# Push Notifications Implementation Guide

## Overview

Is It Vegan now supports push notifications to enhance user engagement and provide timely updates. This document covers the complete implementation, setup, and maintenance of push notifications.

## Architecture

### Technology Stack
- **Frontend**: Expo Notifications SDK for cross-platform push notification handling
- **Backend**: Supabase Edge Functions for notification orchestration
- **Database**: PostgreSQL tables for preferences, history, and user tokens
- **Service**: Expo Push Notification Service for delivery

### Key Components

1. **NotificationService** (`src/services/NotificationService.ts`)
   - Token management and registration
   - Permission handling with contextual timing
   - Local notification scheduling for testing
   - User preference management

2. **Edge Function** (`supabase/functions/send-push-notification/index.ts`)
   - Handles bulk notification sending
   - Integrates with Expo Push API
   - Logs notification history
   - Validates user permissions

3. **Database Schema** (Migration: `20250811170445_add_push_notifications_tables.sql`)
   - `user_notification_preferences`: User tokens and settings
   - `notification_history`: Sent notification tracking

4. **Settings UI** (`app/(tabs)/settings.tsx`)
   - User-facing notification preferences
   - Test notification functionality
   - Debug information display

## Database Schema

### user_notification_preferences
```sql
CREATE TABLE user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT,
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);
```

### notification_history
```sql
CREATE TABLE notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed'))
);
```

## Setup Instructions

### 1. Environment Configuration

Add the following environment variable to your Edge Functions:
```bash
# Expo Push Token (obtain from Expo Developer Console)
EXPO_ACCESS_TOKEN=your_expo_access_token_here
```

### 2. EAS Credentials Setup

Configure push notification credentials for both platforms:

#### iOS Setup
```bash
eas credentials
# Select: iOS -> Push Notifications: Manage your Apple Push Notifications Key
```

#### Android Setup
```bash
eas credentials
# Select: Android -> Push Notifications: Manage your FCM Api Key
```

### 3. App Configuration

The `app.json` has been configured with:
- Notification permissions for Android
- Notification icon and color settings
- expo-notifications plugin configuration

### 4. Deployment

Deploy the Edge Function to both environments:

```bash
# Development
supabase functions deploy send-push-notification

# Production (after switching to prod environment)
npm run supabase:prod
supabase functions deploy send-push-notification
```

## Usage

### User Registration Flow

1. User logs in → `AuthContext` triggers notification initialization
2. `NotificationService.initializeForUser()` requests permissions
3. Expo push token is obtained and saved to database
4. User can manage preferences in Settings tab

### Sending Notifications

#### Via Edge Function (Recommended)
```typescript
const response = await supabase.functions.invoke('send-push-notification', {
  body: {
    userId: 'user-uuid',
    title: 'Test Notification',
    body: 'This is a test notification',
    data: { type: 'test', customData: 'value' },
    type: 'test'
  }
});
```

#### Bulk Notifications
```typescript
const response = await supabase.functions.invoke('send-push-notification', {
  body: {
    userIds: ['user-uuid-1', 'user-uuid-2'],
    title: 'Bulk Notification',
    body: 'Message for multiple users',
    type: 'announcement'
  }
});
```

### Local Testing

Use the Settings screen test button or call directly:
```typescript
await notificationService.scheduleLocalNotification(
  'Test Title',
  'Test body',
  { type: 'test' },
  2 // seconds delay
);
```

## User Experience

### Permission Request Strategy
- Permissions requested after first successful scan (contextual)
- Non-intrusive with clear value proposition
- Easy opt-out available in settings

### Settings Integration
- Toggle for enabling/disabling notifications
- Test notification button for verification
- Debug information for troubleshooting

## Monitoring and Analytics

### Key Metrics to Track
- Push token registration success rate
- Notification delivery rates (sent vs delivered)
- User engagement with notifications
- Settings toggle usage

### Logging
- All notification sends logged to `notification_history`
- Success/failure status tracking
- Error logging in Edge Function console

## Security Considerations

### Row Level Security (RLS)
- Users can only access their own notification preferences
- Users can only view their own notification history
- Service role bypasses RLS for Edge Functions

