import { cacheService } from './CacheService';
import { backgroundQueueService } from './backgroundQueueService';
import { ProductLookupService } from './productLookupService';
import { ProductImageUrlService } from './productImageUrlService';
import { BackgroundJob } from '../types/backgroundJobs';

/**
 * Centralized cache invalidation service that coordinates cache updates
 * across the entire application when background jobs complete.
 */
class CacheInvalidationService {
  private static instance: CacheInvalidationService;
  private isInitialized = false;
  private unsubscribeFromJobs?: () => void;

  private constructor() {}

  public static getInstance(): CacheInvalidationService {
    if (!CacheInvalidationService.instance) {
      CacheInvalidationService.instance = new CacheInvalidationService();
    }
    return CacheInvalidationService.instance;
  }

  /**
   * Initialize the cache invalidation service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🔄 [CacheInvalidation] Initializing CacheInvalidationService');
    console.log('🔄 [CacheInvalidation] Current timestamp:', new Date().toISOString());

    // Subscribe to background job events
    console.log('🔄 [CacheInvalidation] Subscribing to background job events...');
    this.unsubscribeFromJobs = backgroundQueueService.subscribeToJobUpdates(
      this.handleJobEvent.bind(this)
    );

    this.isInitialized = true;
    console.log('✅ [CacheInvalidation] CacheInvalidationService initialized and listening for job events');
    console.log('✅ [CacheInvalidation] Event subscription active, ready to process:', ['job_completed', 'job_failed', 'jobs_cleared']);
    
    // Test event subscription immediately
    console.log('🔍 [CacheInvalidation] Testing event subscription by logging this initialization');
    
    // Get current background queue stats for debugging
    try {
      const stats = await backgroundQueueService.getQueueStats();
      console.log('📊 [CacheInvalidation] Current queue stats at initialization:', stats);
    } catch (error) {
      console.error('❌ [CacheInvalidation] Error getting queue stats:', error);
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.unsubscribeFromJobs) {
      this.unsubscribeFromJobs();
      this.unsubscribeFromJobs = undefined;
    }
    this.isInitialized = false;
    console.log('🧹 CacheInvalidationService cleaned up');
  }

  /**
   * Handle background job events and coordinate cache invalidation
   */
  private async handleJobEvent(event: string, job?: BackgroundJob): Promise<void> {
    console.log(`🎯 [CacheInvalidation] *** RECEIVED EVENT: ${event} ***`);
    console.log(`🎯 [CacheInvalidation] Event timestamp:`, new Date().toISOString());
    console.log(`🎯 [CacheInvalidation] Service initialized:`, this.isInitialized);
    
    if (!job && event !== 'jobs_cleared') {
      console.log(`⚠️ [CacheInvalidation] No job data received for event: ${event}`);
      return;
    }

    if (job) {
      console.log(`🔄 [CacheInvalidation] Job event details:`, {
        event,
        jobId: job.id?.slice(-8) || 'NO_ID',
        jobType: job.jobType,
        upc: job.upc,
        status: job.status,
        completedAt: job.completedAt?.toISOString(),
        resultData: job.resultData ? 'YES' : 'NO',
        hasError: job.resultData?.error ? 'YES' : 'NO'
      });
    }

    try {
      switch (event) {
        case 'job_completed':
          console.log(`✅ [CacheInvalidation] Processing JOB_COMPLETED for ${job?.jobType}/${job?.upc}`);
          await this.handleJobCompleted(job!);
          break;
        case 'job_failed':
          console.log(`❌ [CacheInvalidation] Processing JOB_FAILED for ${job?.jobType}/${job?.upc}`);
          await this.handleJobFailed(job!);
          break;
        case 'jobs_cleared':
          console.log(`🧹 [CacheInvalidation] Processing JOBS_CLEARED`);
          await this.handleAllJobsCleared();
          break;
        case 'job_added':
          console.log(`➕ [CacheInvalidation] Job added (no action needed): ${job?.jobType}/${job?.upc}`);
          break;
        case 'job_updated':
          console.log(`🔄 [CacheInvalidation] Job updated (no action needed): ${job?.jobType}/${job?.upc}`);
          break;
        default:
          console.log(`❓ [CacheInvalidation] Unknown event type: ${event}`);
          break;
      }
    } catch (error) {
      console.error(`❌ [CacheInvalidation] Error handling ${event} for job ${job?.id}:`, error);
      console.error(`❌ [CacheInvalidation] Error stack:`, error.stack);
    }
  }

