#!/usr/bin/env tsx
/**
 * OpenFoodFacts SQLite Database Ingredient Processing Utility
 * 
 * This utility processes OpenFoodFacts records from the SQLite database,
 * uses Gemini AI to extract ingredients from image URLs, and updates the
 * products table within the same SQLite database.
 * 
 * Usage:
 *   npm run off-process           # Process 10 test records
 *   npm run off-process -- --full # Process all eligible records
 */

import axios from 'axios';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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

class OffDbProcessor {
  private db: Database.Database;
  private geminiApiKey: string;
  private isTestMode: boolean = true;
  private processedCount: number = 0;
  private errorCount: number = 0;
  private skippedCount: number = 0;
  private totalApiCalls: number = 0;
  private totalApiCost: number = 0;
  private batchStartTime: Date = new Date();

  // Original comprehensive prompt (stored for reference/modification)
  private readonly ORIGINAL_GEMINI_PROMPT = `Analyze this food product label image and extract the ingredients list with a two-step analysis.

Instructions:
1. Look for an "INGREDIENTS:" or "Ingredients:" section (or a "CONTAINS:" or "Contains:" section)
2. Extract each individual ingredient from the list
3. Clean up the text (remove parentheses, allergen warnings, etc.)
4. MANDATORY: TRANSLATE ALL ingredients to standard American English food terminology - NO EXCEPTIONS
5. Return ONLY the actual food ingredients that are part of this product
6. Determine if this appears to be a valid food ingredients list

CRITICAL TRANSLATION REQUIREMENT: Every single ingredient must be translated to English immediately upon extraction. Do not include any non-English words in either field.

TRANSLATION EXAMPLES (MANDATORY TO FOLLOW):
- French "eau" → "water" (not "aqua")
- French "sucre" → "sugar" 
- French "lait" → "milk"
- French "farine de blé" → "wheat flour"
- French "beurre" → "butter"
- French "œufs" → "eggs"
- French "sel" → "salt"
- French "levure" → "yeast"
- French "huile" → "oil"
- French "viande" → "meat"
- French "fromage" → "cheese"
- French "tomates" → "tomatoes"
- French "oignons" → "onions"
- French "ail" → "garlic"
- German "Kohlensäure" → "carbon dioxide" (not "carbonic acid")
- German "Süßungsmittel" → "sweeteners"
- German "Wasser" → "water"
- German "Zucker" → "sugar"
- Spanish "azúcar" → "sugar"
- Spanish "agua" → "water"
- Spanish "aceite" → "oil"
- Italian "pomodori" → "tomatoes"
- Italian "acqua" → "water"
- Portuguese "água" → "water"
- Portuguese "açúcar" → "sugar"
- Finnish "vesi" → "water"
- Finnish "sokeri" → "sugar"

IMPORTANT EXCLUSIONS - Skip any text that mentions:
- "Made in a facility that also processes..." or similar facility warnings
- "May contain..." statements (however do include ingredients if it says "Contains:")
- "Processed in a facility with..." warnings
- Cross-contamination or allergen facility information
- Manufacturing location or equipment information

Focus ONLY on ingredients that are actually added to make this specific product.

CRITICAL: If you only find facility warnings or processing statements (like "Made in a facility that processes...") but NO actual ingredients list, then return an empty ingredients array and set isValidIngredientsList to false. Do NOT include the facility warning items as ingredients.

STEP 2 - ANALYSIS FIELD CLEANUP:
After extracting the ingredients, create a cleaned "analysis" version where you:
- FIRST AND MOST IMPORTANT: TRANSLATE ALL ingredients to standard American English food terminology
- IMPORTANT: Remove unnecessary adjectives and modifiers (pasteurized, enriched, modified, concentrated, dried, whole, organic, etc.)
- Remove percentage indicators (12% oat flakes → oat flakes)
- Remove geographic/brand descriptors (italian pork → pork, australian almonds → almonds)
- IMPORTANT: Remove processing methods (hydrogenated vegetable oil → vegetable oil)
- IMPORTANT: Remove parenthetical specifications (whey powder (from milk) → whey powder)
- Fix obvious misspellings
- Keep only the core ingredient name in STANDARD AMERICAN ENGLISH

MANDATORY: Use common American English food names, not technical or scientific terms.

Examples of cleanup with translation:
- "lait pasteurisé" → "milk" (French to English + cleanup)
- "farine de blé enrichie" → "wheat flour" (French to English + cleanup)
- "12% copos de avena" → "oat flakes" (Spanish to English + cleanup)
- "concentrado de limón" → "lemon juice" (Spanish to English + cleanup)
- "suero seco (de leche)" → "whey" (Spanish to English + cleanup)
- "almidón de maíz modificado" → "corn starch" (Spanish to English + cleanup)
- "aceites vegetales (girasol, colza)" → "vegetable oils" (Spanish to English + cleanup)

Return a JSON object with this exact structure:
{
  "ingredients": ["english_ingredient1", "english_ingredient2", "english_ingredient3"],
  "analysis": ["cleaned_english_ingredient1", "cleaned_english_ingredient2", "cleaned_english_ingredient3"],
  "confidence": 0.95,
  "isValidIngredientsList": true
}

ABSOLUTE REQUIREMENT: Both "ingredients" and "analysis" fields MUST contain ingredients translated to standard American English food terminology. 

THE "INGREDIENTS" FIELD MUST BE IN ENGLISH - translate everything!
THE "ANALYSIS" FIELD MUST BE IN ENGLISH - translate and clean everything!

ZERO TOLERANCE FOR NON-ENGLISH WORDS: If you see "tomate" write "tomato". If you see "lait" write "milk". If you see "sucre" write "sugar". If you see "eau" write "water". If you see "huile" write "oil". 

FINAL REMINDER: I will reject any response that contains non-English words in either field. Every single ingredient in both fields must be in perfect American English.

If you cannot find or read ingredients clearly, OR if you only find facility warnings without actual ingredients, set confidence below 0.7 and isValidIngredientsList to false.`;

