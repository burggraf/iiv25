/**
 * Heartbeat Monitor and Recovery System
 * 
 * Monitors worker health and recovers orphaned records from failed workers
 * Ensures no records are lost due to worker crashes or network issues
 */

import { dbManager } from './database-manager';

interface WorkerHeartbeat {
  workerId: string;
  lastSeen: Date;
  recordsInProgress: number;
  batchId?: string;
}

interface OrphanedRecord {
  code: string;
  workerId: string;
  processingStartedAt: Date;
  batchId?: string;
  retryCount: number;
}

class HeartbeatMonitor {
  private heartbeatTimeoutMs: number;
  private cleanupIntervalMs: number;
  private isRunning: boolean = false;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(heartbeatTimeoutMs: number = 60000, cleanupIntervalMs: number = 30000) {
    this.heartbeatTimeoutMs = heartbeatTimeoutMs; // 1 minute default
    this.cleanupIntervalMs = cleanupIntervalMs; // 30 seconds default

    // Database connection is managed by dbManager
    this.initializeHeartbeatTables();
    console.log(`💓 Heartbeat monitor initialized (timeout: ${heartbeatTimeoutMs / 1000}s)`);
  }

  /**
   * Initialize heartbeat monitoring tables
   */
  private initializeHeartbeatTables(): void {
    try {
      // Create worker heartbeat table
      dbManager.executeWithRetry(() => {
        const db = dbManager.getDatabase();
        db.exec(`
          CREATE TABLE IF NOT EXISTS worker_heartbeats (
            worker_id TEXT PRIMARY KEY,
            last_heartbeat DATETIME NOT NULL,
            records_in_progress INTEGER DEFAULT 0,
            current_batch_id TEXT,
            process_pid INTEGER,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create orphaned records log
        db.exec(`
          CREATE TABLE IF NOT EXISTS orphaned_records_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_code TEXT NOT NULL,
            original_worker_id TEXT NOT NULL,
            processing_started_at DATETIME NOT NULL,
            orphaned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            batch_id TEXT,
            retry_count INTEGER DEFAULT 0,
            recovery_action TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create indexes for performance
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_heartbeat 
          ON worker_heartbeats(last_heartbeat, status)
        `);

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_orphaned_records_log_orphaned_at 
          ON orphaned_records_log(orphaned_at)
        `);
      }, 'initialize heartbeat tables');

      console.log('✅ Heartbeat monitoring tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize heartbeat tables:', error);
      throw error;
    }
  }