  /**
   * Handle successful job completion
   */
  private async handleJobCompleted(job: BackgroundJob): Promise<void> {
    const { jobType, upc, resultData } = job;

    console.log(`✅ [CacheInvalidation] Processing completed job: ${jobType} for ${upc}`);

    switch (jobType) {
      case 'ingredient_parsing':
        await this.handleIngredientParsingCompleted(upc, resultData);
        break;
      
      case 'product_creation':
        await this.handleProductCreationCompleted(upc, resultData);
        break;
      
      case 'product_photo_upload':
        await this.handleProductPhotoUploadCompleted(upc, resultData);
        break;
      
      default:
        console.log(`🔄 [CacheInvalidation] Unknown job type: ${jobType}, invalidating cache for ${upc}`);
        await this.invalidateProductCache(upc, `${jobType} completed`);
        break;
    }
  }

  /**
   * Handle failed job
   */
  private async handleJobFailed(job: BackgroundJob): Promise<void> {
    console.log(`❌ [CacheInvalidation] Job failed: ${job.jobType} for ${job.upc} - ${job.errorMessage}`);
    
    // For failed jobs, we might still want to invalidate cache in some cases
    // to ensure users don't see stale data
    switch (job.jobType) {
      case 'ingredient_parsing':
        // Don't invalidate cache for failed ingredient parsing to avoid losing existing data
        console.log(`🔄 [CacheInvalidation] Keeping cache for failed ingredient parsing: ${job.upc}`);
        break;
      
      case 'product_creation':
        // Invalidate cache for failed product creation so user can retry
        await this.invalidateProductCache(job.upc, 'product creation failed');
        break;
      
      case 'product_photo_upload':
        // Don't invalidate cache for failed photo upload, keep existing product data
        console.log(`🔄 [CacheInvalidation] Keeping cache for failed photo upload: ${job.upc}`);
        break;
    }
  }

  /**
   * Handle when all jobs are cleared
   */
  private async handleAllJobsCleared(): Promise<void> {
    console.log(`🧹 [CacheInvalidation] All jobs cleared - no cache invalidation needed`);
    // When jobs are cleared, we don't need to invalidate cache since
    // this is typically a cleanup operation, not a data change
  }

  /**
   * Handle ingredient parsing completion
   */
  private async handleIngredientParsingCompleted(upc: string, resultData: any): Promise<void> {
    console.log(`🧪 [CacheInvalidation] Ingredient parsing completed for ${upc}`);
    
    // Check if the parsing was successful and actually updated ingredients
    if (resultData?.success && resultData?.updatedProduct) {
      // Update cache with new product data including parsed ingredients
      await cacheService.setProduct(upc, resultData.updatedProduct);
      console.log(`✅ [CacheInvalidation] Updated cache with parsed ingredients for ${upc}`);
    } else {
      // If parsing failed or didn't update product, refresh cache with latest data
      await this.refreshProductCache(upc, 'ingredient parsing completed (no updates)');
    }
  }

  /**
   * Handle product creation completion
   */
  private async handleProductCreationCompleted(upc: string, resultData: any): Promise<void> {
    console.log(`🆕 [CacheInvalidation] Product creation completed for ${upc}`);
    
    // Product creation means we have a completely new product
    // Refresh cache with fresh data from database
    await this.refreshProductCache(upc, 'new product created');
  }

