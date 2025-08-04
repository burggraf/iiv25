/**
 * Shared Rate Limiter for Gemini API
 * 
 * Implements a distributed token bucket rate limiter using SQLite as coordination mechanism
 * Ensures all workers collectively stay within the 15 requests/second limit
 */

import { dbManager } from './database-manager';

interface RateLimitConfig {
  maxRequestsPerSecond: number;
  bucketCapacity?: number;
  refillIntervalMs?: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
  requestsThisSecond: number;
  currentSecond: number;
}

class SharedRateLimiter {
  private config: Required<RateLimitConfig>;
  private limiterName: string;

  constructor(limiterName: string, config: RateLimitConfig) {
    this.limiterName = limiterName;
    this.config = {
      maxRequestsPerSecond: config.maxRequestsPerSecond,
      bucketCapacity: config.bucketCapacity || config.maxRequestsPerSecond * 2,
      refillIntervalMs: config.refillIntervalMs || 100 // Check every 100ms
    };

    this.initializeRateLimiter();
  }

  /**
   * Initialize rate limiter table and state
   */
  private initializeRateLimiter(): void {
    try {
      // Create rate limiter table if it doesn't exist
      dbManager.executeWithRetry(() => {
        const db = dbManager.getDatabase();
        db.exec(`
          CREATE TABLE IF NOT EXISTS rate_limiter_state (
            limiter_name TEXT PRIMARY KEY,
            tokens REAL NOT NULL,
            last_refill INTEGER NOT NULL,
            requests_this_second INTEGER DEFAULT 0,
            current_second INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }, 'create rate limiter table');

      // Initialize state for this limiter (synchronous to ensure it's ready)
      const now = Date.now();
      const currentSecond = Math.floor(now / 1000);

      // Use synchronous operation for initialization to ensure completion
      const db = dbManager.getDatabase();
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO rate_limiter_state 
        (limiter_name, tokens, last_refill, requests_this_second, current_second)
        VALUES (?, ?, ?, 0, ?)
      `);
      insertStmt.run(this.limiterName, this.config.bucketCapacity, now, currentSecond);

      console.log(`✅ Rate limiter '${this.limiterName}' initialized: ${this.config.maxRequestsPerSecond} req/sec`);
    } catch (error) {
      console.error(`❌ Failed to initialize rate limiter '${this.limiterName}':`, error);
      throw error;
    }
  }

  /**
   * Attempt to consume a token (make a request)
   * Returns true if allowed, false if rate limited
   */
  async tryConsume(tokensToConsume: number = 1): Promise<boolean> {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);

    // Retry the entire operation if we get database contention
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Use transaction for atomic token consumption
        const result = await dbManager.executeTransaction(() => {
          const db = dbManager.getDatabase();
          
          // Get current state
          const getStateStmt = db.prepare(`
            SELECT tokens, last_refill, requests_this_second, current_second
            FROM rate_limiter_state 
            WHERE limiter_name = ?
          `);

          const state = getStateStmt.get(this.limiterName) as TokenBucketState | undefined;
          if (!state) {
            throw new Error(`Rate limiter state not found: ${this.limiterName}`);
          }

          // Reset per-second counter if we're in a new second
          if (currentSecond !== state.currentSecond) {
            state.requestsThisSecond = 0;
            state.currentSecond = currentSecond;
          }

          // Check per-second limit first (hard limit)
          if (state.requestsThisSecond + tokensToConsume > this.config.maxRequestsPerSecond) {
            return { allowed: false, reason: 'per_second_limit_exceeded' };
          }

          // Refill tokens based on time elapsed
          const timeSinceRefill = now - state.lastRefill;
          const tokensToAdd = (timeSinceRefill / 1000) * this.config.maxRequestsPerSecond;
          const newTokenCount = Math.min(state.tokens + tokensToAdd, this.config.bucketCapacity);

          // Check if we have enough tokens
          if (newTokenCount < tokensToConsume) {
            return { allowed: false, reason: 'insufficient_tokens' };
          }

          // Consume tokens and update state
          const finalTokenCount = newTokenCount - tokensToConsume;
          const newRequestsThisSecond = state.requestsThisSecond + tokensToConsume;

          const updateStmt = db.prepare(`
            UPDATE rate_limiter_state 
            SET tokens = ?, 
                last_refill = ?, 
                requests_this_second = ?,
                current_second = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE limiter_name = ?
          `);

          updateStmt.run(finalTokenCount, now, newRequestsThisSecond, currentSecond, this.limiterName);

          return { 
            allowed: true, 
            tokensRemaining: finalTokenCount,
            requestsThisSecond: newRequestsThisSecond
          };
        }, 'rate limiter token consumption');

        return result.allowed;
      } catch (error: any) {
        if ((error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') && attempt < 3) {
          // Wait a bit and retry
          const delay = 100 * attempt + Math.random() * 100;
          await this.delay(delay);
          continue;
        }
        
        console.error(`❌ Rate limiter tryConsume failed (attempt ${attempt}/3):`, error);
        // On final failure, allow the request to avoid blocking the system
        return true;
      }
    }
    
    // Should never reach here, but just in case
    return true;
  }