  /**
   * Record a worker heartbeat
   */
  async recordHeartbeat(workerId: string, processPid?: number, batchId?: string): Promise<void> {
    const now = new Date();

    try {
      // Count records currently being processed by this worker
      const recordsInProgress = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM openfoodfacts 
        WHERE processing_worker_id = ? AND import_status = 'processing'
      `, [workerId], 'count worker records in progress');

      // Update or insert heartbeat record
      await dbManager.executeStatementRun(`
        INSERT INTO worker_heartbeats 
        (worker_id, last_heartbeat, records_in_progress, current_batch_id, process_pid, status, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?)
        ON CONFLICT(worker_id) DO UPDATE SET
          last_heartbeat = excluded.last_heartbeat,
          records_in_progress = excluded.records_in_progress,
          current_batch_id = excluded.current_batch_id,
          process_pid = excluded.process_pid,
          status = excluded.status,
          updated_at = excluded.updated_at
      `, [workerId, now.toISOString(), recordsInProgress.count, batchId, processPid, now.toISOString()], 'record worker heartbeat');
    } catch (error) {
      console.error(`❌ Failed to record heartbeat for worker ${workerId}:`, error);
    }
  }

  /**
   * Mark a worker as shutdown
   */
  async markWorkerShutdown(workerId: string): Promise<void> {
    try {
      await dbManager.executeStatementRun(`
        UPDATE worker_heartbeats 
        SET status = 'shutdown', updated_at = CURRENT_TIMESTAMP
        WHERE worker_id = ?
      `, [workerId], 'mark worker shutdown');

      console.log(`🛑 Marked worker ${workerId} as shutdown`);
    } catch (error) {
      console.error(`❌ Failed to mark worker ${workerId} as shutdown:`, error);
    }
  }

  /**
   * Start heartbeat monitoring and cleanup
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️  Heartbeat monitor already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Starting heartbeat monitor (cleanup every ${this.cleanupIntervalMs / 1000}s)`);

    // Run initial cleanup
    this.performCleanup();

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(async () => {
      await this.performCleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    this.isRunning = false;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    console.log('⏹️  Heartbeat monitor stopped');
  }

  /**
   * Perform cleanup of orphaned records and dead workers
   */
  private async performCleanup(): Promise<void> {
    try {
      const orphanedRecords = await this.findOrphanedRecords();
      const deadWorkers = await this.findDeadWorkers();

      if (orphanedRecords.length > 0) {
        console.log(`🧹 Found ${orphanedRecords.length} orphaned records`);
        await this.recoverOrphanedRecords(orphanedRecords);
      }

      if (deadWorkers.length > 0) {
        console.log(`💀 Found ${deadWorkers.length} dead workers`);
        await this.handleDeadWorkers(deadWorkers);
      }

      // Log cleanup statistics
      await this.logCleanupStats();

    } catch (error) {
      console.error('❌ Error during heartbeat cleanup:', error);
    }
  }

  /**
   * Find records orphaned by failed workers
   */
  private async findOrphanedRecords(): Promise<OrphanedRecord[]> {
    const timeoutThreshold = new Date(Date.now() - this.heartbeatTimeoutMs);

    try {
      const records = await dbManager.executeStatementAll<any>(`
        SELECT 
          o.code,
          o.processing_worker_id as workerId,
          o.processing_started_at as processingStartedAt,
          o.batch_id as batchId,
          COALESCE(o.retry_count, 0) as retryCount
        FROM openfoodfacts o
        LEFT JOIN worker_heartbeats w ON o.processing_worker_id = w.worker_id
        WHERE o.import_status = 'processing'
          AND o.processing_worker_id IS NOT NULL
          AND o.processing_started_at IS NOT NULL
          AND (
            w.worker_id IS NULL 
            OR w.last_heartbeat < ?
            OR w.status = 'shutdown'
          )
      `, [timeoutThreshold.toISOString()], 'find orphaned records');

      return records.map(record => ({
        code: record.code,
        workerId: record.workerId,
        processingStartedAt: new Date(record.processingStartedAt),
        batchId: record.batchId,
        retryCount: record.retryCount
      }));
    } catch (error) {
      console.error('❌ Error finding orphaned records:', error);
      return [];
    }
  }

  /**
   * Find workers that haven't sent heartbeats recently
   */
  private async findDeadWorkers(): Promise<string[]> {
    const timeoutThreshold = new Date(Date.now() - this.heartbeatTimeoutMs);

    try {
      const deadWorkers = await dbManager.executeStatementAll<{ worker_id: string }>(`
        SELECT worker_id 
        FROM worker_heartbeats 
        WHERE last_heartbeat < ? 
          AND status = 'active'
          AND records_in_progress > 0
      `, [timeoutThreshold.toISOString()], 'find dead workers');
      
      return deadWorkers.map(w => w.worker_id);
    } catch (error) {
      console.error('❌ Error finding dead workers:', error);
      return [];
    }
  }

  /**
   * Recover orphaned records by resetting them to pending state
   */
  private async recoverOrphanedRecords(orphanedRecords: OrphanedRecord[]): Promise<void> {
    try {
      await dbManager.executeTransaction(() => {
        const db = dbManager.getDatabase();
        
        for (const record of orphanedRecords) {
          // Log the orphaned record
          const logStmt = db.prepare(`
            INSERT INTO orphaned_records_log 
            (record_code, original_worker_id, processing_started_at, batch_id, retry_count, recovery_action)
            VALUES (?, ?, ?, ?, ?, 'reset_to_pending')
          `);

          logStmt.run(
            record.code,
            record.workerId,
            record.processingStartedAt.toISOString(),
            record.batchId,
            record.retryCount
          );

          // Reset the record to pending state
          const resetStmt = db.prepare(`
            UPDATE openfoodfacts 
            SET import_status = 'pending',
                processing_worker_id = NULL,
                processing_started_at = NULL,
                batch_id = NULL,
                last_error = 'Recovered from failed worker: ' || ?
            WHERE code = ?
          `);

          resetStmt.run(record.workerId, record.code);

          // Silent recovery - individual records not logged
        }
      }, 'recover orphaned records');
      
      console.log(`✅ Recovered ${orphanedRecords.length} orphaned records`);

      console.log(`✅ Recovered ${orphanedRecords.length} orphaned records`);
    } catch (error) {
      console.error('❌ Error recovering orphaned records:', error);
    }
  }

  /**
   * Handle dead workers by marking them as inactive
   */
  private async handleDeadWorkers(deadWorkers: string[]): Promise<void> {
    for (const workerId of deadWorkers) {
      try {
        await dbManager.executeStatementRun(`
          UPDATE worker_heartbeats 
          SET status = 'dead', updated_at = CURRENT_TIMESTAMP
          WHERE worker_id = ?
        `, [workerId], 'mark worker as dead');

        console.log(`💀 Marked worker ${workerId} as dead`);
      } catch (error) {
        console.error(`❌ Failed to mark worker ${workerId} as dead:`, error);
      }
    }
  }

  /**
   * Get current heartbeat monitoring statistics
   */
  async getStats(): Promise<{
    activeWorkers: number;
    deadWorkers: number;
    totalRecordsInProgress: number;
    orphanedRecordsRecovered: number;
    lastCleanupTime: Date;
  }> {
    try {
      // Count active workers
      const activeWorkers = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM worker_heartbeats 
        WHERE status = 'active'
      `, [], 'count active workers');

      // Count dead workers
      const deadWorkers = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM worker_heartbeats 
        WHERE status = 'dead'
      `, [], 'count dead workers');

      // Count records currently in progress
      const recordsInProgress = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM openfoodfacts 
        WHERE import_status = 'processing'
      `, [], 'count records in progress');

      // Count total orphaned records recovered
      const orphanedRecovered = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM orphaned_records_log
      `, [], 'count orphaned records recovered');

      return {
        activeWorkers: activeWorkers.count,
        deadWorkers: deadWorkers.count,
        totalRecordsInProgress: recordsInProgress.count,
        orphanedRecordsRecovered: orphanedRecovered.count,
        lastCleanupTime: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting heartbeat stats:', error);
      return {
        activeWorkers: 0,
        deadWorkers: 0,
        totalRecordsInProgress: 0,
        orphanedRecordsRecovered: 0,
        lastCleanupTime: new Date()
      };
    }
  }

  /**
   * Log cleanup statistics
   */
  private async logCleanupStats(): Promise<void> {
    const stats = await this.getStats();
    
    console.log(`💓 Heartbeat Stats - Active: ${stats.activeWorkers}, Dead: ${stats.deadWorkers}, In Progress: ${stats.totalRecordsInProgress}, Recovered: ${stats.orphanedRecordsRecovered}`);
  }

  /**
   * Get detailed worker status
   */
  getWorkerStatus(): WorkerHeartbeat[] {
    const query = this.db.prepare(`
      SELECT 
        worker_id as workerId,
        last_heartbeat as lastSeen,
        records_in_progress as recordsInProgress,
        current_batch_id as batchId,
        status,
        process_pid as processPid
      FROM worker_heartbeats
      ORDER BY last_heartbeat DESC
    `);

    const workers = query.all() as any[];
    
    return workers.map(worker => ({
      workerId: worker.workerId,
      lastSeen: new Date(worker.lastSeen),
      recordsInProgress: worker.recordsInProgress,
      batchId: worker.batchId
    }));
  }

  /**
   * Cleanup old heartbeat and log records
   */
  cleanupOldRecords(daysOld: number = 7): void {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));

