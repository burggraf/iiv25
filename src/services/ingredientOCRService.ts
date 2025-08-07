import { supabase } from './supabaseClient';

export interface ParseIngredientsResponse {
  ingredients: string[];
  confidence: number;
  isValidIngredientsList: boolean;
  classification?: string;
  error?: string;
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

export class IngredientOCRService {
  static async parseIngredientsFromImage(imageBase64: string, upc: string, openFoodFactsData?: any): Promise<ParseIngredientsResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('parse-ingredients', {
        body: {
          imageBase64,
          upc,
          openFoodFactsData,
        },
      });

      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }

      // Don't throw on application-level errors - let them be handled by the caller
      // This ensures backward compatibility and prevents unhandled promise rejections
      
      // Log API cost information
      if (data?.apiCost) {
        console.log('💰 Gemini API Cost:', {
          inputTokens: data.apiCost.inputTokens,
          outputTokens: data.apiCost.outputTokens,
          totalCost: data.apiCost.totalCost
        });
      }

      // Log classification result if available
      if (data?.classification) {
        console.log(`🔍 Product classification updated: ${data.classification}`);
      }
      
      return data as ParseIngredientsResponse;
    } catch (error) {
      console.error('Error calling ingredient OCR service:', error);
      return {
        ingredients: [],
        confidence: 0.0,
        isValidIngredientsList: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}