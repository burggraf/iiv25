#!/usr/bin/env python3
"""
Import Open Food Facts CSV data into the SQLite database as 'openfoodfacts' table.
"""

import sqlite3
import csv
import os
from datetime import datetime

def get_csv_columns(csv_path):
    """Get the column headers from the CSV file."""
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter='\t')
        return next(reader)

def create_openfoodfacts_table(conn, columns):
    """Create the openfoodfacts table with dynamic columns."""
    cursor = conn.cursor()
    
    # Drop existing table
    cursor.execute('DROP TABLE IF EXISTS openfoodfacts')
    
    # Create table with all columns as TEXT (simplest approach)
    column_defs = [f'"{col}" TEXT' for col in columns]
    create_sql = f'CREATE TABLE openfoodfacts ({", ".join(column_defs)})'
    
    cursor.execute(create_sql)
    
    # Create index on code (barcode)
    cursor.execute('CREATE INDEX idx_openfoodfacts_code ON openfoodfacts(code)')
    
    conn.commit()
    print(f"✅ Created openfoodfacts table with {len(columns)} columns")
    return columns

def import_csv_data(conn, csv_path, columns):
    """Import CSV data in batches."""
    cursor = conn.cursor()
    
    # Increase CSV field size limit for very large fields
    csv.field_size_limit(10000000)  # 10MB limit
    
    # Speed optimizations
    cursor.execute('PRAGMA journal_mode = WAL')
    cursor.execute('PRAGMA synchronous = NORMAL')
    cursor.execute('PRAGMA cache_size = 1000000')
    
    # Prepare insert statement
    placeholders = ', '.join(['?' for _ in columns])
    insert_sql = f'INSERT INTO openfoodfacts VALUES ({placeholders})'
    
    batch_size = 10000
    batch = []
    total_imported = 0
    
    print("🔄 Starting CSV import...")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter='\t')
        next(reader)  # Skip header
        
        for row_num, row in enumerate(reader, 1):
            # Pad or truncate row to match column count
            if len(row) < len(columns):
                row.extend([''] * (len(columns) - len(row)))
            elif len(row) > len(columns):
                row = row[:len(columns)]
            
            batch.append(row)
            
            if len(batch) >= batch_size:
                cursor.executemany(insert_sql, batch)
                total_imported += len(batch)
                batch = []
                
                if total_imported % 1000000 == 0:
                    print(f"   Imported {total_imported:,} records...")
                    conn.commit()
        
        # Import remaining batch
        if batch:
            cursor.executemany(insert_sql, batch)
            total_imported += len(batch)
    
    conn.commit()
    print(f"✅ Import completed: {total_imported:,} records")
    return total_imported

def main():
    """Main import function."""
    csv_path = '/Users/markb/dev/openfoodfacts/en.openfoodfacts.org.products.csv'
    db_path = 'off-database.db'
    
    print("🚀 Open Food Facts CSV Import")
    print("=" * 40)
    print(f"📁 CSV file: {csv_path}")
    print(f"📁 Database: {db_path}")
    
    if not os.path.exists(csv_path):
        print(f"❌ CSV file not found: {csv_path}")
        return
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        return
    
    start_time = datetime.now()
    
    try:
        # Get CSV structure
        print("📋 Reading CSV structure...")
        columns = get_csv_columns(csv_path)
        print(f"   Found {len(columns)} columns")
        
        # Connect to database
        conn = sqlite3.connect(db_path)
        
        # Create table
        create_openfoodfacts_table(conn, columns)
        
        # Import data
        total_imported = import_csv_data(conn, csv_path, columns)
        
        # Final statistics
        end_time = datetime.now()
        duration = end_time - start_time
        
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM openfoodfacts')
        final_count = cursor.fetchone()[0]
        
        file_size = os.path.getsize(db_path) / (1024*1024)
        
        print("\n" + "=" * 50)
        print("📊 IMPORT COMPLETED")
        print("=" * 50)
        print(f"⏱️  Duration: {duration}")
        print(f"📊 Records imported: {total_imported:,}")
        print(f"📊 Records in table: {final_count:,}")
        print(f"💾 Database size: {file_size:.1f} MB")
        print("✅ Import successful!")
        
        # Show sample data
        print("\n📋 Sample records:")
        cursor.execute('SELECT code, product_name, brands FROM openfoodfacts WHERE product_name IS NOT NULL AND product_name != "" LIMIT 5')
        for row in cursor.fetchall():
            print(f"   {row[0]}: {row[1]} ({row[2]})")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()