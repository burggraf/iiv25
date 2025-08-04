/**
 * Simple File-Based Rate Limiter
 * 
 * Uses a simple file-based approach to coordinate rate limiting across processes
 * Avoids SQLite contention issues by using filesystem operations
 */

import * as fs from 'fs';
import * as path from 'path';

interface RateLimitState {
  lastReset: number;
  requestsThisSecond: number;
  tokens: number;
  lastRefill: number;
}

class SimpleRateLimiter {
  private statePath: string;
  private maxRequestsPerSecond: number;
  private bucketCapacity: number;
  private lockPath: string;

  constructor(name: string, maxRequestsPerSecond: number = 15) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
    this.bucketCapacity = maxRequestsPerSecond * 8; // Even larger bucket for bursts
    this.statePath = path.join(__dirname, `rate-limiter-${name}.json`);
    this.lockPath = path.join(__dirname, `rate-limiter-${name}.lock`);
    
    this.initializeState();
  }

  private initializeState(): void {
    if (!fs.existsSync(this.statePath)) {
      const initialState: RateLimitState = {
        lastReset: Date.now(),
        requestsThisSecond: 0,
        tokens: this.bucketCapacity,
        lastRefill: Date.now()
      };
      
      try {
        fs.writeFileSync(this.statePath, JSON.stringify(initialState), 'utf8');
      } catch (error) {
        console.warn('⚠️  Could not initialize rate limiter state file, using in-memory fallback');
      }
    }
  }

  private async acquireLock(maxWaitMs: number = 500): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        fs.writeFileSync(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return true;
      } catch (error) {
        // Lock exists, wait minimal time
        await this.delay(1 + Math.random() * 3);
      }
    }
    
    return false; // Timeout
  }

  private releaseLock(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch (error) {
      // Lock file might not exist, ignore
    }
  }

  private readState(): RateLimitState {
    try {
      const data = fs.readFileSync(this.statePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return default state
      return {
        lastReset: Date.now(),
        requestsThisSecond: 0,
        tokens: this.bucketCapacity,
        lastRefill: Date.now()
      };
    }
  }

  private writeState(state: RateLimitState): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(state), 'utf8');
    } catch (error) {
      console.warn('⚠️  Could not write rate limiter state:', error);
    }
  }

  async tryConsume(tokensToConsume: number = 1): Promise<boolean> {
    // Try to acquire lock with ultra short timeout
    if (!await this.acquireLock(50)) {
      // If we can't get the lock quickly, allow the request (fail-open)
      return true;
    }

    try {
      const now = Date.now();
      const currentSecond = Math.floor(now / 1000);
      const state = this.readState();
      
      // Reset per-second counter if we're in a new second
      const lastSecond = Math.floor(state.lastReset / 1000);
      if (currentSecond !== lastSecond) {
        state.requestsThisSecond = 0;
        state.lastReset = now;
      }

      // Check per-second limit first (hard limit)
      if (state.requestsThisSecond + tokensToConsume > this.maxRequestsPerSecond) {
        this.writeState(state);
        return false;
      }

      // Refill tokens based on time elapsed
      const timeSinceRefill = now - state.lastRefill;
      const tokensToAdd = (timeSinceRefill / 1000) * this.maxRequestsPerSecond;
      const newTokenCount = Math.min(state.tokens + tokensToAdd, this.bucketCapacity);

      // Check if we have enough tokens
      if (newTokenCount < tokensToConsume) {
        this.writeState(state);
        return false;
      }

      // Consume tokens and update state
      state.tokens = newTokenCount - tokensToConsume;
      state.lastRefill = now;
      state.requestsThisSecond += tokensToConsume;

      this.writeState(state);
      return true;

    } finally {
      this.releaseLock();
    }
  }

  async waitForPermission(tokensToConsume: number = 1, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitMs) {
      attempts++;
      if (await this.tryConsume(tokensToConsume)) {
        return true;
      }

      // Wait before trying again (absolute minimal wait time)
      const waitTime = Math.max(2, 100 / this.maxRequestsPerSecond);
      await this.delay(waitTime);
    }

    // On timeout, allow the request (fail-open)
    console.warn(`⚠️  Rate limiter timeout after ${maxWaitMs}ms (${attempts} attempts), allowing request`);
    return true;
  }

  getStats(): { requestsThisSecond: number; maxRequestsPerSecond: number; tokens: number } {
    try {
      const state = this.readState();
      return {
        requestsThisSecond: state.requestsThisSecond,
        maxRequestsPerSecond: this.maxRequestsPerSecond,
        tokens: state.tokens
      };
    } catch (error) {
      return {
        requestsThisSecond: 0,
        maxRequestsPerSecond: this.maxRequestsPerSecond,
        tokens: this.bucketCapacity
      };
    }
  }

  async reset(): Promise<void> {
    if (!await this.acquireLock()) {
      return;
    }

    try {
      const initialState: RateLimitState = {
        lastReset: Date.now(),
        requestsThisSecond: 0,
        tokens: this.bucketCapacity,
        lastRefill: Date.now()
      };
      
      this.writeState(initialState);
    } finally {
      this.releaseLock();
    }
  }

  close(): void {
    // Clean up lock and state files
    try {
      this.releaseLock();
      if (fs.existsSync(this.statePath)) {
        fs.unlinkSync(this.statePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter instance for Gemini API (true Gemini limit: 16.67 req/sec)
 */
export const GeminiRateLimiter = new SimpleRateLimiter('gemini_api', 16);

export default SimpleRateLimiter;