#!/usr/bin/env tsx
/**
 * Parallel Processing Coordinator with OODA Loop Optimization
 * 
 * Master process that:
 * - Manages pool of worker processes
 * - Implements OODA loop for performance optimization
 * - Enforces shared rate limiting (15 req/sec for Gemini API)
 * - Monitors worker health and performance
 * - Handles scaling decisions and failure recovery
 */

import cluster from 'cluster';
import os from 'os';
import { config } from 'dotenv';
import * as fs from 'fs';
import { dbManager } from './database-manager';

// Load environment variables
config();

interface WorkerMetrics {
  workerId: number;
  pid: number;
  recordsProcessed: number;
  apiCallsCount: number;
  totalApiCost: number;
  lastHeartbeat: Date;
  averageProcessingTime: number;
  errorCount: number;
  isHealthy: boolean;
}

interface PerformanceMetrics {
  totalRecordsProcessed: number;
  totalApiCalls: number;
  totalApiCost: number;
  recordsPerSecond: number;
  apiCallsPerSecond: number;
  errorRate: number;
  queueDepth: number;
  estimatedTimeRemaining: number;
}

interface OodaState {
  observe: {
    currentThroughput: number;
    errorRatePercent: number;
    averageResponseTime: number;
    queueDepth: number;
    workerUtilization: number;
  };
  orient: {
    isPerformanceOptimal: boolean;
    bottleneckIdentified: string | null;
    recommendedAction: string | null;
  };
  decide: {
    targetWorkerCount: number;
    targetBatchSize: number;
    shouldScale: boolean;
  };
  act: {
    lastActionTime: Date;
    actionTaken: string | null;
  };
}

class ParallelProcessingCoordinator {
  private workers: Map<number, WorkerMetrics> = new Map();
  private startTime: Date = new Date();
  private oodaState: OodaState;
  private maxWorkers: number = 20; // Back to working config
  private minWorkers: number = 10;
  private targetWorkers: number = 15; // Proven working configuration
  private batchSize: number = 10; // Back to working batch size
  private rateLimitPerSecond: number = 16; // Gemini's actual limit (1000/min)
  private oodaIntervalMs: number = 30000; // OODA loop every 30 seconds
  private heartbeatTimeoutMs: number = 60000; // 1 minute heartbeat timeout
  private performanceLog: PerformanceMetrics[] = [];
  private isShuttingDown: boolean = false;

  constructor() {
    console.log('🚀 Initializing Parallel Processing Coordinator');
    console.log('================================================');
    
    // Database manager is initialized automatically
    console.log('✅ Using shared database manager');

    // Verify Gemini API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('❌ Missing GEMINI_API_KEY environment variable');
    }
    console.log('✅ Gemini API key configured');

    // Initialize OODA state
    this.oodaState = {
      observe: {
        currentThroughput: 0,
        errorRatePercent: 0,
        averageResponseTime: 0,
        queueDepth: 0,
        workerUtilization: 0
      },
      orient: {
        isPerformanceOptimal: false,
        bottleneckIdentified: null,
        recommendedAction: null
      },
      decide: {
        targetWorkerCount: this.targetWorkers,
        targetBatchSize: this.batchSize,
        shouldScale: false
      },
      act: {
        lastActionTime: new Date(),
        actionTaken: null
      }
    };

    console.log(`✅ STABLE HIGH THROUGHPUT CONFIG:`);
    console.log(`   Rate limit: BYPASSED (Gemini server-side handling)`);
    console.log(`   Worker pool: ${this.targetWorkers} workers (max ${this.maxWorkers})`);
    console.log(`   Batch size: ${this.batchSize} records`);
    console.log(`   Target: 3.5+ records/second (proven stable)`);
    console.log('');