  /**
   * Handle product photo upload completion
   */
  private async handleProductPhotoUploadCompleted(upc: string, resultData: any): Promise<void> {
    console.log(`📸 [CacheInvalidation] *** PHOTO UPLOAD COMPLETED ***`);
    console.log(`📸 [CacheInvalidation] UPC: ${upc}`);
    console.log(`📸 [CacheInvalidation] Result data:`, {
      success: resultData?.success,
      imageUrl: resultData?.imageUrl,
      hasError: resultData?.error ? 'YES' : 'NO',
      errorMessage: resultData?.error
    });
    
    if (resultData?.success && resultData?.imageUrl) {
      console.log(`📸 [CacheInvalidation] Photo upload successful, but deferring cache update to useBackgroundJobs`);
      console.log(`📸 [CacheInvalidation] New image URL: ${resultData.imageUrl}`);
    } else {
      console.log(`⚠️ [CacheInvalidation] Photo upload may have failed or no image URL returned`);
    }
    
    // IMPORTANT: Don't update cache here for photo upload jobs!
    // The useBackgroundJobs hook needs to handle the isNew flag logic first,
    // then it will trigger the cache update through historyService.addToHistory()
    console.log(`📸 [CacheInvalidation] Skipping automatic cache update for photo upload - letting useBackgroundJobs handle isNew logic`);
  }

  /**
   * Refresh product cache with fresh data from database
   */
  private async refreshProductCache(upc: string, reason: string): Promise<void> {
    console.log(`🔄 [CacheInvalidation] Refreshing cache for ${upc}: ${reason}`);
    
    try {
      // Fetch fresh product data from database
      const freshProductResult = await ProductLookupService.lookupProductByBarcode(upc, { 
        context: 'CacheInvalidation' 
      });
      
      if (freshProductResult.product) {
        // Update cache with fresh data - this will emit onCacheUpdated event
        await cacheService.setProduct(upc, freshProductResult.product);
        console.log(`✅ [CacheInvalidation] Cache refreshed for ${upc}`);
      } else {
        console.log(`⚠️ [CacheInvalidation] Could not fetch fresh product data for ${upc}`);
        // DON'T invalidate cache if we can't get fresh data
      }
    } catch (error) {
      console.error(`❌ [CacheInvalidation] Error refreshing cache for ${upc}:`, error);
      // DON'T invalidate cache on error
    }
  }

  /**
   * Invalidate product cache and update all dependent systems (DEPRECATED - use refreshProductCache)
   */
  private async invalidateProductCache(upc: string, reason: string): Promise<void> {
    console.log(`🗑️ [CacheInvalidation] Invalidating cache for ${upc}: ${reason}`);
    
    // Invalidate the product cache
    await cacheService.invalidateProduct(upc, reason);
    
    // The HistoryService automatically listens to cache invalidation events
    // via the CacheEventListener interface, so it will be updated automatically
    
    console.log(`✅ [CacheInvalidation] Cache invalidated for ${upc}`);
  }

