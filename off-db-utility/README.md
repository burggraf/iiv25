# Off-Database Utility

This directory contains utilities for working with OpenFoodFacts data and processing ingredients using AI within the local SQLite database.

## Files

- `off-database.db` - Complete SQLite database (381 MB) with openfoodfacts, products, and ingredients tables
- `process-ingredients.ts` - **NEW**: AI-powered ingredient processing utility
- `run-test.sh` - **NEW**: Complete test workflow script
- `import_openfoodfacts.py` - Import OFF CSV data into SQLite
- `import_supabase_data.py` - Export Supabase data to SQLite
- `README.md` - This file

## OpenFoodFacts Ingredient Processing Utility

### Overview
The `process-ingredients.ts` utility processes existing OpenFoodFacts records from the SQLite database, uses Gemini AI to extract ingredients from image URLs, and updates the products table. **Everything is contained within SQLite - no external database connections required.**

### Key Features
- ✅ Works entirely with existing SQLite database
- ✅ Processes records from the existing openfoodfacts table (4M+ records with ingredient images)
- ✅ Uses Gemini 1.5 Flash API for AI-powered ingredient extraction
- ✅ Updates/creates products table with ingredient data  
- ✅ Creates missing ingredients in ingredients table
- ✅ Comprehensive status tracking and error handling
- ✅ Test mode (10 records) and full processing mode
- ✅ Rate limiting and API cost tracking
- ✅ UPC/EAN13 normalization and barcode handling
- ✅ Automatically adds missing columns to products table

### Prerequisites

1. **SQLite Database**: The `off-database.db` file with openfoodfacts, products, and ingredients tables
2. **Environment Variable**: Set `GEMINI_API_KEY=your-api-key`
3. **Dependencies**: Run `npm install` to install required packages

### Usage

#### Quick Start (Automated)
```bash
# Run the complete test workflow
./off-db-utility/run-test.sh
```

#### Manual Commands
```bash
# Set environment variable
export GEMINI_API_KEY=your-gemini-api-key

# Install dependencies
npm install

# Process 10 test records
npm run off-process

# Process all eligible records (when ready)
npm run off-process:full
```

### How It Works

1. **Query**: Finds OpenFoodFacts records with valid `image_ingredients_url` that don't already have corresponding products with analysis
2. **Filter**: Excludes records where products already exist with valid analysis data
3. **Process**: For each eligible record:
   - Fetches ingredient image from OpenFoodFacts CDN
   - Converts to base64 for Gemini API
   - Extracts ingredients using AI (same prompt as parse-ingredients function)
   - Updates existing product or creates new product record
   - Creates missing ingredients in ingredients table
   - Updates status tracking in openfoodfacts table
4. **Report**: Provides comprehensive processing summary

### Database Processing Logic

The utility follows your exact requirements:

1. **Source Query**: 
   ```sql
   SELECT o.* FROM openfoodfacts o
   LEFT JOIN products p ON (p.upc = o.code OR p.ean13 = o.code)
   WHERE o.image_ingredients_url IS NOT NULL 
     AND o.image_ingredients_url != ''
     AND o.image_ingredients_url NOT LIKE '%invalid%'
     AND (p.upc IS NULL OR p.analysis IS NULL OR p.analysis = '')
   ```

2. **Product Updates**:
   - **Existing products**: Updates ingredients, analysis, lastupdated, ingredients_url
   - **New products**: Creates with openfoodfacts data (product_name → product_name, brands → brand, code → upc/ean13)

3. **Ingredient Creation**: Adds missing ingredients to ingredients table with title, created, lastupdated

4. **Status Tracking**: Updates openfoodfacts.import_status to 'updated', 'created', 'skipped', etc.

### Status Tracking (openfoodfacts table)
- `pending` - Ready for processing (default)
- `processing` - Currently being processed
- `updated` - Existing product updated with new ingredients
- `created` - New product created from OFF data
- `skipped` - Already has valid product with analysis
- `no_ingredients` - Valid image but no ingredients found
- `error` - Processing failed

### Database Schema Updates

The utility automatically adds missing columns to the products table:
- `ingredients_url TEXT` - URL to ingredient image (copied from OFF)
- `import_status TEXT` - Import status tracking  
- `import_status_time TEXT` - Timestamp of last status update

### Example Results

After processing 10 records, you might see:
```sql
-- Check processing status
SELECT import_status, COUNT(*) FROM openfoodfacts 
WHERE import_status IS NOT NULL 
GROUP BY import_status;

-- Results:
-- updated: 3
-- created: 5  
-- skipped: 1
-- no_ingredients: 1
```

### API Costs

The utility tracks Gemini API usage:
- **Gemini 1.5 Flash**: $0.075 per 1M input tokens, $0.30 per 1M output tokens
- **Typical cost per image**: ~$0.001-$0.005 per ingredient extraction
- **10 test records**: Usually under $0.05 total
- **1000 records**: Typically $2-5 depending on image complexity

### Exploring Results

```sql
-- Check processing status
SELECT import_status, COUNT(*) FROM openfoodfacts 
WHERE import_status IS NOT NULL 
GROUP BY import_status;

-- View newly processed products
SELECT p.ean13, p.product_name, p.import_status, LENGTH(p.ingredients) as ingredient_len
FROM products p 
WHERE p.import_status IN ('created', 'updated')
ORDER BY p.import_status_time DESC 
LIMIT 10;

-- Check new ingredients added in last hour
SELECT title, created FROM ingredients 
WHERE created > datetime('now', '-1 hour')
ORDER BY created DESC;
```

---

## Original Database Contents

### Products Table (411,497 records)
- Complete product information with ingredients, classifications, and metadata
- Primary key: ean13
- Includes vegan/vegetarian classifications

### Ingredients Table (227,849 records)  
- Ingredient classifications and product counts
- Indexed for fast lookups

### OpenFoodFacts Table (4M+ records)
- Raw OpenFoodFacts CSV data with all product information
- 3.9M+ records have ingredient image URLs for processing
- Includes product names, brands, nutritional data, and image URLs

## Export Results

- **Duration**: 58.9 seconds
- **Products**: 411,497 records ✅
- **Ingredients**: 227,849 records ✅
- **OpenFoodFacts**: 4M+ records ✅
- **Total**: 4.6M+ records
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

-- OpenFoodFacts records with ingredient images
SELECT COUNT(*) FROM openfoodfacts WHERE image_ingredients_url IS NOT NULL;
```

Export completed successfully on 2025-08-03.