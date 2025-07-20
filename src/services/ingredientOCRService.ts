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

import { supabase } from './supabaseClient';

export class IngredientOCRService {
  static async parseIngredientsFromImage(imageBase64: string, upc: string, openFoodFactsData?: any): Promise<ParseIngredientsResponse> {
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('parse-ingredients', {
        body: {
          imageBase64,
          upc,
          openFoodFactsData,
          userid: user?.id, // Pass the user ID explicitly
        },
      });

      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
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