### Data Protection
- Push tokens encrypted in database
- User consent required for all notifications
- Easy opt-out mechanism available

### Privacy Compliance
- No sensitive data included in notification payloads
- User preferences stored securely
- Data retention managed automatically

## Maintenance Tasks

### Regular Monitoring
1. **Check Delivery Rates**
   ```sql
   SELECT 
     notification_type,
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE status = 'sent') as sent,
     COUNT(*) FILTER (WHERE status = 'failed') as failed
   FROM notification_history 
   WHERE sent_at > NOW() - INTERVAL '7 days'
   GROUP BY notification_type;
   ```

2. **Monitor Token Health**
   ```sql
   SELECT 
     COUNT(*) as total_users,
     COUNT(expo_push_token) as users_with_tokens,
     COUNT(*) FILTER (WHERE notifications_enabled = true) as enabled_users
   FROM user_notification_preferences;
   ```

### Token Cleanup
Implement periodic cleanup of invalid tokens:
```sql
-- Remove tokens for deleted users (handled by CASCADE)
-- Monitor for tokens that consistently fail delivery
```

### Performance Optimization
- Monitor Edge Function execution times
- Optimize batch sizes for bulk notifications
- Implement retry logic for failed sends

## Troubleshooting

### Common Issues

1. **Notifications Not Received**
   - Check device permissions
   - Verify push token is valid
   - Confirm user has notifications enabled
   - Check Expo Push API status

2. **Permission Request Fails**
   - Ensure physical device (simulators don't work)
   - Check if user previously denied permissions
   - Verify app.json configuration

3. **Edge Function Errors**
   - Check EXPO_ACCESS_TOKEN environment variable
   - Verify Supabase service role key
   - Monitor function logs for errors

### Debug Tools

1. **Settings Screen Debug Info**: Shows current push token
2. **Test Notification**: Verifies local notification delivery
3. **Edge Function Logs**: Check Supabase dashboard function logs
4. **Database Queries**: Monitor notification_history table

## Future Enhancements

### Planned Features
1. **Smart Notifications**: App review requests based on usage patterns
2. **Sales Notifications**: Subscription and in-app purchase promotions
3. **Account Alerts**: Failed scan notifications and account issues
4. **Rich Notifications**: Images and action buttons
5. **Scheduling**: Time-zone aware notification delivery

### Advanced Features
- A/B testing framework for notification content
- User segmentation for targeted notifications
- Real-time notification analytics dashboard
- Push notification templates and campaigns

## API Reference

### NotificationService Methods

#### `registerForPushNotifications(): Promise<string | null>`
Registers device for push notifications and returns Expo push token.

#### `saveUserPushToken(userId: string, pushToken: string): Promise<boolean>`
Saves push token to database for user.

#### `areNotificationsEnabled(userId: string): Promise<boolean>`
Checks if user has notifications enabled (defaults to true).

#### `updateUserPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<boolean>`
Updates user notification preferences.

#### `initializeForUser(userId: string): Promise<void>`
Initializes notifications for a user (call on login).

### Edge Function API

#### POST /functions/v1/send-push-notification

**Request Body:**
```typescript
{
  userId?: string;        // Single user ID
  userIds?: string[];     // Multiple user IDs
  title: string;          // Notification title
  body: string;           // Notification body  
  data?: Record<string, any>; // Custom data
  type: string;           // Notification type for tracking
}
```

**Response:**
```typescript
{
  message: string;
  sent: number;           // Number of notifications sent
  total: number;          // Total number attempted
  details: Array<{        // Expo API response details
    status: 'ok' | 'error';
    id?: string;
    message?: string;
  }>;
}
```

## Cost Considerations

### Expo Push Notifications
- Free tier: 100,000 notifications/month
- Paid tiers available for higher volumes
- Monitor usage in Expo dashboard

### Supabase Edge Functions
- Free tier: 500,000 invocations/month
- Additional invocations charged per use
- Optimize batch sending to reduce costs

### Database Storage
- Notification history grows over time
- Consider implementing data retention policies
- Monitor storage usage and costs

---

*Last Updated: August 2025*
*Version: 1.0.0*