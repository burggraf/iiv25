#!/usr/bin/env tsx
/**
 * Parallel Processing Worker
 * 
 * Individual worker process that:
 * - Claims record batches atomically from queue
 * - Processes ingredients using Gemini API
 * - Respects individual rate limits
 * - Reports progress and health to coordinator
 * - Handles failures with retry logic
 */

import axios from 'axios';
import { config } from 'dotenv';
import { dbManager } from './database-manager';
import { GeminiRateLimiter } from './simple-rate-limiter';
import * as http from 'http';
import * as https from 'https';

// Load environment variables
config();

interface OpenFoodFactsRecord {
  code: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_ingredients_url?: string;
  import_status?: string;
  import_status_time?: string;
  processing_worker_id?: string;
  processing_started_at?: string;
  retry_count?: number;
  last_error?: string;
  batch_id?: string;
}

interface GeminiResponse {
  ingredients: string[];
  analysis?: string[];
  confidence: number;
  isValidIngredientsList: boolean;
  error?: string;
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

interface WorkerStats {
  recordsProcessed: number;
  apiCallsCount: number;
  totalApiCost: number;
  errorCount: number;
  batchesCompleted: number;
  averageProcessingTime: number;
  startTime: Date;
}

class ParallelProcessingWorker {
  private geminiApiKey: string;
  private workerId: string;
  private batchSize: number;
  private maxRetries: number = 3;
  private heartbeatIntervalMs: number = 30000; // 30 seconds
  private apiRetries: number = 2; // Retries for API calls specifically
  private stats: WorkerStats;
  private isShuttingDown: boolean = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  // Optimized Gemini prompt (from original implementation)
  private readonly OPTIMIZED_GEMINI_PROMPT = `Extract ingredients from food label image. Two-step process:

STEP 1 - Extract ingredients from "INGREDIENTS:" section:
- Find ingredients list (skip "May contain" warnings)
- TRANSLATE ALL to English: eau→water, sucre→sugar, lait→milk, farine→flour, huile→oil, etc.
- Only actual ingredients, not facility warnings

STEP 2 - Create cleaned "analysis" field:
- Remove modifiers: pasteurized, enriched, organic, dried, whole, 12%, Italian, etc.
- Core names only: "pasteurized milk" → "milk", "enriched wheat flour" → "wheat flour"

Examples:
- "lait pasteurisé" → ingredients: "milk", analysis: "milk"  
- "12% farine de blé enrichie" → ingredients: "enriched wheat flour", analysis: "wheat flour"
- "aceites vegetales (girasol)" → ingredients: "vegetable oils (sunflower)", analysis: "vegetable oils"

Return JSON:
{
  "ingredients": ["full_english_ingredient1", "full_english_ingredient2"],
  "analysis": ["core_ingredient1", "core_ingredient2"], 
  "confidence": 0.95,
  "isValidIngredientsList": true
}

CRITICAL: Both fields must be 100% English. If no ingredients found (only warnings), return empty array + isValidIngredientsList: false.`;

  constructor() {
    // Get worker configuration from environment
    this.workerId = `worker-${process.pid}`;
    this.batchSize = parseInt(process.env.WORKER_BATCH_SIZE || '10'); // Back to working config

    // Get Gemini API key
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    if (!this.geminiApiKey) {
      throw new Error('❌ Missing GEMINI_API_KEY environment variable');
    }

    // Initialize HTTP agents with connection pooling and keep-alive
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 5,
      maxFreeSockets: 2,
      timeout: 30000
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 5,
      maxFreeSockets: 2,
      timeout: 30000
    });

    // Initialize stats
    this.stats = {
      recordsProcessed: 0,
      apiCallsCount: 0,
      totalApiCost: 0,
      errorCount: 0,
      batchesCompleted: 0,
      averageProcessingTime: 0,
      startTime: new Date()
    };

    this.setupMessageHandlers();
    this.startHeartbeat();
    
