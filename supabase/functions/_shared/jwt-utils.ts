/**
 * Shared JWT utilities for edge functions
 * Provides secure token generation and verification for email confirmation
 */

export interface EmailConfirmationPayload {
  user_id: string;
  token: string;
  exp: number; // Expiration timestamp
}

const JWT_SECRET = Deno.env.get('JWT_SECRET') ?? 'fallback-secret-key';

/**
 * Creates a JWT token containing encrypted user_id and confirmation token
 */
export async function createEmailConfirmationJWT(user_id: string, token: string): Promise<string> {
  const payload: EmailConfirmationPayload = {
    user_id,
    token,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Create HMAC-SHA256 signature
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verifies and decodes a JWT token to extract user_id and confirmation token
 */
export async function verifyEmailConfirmationJWT(jwt: string): Promise<EmailConfirmationPayload | null> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = new Uint8Array(
      atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => c.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(signatureInput)
    );

    if (!isValid) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(
      atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'))
    ) as EmailConfirmationPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token expired
    }

    return payload;

  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}