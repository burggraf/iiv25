import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface CreateProductRequest {
  imageBase64: string;
  upc: string;
  validateOnly?: boolean;     // NEW: only validate photo, don't create/update product
  updateImageOnly?: boolean;  // NEW: validate + upload image to existing product, don't extract product info
}

interface CreateProductResponse {
  product?: any;
  productName?: string;
  brand?: string;
  confidence?: number;
  classification?: string;
  imageUrl?: string;  // NEW: for updateImageOnly mode
  error?: string;
  retryable?: boolean; // New field to indicate if error is retryable
  apiCost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: string;
  };
}

// Helper function to make Gemini API calls with retry logic
async function callGeminiWithRetry(apiKey: string, imageBase64: string, maxRetries = 3): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  retryable?: boolean;
}> {
  const geminiPrompt = `You are an expert at analyzing product packaging images. Your task is to extract the product name and brand from this product package image.

Instructions:
1. Look for the main product name (not ingredients or nutritional info)
2. Identify the brand name if visible
3. Focus on the front-facing text that would help identify the product
4. If you can't clearly read the product name, respond with null values
5. If the image contains inappropriate, offensive, or non-product content, set confidence to 0 and respond with null values
6. Provide a confidence score from 0-100

Return your response in this exact JSON format:
{
  "productName": "string or null",
  "brand": "string or null", 
  "confidence": number
}

Do not include any other text or explanation, only the JSON response.`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting Gemini API call (attempt ${attempt}/${maxRetries})`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: geminiPrompt },
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
              maxOutputTokens: 1000,
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`Gemini API call successful on attempt ${attempt}`);
        return { success: true, data };
      }

      // Handle different error types
      const errorText = await response.text();
      console.error(`Gemini API error (attempt ${attempt}):`, response.status, errorText);

      // Parse error response
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { code: response.status, message: errorText } };
      }

      const errorCode = errorData?.error?.code || response.status;
      const errorMessage = errorData?.error?.message || 'Unknown error';

      // Check if error is retryable
      const retryableErrors = [503, 429, 500, 502, 504]; // Service unavailable, rate limit, server errors
      const isRetryable = retryableErrors.includes(errorCode);

      if (!isRetryable) {
        // Non-retryable error (like 400 Bad Request)
        return {
          success: false,
          error: `Gemini API error: ${errorMessage}`,
          retryable: false
        };
      }

      if (attempt === maxRetries) {
        // Last attempt failed
        return {
          success: false,
          error: `Gemini API is temporarily unavailable (${errorMessage}). Please try again in a few moments.`,
          retryable: true
        };
      }

      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Cap at 10 seconds
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

    } catch (networkError) {
      console.error(`Network error on attempt ${attempt}:`, networkError);

      if (attempt === maxRetries) {
        return {
          success: false,
          error: 'Network error connecting to Gemini API. Please check your connection and try again.',
          retryable: true
        };
      }

      // Wait before retrying network errors too
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return {
    success: false,
    error: 'Unexpected error in Gemini API retry logic',
    retryable: true
  };
}

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create clients
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request
    const body: CreateProductRequest = await req.json();
    const { imageBase64, upc, validateOnly, updateImageOnly } = body;

    if (!imageBase64 || !upc) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageBase64, upc' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing product creation for UPC:', upc);
    console.log('Mode:', validateOnly ? 'validate-only' : updateImageOnly ? 'update-image-only' : 'full-create');

    // Call Gemini API to extract product name and brand
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const geminiApiResult = await callGeminiWithRetry(geminiApiKey, imageBase64);

    if (!geminiApiResult.success) {
      console.error('Gemini API failed after retries:', geminiApiResult.error);
      return new Response(
        JSON.stringify({
          error: geminiApiResult.error,
          retryable: geminiApiResult.retryable
        }),
        {
          status: 503, // Service Unavailable
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const geminiResult = geminiApiResult.data;
    console.log('Gemini API response:', JSON.stringify(geminiResult, null, 2));

    // Calculate API cost
    const usageMetadata = geminiResult.usageMetadata;
    const inputTokens = usageMetadata?.promptTokenCount || 0;
    const outputTokens = usageMetadata?.candidatesTokenCount || 0;

    // Gemini 1.5 Flash pricing: $0.075 per 1M input tokens, $0.30 per 1M output tokens
    const inputCost = (inputTokens / 1000000) * 0.075;
    const outputCost = (outputTokens / 1000000) * 0.30;
    const totalCost = inputCost + outputCost;

    // Parse Gemini response
    let productName = 'unknown product';
    let brand = '';
    let confidence = 0;

    try {
      const responseText = geminiResult.candidates[0]?.content?.parts[0]?.text;
      if (responseText) {
        const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
        const parsedResponse = JSON.parse(cleanedResponse);

        if (parsedResponse.productName && parsedResponse.productName !== null) {
          productName = parsedResponse.productName;
        }
        if (parsedResponse.brand && parsedResponse.brand !== null) {
          brand = parsedResponse.brand;
        }
        confidence = parsedResponse.confidence || 0;
      }
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      // Continue with default values
    }

    // Normalize confidence score to 0-1 range with error handling
    try {
      const confidenceValue = Number(confidence);
      if (isNaN(confidenceValue)) {
        confidence = 0.0;
      } else if (confidenceValue > 1) {
        confidence = confidenceValue / 100;
      } else {
        confidence = confidenceValue;
      }
    } catch (error) {
      console.warn('Failed to normalize confidence score:', confidence);
      confidence = 0.0;
    }

    // Validate confidence threshold (90%)
    if (confidence < 0.9) {
      const confidencePercentage = Math.round(confidence * 100);
      console.log(`❌ Low confidence product title scan: ${confidencePercentage}% (threshold: 90%)`);

      return new Response(JSON.stringify({
        productName: 'unknown product',
        brand: '',
        confidence: confidence,
        error: 'Product title scan failed.',
        retryable: false,
        apiCost: {
          inputTokens,
          outputTokens,
          totalCost: totalCost.toFixed(6),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Extracted product info:', { productName, brand, confidence });

    // If validateOnly mode, return validation success without creating/updating product
    if (validateOnly) {
      console.log('✅ Validation-only mode: Photo passed 90% confidence threshold');
      return new Response(JSON.stringify({
        productName,
        brand,
        confidence,
        apiCost: {
          inputTokens,
          outputTokens,
          totalCost: totalCost.toFixed(6),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize UPC/EAN codes
    let normalizedUpc = upc;
    let ean13 = upc;

    // Convert 11-digit UPC-E to 12-digit UPC-A by prepending 0
    if (upc.length === 11) {
      normalizedUpc = '0' + upc;
      ean13 = normalizedUpc;
    } else if (upc.length === 12) {
      ean13 = upc;
    }

    // Check if product already exists
    const { data: existingProducts, error: queryError } = await supabaseService
      .from('products')
      .select('*')
      .or(`upc.eq.${upc},upc.eq.${normalizedUpc},ean13.eq.${ean13}`)
      .limit(1);

    if (queryError) {
      console.error('Error querying existing products:', queryError);
    }

    let product;
    let isNewProduct = false;

    if (existingProducts && existingProducts.length > 0) {
      // Update existing product
      product = existingProducts[0];
      console.log('Found existing product, updating with new info');

      const { data: updatedProduct, error: updateError } = await supabaseService
        .from('products')
        .update({
          product_name: productName,
          brand: brand,
          lastupdated: new Date().toISOString(),
        })
        .eq('ean13', product.ean13)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating product:', updateError);
      } else {
        product = updatedProduct;
      }
    } else {
      // Create new product
      isNewProduct = true;
      console.log('Creating new product with extracted info');

      const { data: newProduct, error: insertError } = await supabaseService
        .from('products')
        .insert({
          product_name: productName,
          brand: brand,
          upc: normalizedUpc,
          ean13: ean13,
          classification: 'undetermined',
          created: new Date().toISOString(),
          lastupdated: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating product:', insertError);
        throw insertError;
      }
      product = newProduct;
    }

    // Handle image upload for updateImageOnly mode
    if (updateImageOnly) {
      console.log('🖼️ Update-image-only mode: Uploading image to Supabase storage');
      
      try {
        // Convert base64 to buffer for upload
        const imageBuffer = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
        const fileName = `product-images/${normalizedUpc}_${Date.now()}.jpg`;
        
        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabaseService.storage
          .from('product-images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          console.error('Error uploading image to storage:', uploadError);
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }

        console.log('✅ Image uploaded successfully:', uploadData.path);

        // Get public URL
        const { data: urlData } = supabaseService.storage
          .from('product-images')
          .getPublicUrl(uploadData.path);

        const imageUrl = urlData.publicUrl;
        console.log('🔗 Generated image URL:', imageUrl);

        // Update product with image URL (store [SUPABASE] marker, not full URL)
        const { data: updatedProduct, error: updateError } = await supabaseService
          .from('products')
          .update({ 
            imageurl: '[SUPABASE]',
            lastupdated: new Date().toISOString()
          })
          .eq('ean13', product.ean13)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating product with image URL:', updateError);
          throw new Error(`Failed to update product: ${updateError.message}`);
        }

        product = updatedProduct;
        console.log('✅ Product updated with image URL');

        // Log the action for image upload
        try {
          await supabaseService
            .from('actionlog')
            .insert({
              userid: user.id,
              type: 'update_product_image_validated',
              input: normalizedUpc,
              result: '[SUPABASE]',
              metadata: {
                upc: normalizedUpc,
                productName,
                brand,
                confidence,
                imageUrl: '[SUPABASE]',
                apiCost: totalCost.toFixed(6)
              },
            });
        } catch (logError) {
          console.error('Failed to log image upload action:', logError);
          // Don't fail the request if logging fails
        }

        // Return early with image URL for updateImageOnly mode
        return new Response(JSON.stringify({
          product,
          productName,
          brand,
          confidence,
          imageUrl: '[SUPABASE]',
          apiCost: {
            inputTokens,
            outputTokens,
            totalCost: totalCost.toFixed(6),
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (imageError) {
        console.error('Error in updateImageOnly mode:', imageError);
        return new Response(JSON.stringify({
          productName: 'unknown product',
          brand: '',
          confidence: confidence,
          error: imageError instanceof Error ? imageError.message : 'Failed to upload image',
          retryable: true, // Image upload errors are usually retryable
          apiCost: {
            inputTokens,
            outputTokens,
            totalCost: totalCost.toFixed(6),
          },
        }), {
          status: 200, // Return 200 with error in body, consistent with validation errors
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Log the action
    try {
      await supabaseService
        .from('actionlog')
        .insert({
          userid: user.id,
          type: isNewProduct ? 'create_product_from_photo' : 'update_product_from_photo',
          input: normalizedUpc,
          result: productName,
          metadata: {
            upc: normalizedUpc,
            productName,
            brand,
            confidence,
            apiCost: totalCost.toFixed(6)
          },
        });
    } catch (logError) {
      console.error('Failed to log action:', logError);
      // Don't fail the request if logging fails
    }

    const response: CreateProductResponse = {
      product,
      productName,
      brand,
      confidence,
      apiCost: {
        inputTokens,
        outputTokens,
        totalCost: totalCost.toFixed(6),
      },
    };

    console.log('Product creation completed successfully');

    // Debug: Test if we can immediately query the product we just created/updated
    // This helps determine if the timing issue is between edge function and client
    try {
      const { data: verifyProduct, error: verifyError } = await supabaseService
        .from('products')
        .select('upc, ean13, product_name, imageurl')
        .or(`upc.eq.${normalizedUpc},ean13.eq.${ean13}`)
        .limit(1);

      if (verifyError) {
        console.log('❌ Edge function immediate verification failed:', verifyError);
      } else if (verifyProduct && verifyProduct.length > 0) {
        console.log('✅ Edge function can immediately see created product:', {
          name: verifyProduct[0].product_name,
          upc: verifyProduct[0].upc,
          ean13: verifyProduct[0].ean13,
          hasImage: !!verifyProduct[0].imageurl
        });
      } else {
        console.log('❌ Edge function cannot see the product it just created - this indicates a serious issue');
      }
    } catch (debugError) {
      console.log('Debug query failed:', debugError);
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in create-product-from-photo function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});