    // Cleanup old dead worker heartbeats
    const cleanupHeartbeats = this.db.prepare(`
      DELETE FROM worker_heartbeats 
      WHERE status = 'dead' AND updated_at < ?
    `);

    const heartbeatsDeleted = cleanupHeartbeats.run(cutoffDate.toISOString());

    // Cleanup old orphaned records log
    const cleanupLogs = this.db.prepare(`
      DELETE FROM orphaned_records_log 
      WHERE created_at < ?
    `);

    const logsDeleted = cleanupLogs.run(cutoffDate.toISOString());

    console.log(`🧹 Cleaned up ${heartbeatsDeleted.changes} old heartbeats and ${logsDeleted.changes} old logs`);
  }

  /**
   * Force recovery of all processing records (emergency use)
   */
  forceRecoverAllProcessingRecords(): number {
    console.log('🚨 EMERGENCY: Force recovering all processing records');

    const transaction = this.db.transaction(() => {
      // Log all processing records as force-recovered
      const logStmt = this.db.prepare(`
        INSERT INTO orphaned_records_log 
        (record_code, original_worker_id, processing_started_at, batch_id, retry_count, recovery_action)
        SELECT 
          code,
          COALESCE(processing_worker_id, 'unknown'),
          COALESCE(processing_started_at, CURRENT_TIMESTAMP),
          batch_id,
          COALESCE(retry_count, 0),
          'force_recovery'
        FROM openfoodfacts 
        WHERE import_status = 'processing'
      `);

      logStmt.run();

      // Reset all processing records
      const resetStmt = this.db.prepare(`
        UPDATE openfoodfacts 
        SET import_status = 'pending',
            processing_worker_id = NULL,
            processing_started_at = NULL,
            batch_id = NULL,
            last_error = 'Force recovered by emergency procedure'
        WHERE import_status = 'processing'
      `);

      const result = resetStmt.run();
      return result.changes;
    });

    const recoveredCount = transaction();
    console.log(`🔄 Force recovered ${recoveredCount} processing records`);
    
    return recoveredCount;
  }

  /**
   * Close heartbeat monitor
   */
  close(): void {
    this.stop();
    // Note: We don't close the db connection here since it's shared
  }
}

export default HeartbeatMonitor;