import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface UpdateProductImageRequest {
  upc?: string;
  batchSize?: number;
  startOffset?: number;
  userid?: string;
}

interface UpdateProductImageResponse {
  success: boolean;
  message: string;
  processedCount: number;
  updatedCount: number;
  errorCount: number;
  errors?: string[];
}

interface OpenFoodFactsProduct {
  status: number;
  product?: {
    image_url?: string;
    product_name?: string;
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
    
    // Create client with anon key to verify user authentication
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      console.log('❌ Authentication failed:', authError?.message || 'No user found');
      return new Response(JSON.stringify({ 
        error: 'Authentication required. Anonymous users cannot access this function.' 
      }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    if (user.is_anonymous) {
      console.log('❌ Anonymous user attempted to access function');
      return new Response(JSON.stringify({ 
        error: 'Anonymous users are not allowed to access this function. Please sign in with a valid account.' 
      }), {
        status: 403,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log(`✅ Authenticated user: ${user.email || user.id}`);
    
    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const requestBody: UpdateProductImageRequest = await req.json().catch(() => ({}));
    const { upc, batchSize = 50, startOffset = 0, userid } = requestBody;

    console.log(`🔄 Starting product image update process...`);
    console.log(`📊 Parameters: UPC=${upc || 'batch'}, batchSize=${batchSize}, startOffset=${startOffset}`);

    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    if (upc) {
      // Single product mode
      const result = await updateSingleProduct(supabase, upc);
      processedCount = 1;
      if (result.success) {
        updatedCount = 1;
      } else {
        errorCount = 1;
        errors.push(result.error);
      }
    } else {
      // Batch mode - get products with missing images
      const { data: products, error: queryError } = await supabase
        .from('products')
        .select('upc, ean13, product_name')
        .or('imageurl.is.null,imageurl.eq.')
        .range(startOffset, startOffset + batchSize - 1)
        .order('created', { ascending: true });

      if (queryError) {
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!products || products.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No products found with missing images',
          processedCount: 0,
          updatedCount: 0,
          errorCount: 0
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      console.log(`📦 Found ${products.length} products with missing images`);

      // Process each product
      for (const product of products) {
        const barcode = product.upc || product.ean13;
        if (!barcode) {
          errorCount++;
          errors.push(`Product missing barcode: ${product.product_name || 'unknown'}`);
          processedCount++;
          continue;
        }

        const result = await updateSingleProduct(supabase, barcode);
        processedCount++;
        
        if (result.success) {
          updatedCount++;
          console.log(`✅ Updated image for ${barcode}: ${product.product_name}`);
        } else {
          errorCount++;
          errors.push(`${barcode}: ${result.error}`);
          console.log(`❌ Failed to update ${barcode}: ${result.error}`);
        }

        // Rate limiting: wait 1 second between requests to respect OpenFoodFacts API
        if (processedCount < products.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    const response: UpdateProductImageResponse = {
      success: true,
      message: `Processed ${processedCount} products, updated ${updatedCount} images`,
      processedCount,
      updatedCount,
      errorCount,
      ...(errors.length > 0 && { errors: errors.slice(0, 10) }) // Limit errors in response
    };

    console.log(`🎉 Batch complete: ${updatedCount}/${processedCount} updated, ${errorCount} errors`);

    // Log the action to actionlog table
    console.log(`📝 Logging action to actionlog`);
    const logUserId = userid || user.id;
    
    if (upc) {
      // Single product mode
      const { error: logError } = await supabase
        .from('actionlog')
        .insert({
          type: 'update_product_image_from_off',
          input: upc,
          userid: logUserId,
          result: updatedCount > 0 ? 'success' : 'failed',
          metadata: {
            operation: 'update_image',
            processed_count: processedCount,
            updated_count: updatedCount,
            error_count: errorCount,
            errors: errors.slice(0, 3)
          }
        });

      if (logError) {
        console.error('⚠️ Failed to log action (continuing anyway):', logError);
      } else {
        console.log('✅ Action logged successfully');
      }
    } else {
      // Batch mode
      const { error: logError } = await supabase
        .from('actionlog')
        .insert({
          type: 'update_product_image_from_off',
          input: 'batch_update',
          userid: logUserId,
          result: `${updatedCount}/${processedCount} updated`,
          metadata: {
            operation: 'batch_update',
            batch_size: batchSize,
            start_offset: startOffset,
            processed_count: processedCount,
            updated_count: updatedCount,
            error_count: errorCount,
            errors: errors.slice(0, 5)
          }
        });

      if (logError) {
        console.error('⚠️ Failed to log action (continuing anyway):', logError);
      } else {
        console.log('✅ Action logged successfully');
      }
    }

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
      processedCount: 0,
      updatedCount: 0,
      errorCount: 1,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
});

async function updateSingleProduct(supabase: any, barcode: string): Promise<{ success: boolean; error: string }> {
  try {
    // Fetch product data from OpenFoodFacts
    const offResponse = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    
    if (!offResponse.ok) {
      return { success: false, error: `OpenFoodFacts API error: ${offResponse.status}` };
    }

    const offData: OpenFoodFactsProduct = await offResponse.json();

    if (offData.status === 0 || !offData.product) {
      return { success: false, error: 'Product not found in OpenFoodFacts' };
    }

    const imageUrl = offData.product.image_url;
    
    if (!imageUrl || !isValidImageUrl(imageUrl)) {
      return { success: false, error: 'No valid image URL found in OpenFoodFacts' };
    }

    // Update the product in Supabase
    const { error: updateError } = await supabase
      .from('products')
      .update({ 
        imageurl: imageUrl,
        lastupdated: new Date().toISOString()
      })
      .eq('upc', barcode);

    if (updateError) {
      // Try updating by EAN13 if UPC update failed
      const { error: ean13UpdateError } = await supabase
        .from('products')
        .update({ 
          imageurl: imageUrl,
          lastupdated: new Date().toISOString()
        })
        .eq('ean13', barcode);

      if (ean13UpdateError) {
        return { success: false, error: `Database update failed: ${updateError.message}` };
      }
    }

    return { success: true, error: '' };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error in updateSingleProduct' 
    };
  }
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Check if it's a valid HTTP/HTTPS URL and has an image-like extension
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
           (url.includes('/images/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url));
  } catch {
    return false;
  }
}