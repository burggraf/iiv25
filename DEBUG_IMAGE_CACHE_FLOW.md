# Image Cache Debug Flow - Comprehensive Logging Guide

## Overview
This document outlines the comprehensive debugging added to trace the complete image caching flow from photo upload to UI update.

## Expected Flow When Photo Upload Completes

1. **Background Job Processing** → `backgroundQueueService.ts`
2. **Event Emission** → `backgroundQueueService.ts` 
3. **Event Reception** → Multiple subscribers
4. **Cache Invalidation** → `CacheInvalidationService.ts`
5. **Database Refresh** → `ProductLookupService.ts`
6. **Cache Update** → `CacheService.ts`
7. **UI Component Updates** → Via cache event listeners

## Debug Log Patterns to Look For

### 1. App Initialization (AppContext)
```
🚀 [AppContext] *** INITIALIZING APP SERVICES ***
🚀 [AppContext] Step 3: Initializing cache invalidation service...
✅ [AppContext] Cache invalidation service status: { isInitialized: true, isListeningToJobs: true }
```

### 2. Background Job Event Subscription Setup
```
📡 [BackgroundQueue] *** SETTING UP EVENT SUBSCRIPTION ***
📡 [BackgroundQueue] Registering listener for events: ["job_added", "job_updated", "job_completed", "job_failed", "jobs_cleared"]
🔄 [CacheInvalidation] Subscribing to background job events...
```

### 3. Photo Upload Job Processing
```
📸 [BackgroundQueue] *** PROCESSING PHOTO UPLOAD JOB ***
📸 [BackgroundQueue] Step 1: Uploading image to storage...
💾 [ProductImageUploadService] *** UPDATING DATABASE IMAGE URL ***
✅ [ProductImageUploadService] *** DATABASE UPDATE SUCCESSFUL ***
```

### 4. Job Completion Event Emission
```
🎉 [BackgroundQueue] *** EMITTING JOB_COMPLETED EVENT ***
📡 [BackgroundQueue] job_completed event emitted for job [jobId]
```

### 5. Cache Invalidation Service Receiving Event
```
🎯 [CacheInvalidation] *** RECEIVED EVENT: job_completed ***
📸 [CacheInvalidation] *** PHOTO UPLOAD COMPLETED ***
📸 [CacheInvalidation] Starting cache refresh with image cache busting...
```

### 6. Fresh Product Data Fetch & Cache Busting
```
📸 [CacheInvalidation] Step 1: Fetching fresh product data from database...
📸 [CacheInvalidation] Step 3: Adding image cache busting to product...
📸 [CacheInvalidation] *** ADDING CACHE BUSTING ***
📸 [CacheInvalidation] Added cache busting timestamp: [timestamp]
```

### 7. Cache Update
```
💾 [CacheService] *** SETTING PRODUCT IN CACHE ***
💾 [CacheService] Product image URL: [SUPABASE]?v=[timestamp]
📡 [CacheService] *** NOTIFYING CACHE LISTENERS ***
✅ [CacheService] *** PRODUCT CACHED SUCCESSFULLY ***
```

### 8. Image URL Resolution in UI
```
📸 [ProductImageUrlService] *** RESOLVING IMAGE URL ***
📸 [ProductImageUrlService] *** CACHE BUSTING DETECTED ***
📸 [ProductImageUrlService] Final resolved URL: [full_supabase_url]?v=[timestamp]
```

### 9. useBackgroundJobs Hook Event Reception
```
🎣 [useBackgroundJobs] *** RECEIVED JOB EVENT: job_completed ***
🎣 [useBackgroundJobs] *** PHOTO UPLOAD JOB COMPLETED ***
🎣 [useBackgroundJobs] This should trigger cache invalidation!
```

## Troubleshooting Guide

### If NO cache invalidation happens:

**Check for these log patterns:**

1. **Service Not Initialized:**
   ```
   ❌ [AppContext] Cache invalidation service failed to initialize!
   ❌ [AppContext] Cache invalidation service is not listening to job events!
   ```

2. **No Event Subscription:**
   ```
   Missing: 📡 [BackgroundQueue] *** SETTING UP EVENT SUBSCRIPTION ***
   ```

3. **Events Not Being Emitted:**
   ```
   Missing: 🎉 [BackgroundQueue] *** EMITTING JOB_COMPLETED EVENT ***
   ```

4. **CacheInvalidationService Not Receiving Events:**
   ```
   Missing: 🎯 [CacheInvalidation] *** RECEIVED EVENT: job_completed ***
   ```

### If cache invalidation starts but fails:

**Look for these error patterns:**

1. **Database Fetch Fails:**
   ```
   ⚠️ [CacheInvalidation] Could not fetch fresh product data for [upc]
   ❌ [CacheInvalidation] Cache refresh FAILED
   ```

2. **Image URL Not Updated in Database:**
   ```
   ⚠️ [ProductImageUploadService] Image URL mismatch!
   💾 [ProductImageUploadService] Max retries reached, giving up
   ```

3. **Cache Update Fails:**
   ```
   ⚠️ [CacheService] No listeners registered for cache events!
   ❌ [CacheService] Error in cache event listener
   ```

### If cache updates but UI doesn't refresh:

**Check for these patterns:**

1. **Image URL Resolution Issues:**
   ```
   📸 [ProductImageUrlService] Unknown image URL format: [url]
   📸 [ProductImageUrlService] No cache busting, resolved URL: [url]
   ```

2. **React Native Image Component Not Detecting Changes:**
   - Look for cache-busted URLs with `?v=timestamp`
   - Verify timestamp is different from previous

## Key Files Modified

- `/src/services/CacheInvalidationService.ts` - Core cache invalidation logic
- `/src/services/backgroundQueueService.ts` - Job processing and event emission
- `/src/services/productImageUrlService.ts` - Image URL resolution and cache busting
- `/src/services/productImageUploadService.ts` - Database image URL updates
- `/src/services/CacheService.ts` - Cache operations and listener notifications
- `/src/hooks/useBackgroundJobs.ts` - Event subscription in UI
- `/src/context/AppContext.tsx` - Service initialization

## Testing the Flow

1. Upload a new photo for a product
2. Watch the logs for the complete flow above
3. Verify each step completes successfully
4. Check that the UI shows the new image immediately after job completion

The logs will now clearly show exactly where the flow breaks if cache invalidation isn't working.