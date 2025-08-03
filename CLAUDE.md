# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Is It Vegan? - A React Native/Expo app that scans product barcodes to determine vegan/vegetarian status. Published on iOS App Store, Android in development.

## Technology Stack

- **React Native** with **Expo SDK 53** and **Expo Router** (file-based routing)
- **TypeScript** with strict mode and path aliases (@/\*)
- **Supabase** for authentication and PostgreSQL database (411K+ products)
- **Open Food Facts API** as secondary data source
- **EAS Build** for deployment to iOS TestFlight and Android APK

## Development Commands

### Core Development

```bash
npm start           # Start Expo development server
npm run android     # Run on Android device/emulator
npm run ios         # Run on iOS device/simulator
npm run web         # Run on web browser
```

### Building & Deployment

#### Production Builds
```bash
npm run build:android     # Build Android APK (production)
npm run build:ios        # Build iOS TestFlight (production)
npm run build:production # Build for production (both platforms)
npm run submit:ios       # Submit to App Store
```

#### Development Builds
```bash
npm run build:dev-android    # Build Android APK (development environment)
npm run build:dev-ios       # Build iOS (development environment)
npm run build:testflight-dev # Build iOS TestFlight (development environment)
```

### Testing & Quality

```bash
npm run test        # Run all tests
npm run lint        # Run ESLint (flat config format)
npm run type-check  # Run TypeScript compiler check
```

## Environment Management

### Development vs Production

The app uses **two separate Supabase projects** for complete environment isolation:

- **Production**: `wlatnzsnrlwykkriovwd` (isitvegan) - `https://isitvegan.supabase.co`
- **Development**: `wpjqtgkfgvheisgcxhxu` (isitvegan-dev) - `https://wpjqtgkfgvheisgcxhxu.supabase.co`

### Environment Switching

```bash
npm run supabase:dev      # Switch to DEVELOPMENT environment
npm run supabase:prod     # Switch to PRODUCTION environment  
npm run supabase:status   # Show current linked environment
```

### Environment Indicators

- **Visual Banner**: Development builds show environment banner at top of app
- **App Names**: "Is It Vegan?" (prod) vs "Is It Vegan? (Dev)" (dev)
- **Bundle IDs**: `net.isitvegan.free` (prod) vs `net.isitvegan.dev` (dev)
- **Settings Screen**: Shows environment, backend URL, and build info

### Database Migrations

**CRITICAL**: All database schema changes MUST go through migrations only. Never modify production database directly.

```bash
# Create new migration
supabase migration new migration_name

# Test in development
npm run migrate:dev        # Apply migrations to development
npm run supabase:dev       # Ensure linked to dev first

# Deploy to production (after testing)
npm run migrate:prod       # Apply migrations to production
npm run supabase:prod      # Ensure linked to prod first
```

### Edge Functions Deployment

```bash
# Deploy to development
npm run functions:deploy:dev   # Deploy all functions to development

# Deploy to production  
npm run functions:deploy:prod  # Deploy all functions to production
```

## Testing Requirements

- **Write tests for all new features** unless explicitly told not to
- **Run tests before committing** to ensure code quality and functionality
- Use `npm run test` to verify all tests pass before making commits
- Tests should cover both happy path and edge cases for new functionality

## Architecture Overview

### Routing & Navigation

- **Expo Router** with file-based routing in `/app/` directory
- **Authentication Flow**: `/app/index.tsx` → `/app/auth/` or `/app/(tabs)/`
- **Tab Navigation**: Home, Scanner, Manual, History, Search in `/app/(tabs)/`

### State Management

- **React Context API** with AuthContext and AppContext providers
- **Authentication**: Supabase Auth with PKCE flow (email, Google, anonymous)
- **Local Storage**: AsyncStorage for offline caching

### Data Architecture (Hybrid Approach)

1. **Primary**: Supabase PostgreSQL database (products and ingredients tables)
2. **Secondary**: Open Food Facts API for missing products
3. **Flow**: Supabase query → OFF API fallback → sync new products to Supabase
4. **Images**: Always fetched from Open Food Facts for display

### Key Services Layer (`/src/services/`)

- **ProductLookupService**: Main orchestration for product searches
- **SupabaseService**: Database queries and operations
- **OpenFoodFactsService**: External API with enhanced vegan classification
- **VeganClassificationService**: Multi-strategy ingredient analysis
- **ProductImageUrlService**: Image URL resolution and caching

### Directory Structure

```
app/                 # Expo Router pages and layouts
├── (tabs)/         # Tab navigation screens
├── auth/           # Authentication screens
├── _layout.tsx     # Root layout with providers
└── index.tsx       # Authentication routing logic

src/
├── components/     # Reusable UI components
├── context/        # React Context providers
├── hooks/          # Custom React hooks
├── screens/        # Screen components (legacy)
├── services/       # Business logic and API services
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Important Configuration

### Environment Setup

- **Supabase**: Requires SUPABASE_URL and SUPABASE_ANON_KEY in environment
- **Bundle ID**: `net.isitvegan.free`
- **Metro Config**: Custom resolver with polyfills for crypto/URL APIs
- **EAS Config**: Profiles for development, preview, production, testflight

### Type Safety

- Comprehensive TypeScript definitions in `/src/types/index.ts`
- Path aliases configured: `@/*` maps to `src/*`
- Strict TypeScript configuration with all strict checks enabled

### Key Data Models

- **Product**: Core product interface with UPC/EAN13, ingredients, vegan status
- **VeganStatus**: Enum (VEGAN, VEGETARIAN, NOT_VEGETARIAN, UNKNOWN)
- **Ingredient**: Enhanced with Supabase classification mapping
- **User**: Supabase auth user with profile management

## Production Considerations

- **iOS**: Published on App Store, TestFlight builds via EAS
- **Android**: APK builds ready for Google Play Store
- **Database**: 411K+ products in Supabase with UPC/EAN13 indexing
- **Images**: CDN optimized through Open Food Facts
- **Auth**: Production-ready with multiple OAuth providers

## Critical Files to Understand

- `/app/_layout.tsx`: Root providers and navigation setup
- `/src/services/ProductLookupService.ts`: Main product search orchestration
- `/src/types/index.ts`: Complete type definitions
- `/src/context/AuthContext.tsx`: Authentication state management
- `app.json` & `eas.json`: Build and deployment configuration

## Available Claude Agents

- **react-native-specialist**: Mobile development, barcode scanning, cross-platform features
- **api-integration-specialist**: Supabase, Open Food Facts API, payment integrations  
- **testing-specialist**: Jest testing and quality assurance
- **deployment-specialist**: EAS builds and app store submissions

Usage: `> Use [agent-name] to [describe task]`