  /**
   * Wait for permission to make a request (blocking)
   */
  async waitForPermission(tokensToConsume: number = 1, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.tryConsume(tokensToConsume)) {
        return true;
      }

      // Wait before trying again (adaptive backoff with more spacing)
      const waitTime = Math.min(500, Math.max(100, 1500 / this.config.maxRequestsPerSecond));
      await this.delay(waitTime);
    }

    // On timeout, allow the request to avoid blocking the system indefinitely
    console.warn(`⚠️  Rate limiter timeout after ${maxWaitMs}ms, allowing request`);
    return true;
  }

  /**
   * Get current rate limiter statistics
   */
  getStats(): {
    tokens: number;
    requestsThisSecond: number;
    maxRequestsPerSecond: number;
    bucketCapacity: number;
    utilizationPercent: number;
  } {
    try {
      const state = dbManager.getDatabase().prepare(`
        SELECT tokens, requests_this_second
        FROM rate_limiter_state 
        WHERE limiter_name = ?
      `).get(this.limiterName) as { tokens: number; requests_this_second: number } | undefined;
      
      if (!state) {
        return {
          tokens: 0,
          requestsThisSecond: 0,
          maxRequestsPerSecond: this.config.maxRequestsPerSecond,
          bucketCapacity: this.config.bucketCapacity,
          utilizationPercent: 0
        };
      }

      return {
        tokens: state.tokens,
        requestsThisSecond: state.requests_this_second,
        maxRequestsPerSecond: this.config.maxRequestsPerSecond,
        bucketCapacity: this.config.bucketCapacity,
        utilizationPercent: (state.requests_this_second / this.config.maxRequestsPerSecond) * 100
      };
    } catch (error) {
      console.warn('⚠️  Could not get rate limiter stats:', error);
      return {
        tokens: 0,
        requestsThisSecond: 0,
        maxRequestsPerSecond: this.config.maxRequestsPerSecond,
        bucketCapacity: this.config.bucketCapacity,
        utilizationPercent: 0
      };
    }
  }

  /**
   * Reset rate limiter state (useful for testing or emergency reset)
   */
  async reset(): Promise<void> {
    try {
      const now = Date.now();
      const currentSecond = Math.floor(now / 1000);

      await dbManager.executeStatementRun(`
        UPDATE rate_limiter_state 
        SET tokens = ?,
            last_refill = ?,
            requests_this_second = 0,
            current_second = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE limiter_name = ?
      `, [this.config.bucketCapacity, now, currentSecond, this.limiterName], 'reset rate limiter');

      console.log(`🔄 Rate limiter '${this.limiterName}' reset`);
    } catch (error) {
      console.error(`❌ Failed to reset rate limiter '${this.limiterName}':`, error);
      throw error;
    }
  }

  /**
   * Cleanup rate limiter resources
   */
  close(): void {
    // Note: We don't close the db connection here since it's shared
    // The coordinator will handle database cleanup
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter instance for Gemini API
 */
export const GeminiRateLimiter = new SharedRateLimiter('gemini_api', {
  maxRequestsPerSecond: 15, // Conservative limit for Gemini API
  bucketCapacity: 30, // Allow burst of 30 requests
  refillIntervalMs: 100
});

export default SharedRateLimiter;