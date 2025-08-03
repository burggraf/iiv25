# Off-Database Utility

Successfully exported Supabase database to SQLite for offline analysis.

## Files

- `off-database.db` - Complete SQLite database (381 MB)
- `direct_export.py` - Export script that created the database
- `README.md` - This file

## Database Contents

### Products Table (411,497 records)
- Complete product information with ingredients, classifications, and metadata
- Primary key: ean13
- Includes vegan/vegetarian classifications

### Ingredients Table (227,849 records)  
- Ingredient classifications and product counts
- Indexed for fast lookups

## Export Results

- **Duration**: 58.9 seconds
- **Products**: 411,497 records ✅
- **Ingredients**: 227,849 records ✅
- **Total**: 639,346 records
- **Database size**: 381.1 MB

## Usage

The SQLite database is ready for analysis:

```bash
sqlite3 off-database.db
```

Sample queries:
```sql
-- Count by classification
SELECT classification, COUNT(*) FROM products GROUP BY classification;

-- Find vegan products
SELECT product_name, brand FROM products WHERE classification = 'vegan' LIMIT 10;

-- Top ingredient classes
SELECT class, COUNT(*) FROM ingredients WHERE class IS NOT NULL GROUP BY class ORDER BY COUNT(*) DESC;
```

## Database Schema

### Products
```sql
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
);
```

### Ingredients
```sql
CREATE TABLE ingredients (
    title TEXT UNIQUE,
    class TEXT,
    productcount INTEGER DEFAULT 0,
    lastupdated TEXT,
    created TEXT,
    primary_class TEXT
);
```

Export completed successfully on 2025-08-03.