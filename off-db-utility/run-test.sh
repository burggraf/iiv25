#!/bin/bash

# OpenFoodFacts SQLite Ingredient Processing Test Runner
# This script runs the ingredient processor on existing OpenFoodFacts data

echo "🚀 OpenFoodFacts SQLite Ingredient Processing Test"
echo "================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check environment variables
if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  WARNING: GEMINI_API_KEY not set"
    echo "   Make sure to set your environment variable:"
    echo "   export GEMINI_API_KEY=your-gemini-api-key"
    echo ""
fi

# Check if SQLite database exists
if [ ! -f "off-db-utility/off-database.db" ]; then
    echo "❌ SQLite database not found at off-db-utility/off-database.db"
    echo "   Please ensure the database file exists with openfoodfacts, products and ingredients tables"
    exit 1
fi

echo "✅ SQLite database found: off-db-utility/off-database.db"

# Check tables exist
echo "🔍 Checking database tables..."
TABLES=$(sqlite3 off-db-utility/off-database.db ".tables")
if [[ $TABLES == *"openfoodfacts"* && $TABLES == *"products"* && $TABLES == *"ingredients"* ]]; then
    echo "✅ All required tables found: openfoodfacts, products, ingredients"
else
    echo "❌ Missing required tables in database"
    echo "   Found tables: $TABLES"
    exit 1
fi

# Check OpenFoodFacts records
RECORD_COUNT=$(sqlite3 off-db-utility/off-database.db "SELECT COUNT(*) FROM openfoodfacts WHERE image_ingredients_url IS NOT NULL and image_ingredients_url NOT LIKE '%invalid%';")
echo "📊 Found $RECORD_COUNT OpenFoodFacts records with ingredient image URLs"

if [ "$RECORD_COUNT" -eq 0 ]; then
    echo "❌ No records with ingredient image URLs found"
    exit 1
fi

# Run ingredient processing
echo ""
echo "📋 Running ingredient processing (test mode - 10 records)..."
npm run off-process
if [ $? -ne 0 ]; then
    echo "❌ Ingredient processing failed"
    exit 1
fi
echo "✅ Ingredient processing completed successfully"
echo ""

echo "🎉 Test completed successfully!"
echo ""
echo "Next steps:"
echo "- Check the openfoodfacts table for status updates:"
echo "  sqlite3 off-db-utility/off-database.db \"SELECT import_status, COUNT(*) FROM openfoodfacts GROUP BY import_status;\""
echo "- Review the products table for newly created/updated records"
echo "- Check the ingredients table for new ingredients"
echo "- Run 'npm run off-process:full' for full processing"