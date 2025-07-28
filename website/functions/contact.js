// Cloudflare Worker for handling contact form submissions
// This worker receives form data and sends emails to support@isitvegan.net
// without exposing the email address to the client

export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        },
      });
    }

    try {
      // Parse the request body
      const data = await request.json();
      
      // Validate required fields
      const { name, email, subject, message } = data;
      if (!name || !email || !subject || !message) {
        return new Response('Missing required fields', {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/plain',
          },
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response('Invalid email format', {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/plain',
          },
        });
      }

      // Rate limiting: Check if this IP has sent too many requests recently
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitKey = `contact_rate_limit:${clientIP}`;
      
      // Simple rate limiting using KV (if available)
      if (env.RATE_LIMIT_KV) {
        const currentCount = await env.RATE_LIMIT_KV.get(rateLimitKey);
        if (currentCount && parseInt(currentCount) >= 5) {
          return new Response('Rate limit exceeded. Please try again later.', {
            status: 429,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/plain',
            },
          });
        }
      }

      // Sanitize inputs to prevent injection attacks
      const sanitizedData = {
        name: sanitizeInput(name),
        email: sanitizeInput(email),
        subject: sanitizeInput(subject),
        message: sanitizeInput(message),
      };

      // Create email content
      const emailSubject = `[IsItVegan Contact] ${sanitizedData.subject}`;
      const emailBody = createEmailBody(sanitizedData, clientIP, request.headers.get('User-Agent'));

      // Send email using Cloudflare's email service or external service
      const emailSent = await sendEmail(emailSubject, emailBody, sanitizedData.email, env);

      if (emailSent) {
        // Update rate limit counter
        if (env.RATE_LIMIT_KV) {
          const currentCount = await env.RATE_LIMIT_KV.get(rateLimitKey);
          const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
          await env.RATE_LIMIT_KV.put(rateLimitKey, newCount.toString(), { expirationTtl: 3600 }); // 1 hour
        }

        return new Response('Message sent successfully', {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/plain',
          },
        });
      } else {
        throw new Error('Failed to send email');
      }

    } catch (error) {
      console.error('Contact form error:', error);
      
      return new Response('Internal server error', {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        },
      });
    }
  },
};

// Sanitize input to prevent XSS and injection attacks
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
}

// Create formatted email body
function createEmailBody(data, clientIP, userAgent) {
  return `
Hello,

You have received a new message through the Is It Vegan website contact form.

CONTACT DETAILS:
Name: ${data.name}
Email: ${data.email}
Subject: ${data.subject}

MESSAGE:
${data.message}

You can reply directly to this email to respond to ${data.name}.

Best regards,
Is It Vegan Contact System

---
Technical Information:
Submitted: ${new Date().toISOString()}
IP Address: ${clientIP}
User Agent: ${userAgent || 'Unknown'}
`.trim();
}

// Send email using external service (configure based on your needs)
async function sendEmail(subject, body, replyToEmail, env) {
  // Option 1: Use Mailgun API
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    try {
      const response = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: `IsItVegan Contact Form <noreply@${env.MAILGUN_DOMAIN}>`,
          'h:Reply-To': replyToEmail,
          to: env.CONTACT_EMAIL || 'support@isitvegan.net',
          subject: subject,
          text: body,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Mailgun error:', error);
      return false;
    }
  }

  // Option 2: Use SendGrid API
  if (env.SENDGRID_API_KEY) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: env.CONTACT_EMAIL || 'support@isitvegan.net' }],
          }],
          from: { email: 'noreply@isitvegan.net', name: 'IsItVegan Contact Form' },
          reply_to: { email: replyToEmail },
          subject: subject,
          content: [{
            type: 'text/plain',
            value: body,
          }],
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('SendGrid error:', error);
      return false;
    }
  }

  // Option 3: Use Resend API (recommended for simplicity)
  if (env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'IsItVegan Contact <noreply@isitvegan.net>',
          reply_to: [replyToEmail],
          to: [env.CONTACT_EMAIL || 'support@isitvegan.net'],
          subject: subject,
          text: body,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Resend error:', error);
      return false;
    }
  }

  // Fallback: Log to console (for development)
  console.log('Email would be sent:');
  console.log('Subject:', subject);
  console.log('Body:', body);
  
  // Return true for development purposes
  return true;
}