  /**
   * Refresh product cache with fresh data and image cache busting
   */
  private async invalidateProductCacheWithImageRefresh(upc: string, reason: string): Promise<void> {
    console.log(`📸 [CacheInvalidation] *** STARTING IMAGE CACHE REFRESH ***`);
    console.log(`📸 [CacheInvalidation] UPC: ${upc}, Reason: ${reason}`);
    console.log(`📸 [CacheInvalidation] Timestamp: ${new Date().toISOString()}`);
    
    try {
      console.log(`📸 [CacheInvalidation] Step 1: Fetching fresh product data from database...`);
      
      // Fetch fresh product data with cache-busted image URL
      const freshProductResult = await ProductLookupService.lookupProductByBarcode(upc, { 
        context: 'CacheInvalidation' 
      });
      
      console.log(`📸 [CacheInvalidation] Step 2: Fresh product lookup result:`, {
        found: !!freshProductResult.product,
        source: freshProductResult.source,
        imageUrl: freshProductResult.product?.imageUrl,
        barcode: freshProductResult.product?.barcode
      });
      
      if (freshProductResult.product) {
        console.log(`📸 [CacheInvalidation] Step 3: Adding image cache busting to product...`);
        console.log(`📸 [CacheInvalidation] Original image URL: ${freshProductResult.product.imageUrl}`);
        
        // Add cache busting timestamp to image URL if it's a Supabase image
        const cacheBustedProduct = this.addImageCacheBusting(freshProductResult.product);
        
        console.log(`📸 [CacheInvalidation] Step 4: Cache-busted image URL: ${cacheBustedProduct.imageUrl}`);
        console.log(`📸 [CacheInvalidation] Step 5: Updating cache with fresh product data...`);
        
        // Update cache with fresh data including cache-busted image URL
        // This will emit onCacheUpdated event which updates history properly
        await cacheService.setProduct(upc, cacheBustedProduct);
        
        console.log(`✅ [CacheInvalidation] Step 6: Cache successfully updated!`);
        console.log(`✅ [CacheInvalidation] Final image URL in cache: ${cacheBustedProduct.imageUrl}`);
        console.log(`✅ [CacheInvalidation] Cache refresh with image cache busting COMPLETED for ${upc}`);
      } else {
        console.log(`⚠️ [CacheInvalidation] Could not fetch fresh product data for ${upc}`);
        console.log(`⚠️ [CacheInvalidation] ProductLookupService returned no product - skipping cache update`);
      }
    } catch (error) {
      console.error(`❌ [CacheInvalidation] Error refreshing cache with image for ${upc}:`, error);
      console.error(`❌ [CacheInvalidation] Error stack:`, error.stack);
      console.log(`❌ [CacheInvalidation] Cache refresh FAILED - not falling back to invalidation to preserve history`);
    }
  }

