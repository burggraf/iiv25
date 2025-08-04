#!/usr/bin/env tsx
/**
 * Parallel Processing Monitor and Recovery Utility
 * 
 * Provides real-time monitoring, statistics, and recovery commands
 * for the parallel processing system
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { GeminiRateLimiter } from './shared-rate-limiter';
import HeartbeatMonitor from './heartbeat-monitor';

interface ProcessingStats {
  eligible: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  noIngredients: number;
  errors: number;
  total: number;
  progressPercent: number;
}

interface PerformanceStats {
  recordsPerSecond: number;
  estimatedHoursRemaining: number;
  totalApiCalls: number;
  totalApiCost: number;
  averageCostPerRecord: number;
  errorRate: number;
}

interface WorkerStats {
  activeWorkers: number;
  deadWorkers: number;
  totalRecordsInProgress: number;
  orphanedRecordsRecovered: number;
}

class ParallelProcessingMonitor {
  private db: Database.Database;
  private heartbeatMonitor: HeartbeatMonitor;
  private startTime: Date = new Date();

  constructor() {
    // Initialize database connection
    const dbPath = path.join(__dirname, 'off-database.db');
    this.db = new Database(dbPath);
    
    // Initialize heartbeat monitor
    this.heartbeatMonitor = new HeartbeatMonitor();
    
    console.log('📊 Parallel Processing Monitor initialized');
  }

  /**
   * Display comprehensive dashboard
   */
  async displayDashboard(): Promise<void> {
    console.clear();
    console.log('🚀 PARALLEL PROCESSING MONITOR - LIVE DASHBOARD');
    console.log('='.repeat(80));
    console.log(`⏰ Current Time: ${new Date().toLocaleString()}`);
    console.log(`⏱️  Monitor Started: ${this.startTime.toLocaleString()}`);
    console.log('');

    // Processing Statistics
    const processingStats = this.getProcessingStats();
    console.log('📊 PROCESSING STATISTICS:');
    console.log(`  📋 Total Records: ${processingStats.total.toLocaleString()}`);
    console.log(`  ✅ Completed: ${processingStats.completed.toLocaleString()} (${((processingStats.completed / processingStats.total) * 100).toFixed(1)}%)`);
    console.log(`  🔄 Processing: ${processingStats.processing.toLocaleString()}`);
    console.log(`  ⏳ Pending: ${processingStats.pending.toLocaleString()}`);
    console.log(`  ❌ Failed: ${processingStats.failed.toLocaleString()}`);
    console.log(`  ⚠️  No Ingredients: ${processingStats.noIngredients.toLocaleString()}`);
    console.log(`  📈 Progress: ${processingStats.progressPercent.toFixed(2)}%`);
    console.log('');

    // Performance Statistics
    const performanceStats = this.getPerformanceStats();
    console.log('🎯 PERFORMANCE STATISTICS:');
    console.log(`  🚀 Speed: ${performanceStats.recordsPerSecond.toFixed(2)} records/second`);
    console.log(`  ⏳ ETA: ${performanceStats.estimatedHoursRemaining.toFixed(1)} hours remaining`);
    console.log(`  🔥 API Calls: ${performanceStats.totalApiCalls.toLocaleString()}`);
    console.log(`  💰 Total Cost: $${performanceStats.totalApiCost.toFixed(4)}`);
    console.log(`  💵 Avg Cost/Record: $${performanceStats.averageCostPerRecord.toFixed(6)}`);
    console.log(`  ❌ Error Rate: ${performanceStats.errorRate.toFixed(2)}%`);
    console.log('');

    // Rate Limiter Statistics
    const rateLimiterStats = GeminiRateLimiter.getStats();
    console.log('🎚️  RATE LIMITER STATISTICS:');
    console.log(`  🪣 Tokens Available: ${rateLimiterStats.tokens.toFixed(1)} / ${rateLimiterStats.bucketCapacity}`);
    console.log(`  📊 Requests This Second: ${rateLimiterStats.requestsThisSecond} / ${rateLimiterStats.maxRequestsPerSecond}`);
    console.log(`  📈 Utilization: ${rateLimiterStats.utilizationPercent.toFixed(1)}%`);
    console.log('');

    // Worker Statistics
    const workerStats = this.heartbeatMonitor.getStats();
    console.log('👥 WORKER STATISTICS:');
    console.log(`  ✅ Active Workers: ${workerStats.activeWorkers}`);
    console.log(`  💀 Dead Workers: ${workerStats.deadWorkers}`);
    console.log(`  🔄 Records in Progress: ${workerStats.totalRecordsInProgress}`);
    console.log(`  🔄 Orphaned Records Recovered: ${workerStats.orphanedRecordsRecovered}`);
    console.log('');

    // Worker Details
    const workerDetails = this.heartbeatMonitor.getWorkerStatus();
    if (workerDetails.length > 0) {
      console.log('👷 WORKER DETAILS:');
      for (const worker of workerDetails.slice(0, 10)) { // Show top 10 workers
        const timeSinceHeartbeat = Date.now() - worker.lastSeen.getTime();
        const healthStatus = timeSinceHeartbeat < 60000 ? '✅' : '❌';
        console.log(`  ${healthStatus} ${worker.workerId}: ${worker.recordsInProgress} records, last seen ${Math.floor(timeSinceHeartbeat / 1000)}s ago`);
      }
      console.log('');
    }

    // System Resources and Recommendations
    this.displayRecommendations(processingStats, performanceStats, rateLimiterStats);
  }

  /**
   * Get processing statistics
   */
  private getProcessingStats(): ProcessingStats {
    // Get total eligible records
    const eligibleQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM openfoodfacts o
      LEFT OUTER JOIN products p ON o.code = p.upc
      WHERE o.image_ingredients_url IS NOT NULL 
        AND o.image_ingredients_url <> ''
        AND o.image_ingredients_url NOT LIKE '%invalid%'
        AND (p.upc is null or p.analysis is null or p.analysis = '')
    `);
    const eligible = (eligibleQuery.get() as { count: number }).count;

    // Get status counts
    const statusQuery = this.db.prepare(`
      SELECT 
        import_status,
        COUNT(*) as count
      FROM openfoodfacts o
      LEFT OUTER JOIN products p ON o.code = p.upc
      WHERE o.image_ingredients_url IS NOT NULL 
        AND o.image_ingredients_url <> ''
        AND o.image_ingredients_url NOT LIKE '%invalid%'
        AND (p.upc is null or p.analysis is null or p.analysis = '')
      GROUP BY import_status
    `);

    const statusCounts = statusQuery.all() as { import_status: string | null; count: number }[];
    
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let noIngredients = 0;
    let errors = 0;

    for (const status of statusCounts) {
      switch (status.import_status) {
        case null:
        case 'pending':
          pending += status.count;
          break;
        case 'processing':
          processing += status.count;
          break;
        case 'created':
        case 'updated':
          completed += status.count;
          break;
        case 'failed':
          failed += status.count;
          break;
        case 'no_ingredients':
          noIngredients += status.count;
          break;
        case 'error':
          errors += status.count;
          break;
      }
    }

    const total = eligible;
    const processed = completed + failed + noIngredients + errors;
    const progressPercent = total > 0 ? (processed / total) * 100 : 0;

    return {
      eligible,
      pending,
      processing,
      completed,
      failed,
      noIngredients,
      errors,
      total,
      progressPercent
    };
  }

  /**
   * Get performance statistics
   */
  private getPerformanceStats(): PerformanceStats {
    const runtimeSeconds = (Date.now() - this.startTime.getTime()) / 1000;
    
    // Get completed records count
    const completedQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM openfoodfacts 
      WHERE import_status IN ('created', 'updated', 'failed', 'no_ingredients', 'error')
    `);
    const completedRecords = (completedQuery.get() as { count: number }).count;

    // Get pending records count
    const pendingQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM openfoodfacts o
      LEFT OUTER JOIN products p ON o.code = p.upc
      WHERE o.image_ingredients_url IS NOT NULL 
        AND o.image_ingredients_url <> ''
        AND o.image_ingredients_url NOT LIKE '%invalid%'
        AND (p.upc is null or p.analysis is null or p.analysis = '')
        AND (o.import_status IS NULL OR o.import_status = 'pending')
    `);
    const pendingRecords = (pendingQuery.get() as { count: number }).count;

    // Calculate performance metrics
    const recordsPerSecond = runtimeSeconds > 0 ? completedRecords / runtimeSeconds : 0;
    const estimatedHoursRemaining = recordsPerSecond > 0 ? pendingRecords / recordsPerSecond / 3600 : 0;

    // Estimate API usage (assume 1 API call per successful record)
    const successfulRecords = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM openfoodfacts 
      WHERE import_status IN ('created', 'updated')
    `).get() as { count: number };

    const totalApiCalls = successfulRecords.count;
    const totalApiCost = totalApiCalls * 0.00009; // Estimated based on previous runs
    const averageCostPerRecord = completedRecords > 0 ? totalApiCost / completedRecords : 0;

    // Calculate error rate
    const errorRecords = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM openfoodfacts 
      WHERE import_status IN ('failed', 'error')
    `).get() as { count: number };

    const errorRate = completedRecords > 0 ? (errorRecords.count / completedRecords) * 100 : 0;

    return {
      recordsPerSecond,
      estimatedHoursRemaining,
      totalApiCalls,
      totalApiCost,
      averageCostPerRecord,
      errorRate
    };
  }

  /**
   * Display system recommendations
   */
  private displayRecommendations(
    processingStats: ProcessingStats,
    performanceStats: PerformanceStats,
    rateLimiterStats: any
  ): void {
    console.log('💡 RECOMMENDATIONS:');

    if (performanceStats.recordsPerSecond < 10) {
      console.log('  ⚠️  Low throughput detected - consider scaling up workers');
    }

    if (performanceStats.errorRate > 10) {
      console.log('  ❌ High error rate detected - check worker logs and API connectivity');
    }

    if (rateLimiterStats.utilizationPercent < 50) {
      console.log('  📈 Rate limiter underutilized - can increase worker count or batch size');
    }

    if (rateLimiterStats.utilizationPercent > 90) {
      console.log('  🔥 Rate limiter near capacity - consider reducing worker count');
    }

    if (processingStats.processing > 100) {
      console.log('  🔄 Many records stuck in processing - run recovery command');
    }

    console.log('');
    console.log('🔧 AVAILABLE COMMANDS:');
    console.log('  npm run off-monitor -- --stats     # Show detailed statistics');
    console.log('  npm run off-monitor -- --recover   # Recover orphaned records');
    console.log('  npm run off-monitor -- --reset     # Reset rate limiter');
    console.log('  npm run off-monitor -- --workers   # Show worker details');
    console.log('  npm run off-monitor -- --live      # Live dashboard (default)');
    console.log('');
  }

  /**
   * Show detailed statistics
   */
  showDetailedStats(): void {
    console.log('📊 DETAILED STATISTICS REPORT');
    console.log('='.repeat(50));

    // Processing breakdown by status
    const statusBreakdown = this.db.prepare(`
      SELECT 
        COALESCE(import_status, 'null') as status,
        COUNT(*) as count,
        MIN(import_status_time) as earliest,
        MAX(import_status_time) as latest
      FROM openfoodfacts o
      LEFT OUTER JOIN products p ON o.code = p.upc
      WHERE o.image_ingredients_url IS NOT NULL 
        AND o.image_ingredients_url <> ''
        AND o.image_ingredients_url NOT LIKE '%invalid%'
        AND (p.upc is null or p.analysis is null or p.analysis = '')
      GROUP BY import_status
      ORDER BY count DESC
    `).all();

    console.log('\n📈 STATUS BREAKDOWN:');
    for (const status of statusBreakdown) {
      console.log(`  ${status.status}: ${status.count.toLocaleString()} records`);
      if (status.earliest) {
        console.log(`    Earliest: ${status.earliest}`);
        console.log(`    Latest: ${status.latest}`);
      }
    }

    // Error analysis
    const errorAnalysis = this.db.prepare(`
      SELECT 
        last_error,
        COUNT(*) as count
      FROM openfoodfacts 
      WHERE last_error IS NOT NULL
      GROUP BY last_error
      ORDER BY count DESC
      LIMIT 10
    `).all();

    if (errorAnalysis.length > 0) {
      console.log('\n❌ TOP ERRORS:');
      for (const error of errorAnalysis) {
        console.log(`  ${error.count}x: ${error.last_error?.substring(0, 80)}...`);
      }
    }

    // Retry analysis
    const retryAnalysis = this.db.prepare(`
      SELECT 
        retry_count,
        COUNT(*) as count
      FROM openfoodfacts 
      WHERE retry_count IS NOT NULL AND retry_count > 0
      GROUP BY retry_count
      ORDER BY retry_count
    `).all();

    if (retryAnalysis.length > 0) {
      console.log('\n🔄 RETRY ANALYSIS:');
      for (const retry of retryAnalysis) {
        console.log(`  ${retry.retry_count} retries: ${retry.count} records`);
      }
    }
  }

  /**
   * Recover orphaned records
   */
  async recoverOrphanedRecords(): Promise<void> {
    console.log('🔧 RECOVERY OPERATIONS');
    console.log('='.repeat(30));

    // Start heartbeat monitor for recovery
    this.heartbeatMonitor.start();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Let it run for 2 seconds
    this.heartbeatMonitor.stop();

    console.log('✅ Recovery operations completed');
  }

  /**
   * Reset rate limiter
   */
  resetRateLimiter(): void {
    console.log('🔄 Resetting rate limiter...');
    GeminiRateLimiter.reset();
    console.log('✅ Rate limiter reset completed');
  }

  /**
   * Show worker details
   */
  showWorkerDetails(): void {
    console.log('👥 WORKER DETAILS');
    console.log('='.repeat(20));

    const workers = this.heartbeatMonitor.getWorkerStatus();
    
    if (workers.length === 0) {
      console.log('No workers found');
      return;
    }

    for (const worker of workers) {
      const timeSinceHeartbeat = Date.now() - worker.lastSeen.getTime();
      const healthStatus = timeSinceHeartbeat < 60000 ? '✅ Healthy' : '❌ Dead';
      
      console.log(`\n🔧 ${worker.workerId}:`);
      console.log(`  Status: ${healthStatus}`);
      console.log(`  Last Seen: ${worker.lastSeen.toLocaleString()}`);
      console.log(`  Time Since Heartbeat: ${Math.floor(timeSinceHeartbeat / 1000)}s`);
      console.log(`  Records in Progress: ${worker.recordsInProgress}`);
      if (worker.batchId) {
        console.log(`  Current Batch: ${worker.batchId}`);
      }
    }
  }

  /**
   * Run live dashboard
   */
  async runLiveDashboard(): Promise<void> {
    console.log('🔴 LIVE DASHBOARD - Press Ctrl+C to exit');
    
    // Display initial dashboard
    await this.displayDashboard();

    // Update every 5 seconds
    const interval = setInterval(async () => {
      await this.displayDashboard();
    }, 5000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n👋 Live dashboard stopped');
      process.exit(0);
    });
  }

  /**
   * Close monitor
   */
  close(): void {
    this.heartbeatMonitor.close();
    this.db.close();
  }
}

// CLI interface
async function main() {
  const monitor = new ParallelProcessingMonitor();
  const args = process.argv.slice(2);

  try {
    if (args.includes('--stats')) {
      monitor.showDetailedStats();
    } else if (args.includes('--recover')) {
      await monitor.recoverOrphanedRecords();
    } else if (args.includes('--reset')) {
      monitor.resetRateLimiter();
    } else if (args.includes('--workers')) {
      monitor.showWorkerDetails();
    } else {
      // Default: live dashboard
      await monitor.runLiveDashboard();
    }
  } catch (error) {
    console.error('❌ Monitor error:', error);
  } finally {
    monitor.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Monitor startup failed:', error);
    process.exit(1);
  });
}

export default ParallelProcessingMonitor;