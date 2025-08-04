/**
 * Database Manager with SQLite Concurrency Fixes
 * 
 * Provides centralized database connection management with:
 * - WAL mode for better concurrency
 * - Connection pooling and retry logic
 * - Proper error handling for SQLITE_BUSY
 * - Database locking coordination
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

interface DatabaseConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  busyTimeoutMs?: number;
  enableWAL?: boolean;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database;
  private config: Required<DatabaseConfig>;
  private dbPath: string;

  private constructor(config: DatabaseConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries || 10, // Increased retries
      retryDelayMs: config.retryDelayMs || 250, // Longer base delay
      busyTimeoutMs: config.busyTimeoutMs || 60000, // 60 seconds
      enableWAL: config.enableWAL !== false // Default to true
    };

    this.dbPath = path.join(__dirname, 'off-database.db');
    this.initializeDatabase();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: DatabaseConfig): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database with concurrency optimizations
   */
  private initializeDatabase(): void {
    // Create database connection
    this.db = new Database(this.dbPath);

    // Set busy timeout to handle contention
    this.db.pragma(`busy_timeout = ${this.config.busyTimeoutMs}`);

    // Enable WAL mode for better concurrency
    if (this.config.enableWAL) {
      try {
        this.db.pragma('journal_mode = WAL');
      } catch (error) {
        console.warn('⚠️  Could not enable WAL mode:', error);
      }
    }

    // Set synchronous mode for better performance in WAL mode
    this.db.pragma('synchronous = NORMAL');
    // Set cache size for better performance (larger cache)
    this.db.pragma('cache_size = 50000');
    // Set temp store to memory
    this.db.pragma('temp_store = memory');
    // Disable shared cache to avoid contention
    this.db.pragma('cache = private');
    // Set WAL autocheckpoint for better performance
    this.db.pragma('wal_autocheckpoint = 1000');
    // Set locking mode to normal (not exclusive)
    this.db.pragma('locking_mode = NORMAL');
  }

  /**
   * Log database configuration info
   */
  private logDatabaseInfo(): void {
    // Silent - database info logged at startup only if needed
  }

  /**
   * Execute a query with retry logic for SQLITE_BUSY errors
   */
  async executeWithRetry<T>(
    operation: () => T,
    operationName: string = 'database operation'
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return operation();
      } catch (error: any) {
        lastError = error;

        // Only retry on database busy errors
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
          if (attempt < this.config.maxRetries) {
            // More aggressive exponential backoff with jitter
            const baseDelay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 100; // Add randomness to avoid thundering herd
            const delayMs = Math.min(baseDelay + jitter, 5000); // Cap at 5 seconds
            await this.delay(delayMs);
            continue;
          }
        }

        // Non-retryable error or max retries reached
        break;
      }
    }

    console.error(`❌ ${operationName} failed after ${this.config.maxRetries} attempts:`, lastError);
    throw lastError;
  }

  /**
   * Get database connection (use with caution - prefer executeWithRetry)
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Execute a prepared statement with retry logic
   */
  async executeStatement<T>(
    sql: string,
    params: any[] = [],
    operationName: string = 'statement'
  ): Promise<T> {
    return this.executeWithRetry(() => {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params) as T;
    }, operationName);
  }

  /**
   * Execute a prepared statement that returns all results
   */
  async executeStatementAll<T>(
    sql: string,
    params: any[] = [],
    operationName: string = 'statement all'
  ): Promise<T[]> {
    return this.executeWithRetry(() => {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    }, operationName);
  }

  /**
   * Execute a prepared statement that modifies data
   */
  async executeStatementRun(
    sql: string,
    params: any[] = [],
    operationName: string = 'statement run'
  ): Promise<Database.RunResult> {
    return this.executeWithRetry(() => {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    }, operationName);
  }

  /**
   * Execute a transaction with retry logic
   */
  async executeTransaction<T>(
    operations: () => T,
    operationName: string = 'transaction'
  ): Promise<T> {
    return this.executeWithRetry(() => {
      const transaction = this.db.transaction(operations);
      return transaction();
    }, operationName);
  }

  /**
   * Check if database is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.executeStatement('SELECT 1 as test', [], 'health check');
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    fileSize: number;
    pageCount: number;
    pageSize: number;
    journalMode: string;
    walFiles: string[];
  }> {
    const stats = fs.statSync(this.dbPath);
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const journalMode = this.db.pragma('journal_mode', { simple: true }) as string;

    // Check for WAL files
    const walFiles = [];
    const walPath = `${this.dbPath}-wal`;
    const shmPath = `${this.dbPath}-shm`;
    
    if (fs.existsSync(walPath)) walFiles.push('WAL');
    if (fs.existsSync(shmPath)) walFiles.push('SHM');

    return {
      fileSize: stats.size,
      pageCount,
      pageSize,
      journalMode,
      walFiles
    };
  }

  /**
   * Checkpoint WAL file (important for WAL mode)
   */
  async checkpointWAL(): Promise<void> {
    try {
      await this.executeWithRetry(() => {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      }, 'WAL checkpoint');
    } catch (error) {
      console.warn('⚠️  WAL checkpoint failed:', error);
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      // Checkpoint WAL before closing
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (error) {
        console.warn('⚠️  Final WAL checkpoint failed:', error);
      }

      this.db.close();
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force unlock database (emergency use only)
   */
  async forceUnlock(): Promise<void> {
    console.log('🚨 EMERGENCY: Force unlocking database...');
    
    try {
      // Try to unlock by running a simple query
      await this.executeWithRetry(() => {
        this.db.pragma('wal_checkpoint(RESTART)');
      }, 'force unlock');
      
      console.log('✅ Database force unlock completed');
    } catch (error) {
      console.error('❌ Force unlock failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();
export default DatabaseManager;