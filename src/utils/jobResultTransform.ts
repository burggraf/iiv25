import { BackgroundJob } from '../types/backgroundJobs';
import { Product, VeganStatus } from '../types';

/**
 * Transforms job result data into a Product interface to avoid redundant lookups
 * This utility is shared between useBackgroundJobs and CacheInvalidationService
 */
export const transformJobResultToProduct = async (job: BackgroundJob): Promise<Product | null> => {
  console.log(`🔄 [transformJobResultToProduct] *** DETAILED TRANSFORMATION DEBUG ***`);
  console.log(`🔄 [transformJobResultToProduct] Job type: ${job.jobType}, UPC: ${job.upc}`);
  console.log(`🔄 [transformJobResultToProduct] Job ID: ${job.id?.slice(-8) || 'NO_ID'}`);
  console.log(`🔄 [transformJobResultToProduct] Job result data exists: ${!!job.resultData}`);
  console.log(`🔄 [transformJobResultToProduct] Full job result data:`, JSON.stringify(job.resultData, null, 2));
  
  if (!job.resultData || !job.upc) {
    console.log(`🔄 [transformJobResultToProduct] ❌ FAILURE: Missing result data (${!!job.resultData}) or UPC (${!!job.upc})`);
    return null;
  }

  try {
    let productData: any = null;
    let classification: string | null = null;

    // Extract product data based on job type
    console.log(`🔄 [transformJobResultToProduct] *** ANALYZING JOB TYPE: ${job.jobType} ***`);
    switch (job.jobType) {
      case 'product_creation':
        console.log(`🔄 [transformJobResultToProduct] PRODUCT_CREATION: Checking for job.resultData.product`);
        console.log(`🔄 [transformJobResultToProduct] job.resultData.product exists: ${!!job.resultData.product}`);
        if (job.resultData.product) {
          console.log(`🔄 [transformJobResultToProduct] ✅ Found product data in job.resultData.product`);
          productData = job.resultData.product;
          classification = productData.classification;
          console.log(`🔄 [transformJobResultToProduct] Product name: ${productData.product_name || 'NO_NAME'}`);
          console.log(`🔄 [transformJobResultToProduct] Classification: ${classification || 'NO_CLASSIFICATION'}`);
        } else {
          console.log(`🔄 [transformJobResultToProduct] ❌ NO product data found in job.resultData.product`);
          console.log(`🔄 [transformJobResultToProduct] Available keys in resultData:`, Object.keys(job.resultData || {}));
        }
        break;
        
      case 'product_photo_upload':
        console.log(`🔄 [transformJobResultToProduct] PRODUCT_PHOTO_UPLOAD: Checking conditions`);
        console.log(`🔄 [transformJobResultToProduct] job.resultData.success: ${job.resultData.success}`);
        console.log(`🔄 [transformJobResultToProduct] job.resultData.updatedProduct exists: ${!!job.resultData.updatedProduct}`);
        
        if (job.resultData.success && job.resultData.updatedProduct) {
          console.log(`🔄 [transformJobResultToProduct] ✅ Found updated product data in updatedProduct field`);
          productData = job.resultData.updatedProduct;
          classification = productData.classification;
          console.log(`🔄 [transformJobResultToProduct] Product name: ${productData.product_name || 'NO_NAME'}`);
          console.log(`🔄 [transformJobResultToProduct] Classification: ${classification || 'NO_CLASSIFICATION'}`);
        } else if (job.resultData.success) {
          console.log(`🔄 [transformJobResultToProduct] ⚠️ WORKAROUND: Photo upload successful but no updatedProduct field`);
          console.log(`🔄 [transformJobResultToProduct] This indicates the edge function response wasn't stored properly`);
          console.log(`🔄 [transformJobResultToProduct] Falling back to lookup (this should be fixed in edge function)`);
          // Don't set productData - let it fall through to fresh lookup
        } else {
          console.log(`🔄 [transformJobResultToProduct] ❌ Missing success flag or updatedProduct`);
          console.log(`🔄 [transformJobResultToProduct] Available keys in resultData:`, Object.keys(job.resultData || {}));
        }
        break;
        
      case 'ingredient_parsing':
        // For ingredient parsing, we need to get the updated product from database
        // since the job result only contains parsing results, not full product data
        console.log(`🔄 [transformJobResultToProduct] INGREDIENT_PARSING: Result doesn't contain full product data (expected)`);
        return null; // Fall back to fresh lookup for this case
        
      default:
        console.log(`🔄 [transformJobResultToProduct] ❌ UNKNOWN job type: ${job.jobType}`);
        return null;
    }

    if (!productData) {
      console.log(`🔄 [transformJobResultToProduct] No product data found in job result`);
      return null;
    }

    // Transform classification to VeganStatus
    const getVeganStatus = (classification: string | null): VeganStatus => {
      if (!classification) return VeganStatus.UNKNOWN;
      
      const normalized = classification.toLowerCase().trim();
      switch (normalized) {
        case 'vegan': return VeganStatus.VEGAN;
        case 'vegetarian': return VeganStatus.VEGETARIAN;
        case 'not_vegetarian': return VeganStatus.NOT_VEGETARIAN;
        default: return VeganStatus.UNKNOWN;
      }
    };

    // Resolve image URL using the same logic as ProductLookupService
    const resolveImageUrl = async (imageUrl: string | null | undefined, upc: string): Promise<string | undefined> => {
      const { ProductImageUrlService } = await import('../services/productImageUrlService');
      return ProductImageUrlService.resolveImageUrl(imageUrl, upc) || undefined;
    };

    // Transform to Product interface
    const product: Product = {
      id: job.upc,
      barcode: job.upc,
      name: productData.product_name || 'Unknown Product',
      brand: productData.brand || undefined,
      ingredients: productData.ingredients 
        ? productData.ingredients.split(',').map((i: string) => i.trim())
        : [],
      veganStatus: getVeganStatus(classification),
      imageUrl: await resolveImageUrl(productData.imageurl, job.upc),
      issues: productData.issues || undefined,
      lastScanned: new Date(),
      classificationMethod: 'structured' // Since this came from our classification system
    };

    console.log(`✅ [transformJobResultToProduct] *** TRANSFORMATION SUCCESS ***`);
    console.log(`✅ [transformJobResultToProduct] Product: ${product.name} (${product.veganStatus})`);
    console.log(`✅ [transformJobResultToProduct] Final product object:`, JSON.stringify(product, null, 2));
    
    return product;
    
  } catch (error) {
    console.error(`❌ [transformJobResultToProduct] *** TRANSFORMATION ERROR ***`);
    console.error(`❌ [transformJobResultToProduct] Error transforming job result:`, error);
    console.error(`❌ [transformJobResultToProduct] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    console.error(`❌ [transformJobResultToProduct] Job data that caused error:`, {
      jobType: job.jobType,
      upc: job.upc,
      resultDataKeys: Object.keys(job.resultData || {}),
      resultData: job.resultData
    });
    return null;
  }
};