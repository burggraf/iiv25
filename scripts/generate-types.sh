#!/bin/bash

# Create lib directory if it doesn't exist
mkdir -p src/lib

# Generate TypeScript types for Supabase database
supabase gen types typescript --linked > src/lib/database.types.ts

echo "Generated TypeScript types at src/lib/database.types.ts"
