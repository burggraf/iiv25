import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface UpdateProductImageRequest {
  upc: string;
  imageUrl: string;
}

interface UpdateProductImageResponse {
  success: boolean;
  error?: string;
  updatedProduct?: any;
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
    const body: UpdateProductImageRequest = await req.json();
    const { upc, imageUrl } = body;

    if (!upc || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: upc, imageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Updating product image URL for UPC:', upc);
    console.log('Image URL:', imageUrl);

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

    // Find the product using service role (bypasses RLS)
    const { data: existingProducts, error: queryError } = await supabaseService
      .from('products')
      .select('*')
      .or(`upc.eq.${upc},upc.eq.${normalizedUpc},ean13.eq.${ean13}`)
      .limit(1);

    if (queryError) {
      console.error('Error querying existing products:', queryError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Database query failed: ${queryError.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!existingProducts || existingProducts.length === 0) {
      console.error('No product found for UPC:', upc);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `No product found for UPC: ${upc}` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const product = existingProducts[0];
    console.log('Found product:', product.product_name, 'EAN13:', product.ean13);

    // Update the product with the image URL using service role
    const { data: updatedProduct, error: updateError } = await supabaseService
      .from('products')
      .update({ 
        imageurl: imageUrl,
        lastupdated: new Date().toISOString()
      })
      .eq('ean13', product.ean13)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating product:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to update product: ${updateError.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Successfully updated product with image URL:', updatedProduct.imageurl);

    // Log the action
    try {
      await supabaseService
        .from('actionlog')
        .insert({
          userid: user.id,
          type: 'update_product_image',
          input: normalizedUpc,
          result: imageUrl,
          metadata: {
            upc: normalizedUpc,
            productName: product.product_name,
            imageUrl: imageUrl
          },
        });
    } catch (logError) {
      console.error('Failed to log action:', logError);
      // Don't fail the request if logging fails
    }

    const response: UpdateProductImageResponse = {
      success: true,
      updatedProduct
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in update-product-image function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});