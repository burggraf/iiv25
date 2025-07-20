# Is It Vegan? - React Native/Expo App Plan

## Project Overview
A cross-platform mobile app that allows users to scan food product barcodes and instantly determine if the product is vegan, vegetarian, or neither.

## Technology Stack
- **Framework**: React Native with Expo
- **Deployment**: iOS App Store and Google Play Store
- **Barcode Scanning**: Expo Camera + Barcode Scanner
- **Backend Database**: Supabase (PostgreSQL) - Primary product/ingredient data source
- **Product Data**: Open Food Facts API - Secondary/fallback data source
- **State Management**: React Context/Redux Toolkit
- **Navigation**: React Navigation
- **UI Components**: React Native Elements or NativeBase

## Phase 1: Project Setup & Scaffolding
1. Initialize Expo project with TypeScript
2. Set up project structure and folder organization
3. Configure development environment
4. Install core dependencies (navigation, UI library)
5. Set up version control and basic CI/CD

## Phase 2: Core Features Development
1. **Barcode Scanner Implementation**
   - Integrate Expo Camera for barcode scanning
   - Handle camera permissions
   - Parse barcode data (UPC/EAN codes)

2. **Supabase Database Integration**
   - Set up Supabase client configuration
   - Create SupabaseService for product/ingredient queries
   - Implement VeganClassificationService using existing classification field
   - Query products table by UPC/EAN13 for instant results

3. **Product Data Flow**
   - Primary: Query Supabase database for existing products
   - Images: Always fetch product images from OpenFoodFacts for display
   - Secondary: Fallback to Open Food Facts API for missing products
   - Sync: Add new products from OpenFoodFacts to Supabase database
   - Classification: Use enhanced multi-strategy vegan analysis

4. **User Interface**
   - Home screen with scan button
   - Camera view with scanning overlay
   - Results screen showing vegan status with data source indicator
   - Product details view with ingredient breakdown
   - History/favorites functionality

## Phase 3: Enhanced Features
1. **User Experience Improvements**
   - Add loading states and error handling
   - Implement search functionality (manual product lookup)
   - Add user preferences and settings
   - Include ingredient explanations

2. **Data & Performance**
   - Implement caching for scanned products
   - Add offline mode support
   - Optimize app performance and bundle size

## Phase 4: Deployment & Distribution
1. **App Store Preparation**
   - Generate app icons and splash screens
   - Configure app.json for both platforms
   - Test on physical devices
   - Prepare store listings and metadata

2. **Release Management**
   - Set up Expo Application Services (EAS)
   - Configure build pipelines
   - Submit to app stores
   - Set up analytics and crash reporting

## Service Architecture

### Core Services
1. **SupabaseService** (`src/services/supabaseService.ts`)
   - Database connection and configuration
   - Product queries by UPC/EAN13
   - Ingredient lookups and classifications
   - Product insertion from OpenFoodFacts data

2. **VeganClassificationService** (`src/services/veganClassificationService.ts`)
   - Extract and enhance existing classification logic
   - Map classification field to VeganStatus enum
   - Ingredient-level classification using ingredients table
   - Consistent classification across data sources

3. **ProductService** (`src/services/productService.ts`)
   - Main orchestration service
   - Implements data flow: Supabase → OpenFoodFacts (images) → Manual
   - Always fetches product images from OpenFoodFacts for display
   - Handles caching and synchronization
   - Provides unified Product interface

4. **Enhanced OpenFoodFactsService** (`src/services/openFoodFactsApi.ts`)
   - Modified to work as secondary data source
   - Integration with SupabaseService for product syncing
   - Maintains existing sophisticated classification logic

### Data Models
- **Product Interface**: Updated to include data source tracking
- **Ingredient Interface**: Enhanced with Supabase classification mapping
- **Classification Details**: Enriched with confidence scores and source attribution

## Development Commands
```bash
# Create new Expo project
npx create-expo-app@latest IsItVegan --template

# Install Supabase dependencies
npm install @supabase/supabase-js react-native-url-polyfill react-native-dotenv

# Development
npm start
npm run ios
npm run android

# Supabase Integration
# Set up environment variables (.env file):
# SUPABASE_URL=your-supabase-project-url
# SUPABASE_ANON_KEY=your-supabase-anon-key

# Test database connections
npm run test:db

# Build for production
eas build --platform all
eas submit --platform all
```

## Data Integration Architecture

### Primary Data Source: Supabase Database
- **Products Table**: 411,000+ products with UPC/EAN13, ingredients, calculated vegan status
- **Ingredients Table**: 227,000+ ingredients with vegan/vegetarian classifications
- **Classification System**: Uses classification field for vegan status determination
- **Performance**: Instant local database queries for existing products

### Secondary Data Source: Open Food Facts API
- **Purpose**: Fallback for products not in Supabase database
- **Integration**: When product found in OpenFoodFacts, add to Supabase for future queries
- **Barcode Format**: Support UPC-A, UPC-E, EAN-13, EAN-8
- **Vegan Classification**: Enhanced multi-strategy analysis (structured, product-level, text-based)

### Data Flow Strategy
1. **Barcode Scan** → Query Supabase products table by UPC/EAN13
2. **If Found in Supabase**: 
   - Use existing classification field + ingredients classification
   - Query OpenFoodFacts API for product image and additional metadata
3. **If Not Found in Supabase**: Query Open Food Facts API for complete product data
4. **If Found in OpenFoodFacts**: Process with VeganClassificationService and add to Supabase
5. **Fallback**: Manual ingredient entry for completely unknown products

## Key Dependencies to Research
- **Database & Backend**:
  - @supabase/supabase-js (Supabase client for React Native)
  - react-native-url-polyfill (Required for Supabase)
- **Core App**:
  - expo-camera
  - expo-barcode-scanner
  - @react-navigation/native
  - react-native-elements or nativebase
- **API & Storage**:
  - axios for API calls (OpenFoodFacts fallback)
  - react-native-async-storage (local caching)
- **Environment**:
  - react-native-dotenv (environment variables for Supabase config)

## Next Steps
1. **Supabase Integration Setup**
   - Configure Supabase client with environment variables
   - Create SupabaseService for database queries
   - Test connection to existing products/ingredients tables

2. **VeganClassificationService Development**
   - Extract classification logic from OpenFoodFactsService
   - Implement classification field mapping to VeganStatus
   - Create ingredient-level classification using ingredients table

3. **ProductService Implementation**
   - Build main orchestration service
   - Implement Supabase → OpenFoodFacts → Manual data flow
   - Add product synchronization from OpenFoodFacts to Supabase

4. **Enhanced User Interface**
   - Update existing screens to use new ProductService
   - Add data source indicators (Supabase vs OpenFoodFacts)
   - Implement enhanced product details with ingredient breakdown

5. **Testing & Optimization**
   - Test with existing 411K+ products in Supabase
   - Optimize query performance for barcode lookups
   - Validate classification accuracy with existing data