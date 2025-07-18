export interface ParseIngredientsResponse {
  ingredients: string[];
  confidence: number;
  isValidIngredientsList: boolean;
  error?: string;
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

export class IngredientOCRService {
  private static readonly EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-ingredients`;
  private static readonly ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  static async parseIngredientsFromImage(imageBase64: string): Promise<ParseIngredientsResponse> {
    try {
      const response = await fetch(this.EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.ANON_KEY}`,
        },
        body: JSON.stringify({
          imageBase64,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ParseIngredientsResponse = await response.json();
      
      // Log API cost information
      if (data.apiCost) {
        console.log('💰 Gemini API Cost:', {
          inputTokens: data.apiCost.inputTokens,
          outputTokens: data.apiCost.outputTokens,
          totalCost: data.apiCost.totalCost
        });
      }
      
      
      return data;
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