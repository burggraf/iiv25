import { supabase } from './supabaseClient';
import { ProductImageUploadService } from './productImageUploadService';
import { backgroundQueueService } from './backgroundQueueService';

export interface CreateProductResponse {
  product?: any;
  productName?: string;
  brand?: string;
  confidence?: number;
  classification?: string;
  error?: string;
  retryable?: boolean; // Indicates if the error is retryable
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

export class ProductCreationService {
  static async createProductFromPhoto(
    imageBase64: string, 
    upc: string, 
    imageUri?: string,
    workflowContext?: {
      workflowId?: string;
      workflowType?: 'add_new_product' | 'individual_action';
    }
  ): Promise<CreateProductResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('create-product-from-photo', {
        body: {
          imageBase64,
          upc,
        },
      });

      if (error) {
        // Parse error to extract retryable information
        const isRetryable = data?.retryable === true;
        const errorMessage = error.message || 'Unknown error occurred';
        
        console.error('Edge function error:', errorMessage, 'Retryable:', isRetryable);
        
        return {
          productName: 'unknown product',
          brand: '',
          confidence: 0,
          error: errorMessage,
          retryable: isRetryable,
        };
      }
      
      // Log API cost information
      if (data?.apiCost) {
        console.log('💰 Gemini API Cost (Product Creation):', {
          inputTokens: data.apiCost.inputTokens,
          outputTokens: data.apiCost.outputTokens,
          totalCost: data.apiCost.totalCost
        });
      }

      // Log product creation result
      if (data?.productName) {
        console.log(`📦 Product created/updated: ${data.productName}${data.brand ? ` (${data.brand})` : ''}`);
        console.log(`🎯 Confidence: ${data.confidence}%`);
      }

      // Queue async image upload job if imageUri is provided and product creation succeeded
      if (imageUri && data?.productName && !data?.error) {
        if (workflowContext?.workflowId) {
          // Queue as part of workflow with step 3 of 3
          console.log(`📸 Queueing image upload job for UPC: ${upc} (workflow context: ${workflowContext.workflowId.slice(-6)})`);
          try {
            const job = await backgroundQueueService.queueJob({
              jobType: 'product_photo_upload',
              imageUri: imageUri,
              upc: upc,
              existingProductData: data,
              priority: 1,
              workflowId: workflowContext.workflowId,
              workflowType: workflowContext.workflowType,
              workflowSteps: { total: 3, current: 3 }
            });
            console.log(`✅ Image upload job queued as workflow step 3: ${job.id.slice(-8)}`);
          } catch (error) {
            console.error(`❌ Failed to queue workflow image upload job for UPC: ${upc}`, error);
          }
        } else {
          // Queue as individual job (non-workflow context)
          console.log(`📸 Queueing image upload job for UPC: ${upc} (non-workflow context)`);
          try {
            const job = await backgroundQueueService.queueJob({
              jobType: 'product_photo_upload',
              imageUri: imageUri,
              upc: upc,
              existingProductData: data,
              priority: 1
            });
            console.log(`✅ Image upload job queued: ${job.id.slice(-8)}`);
          } catch (error) {
            console.error(`❌ Failed to queue image upload job for UPC: ${upc}`, error);
          }
        }
      } else if (imageUri && data?.error) {
        console.log(`📸 Skipping image upload job for UPC: ${upc} due to product creation error: ${data.error}`);
      }
      
      return data as CreateProductResponse;
    } catch (error) {
      console.error('Error calling product creation service:', error);
      
      // Check if this is a retryable error from our edge function
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const isRetryable = errorMessage.includes('temporarily unavailable') || 
                         errorMessage.includes('overloaded') || 
                         errorMessage.includes('503') ||
                         errorMessage.includes('Network error');
      
      return {
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: errorMessage,
        retryable: isRetryable,
      };
    }
  }
}