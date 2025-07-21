export interface CreateProductResponse {
  product?: any;
  productName?: string;
  brand?: string;
  confidence?: number;
  classification?: string;
  error?: string;
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

import { supabase } from './supabaseClient';

export class ProductCreationService {
  static async createProductFromPhoto(imageBase64: string, upc: string): Promise<CreateProductResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('create-product-from-photo', {
        body: {
          imageBase64,
          upc,
        },
      });

      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
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
      
      return data as CreateProductResponse;
    } catch (error) {
      console.error('Error calling product creation service:', error);
      return {
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}