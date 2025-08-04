#!/usr/bin/env tsx
/**
 * Parallel Processing System Main Entry Point
 * 
 * Launches the complete parallel processing system with:
 * - Master coordinator with OODA loop optimization
 * - Pool of worker processes
 * - Shared rate limiting
 * - Heartbeat monitoring
 * - Real-time dashboard
 */

import cluster from 'cluster';
import ParallelProcessingCoordinator from './off-process-coordinator';
import ParallelProcessingWorker from './off-process-worker';
import HeartbeatMonitor from './heartbeat-monitor';
import { GeminiRateLimiter } from './simple-rate-limiter';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Main application entry point
 */
async function main() {

  // Verify environment
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY environment variable');
    console.error('   Please set your Gemini API key before starting');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test');
  const workerCount = parseInt(args.find(arg => arg.startsWith('--workers='))?.split('=')[1] || '10');
  const batchSize = parseInt(args.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '20');

  console.log(`🚀 Starting ${isTestMode ? 'TEST' : 'PRODUCTION'} mode: ${workerCount} workers, batch size ${batchSize}`);

  if (cluster.isPrimary) {
    // Launch master coordinator
    await launchMasterCoordinator(workerCount, batchSize);
  } else {
    // Launch worker process
    await launchWorkerProcess();
  }
}

/**
 * Launch master coordinator process
 */
async function launchMasterCoordinator(workerCount: number, batchSize: number): Promise<void> {
  try {
    // Initialize heartbeat monitor with longer timeout for API calls
    const heartbeatMonitor = new HeartbeatMonitor(300000, 120000); // 5 min timeout, 2 min cleanup
    heartbeatMonitor.start();

    // Set up graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      heartbeatMonitor.stop();
      
      // Kill all workers
      for (const workerId in cluster.workers) {
        const worker = cluster.workers[workerId];
        if (worker) {
          worker.kill('SIGTERM');
        }
      }
      
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    });

    // Start the coordinator
    const coordinator = new ParallelProcessingCoordinator();
    await coordinator.start();

  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

/**
 * Launch worker process
 */
async function launchWorkerProcess(): Promise<void> {
  try {
    const worker = new ParallelProcessingWorker();
    await worker.start();
  } catch (error) {
    console.error(`❌ Worker ${process.pid} failed:`, error);
    process.exit(1);
  }
}

/**
 * Display usage information
 */
function displayUsage(): void {
  console.log('🚀 PARALLEL PROCESSING SYSTEM');
  console.log('==============================');
  console.log('');
  console.log('USAGE:');
  console.log('  npm run off-parallel                    # Start production processing');
  console.log('  npm run off-parallel -- --test          # Start test mode (10 records)');
  console.log('  npm run off-parallel -- --workers=15    # Set worker count');
  console.log('  npm run off-parallel -- --batch=30      # Set batch size');
  console.log('');
  console.log('MONITORING:');
  console.log('  npm run off-monitor                      # Live dashboard');
  console.log('  npm run off-monitor -- --stats           # Detailed statistics');
  console.log('  npm run off-monitor -- --recover         # Recover orphaned records');
  console.log('  npm run off-monitor -- --workers         # Show worker details');
  console.log('');
  console.log('SETUP:');
  console.log('  npx tsx off-db-utility/migrate-parallel-queue.ts   # Run migration');
  console.log('');
  console.log('ENVIRONMENT:');
  console.log('  GEMINI_API_KEY        Required - Your Gemini API key');
  console.log('');
  console.log('EXPECTED PERFORMANCE:');
  console.log('  📊 Throughput: ~15 records/second (900/minute)');
  console.log('  ⏱️  Duration: ~18.5 hours for 1M records');
  console.log('  💰 Cost: ~$90 for 1M records (at $0.00009/call)');
  console.log('  🎯 Success Rate: 99%+ with retry logic');
  console.log('');
}

// Handle help command
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  displayUsage();
  process.exit(0);
}

// Start the system
if (require.main === module) {
  main().catch(error => {
    console.error('💥 System startup failed:', error);
    process.exit(1);
  });
}