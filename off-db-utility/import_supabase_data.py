#!/usr/bin/env python3
"""
Direct Supabase to SQLite export using credentials.
Simple approach that connects directly to PostgreSQL and exports data.
"""

import os
import sqlite3
import psycopg2
from datetime import datetime
import sys

# Supabase connection - will use environment variable or prompt
CONNECTION_URL = os.environ.get('DATABASE_URL', '')

def create_sqlite_db():
    """Create SQLite database with schema and speed optimizations."""
    conn = sqlite3.connect('off-database.db')
    cursor = conn.cursor()
    
    # Speed optimizations
    cursor.execute('PRAGMA journal_mode = WAL')
    cursor.execute('PRAGMA synchronous = NORMAL') 
    cursor.execute('PRAGMA cache_size = 1000000')
    cursor.execute('PRAGMA temp_store = memory')
    
    # Drop and recreate tables
    cursor.execute('DROP TABLE IF EXISTS products')
    cursor.execute('DROP TABLE IF EXISTS ingredients')
    
    # Create products table
    cursor.execute('''
        CREATE TABLE products (
            product_name TEXT,
            brand TEXT,
            upc TEXT,
            ean13 TEXT PRIMARY KEY,
            ingredients TEXT,
            lastupdated TEXT,
            analysis TEXT,
            created TEXT,
            mfg TEXT,
            imageurl TEXT,
            classification TEXT,
            issues TEXT
        )
    ''')
    
    # Create ingredients table
    cursor.execute('''
        CREATE TABLE ingredients (
            title TEXT UNIQUE,
            class TEXT,
            productcount INTEGER DEFAULT 0,
            lastupdated TEXT,
            created TEXT,
            primary_class TEXT
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX idx_products_ean13 ON products(ean13)')
    cursor.execute('CREATE INDEX idx_products_classification ON products(classification)')
    cursor.execute('CREATE INDEX idx_ingredients_title ON ingredients(title)')
    cursor.execute('CREATE INDEX idx_ingredients_class ON ingredients(class)')
    
    conn.commit()
    return conn

def export_products(pg_conn, sqlite_conn):
    """Export products from PostgreSQL to SQLite."""
    print("🔄 Exporting products...")
    
    pg_cursor = pg_conn.cursor()
    sqlite_cursor = sqlite_conn.cursor()
    
    # Get total count
    pg_cursor.execute("SELECT COUNT(*) FROM products")
    total = pg_cursor.fetchone()[0]
    print(f"   Total products: {total:,}")
    
    # Export in larger batches for speed
    batch_size = 10000  # 10x larger batches
    offset = 0
    exported = 0
    
    while offset < total:
        pg_cursor.execute("""
            SELECT product_name, brand, upc, ean13, ingredients, lastupdated,
                   analysis, created, mfg, imageurl, classification, issues
            FROM products 
            ORDER BY ean13
            LIMIT %s OFFSET %s
        """, (batch_size, offset))
        
        rows = pg_cursor.fetchall()
        if not rows:
            break
            
        # Insert into SQLite
        sqlite_cursor.executemany('''
            INSERT OR REPLACE INTO products 
            (product_name, brand, upc, ean13, ingredients, lastupdated,
             analysis, created, mfg, imageurl, classification, issues)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', rows)
        
        exported += len(rows)
        offset += batch_size
        
        if exported % 50000 == 0 or exported == total:  # Less frequent updates
            print(f"   Exported {exported:,} / {total:,} products ({(exported/total)*100:.1f}%)")
        sqlite_conn.commit()
    
    print(f"✅ Products completed: {exported:,} records")
    return exported

def export_ingredients(pg_conn, sqlite_conn):
    """Export ingredients from PostgreSQL to SQLite."""
    print("\n🔄 Exporting ingredients...")
    
    pg_cursor = pg_conn.cursor()
    sqlite_cursor = sqlite_conn.cursor()
    
    # Get total count
    pg_cursor.execute("SELECT COUNT(*) FROM ingredients")
    total = pg_cursor.fetchone()[0]
    print(f"   Total ingredients: {total:,}")
    
    # Export in larger batches for speed
    batch_size = 20000  # Much larger batches for ingredients
    offset = 0
    exported = 0
    
    while offset < total:
        pg_cursor.execute("""
            SELECT title, class, productcount, lastupdated, created, primary_class
            FROM ingredients 
            ORDER BY title
            LIMIT %s OFFSET %s
        """, (batch_size, offset))
        
        rows = pg_cursor.fetchall()
        if not rows:
            break
            
        # Insert into SQLite
        sqlite_cursor.executemany('''
            INSERT OR REPLACE INTO ingredients
            (title, class, productcount, lastupdated, created, primary_class)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', rows)
        
        exported += len(rows)
        offset += batch_size
        
        if exported % 100000 == 0 or exported == total:  # Less frequent updates  
            print(f"   Exported {exported:,} / {total:,} ingredients ({(exported/total)*100:.1f}%)")
        sqlite_conn.commit()
    
    print(f"✅ Ingredients completed: {exported:,} records")
    return exported

def main():
    """Main export function."""
    print("🚀 Direct Supabase to SQLite Export")
    print("=" * 40)
    
    # Connection configured in script
    
    start_time = datetime.now()
    
    try:
        # Connect to Supabase PostgreSQL
        print("📡 Connecting to Supabase...")
        pg_conn = psycopg2.connect(
            host="hostname",
            port=5432,
            database="postgres", 
            user="username",
            password="password"
        )
        print("✅ Connected to Supabase")
        
        # Create SQLite database
        print("📦 Creating SQLite database...")
        sqlite_conn = create_sqlite_db()
        print("✅ SQLite database created")
        
        # Export data
        products_count = export_products(pg_conn, sqlite_conn)
        ingredients_count = export_ingredients(pg_conn, sqlite_conn)
        
        # Final report
        end_time = datetime.now()
        duration = end_time - start_time
        file_size = os.path.getsize('off-database.db') / (1024*1024)
        
        print("\n" + "=" * 50)
        print("📊 EXPORT COMPLETED")
        print("=" * 50)
        print(f"⏱️  Duration: {duration}")
        print(f"📊 Products: {products_count:,}")
        print(f"📊 Ingredients: {ingredients_count:,}")
        print(f"📊 Total records: {products_count + ingredients_count:,}")
        print(f"💾 Database size: {file_size:.1f} MB")
        print(f"📁 File: off-database.db")
        print("✅ Export successful!")
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        if 'pg_conn' in locals():
            pg_conn.close()
        if 'sqlite_conn' in locals():
            sqlite_conn.close()

if __name__ == "__main__":
    main()