  // Optimized prompt for reduced token usage while maintaining functionality
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
    // Initialize SQLite database
    const dbPath = path.join(__dirname, 'off-database.db');
    try {
      this.db = new Database(dbPath);
      console.log('✅ Connected to SQLite database');
    } catch (error) {
      throw new Error(`Failed to connect to SQLite database: ${error}`);
    }

    // Get Gemini API key
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    if (!this.geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY environment variable');
    }

    // Check for full processing mode
    this.isTestMode = !process.argv.includes('--full');

    console.log('🚀 OpenFoodFacts SQLite Ingredient Processor');
    console.log('============================================');
    console.log(`📊 Mode: ${this.isTestMode ? 'TEST (10 records)' : 'FULL PROCESSING'}`);
    console.log(`📁 Database: ${dbPath}`);
    console.log(`🤖 Gemini API Key: ${this.geminiApiKey ? 'Configured ✅' : 'Missing ❌'}`);
    console.log('');

    // Check if required tables exist
    this.verifyTables();
    this.addMissingColumns();
  }

  /**
   * Verify required tables exist in SQLite database
   */
  private verifyTables(): void {
    const tables = ['openfoodfacts', 'products', 'ingredients'];
    const existingTables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN (${tables.map(() => '?').join(',')})
    `).all(...tables);

    const existingTableNames = existingTables.map((t: any) => t.name);
    const missingTables = tables.filter(table => !existingTableNames.includes(table));

    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    console.log('✅ All required tables found in SQLite database');
  }

  /**
   * Add missing columns to products table if they don't exist
   */
  private addMissingColumns(): void {
    const columnsToAdd = [
      'ingredients_url',
      'import_status',
      'import_status_time'
    ];

    // Check existing columns
    const existing = this.db.prepare("PRAGMA table_info(products)").all();
    const existingColumnNames = existing.map((col: any) => col.name);

    for (const column of columnsToAdd) {
      if (!existingColumnNames.includes(column)) {
        try {
          this.db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT`);
          console.log(`✅ Added column: ${column}`);
        } catch (error) {
          console.warn(`Warning: Could not add column ${column}:`, error);
        }
      }
    }
  }

  /**
   * Main processing function
   */
  async process(): Promise<void> {
    try {
      // Reset batch tracking
      this.batchStartTime = new Date();
      this.totalApiCalls = 0;
      this.totalApiCost = 0;

      console.log('📋 Starting ingredient processing...');

      // Get eligible records from openfoodfacts table
      const records = await this.getEligibleRecords();
      console.log(`📊 Found ${records.length} eligible records`);

      if (records.length === 0) {
        console.log('✅ No records to process');
        return;
      }

      // Process each record
      for (const record of records) {
        try {
          await this.processRecord(record);
          this.processedCount++;
        } catch (error) {
          console.error(`❌ Error processing record ${record.code}:`, error);
          this.errorCount++;

          // Update error status
          this.updateOpenFoodFactsStatus(record.code, 'error', new Date());
        }

        // Add small delay to avoid rate limiting
        await this.delay(500);
      }

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Fatal error during processing:', error);
      throw error;
    } finally {
      this.db.close();
    }
  }

  /**
   * Get eligible records from openfoodfacts table
   */
  private async getEligibleRecords(): Promise<OpenFoodFactsRecord[]> {
    const targetCount = this.isTestMode ? 10 : 1000;

    // Use LEFT JOIN to get records that don't have valid products in one query
    const stmt = this.db.prepare(`
      SELECT 
        o.code,
        o.product_name,
        o.brands,
        o.image_url,
        o.image_ingredients_url,
        o.import_status
      FROM openfoodfacts o
        LEFT OUTER JOIN products p ON o.code = p.upc
      WHERE
        o.image_ingredients_url IS NOT NULL
        AND o.image_ingredients_url <> ''
        AND o.image_ingredients_url NOT LIKE '%invalid%'
        AND (p.upc is null or p.analysis is null or p.analysis = '')
        AND (o.import_status IS NULL OR o.import_status = 'pending')
      ORDER BY RANDOM()
      LIMIT ?
    `);

    const records = stmt.all(targetCount) as OpenFoodFactsRecord[];
    console.log(`📋 Found ${records.length} eligible records (no existing valid products)`);

    return records;
  }


  /**
   * Process a single OpenFoodFacts record
   */
  private async processRecord(record: OpenFoodFactsRecord): Promise<void> {
    console.log(`\n🔄 Processing ${record.code}: ${record.product_name || 'Unknown Product'}`);

    // Update status to processing
    this.updateOpenFoodFactsStatus(record.code, 'processing', new Date());

    try {
      // Fetch and process ingredient image
      const ingredientResult = await this.processIngredientImage(record.image_ingredients_url!);

      if (!ingredientResult.isValidIngredientsList || ingredientResult.ingredients.length === 0) {
        console.log(`⚠️  No valid ingredients found for ${record.code}`);
        this.updateOpenFoodFactsStatus(record.code, 'no_ingredients', new Date());
        return;
      }

      // Prepare ingredient data
      const ingredientsCommaDelimited = ingredientResult.ingredients.join(', ');

      // Remove unnecessary adjectives and descriptions
      /*
      const unnecessaryWords = [
        'acidifier', 'active', 'amount', 'antioxidant', 'baked', 'base', 'bit', 'blend',
        'canned', 'chip', 'chopped', 'coloring', 'compound', 'concentrate', 'cooked',
        'dried', 'emulsifier', 'enriched', 'essence', 'exported', 'extract', 'fermented',
        'flake', 'flavored', 'flavoring', 'fortified', 'fresh', 'freshly', 'frozen',
        'granule', 'grown', 'imported', 'inactive', 'jarred', 'juice', 'liquid', 'local', 'locally',
        'mineral', 'mix', 'modified', 'natural', 'organic', 'paste', 'peeled', 'pickled',
        'piece', 'portion', 'powder', 'powdered', 'preservative', 'pressed', 'puree',
        'quantity', 'roasted', 'salted', 'seasoned', 'serving', 'slice', 'sliced',
        'smoked', 'solid', 'stabilizer', 'sweetened', 'sweetener', 'syrup', 'thickener',
        'toasted', 'unflavored', 'unsalted', 'unseasoned', 'unsweetened', 'vitamin', 'whole',
        'concentrated', 'shelled', 'crushed', 'ground', 'powdered', 'pure', 'freshly squeezed',
        'raw', 'from',
      ];

      ingredientResult.ingredients = ingredientResult.ingredients.map(ingredient => {
        return unnecessaryWords.reduce((acc, word) => {
          return acc.replace(new RegExp(`\\b${word}\\b`, 'gi'), '').trim();
        }, ingredient);
      });
      */

      // Use Gemini's analysis field if available, otherwise fall back to ingredients
      const analysisArray = ingredientResult.analysis && ingredientResult.analysis.length > 0
        ? ingredientResult.analysis
        : ingredientResult.ingredients;

      const analysisTildeDelimited = analysisArray
        .map(ingredient => ingredient.toLowerCase().replace(/[^\w\s]/g, '').trim())
        .filter(ingredient => ingredient.length > 0)
        .join('~');

      console.log(`✅ Extracted ${ingredientResult.ingredients.length} ingredients`);

      // Show both fields to see translation issues
      console.log(`📝 INGREDIENTS field: ${ingredientResult.ingredients.join(', ')}`);
      if (ingredientResult.analysis && ingredientResult.analysis.length > 0) {
        console.log(`🔍 ANALYSIS field: ${ingredientResult.analysis.join(', ')}`);
      } else {
        console.log(`⚠️  No analysis field returned`);
      }

      // Update or create product
      const productUpdated = this.updateOrCreateProduct(record, ingredientsCommaDelimited, analysisTildeDelimited);

      // Create missing ingredients using the cleaned analysis field (or fallback to ingredients if no analysis)
      const ingredientsToAdd = ingredientResult.analysis && ingredientResult.analysis.length > 0
        ? ingredientResult.analysis
        : ingredientResult.ingredients;
      this.createMissingIngredients(ingredientsToAdd);

      console.log(`🏷️  Product ${productUpdated ? 'updated' : 'created'} successfully`);

      // Update status to completed
      const statusToSet = productUpdated ? 'updated' : 'created';
      this.updateOpenFoodFactsStatus(record.code, statusToSet, new Date());
      if (productUpdated) {
        this.updatedCount++;
      } else {
        this.createdCount++;
      }

    } catch (error) {
      console.error(`❌ Failed to process ${record.code}:`, error);
      throw error;
    }
  }

  /**
   * Process ingredient image using Gemini AI
   */
  private async processIngredientImage(imageUrl: string): Promise<GeminiResponse> {
    try {
      // Fetch image and convert to base64
      console.log(`📷 Fetching image: ${imageUrl}`);
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'IsItVegan/4.0.3 (ingredient-processor)'
        }
      });

      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      console.log(`📷 Image fetched and encoded (${Math.round(imageBase64.length / 1024)}KB)`);

      // Call Gemini API with the same prompt as parse-ingredients function
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
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const generatedText = geminiResponse.data.candidates[0]?.content?.parts[0]?.text;
      if (!generatedText) {
        throw new Error('No response from Gemini API');
      }

      // Parse JSON response
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Gemini response');
      }

      const parsedResult: GeminiResponse = JSON.parse(jsonMatch[0]);

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

        // Track cumulative API costs
        this.totalApiCalls++;
        this.totalApiCost += totalCost;

        console.log(`💰 API Cost: ${parsedResult.apiCost.totalCost} (${inputTokens + outputTokens} tokens)`);
      }

      return parsedResult;

    } catch (error) {
      console.error('❌ Gemini API error:', error);
      return {
        ingredients: [],
        confidence: 0.0,
        isValidIngredientsList: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update or create product record in SQLite
   */
  private updateOrCreateProduct(
    record: OpenFoodFactsRecord,
    ingredients: string,
    analysis: string
  ): boolean {
    // Normalize barcode format
    const normalizedUPC = record.code.length === 11 ? '0' + record.code : record.code;

    // Check if product exists
    const existingProductStmt = this.db.prepare(`
      SELECT * FROM products 
      WHERE upc = ?
    `);
    const existingProduct = existingProductStmt.get(record.code);

    const now = new Date().toISOString();

    if (existingProduct) {
      // Update existing product
      console.log(`📝 Updating existing product: ${existingProduct.upc}`);

      const updateStmt = this.db.prepare(`
        UPDATE products SET 
          ingredients = ?,
          analysis = ?,
          lastupdated = ?,
          ingredients_url = ?,
          import_status = ?,
          import_status_time = ?
        WHERE upc = ?
      `);

      updateStmt.run(
        ingredients,
        analysis,
        now,
        record.image_ingredients_url,
        'updated',
        now,
        existingProduct.upc
      );

      return true;

    } else {
      // Create new product
      console.log(`➕ Creating new product: ${normalizedUPC}`);

      const insertStmt = this.db.prepare(`
        INSERT INTO products (
          upc, product_name, brand, ingredients, analysis,
          imageurl, ingredients_url, import_status, import_status_time,
          created, lastupdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
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
      );

      return false;
    }
  }

  /**
   * Create missing ingredients in ingredients table
   */
  private createMissingIngredients(ingredientList: string[]): void {
    if (ingredientList.length === 0) return;

    const now = new Date().toISOString();
    const cleanIngredients = ingredientList
      .map(ingredient => ingredient.toLowerCase().trim())
      .filter(ingredient => ingredient.length > 0);

    // Check which ingredients already exist
    const existingStmt = this.db.prepare(`
      SELECT title FROM ingredients WHERE title IN (${cleanIngredients.map(() => '?').join(',')})
    `);
    const existing = existingStmt.all(...cleanIngredients);
    const existingIngredients = new Set(existing.map((ing: any) => ing.title));

    const newIngredients = cleanIngredients.filter(ing => !existingIngredients.has(ing));

    if (newIngredients.length > 0) {
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO ingredients (title, created, lastupdated)
        VALUES (?, ?, ?)
      `);

      const insertMany = this.db.transaction((ingredients: string[]) => {
        for (const title of ingredients) {
          insertStmt.run(title, now, now);
        }
      });

      insertMany(newIngredients);
      console.log(`➕ Created ${newIngredients.length} new ingredients`);
    }
  }

  /**
   * Update OpenFoodFacts record status in SQLite
   */
  private updateOpenFoodFactsStatus(code: string, status: string, timestamp: Date): void {
    const updateStmt = this.db.prepare(`
      UPDATE openfoodfacts SET 
        import_status = ?,
        import_status_time = ?
      WHERE code = ?
    `);

    updateStmt.run(status, timestamp.toISOString(), code);
  }

  /**
   * Print processing summary
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 PROCESSING SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successfully processed: ${this.processedCount}`);
    console.log(`⏭️  Skipped (already valid): ${this.skippedCount}`);
    console.log(`❌ Errors: ${this.errorCount}`);
    console.log(`📊 Total handled: ${this.processedCount + this.skippedCount + this.errorCount}`);
    console.log(`🔥 Total API calls: ${this.totalApiCalls}`);
    console.log(`💰 Total API cost: $${this.totalApiCost.toFixed(6)}`);
    console.log('✅ Processing completed!');

    // Log batch results to CSV
    this.logBatchResultsToCSV();
  }

  /**
   * Log batch results to CSV file
   */
  private logBatchResultsToCSV(): void {
    try {
      const batchEndTime = new Date();
      const csvPath = path.join(__dirname, 'batch-logs.csv');

      // Check if CSV file exists, if not create with headers
      const fileExists = fs.existsSync(csvPath);

      if (!fileExists) {
        const headers = 'timestamp,batch_start,batch_end,duration_seconds,mode,total_handled,processed,skipped,errors,api_calls,total_cost,avg_cost_per_call\n';
        fs.writeFileSync(csvPath, headers);
      }

      // Calculate batch duration
      const durationMs = batchEndTime.getTime() - this.batchStartTime.getTime();
      const durationSeconds = Math.round(durationMs / 1000);

      // Calculate average cost per call
      const avgCostPerCall = this.totalApiCalls > 0 ? this.totalApiCost / this.totalApiCalls : 0;

      // Prepare CSV row
      const totalHandled = this.processedCount + this.skippedCount + this.errorCount;
      const mode = this.isTestMode ? 'TEST' : 'FULL';
      const csvRow = [
        batchEndTime.toISOString(),
        this.batchStartTime.toISOString(),
        batchEndTime.toISOString(),
        durationSeconds,
        mode,
        totalHandled,
        this.processedCount,
        this.skippedCount,
        this.errorCount,
        this.totalApiCalls,
        this.totalApiCost.toFixed(6),
        avgCostPerCall.toFixed(8)
      ].join(',') + '\n';

      // Append to CSV file
      fs.appendFileSync(csvPath, csvRow);

      console.log(`📄 Batch results logged to: ${csvPath}`);

    } catch (error) {
      console.error('❌ Failed to log batch results to CSV:', error);
    }
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  try {
    const processor = new OffDbProcessor();
    await processor.process();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export default OffDbProcessor;