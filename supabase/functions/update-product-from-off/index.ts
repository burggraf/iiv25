import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface UpdateProductFromOffRequest {
  upc: string;
}

interface UpdateProductFromOffResponse {
  success: boolean;
  message: string;
  productCreated: boolean;
  classificationResult?: string;
  originalClassification?: string;
  newClassification?: string;
  classificationChanged: boolean;
  error?: string;
}

interface OpenFoodFactsProduct {
  status: number;
  product?: {
    image_url?: string;
    product_name?: string;
    brands?: string;
    ingredients_text?: string;
    ingredients_text_en?: string;
    ingredients?: Array<{ 
      text: string;
      id?: string;
      has_sub_ingredients?: string;
    }>;
  };
}

Deno.serve(async (req: Request) => {
  // CORS headers for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    // Initialize Supabase client
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.log('Authentication failed:', authError);
      return new Response(JSON.stringify({ 
        error: 'Authentication failed' 
      }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Allow both authenticated and anonymous users
    console.log('Authenticated user:', user.id, user.is_anonymous ? '(anonymous)' : '(registered)');
    
    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const requestBody: UpdateProductFromOffRequest = await req.json();
    const { upc } = requestBody;

    if (!upc) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'UPC parameter is required' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log(`🔄 Processing UPC: ${upc}`);

    // Check if product already exists in database
    const { data: existingProduct, error: checkError } = await supabase
      .from('products')
      .select('upc, ean13, classification')
      .or(`upc.eq.${upc},ean13.eq.${upc}`)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Error checking existing product:', checkError);
      return new Response(JSON.stringify({
        success: false,
        error: `Database error: ${checkError.message}`
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    if (existingProduct) {
      console.log(`⚠️ Product ${upc} already exists in database`);
      
      // Log the failed attempt
      const { error: logError } = await supabase
        .from('actionlog')
        .insert({
          type: 'update_product_from_off',
          input: upc,
          userid: user.id,
          result: 'product_already_exists',
          metadata: {
            operation: 'create_product',
            error: 'Product already exists in database',
            existing_classification: existingProduct.classification
          }
        });

      if (logError) {
        console.error('⚠️ Failed to log action:', logError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        message: 'Product already exists in database',
        productCreated: false,
        classificationChanged: false
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Fetch product data from OpenFoodFacts
    console.log(`📡 Fetching data from OpenFoodFacts for UPC: ${upc}`);
    const offResponse = await fetch(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`);
    
    if (!offResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `OpenFoodFacts API error: ${offResponse.status}`,
        productCreated: false,
        classificationChanged: false
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const offData: OpenFoodFactsProduct = await offResponse.json();

    if (offData.status === 0 || !offData.product) {
      // Log the failed attempt
      const { error: logError } = await supabase
        .from('actionlog')
        .insert({
          type: 'update_product_from_off',
          input: upc,
          userid: user.id,
          result: 'product_not_found_in_off',
          metadata: {
            operation: 'create_product',
            error: 'Product not found in OpenFoodFacts',
            openfoodfacts_status: offData.status
          }
        });

      if (logError) {
        console.error('⚠️ Failed to log action:', logError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Product not found in OpenFoodFacts',
        productCreated: false,
        classificationChanged: false
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const product = offData.product;
    console.log(`📦 Product found: ${product.product_name || 'Unknown'}`);

    // Extract ingredients text - prefer English version
    let ingredientsText = product.ingredients_text_en || product.ingredients_text || '';
    
    // If no ingredients_text, try to extract from ingredients array
    if (!ingredientsText && product.ingredients && Array.isArray(product.ingredients)) {
      ingredientsText = product.ingredients
        .map(ing => ing.text)
        .filter(text => text && text.trim())
        .join(', ');
    }

    // Extract analysis ingredients from ingredients array using id field
    let analysisIngredients: string[] = [];
    if (product.ingredients && Array.isArray(product.ingredients)) {
      analysisIngredients = product.ingredients
        .filter(ing => {
          // Skip items with sub-ingredients
          if (ing.has_sub_ingredients === 'yes') {
            return false;
          }
          // Must have an id field
          return ing.id && ing.id.trim();
        })
        .map(ing => {
          // Strip "en:" prefix and convert dashes to spaces
          let cleanId = ing.id!;
          if (cleanId.startsWith('en:')) {
            cleanId = cleanId.substring(3);
          }
          // Convert dashes to spaces and clean up
          return cleanId.replace(/-/g, ' ').trim().toLowerCase();
        })
        .filter(id => id.length > 0);
    }

    // Log ingredients status but continue even if no ingredients found
    if (!ingredientsText && analysisIngredients.length === 0) {
      console.log('⚠️ No ingredients found in OpenFoodFacts data - creating product without ingredients');
    } else {
      console.log(`🥗 Found ingredients: ${ingredientsText ? 'text' : 'none'}, analysis: ${analysisIngredients.length} items`);
    }

    // Parse ingredients text for display purposes (handle empty case)
    const ingredients = ingredientsText 
      ? ingredientsText
          .split(/[,;]/)
          .map(ing => ing.trim())
          .filter(ing => ing.length > 0)
      : [];

    // Format ingredients for database storage
    const ingredientsField = ingredients.length > 0 ? ingredients.join(', ') : '';
    
    // Use analysis ingredients if available, otherwise fall back to parsed text
    let analysisField: string;
    if (analysisIngredients.length > 0) {
      analysisField = analysisIngredients.join('~');
    } else if (ingredients.length > 0) {
      // Fallback to cleaned parsed ingredients
      const cleanedIngredients = ingredients.map(ing => 
        ing.replace(/[.,!?;:()\[\]{}'"]/g, '').trim().toLowerCase()
      ).filter(ing => ing.length > 0);
      analysisField = cleanedIngredients.join('~');
    } else {
      // No ingredients at all - empty analysis field
      analysisField = '';
    }

    console.log(`🥗 Processed ${ingredients.length} display ingredients`);
    console.log(`🔬 Extracted ${analysisIngredients.length} analysis ingredients from IDs`);
    console.log(`📝 Analysis field: ${analysisField}`);

    // Get current timestamp
    const now = new Date().toISOString();
    
    // Create new product record
    const productData = {
      ean13: upc, // Primary key
      upc: upc,
      product_name: product.product_name || '',
      brand: product.brands || '',
      ingredients: ingredientsField,
      analysis: analysisField,
      imageurl: product.image_url || '',
      lastupdated: now,
      created: now,
      classification: 'undetermined' // Will be updated by classify_upc
    };
    
    console.log(`🗄️ Inserting product data for UPC: ${upc}`);
    
    // Insert the product
    const { error: insertError } = await supabase
      .from('products')
      .insert(productData);
    
    if (insertError) {
      console.error('❌ Database insert error:', insertError);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to create product: ${insertError.message}`,
        productCreated: false,
        classificationChanged: false
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log(`✅ Product created successfully`);

    // Now run classify_upc to update the classification
    console.log(`🔍 Running classification for UPC: ${upc}`);
    
    const { data: classificationResult, error: classifyError } = await supabase
      .rpc('classify_upc', { input_upc: upc });

    let finalClassification = 'undetermined';
    if (classifyError) {
      console.error('❌ Classification error:', classifyError);
    } else {
      finalClassification = classificationResult || 'undetermined';
      console.log(`🎯 Classification result: ${finalClassification}`);
    }

    // Return success response
    const response: UpdateProductFromOffResponse = {
      success: true,
      message: `Product created successfully with classification: ${finalClassification}`,
      productCreated: true,
      classificationResult: finalClassification,
      classificationChanged: finalClassification !== 'undetermined'
    };

    // Log the action to actionlog table
    console.log(`📝 Logging action to actionlog`);
    const { error: logError } = await supabase
      .from('actionlog')
      .insert({
        type: 'update_product_from_off',
        input: upc,
        userid: user.id,
        result: finalClassification,
        metadata: {
          operation: 'create_product',
          product_name: product.product_name || '',
          brand: product.brands || '',
          ingredients_count: ingredients.length,
          analysis_ingredients_count: analysisIngredients.length,
          classification: finalClassification,
          openfoodfacts_status: offData.status
        }
      });

    if (logError) {
      console.error('⚠️ Failed to log action (continuing anyway):', logError);
    } else {
      console.log('✅ Action logged successfully');
    }

    console.log(`🎉 Process complete for UPC: ${upc}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Internal server error',
      productCreated: false,
      classificationChanged: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
});