  /**
   * Add cache busting parameter to product image URL
   */
  private addImageCacheBusting(product: any): any {
    console.log(`📸 [CacheInvalidation] *** ADDING CACHE BUSTING ***`);
    console.log(`📸 [CacheInvalidation] Input product:`, JSON.stringify(product, null, 2));
    console.log(`📸 [CacheInvalidation] Input product imageUrl:`, product.imageUrl);
    console.log(`📸 [CacheInvalidation] Product barcode:`, product.barcode);
    console.log(`📸 [CacheInvalidation] Type of imageUrl:`, typeof product.imageUrl);
    
    if (!product.imageUrl) {
      console.log(`📸 [CacheInvalidation] No image URL to process, returning as-is`);
      return product;
    }

    // Debug the URL detection logic step by step
    console.log(`📸 [CacheInvalidation] *** URL DETECTION DEBUG ***`);
    
    const isSupabaseMarker = ProductImageUrlService.isSupabaseMarker(product.imageUrl);
    console.log(`📸 [CacheInvalidation] isSupabaseMarker check:`, isSupabaseMarker);
    console.log(`📸 [CacheInvalidation] SUPABASE marker constant:`, ProductImageUrlService.getSupabaseMarker());
    console.log(`📸 [CacheInvalidation] Direct comparison: "${product.imageUrl}" === "${ProductImageUrlService.getSupabaseMarker()}"`);
    
    const isSupabaseUrl = ProductImageUrlService.isSupabaseImageUrl(product.imageUrl, product.barcode);
    console.log(`📸 [CacheInvalidation] isSupabaseImageUrl check:`, isSupabaseUrl);
    console.log(`📸 [CacheInvalidation] URL contains supabase.co:`, product.imageUrl.includes('supabase.co'));
    console.log(`📸 [CacheInvalidation] URL contains product-images:`, product.imageUrl.includes('product-images'));
    
    const isSupabaseImage = isSupabaseMarker || isSupabaseUrl;
    
    console.log(`📸 [CacheInvalidation] Image URL analysis:`, {
      isSupabaseMarker,
      isSupabaseUrl,
      isSupabaseImage,
      originalUrl: product.imageUrl,
      urlLength: product.imageUrl.length,
      barcode: product.barcode
    });

    if (isSupabaseImage) {
      // Add cache busting timestamp to the image URL
      const timestamp = Date.now();
      let cacheBustedImageUrl;
      
      console.log(`📸 [CacheInvalidation] *** APPLYING CACHE BUSTING ***`);
      console.log(`📸 [CacheInvalidation] Adding cache busting timestamp: ${timestamp}`);
      
      if (isSupabaseMarker) {
        // For [SUPABASE] marker, add query parameter
        cacheBustedImageUrl = `${ProductImageUrlService.getSupabaseMarker()}?t=${timestamp}`;
        console.log(`📸 [CacheInvalidation] Added cache busting to SUPABASE marker: ${cacheBustedImageUrl}`);
      } else {
        // For full Supabase URLs, add query parameter - handle existing query params
        try {
          const url = new URL(product.imageUrl);
          url.searchParams.set('t', timestamp.toString());
          cacheBustedImageUrl = url.toString();
          console.log(`📸 [CacheInvalidation] Successfully created cache-busted URL: ${cacheBustedImageUrl}`);
        } catch (error) {
          console.error(`📸 [CacheInvalidation] Error creating URL object:`, error);
          // Fallback to simple concatenation
          const separator = product.imageUrl.includes('?') ? '&' : '?';
          cacheBustedImageUrl = `${product.imageUrl}${separator}t=${timestamp}`;
          console.log(`📸 [CacheInvalidation] Fallback cache-busted URL: ${cacheBustedImageUrl}`);
        }
      }
      
      console.log(`📸 [CacheInvalidation] Cache busting transformation:`, {
        before: product.imageUrl,
        after: cacheBustedImageUrl,
        timestamp,
        lengthBefore: product.imageUrl.length,
        lengthAfter: cacheBustedImageUrl.length,
        changed: product.imageUrl !== cacheBustedImageUrl
      });
      
      const result = {
        ...product,
        imageUrl: cacheBustedImageUrl
      };
      
      console.log(`📸 [CacheInvalidation] *** CACHE BUSTING COMPLETE ***`);
      console.log(`📸 [CacheInvalidation] Final result imageUrl: ${result.imageUrl}`);
      console.log(`📸 [CacheInvalidation] Result object:`, JSON.stringify(result, null, 2));
      return result;
    } else {
      // For non-Supabase images (OpenFoodFacts, etc.), return as-is
      console.log(`📸 [CacheInvalidation] *** NOT A SUPABASE IMAGE ***`);
      console.log(`📸 [CacheInvalidation] Returning unchanged product`);
      console.log(`📸 [CacheInvalidation] Reason: isSupabaseMarker=${isSupabaseMarker}, isSupabaseUrl=${isSupabaseUrl}`);
      return product;
    }
  }

  /**
   * Manually invalidate cache for a specific product
   * (useful for external triggers)
   */
  public async invalidateProduct(upc: string, reason = 'manual invalidation'): Promise<void> {
    await this.invalidateProductCache(upc, reason);
  }

  /**
   * Manually refresh cache for a specific product with new data
   * (useful when we have updated product data from external sources)
   */
  public async refreshProductCacheWithData(upc: string, updatedProduct: any, reason = 'manual refresh'): Promise<void> {
    console.log(`🔄 [CacheInvalidation] Refreshing cache for ${upc}: ${reason}`);
    
    // Update cache with new product data
    await cacheService.setProduct(upc, updatedProduct);
    
    console.log(`✅ [CacheInvalidation] Cache refreshed for ${upc}`);
  }

  /**
   * Get status information about the cache invalidation service
   */
  public getStatus(): {
    isInitialized: boolean;
    isListeningToJobs: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      isListeningToJobs: !!this.unsubscribeFromJobs,
    };
  }
}

// Export singleton instance
export const cacheInvalidationService = CacheInvalidationService.getInstance();
export default cacheInvalidationService;