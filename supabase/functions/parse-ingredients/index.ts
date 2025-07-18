import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ParseIngredientsRequest {
  imageBase64: string;
}

interface ParseIngredientsResponse {
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { imageBase64 }: ParseIngredientsRequest = await req.json();
    
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Image data required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Call Gemini 1.5 Flash API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this food product label image and extract the ingredients list. 

Instructions:
1. Look for an "INGREDIENTS:" or "Ingredients:" section
2. Extract each individual ingredient from the list
3. Clean up the text (remove parentheses, allergen warnings, etc.)
4. Return ONLY the actual food ingredients
5. Determine if this appears to be a valid food ingredients list

Return a JSON object with this exact structure:
{
  "ingredients": ["ingredient1", "ingredient2", "ingredient3"],
  "confidence": 0.95,
  "isValidIngredientsList": true
}

If you cannot find or read ingredients clearly, set confidence below 0.7 and isValidIngredientsList to false.`
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates[0]?.content?.parts[0]?.text;

    if (!generatedText) {
      throw new Error('No response from Gemini API');
    }

    // Calculate and log API cost
    let apiCostInfo = undefined;
    const usage = geminiData.usageMetadata;
    if (usage) {
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      
      // Gemini 1.5 Flash pricing (as of 2024)
      const inputCostPer1M = 0.075; // $0.075 per 1M input tokens
      const outputCostPer1M = 0.30;  // $0.30 per 1M output tokens
      
      const inputCost = (inputTokens / 1000000) * inputCostPer1M;
      const outputCost = (outputTokens / 1000000) * outputCostPer1M;
      const totalCost = inputCost + outputCost;
      
      apiCostInfo = {
        inputTokens,
        outputTokens,
        totalCost: `$${totalCost.toFixed(6)}`
      };
      
      console.log(`🔍 Gemini API Usage:`, {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: `$${inputCost.toFixed(6)}`,
        outputCost: `$${outputCost.toFixed(6)}`,
        totalCost: `$${totalCost.toFixed(6)}`
      });
    }

    // Parse the JSON response from Gemini
    let parsedResult: ParseIngredientsResponse;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsedResult = JSON.parse(jsonMatch[0]);
      
      // Add cost info to successful response
      if (apiCostInfo) {
        parsedResult.apiCost = apiCostInfo;
      }
    } catch (parseError) {
      // Fallback: try to extract ingredients manually if JSON parsing fails
      console.error('Failed to parse JSON response:', parseError);
      return new Response(JSON.stringify({
        ingredients: [],
        confidence: 0.0,
        isValidIngredientsList: false,
        error: 'Failed to parse ingredients from image',
        apiCost: apiCostInfo
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error parsing ingredients:', error);
    return new Response(JSON.stringify({
      ingredients: [],
      confidence: 0.0,
      isValidIngredientsList: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
