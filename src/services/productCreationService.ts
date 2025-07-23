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

import { supabase } from './supabaseClient';
import { ProductImageUploadService } from './productImageUploadService';

export class ProductCreationService {
  static async createProductFromPhoto(imageBase64: string, upc: string, imageUri?: string): Promise<CreateProductResponse> {
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

      // Start async image upload process if imageUri is provided
      if (imageUri && data?.productName) {
        console.log(`📸 Starting async image upload for UPC: ${upc}`);
        // Add delay to ensure product is fully committed to database
        // Database transactions from edge function (service role) need time to be visible to client queries
        setTimeout(() => {
          ProductImageUploadService.processProductImage(imageUri, upc)
            .then(() => {
              console.log(`✅ Image upload completed for UPC: ${upc}`);
            })
            .catch((error) => {
              console.error(`❌ Image upload failed for UPC: ${upc}`, error);
            });
        }, 1000); // 1 second delay to ensure product creation is complete
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