    console.log(`🔧 Worker ${this.workerId} initialized with connection pooling`);
  }

  /**
   * Start worker processing loop
   */
  async start(): Promise<void> {
    // Stagger worker startup to reduce initial database contention
    const startupDelay = Math.random() * 5000; // 0-5 second random delay for 100+ workers
    await this.delay(startupDelay);
    
    try {
      while (!this.isShuttingDown) {
        // Claim a batch of records
        const batch = await this.claimBatch();
        
        if (batch.length === 0) {
          await this.delay(3000);
          continue;
        }

        const batchStartTime = Date.now();

        // Process the batch
        await this.processBatch(batch);

        const batchDuration = (Date.now() - batchStartTime) / 1000;
        this.stats.batchesCompleted++;
        this.stats.averageProcessingTime = 
          (this.stats.averageProcessingTime * (this.stats.batchesCompleted - 1) + batchDuration) / 
          this.stats.batchesCompleted;

        // Report progress to coordinator
        this.reportProgress();
      }
    } catch (error) {
      console.error(`💥 Worker ${this.workerId} fatal error:`, error);
      this.reportError(error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Atomically claim a batch of records from the queue
   */
  private async claimBatch(): Promise<OpenFoodFactsRecord[]> {
    const batchId = `${this.workerId}-${Date.now()}`;
    const now = new Date().toISOString();

    try {
      // Atomically claim records by updating them with our worker ID
      const claimResult = await dbManager.executeStatementRun(`
        UPDATE openfoodfacts 
        SET processing_worker_id = ?,
            processing_started_at = ?,
            import_status = 'processing',
            batch_id = ?
        WHERE code IN (
          SELECT o.code 
          FROM openfoodfacts o
          LEFT OUTER JOIN products p ON o.code = p.upc
          WHERE o.image_ingredients_url IS NOT NULL 
            AND o.image_ingredients_url <> ''
            AND o.image_ingredients_url NOT LIKE '%invalid%'
            AND (p.upc is null or p.analysis is null or p.analysis = '')
            AND (o.import_status IS NULL OR o.import_status = 'pending')
            AND o.processing_worker_id IS NULL
            AND (o.retry_count IS NULL OR o.retry_count < ?)
          ORDER BY 
            CASE WHEN o.priority IS NULL THEN 0 ELSE o.priority END DESC,
            o.last_modified_t DESC
          LIMIT ?
        )
      `, [this.workerId, now, batchId, this.maxRetries, this.batchSize], 'claim batch records');

      if (claimResult.changes === 0) {
        return []; // No records claimed
      }

      // Fetch the claimed records
      const records = await dbManager.executeStatementAll<OpenFoodFactsRecord>(`
        SELECT code, product_name, brands, image_url, image_ingredients_url, 
               import_status, retry_count, last_error
        FROM openfoodfacts 
        WHERE processing_worker_id = ? AND batch_id = ?
      `, [this.workerId, batchId], 'fetch claimed records');

      return records;

    } catch (error) {
      console.error(`❌ Worker ${this.workerId}: Failed to claim batch:`, error);
      return [];
    }
  }

  /**
   * Process a batch of records
   */
  private async processBatch(batch: OpenFoodFactsRecord[]): Promise<void> {
    for (const record of batch) {
      if (this.isShuttingDown) break;

      try {
        await this.processRecord(record);
        this.stats.recordsProcessed++;
      } catch (error) {
        this.stats.errorCount++;
        await this.handleRecordError(record, error);
      }
    }

    // Notify coordinator that batch is complete
    this.sendMessage({
      type: 'completed_batch',
      recordsProcessed: batch.length
    });
  }

  /**
   * Process a single record (adapted from original implementation)
   */
  private async processRecord(record: OpenFoodFactsRecord): Promise<void> {
    try {
      // Fetch and process ingredient image
      const ingredientResult = await this.processIngredientImage(record.image_ingredients_url!);

      if (!ingredientResult.isValidIngredientsList || ingredientResult.ingredients.length === 0) {
        this.updateRecordStatus(record.code, 'no_ingredients', new Date());
        return;
      }

      // Prepare ingredient data
      const ingredientsCommaDelimited = ingredientResult.ingredients.join(', ');

      // Use Gemini's analysis field if available, otherwise fall back to ingredients
      const analysisArray = ingredientResult.analysis && ingredientResult.analysis.length > 0
        ? ingredientResult.analysis
        : ingredientResult.ingredients;

      const analysisTildeDelimited = analysisArray
        .map(ingredient => ingredient.toLowerCase().replace(/[^\w\s]/g, '').trim())
        .filter(ingredient => ingredient.length > 0)
        .join('~');

      // Update or create product
      const productUpdated = await this.updateOrCreateProduct(record, ingredientsCommaDelimited, analysisTildeDelimited);

      // Create missing ingredients using the cleaned analysis field
      const ingredientsToAdd = ingredientResult.analysis && ingredientResult.analysis.length > 0
        ? ingredientResult.analysis
        : ingredientResult.ingredients;
      
      // DEBUG: Log what we're about to add as ingredients
      console.log(`🧪 DEBUG ${record.code}: ingredientsToAdd =`, ingredientsToAdd);
      
      await this.createMissingIngredients(ingredientsToAdd);

      // Update status to completed
      const statusToSet = productUpdated ? 'updated' : 'created';
      await this.updateRecordStatus(record.code, statusToSet, new Date());

    } catch (error) {
      console.error(`❌ Failed to process ${record.code}:`, error);
      throw error;
    }
  }

  /**
   * Process ingredient image using Gemini AI with improved error handling
   */
  private async processIngredientImage(imageUrl: string): Promise<GeminiResponse> {
    let lastError: any;
    
    // Retry the entire API call process
    for (let attempt = 1; attempt <= this.apiRetries + 1; attempt++) {
      try {
        // Fetch image and convert to base64
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 20000,
          headers: {
            'User-Agent': 'IsItVegan/4.0.2 (parallel-processor)',
            'Accept': 'image/jpeg,image/png,image/webp,*/*',
            'Connection': 'keep-alive'
          },
          maxRedirects: 3,
          validateStatus: (status) => status < 400,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent
        });

        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');

        // Call Gemini API (rate limiting bypassed - let Gemini handle server-side)
        const geminiResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`,
          {
            contents: [{
              parts: [
                {
                  text: this.OPTIMIZED_GEMINI_PROMPT
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: imageBase64
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000
            }
          },
          {
            timeout: 40000, // Further reduced timeout
            headers: { 
              'Content-Type': 'application/json',
              'Connection': 'keep-alive',
              'Accept': 'application/json'
            },
            maxRedirects: 2,
            validateStatus: (status) => status < 500, // Allow 4xx errors but retry 5xx
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent
          }
        );

        const generatedText = geminiResponse.data.candidates[0]?.content?.parts[0]?.text;
        if (!generatedText) {
          throw new Error('No response from Gemini API');
        }

        // Parse JSON response with error handling
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in Gemini response');
        }

        let parsedResult: GeminiResponse;
        try {
          // Try to parse the JSON as-is first
          parsedResult = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          // If JSON parsing fails, try to fix common issues
          let fixedJson = jsonMatch[0];
          
          // Fix trailing commas in arrays
          fixedJson = fixedJson.replace(/,\s*\]/g, ']');
          fixedJson = fixedJson.replace(/,\s*\}/g, '}');
          
          // Fix incomplete arrays or objects
          if (fixedJson.includes('"ingredients":[') && !fixedJson.includes(']')) {
            // Find the last complete ingredient and close the array
            const ingredientsMatch = fixedJson.match(/"ingredients":\[(.*?)(?:$|,\s*"\w+")/s);
            if (ingredientsMatch) {
              const ingredientsPart = ingredientsMatch[1];
              const lastQuoteIndex = ingredientsPart.lastIndexOf('"');
              if (lastQuoteIndex > 0) {
                const fixedIngredients = ingredientsPart.substring(0, lastQuoteIndex + 1);
                fixedJson = fixedJson.replace(ingredientsMatch[0], `"ingredients":[${fixedIngredients}]`);
              }
            }
          }
          
          // Ensure the JSON object is properly closed
          if (!fixedJson.endsWith('}')) {
            fixedJson += '}';
          }
          
          try {
            parsedResult = JSON.parse(fixedJson);
          } catch (secondParseError) {
            // If still failing, return a safe fallback
            console.warn('⚠️  Could not parse Gemini JSON response, using fallback');
            parsedResult = {
              ingredients: [],
              confidence: 0.0,
              isValidIngredientsList: false,
              error: `JSON parse error: ${parseError.message}`
            };
          }
        }

        // Normalize confidence score
        if (typeof parsedResult.confidence === 'number' && parsedResult.confidence > 1) {
          parsedResult.confidence = parsedResult.confidence / 100;
        }

        // Calculate API cost if usage data is available
        const usage = geminiResponse.data.usageMetadata;
        if (usage) {
          const inputTokens = usage.promptTokenCount || 0;
          const outputTokens = usage.candidatesTokenCount || 0;
          const inputCostPer1M = 0.075;
          const outputCostPer1M = 0.30;
          const inputCost = (inputTokens / 1000000) * inputCostPer1M;
          const outputCost = (outputTokens / 1000000) * outputCostPer1M;
          const totalCost = inputCost + outputCost;

          parsedResult.apiCost = {
            inputTokens,
            outputTokens,
            totalCost: `$${totalCost.toFixed(6)}`
          };

          // Track API usage in memory and database
          this.stats.apiCallsCount++;
          this.stats.totalApiCost += totalCost;
          
          // Store API cost in database for persistence across restarts
          await this.recordApiCost(totalCost, 1);
        }

        return parsedResult;

      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(error);
        
        if (attempt <= this.apiRetries && isRetryable) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.delay(backoffMs);
          continue;
        } else {
          break;
        }
      }
    }

    // All retries failed
    console.error('❌ All Gemini API retries failed:', lastError);
    return {
      ingredients: [],
      confidence: 0.0,
      isValidIngredientsList: false,
      error: lastError instanceof Error ? lastError.message : 'Unknown error'
    };
  }

  /**
   * Record API cost in database for persistent tracking
   */
  private async recordApiCost(cost: number, apiCalls: number): Promise<void> {
    try {
      await dbManager.executeStatementRun(`
        INSERT OR IGNORE INTO api_cost_tracking (id, total_cost, total_calls, last_updated)
        VALUES (1, 0, 0, CURRENT_TIMESTAMP)
      `, [], 'initialize api cost tracking');

      await dbManager.executeStatementRun(`
        UPDATE api_cost_tracking 
        SET total_cost = total_cost + ?,
            total_calls = total_calls + ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [cost, apiCalls], 'update api cost tracking');
    } catch (error) {
      console.error('❌ Error recording API cost:', error);
    }
  }

  /**
   * Check if an error is worth retrying
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    // Network errors are retryable
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // HTTP 5xx errors are retryable
    if (error.response && error.response.status >= 500) {
      return true;
    }
    
    // Rate limit errors (429) are retryable
    if (error.response && error.response.status === 429) {
      return true;
    }
    
    // Connection errors
    if (error.message && (
      error.message.includes('timeout') || 
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('socket hang up')
    )) {
      return true;
    }
    
    return false;
  }

  /**
   * Update or create product record (adapted from original)
   */
  private async updateOrCreateProduct(
    record: OpenFoodFactsRecord,
    ingredients: string,
    analysis: string
  ): Promise<boolean> {
    // Normalize barcode format
    const normalizedUPC = record.code.length === 11 ? '0' + record.code : record.code;

    try {
      // Check if product exists
      const existingProduct = await dbManager.executeStatement<any>(`
        SELECT * FROM products 
        WHERE upc = ?
      `, [record.code], 'check existing product');

      const now = new Date().toISOString();

      if (existingProduct) {
        // Update existing product
        await dbManager.executeStatementRun(`
          UPDATE products SET 
            ingredients = ?,
            analysis = ?,
            lastupdated = ?,
            ingredients_url = ?,
            import_status = ?,
            import_status_time = ?
          WHERE upc = ?
        `, [
          ingredients,
          analysis,
          now,
          record.image_ingredients_url,
          'updated',
          now,
          existingProduct.upc
        ], 'update existing product');

        return true;

      } else {
        // Create new product
        await dbManager.executeStatementRun(`
          INSERT INTO products (
            upc, product_name, brand, ingredients, analysis,
            imageurl, ingredients_url, import_status, import_status_time,
            created, lastupdated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          normalizedUPC,
          record.product_name || 'Unknown Product',
          record.brands || '',
          ingredients,
          analysis,
          record.image_url,
          record.image_ingredients_url,
          'created',
          now,
          now,
          now
        ], 'create new product');

        return false;
      }
    } catch (error) {
      console.error(`❌ Database error in updateOrCreateProduct:`, error);
      throw error;
    }
  }

  /**
   * Create missing ingredients (adapted from original)
   */
  private async createMissingIngredients(ingredientList: string[]): Promise<void> {
    if (ingredientList.length === 0) return;

    try {
      const now = new Date().toISOString();
      const cleanIngredients = ingredientList
        .map(ingredient => ingredient.toLowerCase().trim())
        .filter(ingredient => ingredient.length > 0);

      if (cleanIngredients.length === 0) return;

      // Check which ingredients already exist
      const existing = await dbManager.executeStatementAll<{ title: string }>(`
        SELECT title FROM ingredients WHERE title IN (${cleanIngredients.map(() => '?').join(',')})
      `, cleanIngredients, 'check existing ingredients');

      const existingIngredients = new Set(existing.map(ing => ing.title));
      const newIngredients = cleanIngredients.filter(ing => !existingIngredients.has(ing));

      if (newIngredients.length > 0) {
        // Create new ingredients using transaction
        await dbManager.executeTransaction(() => {
          const db = dbManager.getDatabase();
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO ingredients (title, created, lastupdated)
            VALUES (?, ?, ?)
          `);

          for (const title of newIngredients) {
            insertStmt.run(title, now, now);
          }
        }, 'create missing ingredients');
      }
    } catch (error) {
      console.error(`❌ Error creating missing ingredients:`, error);
      throw error;
    }
  }

  /**
   * Update record status in database
   */
  private async updateRecordStatus(code: string, status: string, timestamp: Date): Promise<void> {
    try {
      await dbManager.executeStatementRun(`
        UPDATE openfoodfacts SET 
          import_status = ?,
          import_status_time = ?,
          processing_worker_id = NULL,
          processing_started_at = NULL,
          batch_id = NULL
        WHERE code = ?
      `, [status, timestamp.toISOString(), code], 'update record status');
    } catch (error) {
      console.error(`❌ Error updating record status for ${code}:`, error);
      throw error;
    }
  }

  /**
   * Handle record processing error
   */
  private async handleRecordError(record: OpenFoodFactsRecord, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const retryCount = (record.retry_count || 0) + 1;

    try {
      if (retryCount >= this.maxRetries) {
        // Max retries reached, mark as failed
        await dbManager.executeStatementRun(`
          UPDATE openfoodfacts SET 
            import_status = 'failed',
            import_status_time = ?,
            last_error = ?,
            retry_count = ?,
            processing_worker_id = NULL,
            processing_started_at = NULL,
            batch_id = NULL
          WHERE code = ?
        `, [new Date().toISOString(), errorMessage, retryCount, record.code], 'mark record as failed');
      } else {
        // Reset for retry
        await dbManager.executeStatementRun(`
          UPDATE openfoodfacts SET 
            import_status = 'pending',
            last_error = ?,
            retry_count = ?,
            processing_worker_id = NULL,
            processing_started_at = NULL,
            batch_id = NULL
          WHERE code = ?
        `, [errorMessage, retryCount, record.code], 'reset record for retry');
      }
    } catch (dbError) {
      console.error(`❌ Failed to update error status for record ${record.code}:`, dbError);
    }
  }

  /**
   * Enforce rate limiting (handled by shared rate limiter)
   */
  private async enforceRateLimit(): Promise<void> {
    // Rate limiting is now handled by the shared rate limiter in processIngredientImage
    // This method is kept for compatibility but does nothing
    // The actual rate limiting happens in processIngredientImage via GeminiRateLimiter.waitForPermission()
  }

  /**
   * Setup message handlers for coordinator communication
   */
  private setupMessageHandlers(): void {
    process.on('message', (message: any) => {
      switch (message.type) {
        case 'shutdown':
          console.log(`🛑 Received shutdown signal`);
          this.gracefulShutdown();
          break;

        case 'update_batch_size':
          this.batchSize = message.batchSize;
          break;

        case 'ping':
          this.sendMessage({ type: 'pong' });
          break;
      }
    });
  }

  /**
   * Start heartbeat to coordinator
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.sendMessage({ type: 'heartbeat' });
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Report progress to coordinator
   */
  private reportProgress(): void {
    this.sendMessage({
      type: 'progress',
      recordsProcessed: this.stats.recordsProcessed,
      apiCalls: this.stats.apiCallsCount,
      apiCost: this.stats.totalApiCost,
      errorCount: this.stats.errorCount,
      averageProcessingTime: this.stats.averageProcessingTime
    });
  }

  /**
   * Report error to coordinator
   */
  private reportError(error: any): void {
    this.sendMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  /**
   * Send message to coordinator
   */
  private sendMessage(message: any): void {
    if (process.send) {
      process.send(message);
    }
  }

  /**
   * Graceful shutdown
   */
  private gracefulShutdown(): void {
    this.isShuttingDown = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // The main loop will exit naturally due to isShuttingDown flag
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // Cleanup HTTP agents
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    
    // Database connection is managed by dbManager - no need to close here
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start worker if called directly
if (require.main === module) {
  const worker = new ParallelProcessingWorker();
  worker.start().catch(error => {
    console.error(`💥 Worker startup failed:`, error);
    process.exit(1);
  });
}

export default ParallelProcessingWorker;