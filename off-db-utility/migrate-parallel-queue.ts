#!/usr/bin/env tsx
/**
 * Database Migration for Parallel Processing Queue System
 * 
 * Adds columns to openfoodfacts table to support:
 * - Atomic record claiming by workers
 * - Heartbeat monitoring for failure detection
 * - Retry logic for failed records
 * - Error tracking
 */

import Database from 'better-sqlite3';
import * as path from 'path';

class ParallelQueueMigration {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, 'off-database.db');
    this.db = new Database(dbPath);
    console.log('✅ Connected to SQLite database for migration');
  }

  /**
   * Apply migration to add parallel processing columns
   */
  migrate(): void {
    console.log('🚀 Starting parallel queue migration...');

    // Begin transaction for atomic migration
    const transaction = this.db.transaction(() => {
      // Add columns for parallel processing queue
      const columnsToAdd = [
        { name: 'processing_worker_id', type: 'TEXT', description: 'ID of worker currently processing this record' },
        { name: 'processing_started_at', type: 'DATETIME', description: 'When processing started (for heartbeat monitoring)' },
        { name: 'retry_count', type: 'INTEGER DEFAULT 0', description: 'Number of retry attempts' },
        { name: 'last_error', type: 'TEXT', description: 'Last error message if processing failed' },
        { name: 'priority', type: 'INTEGER DEFAULT 0', description: 'Processing priority (higher = more important)' },
        { name: 'batch_id', type: 'TEXT', description: 'Batch identifier for grouped processing' }
      ];

      // Check existing columns first
      const existingColumns = this.db.prepare("PRAGMA table_info(openfoodfacts)").all();
      const existingColumnNames = new Set(existingColumns.map((col: any) => col.name));

      let addedCount = 0;
      for (const column of columnsToAdd) {
        if (!existingColumnNames.has(column.name)) {
          try {
            this.db.exec(`ALTER TABLE openfoodfacts ADD COLUMN ${column.name} ${column.type}`);
            console.log(`✅ Added column: ${column.name} - ${column.description}`);
            addedCount++;
          } catch (error) {
            console.error(`❌ Failed to add column ${column.name}:`, error);
            throw error;
          }
        } else {
          console.log(`⏭️  Column ${column.name} already exists, skipping`);
        }
      }

      // Create indexes for performance
      const indexes = [
        {
          name: 'idx_openfoodfacts_processing_worker',
          sql: 'CREATE INDEX IF NOT EXISTS idx_openfoodfacts_processing_worker ON openfoodfacts(processing_worker_id, processing_started_at)'
        },
        {
          name: 'idx_openfoodfacts_import_status_priority',
          sql: 'CREATE INDEX IF NOT EXISTS idx_openfoodfacts_import_status_priority ON openfoodfacts(import_status, priority DESC, code)'
        },
        {
          name: 'idx_openfoodfacts_eligible_records',
          sql: 'CREATE INDEX IF NOT EXISTS idx_openfoodfacts_eligible_records ON openfoodfacts(image_ingredients_url, import_status, processing_worker_id)'
        }
      ];

      for (const index of indexes) {
        try {
          this.db.exec(index.sql);
          console.log(`✅ Created index: ${index.name}`);
        } catch (error) {
          console.error(`❌ Failed to create index ${index.name}:`, error);
          throw error;
        }
      }

      // Update any existing 'processing' records to 'pending' (cleanup from previous runs)
      const cleanupResult = this.db.prepare(`
        UPDATE openfoodfacts 
        SET import_status = 'pending', 
            processing_worker_id = NULL, 
            processing_started_at = NULL 
        WHERE import_status = 'processing'
      `).run();

      if (cleanupResult.changes > 0) {
        console.log(`🧹 Cleaned up ${cleanupResult.changes} orphaned 'processing' records`);
      }

      console.log(`📊 Migration completed: ${addedCount} columns added, ${indexes.length} indexes created`);
    });

    // Execute migration transaction
    transaction();

    // Verify migration
    this.verifyMigration();
  }

  /**
   * Verify migration was successful
   */
  private verifyMigration(): void {
    console.log('🔍 Verifying migration...');

    const columns = this.db.prepare("PRAGMA table_info(openfoodfacts)").all();
    const columnNames = columns.map((col: any) => col.name);

    const requiredColumns = [
      'processing_worker_id',
      'processing_started_at', 
      'retry_count',
      'last_error',
      'priority',
      'batch_id'
    ];

    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('✅ Migration verification passed - all columns present');
      
      // Count eligible records
      const eligibleCount = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM openfoodfacts o
        LEFT OUTER JOIN products p ON o.code = p.upc
        WHERE o.image_ingredients_url IS NOT NULL 
          AND o.image_ingredients_url <> ''
          AND o.image_ingredients_url NOT LIKE '%invalid%'
          AND (p.upc is null or p.analysis is null or p.analysis = '')
          AND (o.import_status IS NULL OR o.import_status = 'pending')
      `).get() as { count: number };

      console.log(`📊 Found ${eligibleCount.count.toLocaleString()} eligible records for processing`);
      
    } else {
      console.error('❌ Migration verification failed - missing columns:', missingColumns);
      throw new Error(`Migration incomplete: missing columns ${missingColumns.join(', ')}`);
    }
  }

  /**
   * Rollback migration (remove added columns)
   */
  rollback(): void {
    console.log('⏪ Rolling back migration...');
    console.log('⚠️  SQLite does not support DROP COLUMN, manual intervention required');
    console.log('   Consider recreating the table if rollback is necessary');
  }

  close(): void {
    this.db.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new ParallelQueueMigration();
  try {
    migration.migrate();
    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    migration.close();
  }
}

export default ParallelQueueMigration;