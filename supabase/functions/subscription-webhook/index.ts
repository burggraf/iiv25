import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookEvent {
  type: string;
  data: {
    product_id: string;
    transaction_id: string;
    user_id?: string;
    device_id?: string;
    purchase_date: string;
    expiration_date?: string;
    auto_renew_status?: boolean;
    is_trial_period?: boolean;
    cancellation_date?: string;
  };
}

interface SubscriptionUpdate {
  deviceId: string;
  subscriptionLevel: string;
  expiresAt?: string;
  isActive: boolean;
  transactionId: string;
}

export async function webhookHandler(req: Request) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Subscription webhook called:', req.method, req.url)

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse the webhook payload
    const webhookEvent: WebhookEvent = await req.json()
    console.log('Webhook event:', JSON.stringify(webhookEvent, null, 2))

    // Validate required fields
    if (!webhookEvent.type || !webhookEvent.data) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook payload' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { type, data } = webhookEvent

    // Process different webhook event types
    let subscriptionUpdate: SubscriptionUpdate | null = null

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'RESTORE':
        subscriptionUpdate = await processSubscriptionActivation(data)
        break
      
      case 'CANCELLATION':
      case 'EXPIRATION':
        subscriptionUpdate = await processSubscriptionCancellation(data)
        break
      
      case 'BILLING_RETRY':
        console.log('Billing retry event received - no action needed')
        break
      
      default:
        console.log(`Unknown webhook event type: ${type}`)
        break
    }

    // Update subscription in database if we have a valid update
    if (subscriptionUpdate) {
      const updateResult = await updateSubscriptionInDatabase(supabase, subscriptionUpdate)
      
      if (!updateResult.success) {
        console.error('Failed to update subscription:', updateResult.error)
        return new Response(
          JSON.stringify({ error: 'Failed to update subscription' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('Subscription updated successfully:', subscriptionUpdate.deviceId)

      // Log the webhook event for audit purposes
      await logWebhookEvent(supabase, webhookEvent, subscriptionUpdate)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully',
        updated: subscriptionUpdate ? true : false
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Webhook processing error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

/**
 * Process subscription activation (purchase, renewal, restore)
 */
export async function processSubscriptionActivation(data: WebhookEvent['data']): Promise<SubscriptionUpdate | null> {
  console.log('Processing subscription activation:', data.product_id)

  // Map product ID to subscription level and duration
  const subscriptionInfo = getSubscriptionInfo(data.product_id)
  if (!subscriptionInfo) {
    console.error(`Unknown product ID: ${data.product_id}`)
    return null
  }

  // Calculate expiration date
  let expiresAt: string | undefined
  if (data.expiration_date) {
    expiresAt = data.expiration_date
  } else if (subscriptionInfo.duration > 0) {
    // Calculate expiration based on purchase date and duration
    const purchaseDate = new Date(data.purchase_date)
    const expirationDate = new Date(purchaseDate)
    expirationDate.setDate(expirationDate.getDate() + subscriptionInfo.duration)
    expiresAt = expirationDate.toISOString()
  }
  // For lifetime subscriptions, expiresAt remains undefined

  return {
    deviceId: data.device_id || data.user_id || data.transaction_id, // Fallback chain
    subscriptionLevel: subscriptionInfo.level,
    expiresAt,
    isActive: true,
    transactionId: data.transaction_id,
  }
}

/**
 * Process subscription cancellation or expiration
 */
export async function processSubscriptionCancellation(data: WebhookEvent['data']): Promise<SubscriptionUpdate | null> {
  console.log('Processing subscription cancellation:', data.product_id)

  const subscriptionInfo = getSubscriptionInfo(data.product_id)
  if (!subscriptionInfo) {
    console.error(`Unknown product ID: ${data.product_id}`)
    return null
  }

  return {
    deviceId: data.device_id || data.user_id || data.transaction_id, // Fallback chain
    subscriptionLevel: 'free',
    expiresAt: data.cancellation_date || new Date().toISOString(),
    isActive: false,
    transactionId: data.transaction_id,
  }
}

/**
 * Get subscription information from product ID
 */
export function getSubscriptionInfo(productId: string): { level: string; duration: number } | null {
  const productMap: Record<string, { level: string; duration: number }> = {
    'isitvegan_standard_monthly': { level: 'standard', duration: 30 },
    'isitvegan_standard_quarterly': { level: 'standard', duration: 90 },
    'isitvegan_standard_semiannual': { level: 'standard', duration: 180 },
    'isitvegan_standard_annual': { level: 'standard', duration: 365 },
    'isitvegan_standard_lifetime_subscription': { level: 'standard', duration: -1 }, // -1 for lifetime
  }

  return productMap[productId] || null
}

/**
 * Update subscription in database using RPC function
 */
async function updateSubscriptionInDatabase(
  supabase: any, 
  update: SubscriptionUpdate
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Updating subscription in database:', update)

    const { data, error } = await supabase.rpc('webhook_update_subscription', {
      device_id_param: update.deviceId,
      subscription_level_param: update.subscriptionLevel,
      expires_at_param: update.expiresAt || null,
      is_active_param: update.isActive,
    })

    if (error) {
      console.error('Database update error:', error)
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'No data returned from update function' }
    }

    return { success: true }
  } catch (error) {
    console.error('Database update exception:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Log webhook event for audit purposes
 */
async function logWebhookEvent(
  supabase: any, 
  webhookEvent: WebhookEvent, 
  subscriptionUpdate: SubscriptionUpdate
): Promise<void> {
  try {
    const { error } = await supabase
      .from('webhook_events')
      .insert({
        event_type: webhookEvent.type,
        product_id: webhookEvent.data.product_id,
        transaction_id: webhookEvent.data.transaction_id,
        device_id: subscriptionUpdate.deviceId,
        subscription_level: subscriptionUpdate.subscriptionLevel,
        expires_at: subscriptionUpdate.expiresAt,
        is_active: subscriptionUpdate.isActive,
        raw_payload: webhookEvent,
        processed_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Failed to log webhook event:', error)
      // Don't throw - logging failure shouldn't break webhook processing
    }
  } catch (error) {
    console.error('Webhook logging exception:', error)
    // Don't throw - logging failure shouldn't break webhook processing
  }
}

serve(webhookHandler);

/* To generate types, run:
npx supabase gen types typescript --project-id "$PROJECT_REF" --schema public > types.ts
*/