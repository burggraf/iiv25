import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// NOTE: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically 
// available in all Supabase Edge Functions - no manual setup required
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',           // Available by default
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Available by default
);

Deno.serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the JWT token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create a client with the user's JWT to get current user
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get the current user from the JWT
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const user_id = user.id;
    
    // Get user email from the authenticated user
    if (!user.email) {
      return new Response(JSON.stringify({ error: 'User email not found' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const user_email = user.email;
    
    // Generate cryptographically secure confirmation token
    const confirmationToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    
    // Upsert email confirmation record (reuses existing record)
    const { error } = await supabaseAdmin
      .from('email_confirmations')
      .upsert({
        id: user_id,
        token: confirmationToken,
        confirmation_sent_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ error: 'Database error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Send email via SendPulse  
    const confirmationUrl = `https://isitvegan.net/confirm-email?user_id=${user_id}&token=${confirmationToken}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2e7d32;">Confirm Your Email Address</h2>
        <p>Thank you for signing up for Is It Vegan! Please click the link below to confirm your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmationUrl}" style="background-color: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Confirm Email</a>
        </div>
        <p><strong>This link will expire in 24 hours.</strong></p>
        <p>If you didn't create an account with Is It Vegan, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">
          Is It Vegan - Making plant-based choices easier<br>
          <a href="https://isitvegan.net">isitvegan.net</a>
        </p>
      </div>
    `;
    
    // First, get OAuth2 access token from SendPulse
    const tokenResponse = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: Deno.env.get('SENDPULSE_API_USER_ID'),
        client_secret: Deno.env.get('SENDPULSE_API_SECRET')
      })
    });

    if (!tokenResponse.ok) {
      console.error('SendPulse token error:', await tokenResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to get SendPulse access token' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('No access token received from SendPulse');
      return new Response(JSON.stringify({ error: 'No access token from SendPulse' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const sendPulseResponse = await fetch('https://api.sendpulse.com/smtp/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email: {
          html: btoa(emailHtml), // Base64 encode
          subject: 'Confirm Your Email - Is It Vegan?',
          from: {
            name: Deno.env.get('FROM_NAME'),
            email: Deno.env.get('FROM_EMAIL')
          },
          to: [{
            email: user_email
          }]
        }
      })
    });
    
    if (!sendPulseResponse.ok) {
      console.error('SendPulse error:', await sendPulseResponse.text());
      return new Response(JSON.stringify({ error: 'Email sending failed' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const sendPulseResult = await sendPulseResponse.json();
    console.log('Email sent successfully:', sendPulseResult);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Email confirmation sent successfully',
      email: user_email 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});