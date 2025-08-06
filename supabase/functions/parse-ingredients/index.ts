import { createClient } from 'jsr:@supabase/supabase-js@2';

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ParseIngredientsRequest {
  imageBase64: string;
  upc: string;
  openFoodFactsData?: any;
}

interface ParseIngredientsResponse {
  ingredients: string[];
  confidence: number;
  isValidIngredientsList: boolean;
  classification?: string;
  product?: any; // Complete product data for cache invalidation (backward compatible)
  error?: string;
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Authorization header required'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    console.log('🔍 Auth debug:', {
      authError: authError?.message,
      user: user ? {
        id: user.id,
        email: user.email,
        is_anonymous: user.is_anonymous,
        aud: user.aud,
        role: user.role,
        app_metadata: user.app_metadata
      } : null,
      authHeader: authHeader ? 'present' : 'missing'
    });

    if (authError || !user) {
      console.log('Authentication failed:', authError);
      return new Response(JSON.stringify({
        error: 'Authentication failed'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Allow both authenticated and anonymous users
    console.log('Authenticated user:', user.id, user.is_anonymous ? '(anonymous)' : '(registered)');

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imageBase64, upc, openFoodFactsData }: ParseIngredientsRequest = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Image data required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!upc) {
      return new Response(JSON.stringify({ error: 'UPC code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
1. Look for an "INGREDIENTS:" or "Ingredients:" section (or a "CONTAINS:" or "Contains:" section)
2. Extract each individual ingredient from the list
3. Clean up the text (remove parentheses, allergen warnings, etc.)
4. TRANSLATE all ingredients to English if they are in another language
5. Return ONLY the actual food ingredients that are part of this product
6. Determine if this appears to be a valid food ingredients list

IMPORTANT EXCLUSIONS - Skip any text that mentions:
- "Made in a facility that also processes..." or similar facility warnings
- "May contain..." statements
- "Processed in a facility with..." warnings
- Cross-contamination or allergen facility information
- Manufacturing location or equipment information

Focus ONLY on ingredients that are actually added to make this specific product.

CRITICAL: If you only find facility warnings or processing statements (like "Made in a facility that processes...") but NO actual ingredients list, then return an empty ingredients array and set isValidIngredientsList to false. Do NOT include the facility warning items as ingredients.

Return a JSON object with this exact structure:
{
  "ingredients": ["ingredient1", "ingredient2", "ingredient3"],
  "confidence": 0.95,
  "isValidIngredientsList": true
}

IMPORTANT: All ingredients must be translated to English. For example:
- "eau" should become "water"
- "sucre" should become "sugar" 
- "lait" should become "milk"
- "farine de blé" should become "wheat flour"

If you cannot find or read ingredients clearly, OR if you only find facility warnings without actual ingredients, set confidence below 0.7 and isValidIngredientsList to false.`
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

      // Normalize confidence score to 0-1 range with error handling
      try {
        const confidence = Number(parsedResult.confidence);
        if (isNaN(confidence)) {
          parsedResult.confidence = 0.0;
        } else if (confidence > 1) {
          parsedResult.confidence = confidence / 100;
        } else {
          parsedResult.confidence = confidence;
        }
      } catch (error) {
        console.warn('Failed to normalize confidence score:', parsedResult.confidence);
        parsedResult.confidence = 0.0;
      }

      // Add cost info to successful response
      if (apiCostInfo) {
        parsedResult.apiCost = apiCostInfo;
      }

      // If ingredients were successfully parsed, update the database
      if (parsedResult.isValidIngredientsList && parsedResult.ingredients.length > 0) {
        console.log(`🔍 Processing ingredients for UPC: ${upc}`);

        try {
          // Normalize barcode format - convert UPC-E to UPC-A if needed
          const normalizedUPC = upc.length === 11 ? '0' + upc : upc;
          const normalizedEAN13 = normalizedUPC; // Use normalized UPC as EAN13 for consistency

          console.log(`📋 Normalized barcode: ${upc} → ${normalizedUPC}`);

          // Prepare ingredients data
          const ingredientsCommaDelimited = parsedResult.ingredients.join(', ');
          const analysisTildeDelimited = parsedResult.ingredients
            .map(ingredient => ingredient.toLowerCase().replace(/[^\w\s]/g, '').trim())
            .join('~');

          // Check if product exists (check both original and normalized UPC)
          const { data: existingProduct, error: lookupError } = await supabase
            .from('products')
            .select('*')
            .or(`upc.eq.${upc},upc.eq.${normalizedUPC},ean13.eq.${upc},ean13.eq.${normalizedUPC}`)
            .single();

          if (lookupError && lookupError.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw lookupError;
          }

          let productOperation;
          if (existingProduct) {
            // Update existing product (use the existing product's UPC for the update)
            console.log(`📝 Updating existing product: ${existingProduct.upc}`);

            // Also normalize the existing product's barcode format if needed
            const updateData: any = {
              ingredients: ingredientsCommaDelimited,
              analysis: analysisTildeDelimited,
              lastupdated: new Date().toISOString()
            };

            // If the existing product has 11-digit UPC but we have 12-digit normalized, update it
            if (existingProduct.upc.length === 11 && normalizedUPC.length === 12 && normalizedUPC !== existingProduct.upc) {
              console.log(`🔄 Normalizing existing product barcode: ${existingProduct.upc} → ${normalizedUPC}`);
              updateData.upc = normalizedUPC;
              updateData.ean13 = normalizedEAN13;
            }

            productOperation = await supabase
              .from('products')
              .update(updateData)
              .eq('upc', existingProduct.upc);
          } else {
            // Create new product with normalized barcode formats
            console.log(`➕ Creating new product: ${normalizedUPC}`);
            productOperation = await supabase
              .from('products')
              .insert({
                upc: normalizedUPC,
                ean13: normalizedEAN13,
                product_name: 'unknown product',
                brand: '',
                ingredients: ingredientsCommaDelimited,
                analysis: analysisTildeDelimited,
                created: new Date().toISOString(),
                lastupdated: new Date().toISOString()
              });
          }

          if (productOperation.error) {
            console.error('Database operation error:', productOperation.error);
            throw productOperation.error;
          }

          // Call classify_upc function to get classification (use the UPC that's actually in the database)
          const classifyUPC = existingProduct ? existingProduct.upc : normalizedUPC;
          console.log(`🏷️ Classifying UPC: ${classifyUPC}`);
          const { data: classificationResult, error: classificationError } = await supabase
            .rpc('classify_upc', { input_upc: classifyUPC });

          if (classificationError) {
            console.error('Classification error:', classificationError);
            throw classificationError;
          }

          // Add classification to response
          parsedResult.classification = classificationResult;
          console.log(`✅ Product classified as: ${classificationResult}`);

          // Fetch the complete updated product data for cache invalidation
          const { data: completeProduct, error: fetchError } = await supabase
            .from('products')
            .select('*')
            .eq('upc', classifyUPC)
            .single();

          if (!fetchError && completeProduct) {
            parsedResult.product = completeProduct;
            console.log(`✅ Added complete product data to response for cache invalidation`);
          } else {
            console.warn(`⚠️ Failed to fetch complete product data for cache invalidation:`, fetchError);
          }

          // Log the action to actionlog table
          try {
            const { error: logError } = await supabase
              .from('actionlog')
              .insert({
                type: 'ingredient_scan',
                input: upc,
                userid: user.id,
                result: classificationResult,
                metadata: {
                  ingredients: parsedResult.ingredients,
                  confidence: parsedResult.confidence,
                  operation: existingProduct ? 'update' : 'create'
                }
              });

            if (logError) {
              console.error('Action log error:', logError);
              // Don't throw - logging is not critical to the main operation
            } else {
              console.log(`📋 Logged ingredient scan action for UPC: ${upc}`);
            }
          } catch (logError) {
            console.error('Failed to log action:', logError);
            // Continue without throwing
          }

        } catch (dbError) {
          console.error('Database operation failed:', dbError);
          // Don't fail the entire request for database errors
          // The OCR results are still valid
        }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
