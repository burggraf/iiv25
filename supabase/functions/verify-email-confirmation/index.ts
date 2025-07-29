import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// NOTE: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically 
// available in all Supabase Edge Functions - no manual setup required
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',           // Available by default
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Available by default
);

Deno.serve(async (req) => {
  console.log('Function called with method:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    console.log('Processing POST request');
    const { user_id, token } = await req.json();
    console.log('Parsed user_id:', user_id, 'token length:', token?.length);
    
    // Get confirmation record using SERVICE_ROLE_KEY (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('email_confirmations')
      .select('*')
      .eq('id', user_id)
      .eq('token', token)
      .single();
    
    if (error || !data) {
      return new Response(JSON.stringify({ 
        error: 'Invalid token or user' 
      }), { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // Check if token is expired (24 hours)
    const sentAt = new Date(data.confirmation_sent_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      return new Response(JSON.stringify({ 
        error: 'Token expired',
        message: 'This confirmation link has expired. Please request a new one from the app.'
      }), { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // Check if already confirmed
    if (data.email_confirmed_at) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Email already confirmed'
      }), { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // Update confirmation status
    const { error: updateError } = await supabaseAdmin
      .from('email_confirmations')
      .update({
        email_confirmed_at: new Date().toISOString(),
        token: null // Clear token for security
      })
      .eq('id', user_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Update failed' }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Email confirmed successfully'
    }), { 
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
    
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
});