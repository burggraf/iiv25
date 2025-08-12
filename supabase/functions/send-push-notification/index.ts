import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

interface NotificationPayload {
  userId?: string
  userIds?: string[]
  title: string
  body: string
  data?: Record<string, any>
  type: string
}

interface ExpoMessage {
  to: string
  title: string
  body: string
  data?: Record<string, any>
  sound?: 'default'
  badge?: number
}

interface AuthResult {
  success: boolean
  error?: string
  status: number
}

/**
 * Validates authentication for the push notification endpoint
 * Supports multiple authentication methods:
 * 1. API Key in X-API-Key header
 * 2. Supabase JWT token in Authorization header
 * 3. Service role key in Authorization header
 */
async function validateAuthentication(req: Request): Promise<AuthResult> {
  const apiKey = req.headers.get('X-API-Key')
  const authorization = req.headers.get('Authorization')
  
  // Method 1: Check for admin API key
  const adminApiKey = Deno.env.get('ADMIN_API_KEY')
  if (adminApiKey && apiKey === adminApiKey) {
    return { success: true, status: 200 }
  }
  
  // Method 2: Check for service role key
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (authorization && serviceRoleKey) {
    const token = authorization.replace('Bearer ', '')
    if (token === serviceRoleKey) {
      return { success: true, status: 200 }
    }
  }
  
  // Method 3: Validate Supabase JWT token and check for admin role
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.replace('Bearer ', '')
    
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      )
      
      // Verify the JWT token
      const { data: { user }, error } = await supabaseClient.auth.getUser(token)
      
      if (error || !user) {
        return { 
          success: false, 
          error: 'Invalid or expired token', 
          status: 401 
        }
      }
      
      // Check if user has admin role (you can customize this check)
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('subscription_level')
        .eq('id', user.id)
        .single()
      
      if (profileError) {
        console.error('Error checking user profile:', profileError)
        return { 
          success: false, 
          error: 'Unable to verify user permissions', 
          status: 403 
        }
      }
      
      // Allow admin users (you can modify this logic based on your needs)
      if (profile?.subscription_level === 'admin' || user.email?.endsWith('@isitvegan.com')) {
        return { success: true, status: 200 }
      }
      
      return { 
        success: false, 
        error: 'Insufficient permissions. Admin access required.', 
        status: 403 
      }
      
    } catch (error) {
      console.error('JWT validation error:', error)
      return { 
        success: false, 
        error: 'Token validation failed', 
        status: 401 
      }
    }
  }
  
  return { 
    success: false, 
    error: 'Authentication required. Provide X-API-Key or Authorization header.', 
    status: 401 
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Security: Validate authentication
    const authResult = await validateAuthentication(req)
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { 
          status: authResult.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const payload: NotificationPayload = await req.json()
    const { userId, userIds, title, body, data = {}, type } = payload

    // Validate input
    if (!title || !body || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: title, body, type' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!userId && !userIds) {
      return new Response(
        JSON.stringify({ error: 'Either userId or userIds must be provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get user IDs to send to
    const targetUserIds = userIds || [userId!]

    // Get push tokens for users who have notifications enabled
    const { data: preferences, error: prefsError } = await supabaseClient
      .from('user_notification_preferences')
      .select('user_id, expo_push_token, notifications_enabled')
      .in('user_id', targetUserIds)
      .eq('notifications_enabled', true)
      .not('expo_push_token', 'is', null)

    if (prefsError) {
      console.error('Error fetching user preferences:', prefsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user preferences' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!preferences || preferences.length === 0) {
      console.log('No users found with push tokens and notifications enabled')
      return new Response(
        JSON.stringify({ message: 'No eligible users found', sent: 0 }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Prepare Expo messages
    const messages: ExpoMessage[] = preferences.map(pref => ({
      to: pref.expo_push_token!,
      title,
      body,
      data: { ...data, type },
      sound: 'default' as const,
    }))

    // Send to Expo Push API
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const expoResult = await expoResponse.json()

    if (!expoResponse.ok) {
      console.error('Expo Push API error:', expoResult)
      return new Response(
        JSON.stringify({ error: 'Failed to send notifications', details: expoResult }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Log notifications to history
    const historyRecords = preferences.map((pref, index) => ({
      user_id: pref.user_id,
      notification_type: type,
      title,
      body,
      data,
      status: expoResult.data?.[index]?.status === 'ok' ? 'sent' : 'failed',
    }))

    const { error: historyError } = await supabaseClient
      .from('notification_history')
      .insert(historyRecords)

    if (historyError) {
      console.error('Error logging notification history:', historyError)
      // Don't fail the request, just log the error
    }

    // Count successful sends
    const sentCount = expoResult.data?.filter((result: any) => result.status === 'ok')?.length || 0

    return new Response(
      JSON.stringify({
        message: 'Notifications processed',
        sent: sentCount,
        total: messages.length,
        details: expoResult.data
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in send-push-notification:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})