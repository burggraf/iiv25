# Send Push Notification Edge Function

This edge function sends push notifications to users securely with multiple authentication methods.

## 🔒 Security Features

The function includes comprehensive authentication and authorization:

1. **API Key Authentication** - Simple secret key for admin applications
2. **Service Role Authentication** - Supabase service role key validation  
3. **JWT Token + Admin Role** - User JWT with admin role checking

## ⚙️ Environment Variables Required

Add these to your Supabase Edge Function secrets:

```bash
# Required for basic function operation
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# Required for API key authentication (recommended)
ADMIN_API_KEY=07D36FCA-9856-4349-A75F-4E5FF45827DB
```

## 🧪 Testing Results

✅ **Security Validated** - All authentication methods tested and working:
- Invalid API key rejected: `{"error":"Invalid or expired token"}`
- Valid API key accepted and processes requests
- Proper error handling for unauthorized access

## 🛡️ Security Implementation

The function validates requests through multiple layers:
1. **Supabase Auth Layer**: Requires valid Authorization header
2. **Custom Auth Validation**: Checks X-API-Key, service role, or admin JWT
3. **Database Permissions**: Uses service role for secure database access

## Authentication Methods

### Method 1: API Key (Recommended for Admin Apps)

```bash
curl -X POST https://wpjqtgkfgvheisgcxhxu.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwanF0Z2tmZ3ZoZWlzZ2N4aHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDEzNzksImV4cCI6MjA2OTcxNzM3OX0.hPO_VSjIfP6lT8WBQ4HDDKFS1quknTr1gWHSyp6LVwQ" \
  -H "X-API-Key: 07D36FCA-9856-4349-A75F-4E5FF45827DB" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-here",
    "title": "Test Notification", 
    "body": "This is a test notification",
    "type": "admin_message"
  }'
```

### Method 2: Service Role Key

```bash
curl -X POST https://wpjqtgkfgvheisgcxhxu.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer your_service_role_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["user1-uuid", "user2-uuid"],
    "title": "Bulk Notification",
    "body": "Message for multiple users", 
    "type": "system_alert"
  }'
```

### Method 3: User JWT + Admin Role

```bash
curl -X POST https://wpjqtgkfgvheisgcxhxu.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer user_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "target-user-uuid",
    "title": "Admin Message",
    "body": "Message from admin user",
    "type": "admin_notification"
  }'
```

**Note**: All methods require the `Authorization: Bearer` header due to Supabase Edge Function requirements. Use anon key for Methods 1, service role key for Method 2, or user JWT for Method 3.

## Admin User Requirements

For Method 3 (JWT + Admin), users must meet one of these criteria:

- Have `subscription_level: 'admin'` in the `profiles` table
- Have email ending with `@isitvegan.com`

## Request Payload

```typescript
interface NotificationPayload {
  userId?: string        // Single user ID
  userIds?: string[]     // Multiple user IDs  
  title: string          // Notification title
  body: string           // Notification body
  data?: Record<string, any>  // Optional data payload
  type: string           // Notification type for categorization
}
```

## Response

```typescript
// Success
{
  "message": "Notifications processed",
  "sent": 2,
  "total": 2, 
  "details": [...]
}

// Authentication Error
{
  "error": "Authentication required. Provide X-API-Key or Authorization header."
}

// Authorization Error  
{
  "error": "Insufficient permissions. Admin access required."
}
```

## Setting Environment Variables

```bash
# Set the admin API key (generate a secure random key)
supabase secrets set ADMIN_API_KEY=your_secure_random_key_here

# Verify secrets are set
supabase secrets list
```

## Usage Examples

### From Admin Application

```javascript
const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${anonKey}`, // Required by Supabase
    'X-API-Key': process.env.ADMIN_API_KEY, // Your secure admin key
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'target-user-id',
    title: 'Important Update',
    body: 'Your order has been processed',
    type: 'order_update'
  })
})
```

### From Application Workflow (Service Role)

```javascript
const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
  method: 'POST', 
  headers: {
    'Authorization': `Bearer ${serviceRoleKey}`, // Service role acts as both auth methods
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userIds: ['user1', 'user2', 'user3'],
    title: 'System Maintenance',
    body: 'Scheduled maintenance will begin in 1 hour',
    type: 'system_notification'
  })
})
```

## Security Best Practices

1. **Use API Key method** for admin applications
2. **Rotate API keys** regularly  
3. **Use HTTPS only** in production
4. **Validate user permissions** before calling
5. **Rate limit** calls from your application
6. **Log and monitor** function usage
7. **Keep secrets secure** and never commit to code