    this.setupSignalHandlers();
    // Note: verifyEligibleRecords is called async in start() method
  }

  /**
   * Start the parallel processing system
   */
  async start(): Promise<void> {
    if (cluster.isPrimary) {
      console.log('🎛️  Starting as Master Coordinator Process');
      console.log(`💻 System: ${os.cpus().length} CPU cores available`);
      console.log(`🎯 Rate limit: ${this.rateLimitPerSecond} requests/second`);
      console.log('');

      await this.startMasterProcess();
    } else {
      // This should not happen in this file - workers are separate
      console.error('❌ Coordinator should only run as master process');
      process.exit(1);
    }
  }

  /**
   * Master process orchestration
   */
  private async startMasterProcess(): Promise<void> {
    console.log('🚀 Master process starting...');

    // Verify eligible records count first
    await this.verifyEligibleRecords();

    // Cleanup any orphaned records from previous runs
    await this.cleanupOrphanedRecords();

    // Start initial worker pool
    await this.scaleWorkerPool(this.targetWorkers);

    // Start OODA loop
    this.startOodaLoop();

    // Start monitoring dashboard
    this.startMonitoringDashboard();

    console.log('✅ Master coordinator fully initialized');
    console.log('📊 Processing will begin shortly...');
    console.log('');
  }

  /**
   * Scale worker pool to target size
   */
  private async scaleWorkerPool(targetCount: number): Promise<void> {
    const currentCount = this.workers.size;
    
    if (targetCount > currentCount) {
      // Scale up
      const toAdd = targetCount - currentCount;
      console.log(`📈 Scaling UP: adding ${toAdd} workers (${currentCount} → ${targetCount})`);
      
      for (let i = 0; i < toAdd; i++) {
        await this.spawnWorker();
        await this.delay(200); // Minimal stagger for ultra-fast startup
      }
    } else if (targetCount < currentCount) {
      // Scale down
      const toRemove = currentCount - targetCount;
      console.log(`📉 Scaling DOWN: removing ${toRemove} workers (${currentCount} → ${targetCount})`);
      
      const workersToStop = Array.from(this.workers.keys()).slice(0, toRemove);
      for (const workerId of workersToStop) {
        this.stopWorker(workerId);
      }
    }

    console.log(`👥 Worker pool adjusted: ${this.workers.size} active workers`);
  }

  /**
   * Spawn a new worker process
   */
  private async spawnWorker(): Promise<void> {
    const worker = cluster.fork({
      WORKER_BATCH_SIZE: this.batchSize.toString(),
      RATE_LIMIT_PER_WORKER: Math.ceil(this.rateLimitPerSecond / this.targetWorkers).toString(),
      GEMINI_API_KEY: process.env.GEMINI_API_KEY
    });

    const metrics: WorkerMetrics = {
      workerId: worker.id,
      pid: worker.process.pid!,
      recordsProcessed: 0,
      apiCallsCount: 0,
      totalApiCost: 0,
      lastHeartbeat: new Date(),
      averageProcessingTime: 0,
      errorCount: 0,
      isHealthy: true
    };

    this.workers.set(worker.id, metrics);

    // Handle worker messages
    worker.on('message', (message: any) => {
      this.handleWorkerMessage(worker.id, message);
    });

    // Handle worker exit
    worker.on('exit', (code, signal) => {
      console.log(`⚠️  Worker ${worker.id} (PID ${worker.process.pid}) exited: code=${code}, signal=${signal}`);
      this.workers.delete(worker.id);
      
      // Restart worker if not shutting down
      if (!this.isShuttingDown && code !== 0) {
        console.log(`🔄 Restarting crashed worker ${worker.id}...`);
        setTimeout(() => this.spawnWorker(), 2000);
      }
    });

    console.log(`✅ Spawned worker ${worker.id} (PID ${worker.process.pid})`);
  }

  /**
   * Stop a worker process gracefully
   */
  private stopWorker(workerId: number): void {
    const worker = cluster.workers![workerId];
    if (worker) {
      console.log(`🛑 Stopping worker ${workerId}...`);
      worker.kill('SIGTERM');
      this.workers.delete(workerId);
    }
  }

  /**
   * Handle messages from worker processes
   */
  private handleWorkerMessage(workerId: number, message: any): void {
    const metrics = this.workers.get(workerId);
    if (!metrics) return;

    switch (message.type) {
      case 'heartbeat':
        metrics.lastHeartbeat = new Date();
        metrics.isHealthy = true;
        break;

      case 'progress':
        metrics.recordsProcessed += message.recordsProcessed || 0;
        metrics.apiCallsCount += message.apiCalls || 0;
        metrics.totalApiCost += message.apiCost || 0;
        metrics.averageProcessingTime = message.averageProcessingTime || metrics.averageProcessingTime;
        break;

      case 'error':
        metrics.errorCount++;
        console.error(`❌ Worker ${workerId} reported error:`, message.error);
        break;

      case 'completed_batch':
        console.log(`✅ Worker ${workerId} completed batch: ${message.recordsProcessed} records processed`);
        break;
    }

    this.workers.set(workerId, metrics);
  }

  /**
   * OODA Loop Implementation
   */
  private startOodaLoop(): void {
    setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.executeOodaLoop();
    }, this.oodaIntervalMs);

    console.log(`🎯 OODA loop started (${this.oodaIntervalMs / 1000}s interval)`);
  }

  /**
   * Execute one OODA loop cycle
   */
  private async executeOodaLoop(): Promise<void> {
    // OBSERVE: Collect current metrics
    await this.observe();

    // ORIENT: Analyze situation and identify issues
    this.orient();

    // DECIDE: Make scaling/optimization decisions
    this.decide();

    // ACT: Execute decisions
    await this.act();

    // Log OODA state
    this.logOodaState();
  }

  /**
   * OBSERVE: Collect performance metrics
   */
  private async observe(): Promise<void> {
    const now = new Date();
    const runtimeSeconds = (now.getTime() - this.startTime.getTime()) / 1000;
    
    // Calculate aggregate metrics
    let totalRecords = 0;
    let totalApiCalls = 0;
    let totalApiCost = 0;
    let totalErrors = 0;
    let healthyWorkers = 0;

    for (const metrics of this.workers.values()) {
      totalRecords += metrics.recordsProcessed;
      totalApiCalls += metrics.apiCallsCount;
      totalApiCost += metrics.totalApiCost;
      totalErrors += metrics.errorCount;
      
      // Check worker health (heartbeat timeout)
      const timeSinceHeartbeat = now.getTime() - metrics.lastHeartbeat.getTime();
      metrics.isHealthy = timeSinceHeartbeat < this.heartbeatTimeoutMs;
      
      if (metrics.isHealthy) healthyWorkers++;
    }

    // Get current queue depth
    const queueDepth = await this.getQueueDepth();

    // Update observe state
    this.oodaState.observe = {
      currentThroughput: runtimeSeconds > 0 ? totalRecords / runtimeSeconds : 0,
      errorRatePercent: totalRecords > 0 ? (totalErrors / totalRecords) * 100 : 0,
      averageResponseTime: totalApiCalls > 0 ? runtimeSeconds / totalApiCalls : 0,
      queueDepth: queueDepth,
      workerUtilization: this.workers.size > 0 ? healthyWorkers / this.workers.size : 0
    };
  }

  /**
   * ORIENT: Analyze current situation
   */
  private orient(): void {
    const obs = this.oodaState.observe;
    
    // Determine if performance is optimal (more aggressive targets)
    const targetThroughput = this.rateLimitPerSecond * 0.5; // 50% of API limit still good
    const isPerformanceOptimal = obs.currentThroughput >= targetThroughput && 
                                obs.errorRatePercent < 8 &&
                                obs.workerUtilization > 0.7;

    // Identify bottlenecks
    let bottleneck = null;
    let recommendation = null;

    if (obs.currentThroughput < targetThroughput * 0.4) {
      if (obs.workerUtilization < 0.7) {
        bottleneck = 'insufficient_workers';
        recommendation = 'scale_up_workers';
      } else if (obs.errorRatePercent > 15) {
        bottleneck = 'high_error_rate';
        recommendation = 'reduce_batch_size';
      } else {
        bottleneck = 'rate_limit_too_conservative';
        recommendation = 'scale_up_workers';
      }
    } else if (obs.errorRatePercent > 25) {
      bottleneck = 'system_overload';
      recommendation = 'scale_down_workers';
    }

    this.oodaState.orient = {
      isPerformanceOptimal,
      bottleneckIdentified: bottleneck,
      recommendedAction: recommendation
    };
  }

  /**
   * DECIDE: Make optimization decisions
   */
  private decide(): void {
    const orient = this.oodaState.orient;
    let targetWorkerCount = this.workers.size;
    let targetBatchSize = this.batchSize;
    let shouldScale = false;

    switch (orient.recommendedAction) {
      case 'scale_up_workers':
        targetWorkerCount = Math.min(this.maxWorkers, this.workers.size + 4); // Ultra aggressive scaling
        shouldScale = targetWorkerCount !== this.workers.size;
        break;

      case 'scale_down_workers':
        targetWorkerCount = Math.max(this.minWorkers, this.workers.size - 1);
        shouldScale = targetWorkerCount !== this.workers.size;
        break;

      case 'reduce_batch_size':
        targetBatchSize = Math.max(1, this.batchSize - 1); // Can go down to 1 record batches
        break;

      case 'increase_batch_size':
        targetBatchSize = Math.min(5, this.batchSize + 1); // Keep batches small
        break;
    }

    this.oodaState.decide = {
      targetWorkerCount,
      targetBatchSize,
      shouldScale
    };
  }

  /**
   * ACT: Execute optimization decisions
   */
  private async act(): Promise<void> {
    const decide = this.oodaState.decide;
    let actionTaken = null;

    // Execute scaling decision
    if (decide.shouldScale) {
      await this.scaleWorkerPool(decide.targetWorkerCount);
      actionTaken = `scaled_to_${decide.targetWorkerCount}_workers`;
    }

    // Execute batch size change
    if (decide.targetBatchSize !== this.batchSize) {
      this.batchSize = decide.targetBatchSize;
      actionTaken = actionTaken ? `${actionTaken}_and_batch_size_${this.batchSize}` : `batch_size_${this.batchSize}`;
      
      // Notify workers of new batch size
      for (const workerId of this.workers.keys()) {
        const worker = cluster.workers![workerId];
        if (worker) {
          worker.send({ type: 'update_batch_size', batchSize: this.batchSize });
        }
      }
    }

    this.oodaState.act = {
      lastActionTime: new Date(),
      actionTaken
    };
  }

  /**
   * Log OODA state for monitoring
   */
  private logOodaState(): void {
    // Only log if there's an action taken or bottleneck
    if (this.oodaState.act.actionTaken || this.oodaState.orient.bottleneckIdentified) {
      console.log(`🎯 OODA: ${this.oodaState.observe.currentThroughput.toFixed(1)} rec/sec, ${this.workers.size} workers, ${this.oodaState.observe.queueDepth.toLocaleString()} queue`);
      if (this.oodaState.act.actionTaken) {
        console.log(`   Action: ${this.oodaState.act.actionTaken}`);
      }
    }
  }

  /**
   * Start monitoring dashboard
   */
  private startMonitoringDashboard(): void {
    setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.displayDashboard();
    }, 10000); // Update every 10 seconds

    console.log('📊 Monitoring dashboard started (10s interval)');
  }

  /**
   * Display real-time dashboard
   */
  private async displayDashboard(): Promise<void> {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🚀 [${timestamp}] Is It Vegan - Processing Status`);
    console.log('='.repeat(55));

    const now = new Date();
    const runtimeSeconds = (now.getTime() - this.startTime.getTime()) / 1000;
    const runtimeHours = runtimeSeconds / 3600;

    // Get actual completed records and API costs from database (accurate across restarts)
    const totalRecords = await this.getCompletedRecordsCount();
    const apiCostData = await this.getApiCostData();
    
    // Aggregate error metrics from workers
    let totalErrors = 0;
    for (const metrics of this.workers.values()) {
      totalErrors += metrics.errorCount;
    }

    const queueDepth = await this.getQueueDepth();
    const recordsPerSecond = runtimeSeconds > 0 ? totalRecords / runtimeSeconds : 0;
    const estimatedHoursRemaining = recordsPerSecond > 0 ? queueDepth / recordsPerSecond / 3600 : 0;
    
    // Calculate pricing metrics using database data
    const totalApiCost = apiCostData.totalCost;
    const totalApiCalls = apiCostData.totalCalls;
    const avgCostPerRecord = totalRecords > 0 ? totalApiCost / totalRecords : 0;
    const avgCostPerCall = totalApiCalls > 0 ? totalApiCost / totalApiCalls : 0;
    const totalRecordsToProcess = totalRecords + queueDepth;
    const estimatedTotalCost = totalRecordsToProcess * avgCostPerRecord;

    console.log(`⏱️  Runtime: ${Math.floor(runtimeHours)}h ${Math.floor((runtimeHours % 1) * 60)}m | 👥 Workers: ${this.workers.size} active`);
    console.log(`📊 Progress: ${totalRecords.toLocaleString()} / ${totalRecordsToProcess.toLocaleString()} records (${((totalRecords/totalRecordsToProcess)*100).toFixed(1)}%)`);
    console.log(`🎯 Speed: ${recordsPerSecond.toFixed(2)} records/sec | ⏳ ETA: ${estimatedHoursRemaining.toFixed(1)} hours remaining`);
    console.log(`💰 API Cost: $${totalApiCost.toFixed(4)} total | $${avgCostPerCall.toFixed(6)}/call | $${avgCostPerRecord.toFixed(6)}/record`);
    console.log(`💰 Estimated Total: $${estimatedTotalCost.toFixed(2)} for all ${totalRecordsToProcess.toLocaleString()} records`);
    console.log(`❌ Errors: ${totalErrors} (${totalRecords > 0 ? ((totalErrors/totalRecords)*100).toFixed(1) : 0}%)`);
    console.log('');
  }

  /**
   * Get current queue depth
   */
  private async getQueueDepth(): Promise<number> {
    try {
      const result = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM openfoodfacts o
        LEFT OUTER JOIN products p ON o.code = p.upc
        WHERE o.image_ingredients_url IS NOT NULL 
          AND o.image_ingredients_url <> ''
          AND o.image_ingredients_url NOT LIKE '%invalid%'
          AND (p.upc is null or p.analysis is null or p.analysis = '')
          AND (o.import_status IS NULL OR o.import_status = 'pending')
      `, [], 'get queue depth');
      
      return result.count;
    } catch (error) {
      console.error('❌ Error getting queue depth:', error);
      return 0;
    }
  }

  /**
   * Get actual completed records count from database
   */
  private async getCompletedRecordsCount(): Promise<number> {
    try {
      const result = await dbManager.executeStatement<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM openfoodfacts 
        WHERE import_status IN ('completed', 'updated', 'created')
      `, [], 'get completed records count');
      
      return result.count;
    } catch (error) {
      console.error('❌ Error getting completed records count:', error);
      return 0;
    }
  }

  /**
   * Get API cost data from database
   */
  private async getApiCostData(): Promise<{ totalCost: number; totalCalls: number }> {
    try {
      // Create table if it doesn't exist
      await dbManager.executeStatementRun(`
        CREATE TABLE IF NOT EXISTS api_cost_tracking (
          id INTEGER PRIMARY KEY,
          total_cost REAL DEFAULT 0,
          total_calls INTEGER DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, [], 'create api cost tracking table');

      const result = await dbManager.executeStatement<{ total_cost: number; total_calls: number }>(`
        SELECT total_cost, total_calls 
        FROM api_cost_tracking 
        WHERE id = 1
      `, [], 'get api cost data');
      
      return {
        totalCost: result?.total_cost || 0,
        totalCalls: result?.total_calls || 0
      };
    } catch (error) {
      console.error('❌ Error getting API cost data:', error);
      return { totalCost: 0, totalCalls: 0 };
    }
  }

  /**
   * Cleanup orphaned records from previous runs
   */
  private async cleanupOrphanedRecords(): Promise<void> {
    console.log('🧹 Cleaning up orphaned records...');
    
    try {
      const result = await dbManager.executeStatementRun(`
        UPDATE openfoodfacts 
        SET import_status = 'pending', 
            processing_worker_id = NULL, 
            processing_started_at = NULL,
            batch_id = NULL
        WHERE import_status = 'processing'
      `, [], 'cleanup orphaned records');

      if (result.changes > 0) {
        console.log(`✅ Cleaned up ${result.changes} orphaned records`);
      } else {
        console.log('✅ No orphaned records found');
      }
    } catch (error) {
      console.error('❌ Error cleaning up orphaned records:', error);
    }
  }

  /**
   * Verify eligible records count
   */
  private async verifyEligibleRecords(): Promise<void> {
    const count = await this.getQueueDepth();
    console.log(`📊 Total eligible records: ${count.toLocaleString()}`);
    
    if (count === 0) {
      console.log('⚠️  No records to process - exiting');
      process.exit(0);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n🛑 Received ${signal} - initiating graceful shutdown...`);
    this.isShuttingDown = true;

    // Stop spawning new workers
    console.log('⏹️  Stopping worker spawning...');

    // Send shutdown signal to all workers
    console.log(`👥 Signaling ${this.workers.size} workers to shutdown...`);
    for (const workerId of this.workers.keys()) {
      const worker = cluster.workers![workerId];
      if (worker) {
        worker.send({ type: 'shutdown' });
      }
    }

    // Wait for workers to finish current batches
    console.log('⏳ Waiting for workers to complete current batches...');
    await this.delay(10000); // Give workers 10 seconds to finish

    // Force kill remaining workers
    for (const workerId of this.workers.keys()) {
      const worker = cluster.workers![workerId];
      if (worker) {
        console.log(`🔪 Force killing worker ${workerId}...`);
        worker.kill('SIGKILL');
      }
    }

    // Database connection is managed by dbManager - no need to close here
    console.log('✅ Database cleanup handled by dbManager');

    console.log('🎉 Graceful shutdown complete');
    process.exit(0);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start coordinator if called directly
if (require.main === module) {
  const coordinator = new ParallelProcessingCoordinator();
  coordinator.start().catch(error => {
    console.error('💥 Coordinator startup failed:', error);
    process.exit(1);
  });
}

export default ParallelProcessingCoordinator;