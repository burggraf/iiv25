# Subscription Implementation and Testing Guide

## Overview

This guide provides comprehensive instructions for configuring and testing the subscription system for the Is It Vegan? app on both iOS App Store and Google Play Store.

## Table of Contents

1. [App Store Connect Configuration (iOS)](#app-store-connect-configuration-ios)
2. [Google Play Console Configuration (Android)](#google-play-console-configuration-android)
3. [Testing Plan](#testing-plan)
4. [Webhook Configuration](#webhook-configuration)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## App Store Connect Configuration (iOS)

### Prerequisites

- Apple Developer Account with valid membership
- App already registered in App Store Connect
- Bundle ID: `net.isitvegan.free`
- Xcode with proper provisioning profiles

### Step 1: Configure Subscription Groups

1. **Navigate to App Store Connect**

   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Select your app "Is It Vegan?"

2. **Create Subscription Group**
   - Go to Features → In-App Purchases
   - Click "+" and select "Subscription Group"
   - Group Name: "Standard Subscriptions"
   - Reference Name: "isitvegan_standard_group"

### Step 2: Create Individual Subscriptions

Create each subscription with these exact Product IDs:

#### Monthly Subscription

- **Product ID**: `isitvegan_standard_monthly`
- **Reference Name**: "Monthly Standard"
- **Subscription Duration**: 1 month
- **Price**: $1.99 USD (Tier 2)
- **Subscription Group**: Standard Subscriptions

#### Quarterly Subscription

- **Product ID**: `isitvegan_standard_quarterly`
- **Reference Name**: "3-Month Standard"
- **Subscription Duration**: 3 months
- **Price**: $4.99 USD (Tier 5)
- **Subscription Group**: Standard Subscriptions

#### Semiannual Subscription

- **Product ID**: `isitvegan_standard_semiannual`
- **Reference Name**: "6-Month Standard"
- **Subscription Duration**: 6 months
- **Price**: $6.99 USD (Tier 7)
- **Subscription Group**: Standard Subscriptions

#### Annual Subscription

- **Product ID**: `isitvegan_standard_annual`
- **Reference Name**: "Annual Standard"
- **Subscription Duration**: 1 year
- **Price**: $9.99 USD (Tier 10)
- **Subscription Group**: Standard Subscriptions

#### Lifetime Purchase

- **Product ID**: `isitvegan_standard_lifetime_subscription`
- **Reference Name**: "Lifetime Standard"
- **Type**: Non-Consumable In-App Purchase (not subscription)
- **Price**: $19.99 USD (Tier 20)

### Step 3: Configure Metadata

For each subscription, add:

#### Localized Information (English)

- **Display Name**: "[Duration] Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements. [Savings info]"

#### App Store Review Information

- **Screenshot**: Upload screenshot showing subscription benefits
- **Review Notes**: "Standard subscription unlocks unlimited usage and removes ads"

### Step 4: Set Up Server-to-Server Notifications

1. **Enable Notifications**

   - Go to App Information → App Store Server Notifications
   - Set Notification URL: `https://[your-project].supabase.co/functions/v1/subscription-webhook`
   - Bundle ID: `net.isitvegan.free`
   - Enable for Production and Sandbox

2. **Configure Events**
   - Enable all subscription events:
     - INITIAL_BUY
     - RENEWAL
     - CANCEL
     - PRICE_INCREASE
     - INTERACTIVE_RENEWAL
     - DID_FAIL_TO_RENEW
     - DID_RECOVER

---

## Google Play Console Configuration (Android)

### Prerequisites

- Google Play Console account
- App published (at least internal testing)
- Package name: `net.isitvegan.free`

### Step 1: Create Subscription Products

1. **Navigate to Google Play Console**

   - Go to [Google Play Console](https://play.google.com/console)
   - Select "Is It Vegan?" app

2. **Create Subscriptions**
   - Go to Monetize → Products → Subscriptions
   - Click "Create subscription"

#### Monthly Subscription

- **Product ID**: `isitvegan_standard_monthly`
- **Name**: "Monthly Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements"
- **Billing period**: 1 month
- **Price**: $1.99 USD
- **Free trial**: 7 days (optional)
- **Grace period**: 3 days

#### Quarterly Subscription

- **Product ID**: `isitvegan_standard_quarterly`
- **Name**: "3-Month Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements - Save 17%"
- **Billing period**: 3 months
- **Price**: $4.99 USD
- **Free trial**: 7 days (optional)
- **Grace period**: 3 days

#### Semiannual Subscription

- **Product ID**: `isitvegan_standard_semiannual`
- **Name**: "6-Month Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements - Save 42%"
- **Billing period**: 6 months
- **Price**: $6.99 USD
- **Free trial**: 7 days (optional)
- **Grace period**: 3 days

#### Annual Subscription

- **Product ID**: `isitvegan_standard_annual`
- **Name**: "Annual Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements - Save 58%"
- **Billing period**: 12 months
- **Price**: $9.99 USD
- **Free trial**: 7 days (optional)
- **Grace period**: 3 days

### Step 2: Configure In-App Products (for Lifetime)

1. **Create In-App Product**
   - Go to Monetize → Products → In-app products
   - Click "Create product"

#### Lifetime Purchase

- **Product ID**: `isitvegan_standard_lifetime`
- **Name**: "Lifetime Standard"
- **Description**: "Unlimited product scans and ingredient searches with no advertisements - Pay once, use forever"
- **Price**: $19.99 USD

### Step 3: Set Up Real-time Developer Notifications

1. **Configure Cloud Pub/Sub**

   - Go to Monetize → Real-time developer notifications
   - Set Topic: Create or use existing Cloud Pub/Sub topic
   - Enable notifications for: Subscriptions and One-time products

2. **Webhook Endpoint**
   - Configure your webhook to receive Pub/Sub messages
   - Endpoint: `https://[your-project].supabase.co/functions/v1/subscription-webhook`

---

## Testing Plan

### Phase 1: Sandbox Testing (iOS)

#### Prerequisites

- Sandbox tester account in App Store Connect
- Test device with sandbox account signed in
- Debug build with StoreKit configuration

#### Test Cases

1. **Purchase Flow Testing**

   ```bash
   # Test each subscription tier
   - Monthly subscription purchase
   - Quarterly subscription purchase
   - Semiannual subscription purchase
   - Annual subscription purchase
   - Lifetime purchase
   ```

2. **Subscription Management**

   ```bash
   # Test subscription lifecycle
   - Upgrade from monthly to annual
   - Downgrade from annual to monthly
   - Cancel subscription
   - Reactivate cancelled subscription
   ```

3. **Purchase Restoration**
   ```bash
   # Test restore functionality
   - Delete and reinstall app
   - Sign in with same Apple ID
   - Tap "Restore Purchases"
   - Verify subscription status restored
   ```

#### iOS Testing Commands

```bash
# Build for iOS simulator testing
npm run ios

# Build for physical device testing
eas build --platform ios --profile development

# Test with StoreKit configuration file
# Add StoreKit Configuration to Xcode project
# Test purchases without actual charges
```

### Phase 2: Internal Testing (Android)

#### Prerequisites

- Internal testing track set up in Google Play Console
- Test account added to internal testing list
- Debug/release build uploaded to internal testing

#### Test Cases

1. **Purchase Flow Testing**

   ```bash
   # Test each subscription and product
   - All subscription tiers
   - Lifetime purchase
   - Free trial periods (if enabled)
   - Payment method validation
   ```

2. **Subscription Management**

   ```bash
   # Test Google Play subscription management
   - Access subscription settings
   - Cancel subscription
   - Reactivate subscription
   - Change payment method
   ```

3. **Edge Cases**
   ```bash
   # Test error conditions
   - Network interruption during purchase
   - Insufficient funds
   - Payment method decline
   - Account suspension
   ```

#### Android Testing Commands

```bash
# Build for Android testing
npm run android

# Build signed AAB for internal testing
eas build --platform android --profile preview

# Upload to Google Play Console internal testing
eas submit --platform android --track internal
```

### Phase 3: End-to-End Testing

#### Database Verification

```sql
-- Check subscription status
SELECT * FROM user_subscriptions WHERE device_id = 'test-device-id';

-- Check usage tracking
SELECT * FROM daily_usage WHERE device_id = 'test-device-id';

-- Check webhook events
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;
```

#### Rate Limiting Tests

```bash
# Test rate limits for free users
1. Perform 10 product lookups
2. Verify 11th lookup is blocked
3. Perform 10 ingredient searches
4. Verify 11th search is blocked

# Test unlimited access for standard users
1. Purchase subscription
2. Verify unlimited product lookups
3. Verify unlimited ingredient searches
```

#### Webhook Testing

```bash
# Test webhook events
curl -X POST https://[your-project].supabase.co/functions/v1/subscription-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INITIAL_PURCHASE",
    "data": {
      "product_id": "isitvegan_standard_monthly",
      "transaction_id": "test-transaction-123",
      "device_id": "test-device-id",
      "purchase_date": "2024-01-01T00:00:00Z",
      "expiration_date": "2024-02-01T00:00:00Z"
    }
  }'
```

---

## Webhook Configuration

### Supabase Edge Function Setup

1. **Deploy Webhook Function**

   ```bash
   npx supabase functions deploy subscription-webhook
   ```

2. **Set Environment Variables**

   ```bash
   npx supabase secrets set SUPABASE_URL=your-project-url
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Test Webhook Locally**
   ```bash
   npx supabase functions serve subscription-webhook
   ```

### Webhook Security

1. **iOS Verification**

   - Verify App Store receipts using Apple's verification service
   - Validate signature in production

2. **Android Verification**
   - Verify Google Play purchase tokens
   - Validate Pub/Sub message signatures

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All subscriptions approved in App Store Connect
- [ ] All subscriptions active in Google Play Console
- [ ] Webhook endpoint deployed and tested
- [ ] Database functions tested with production data
- [ ] Rate limiting verified
- [ ] Error handling tested
- [ ] Analytics/logging configured

### iOS Production Steps

1. **Submit for Review**

   ```bash
   # Build production iOS app
   eas build --platform ios --profile production

   # Submit to App Store
   eas submit --platform ios
   ```

2. **Monitor Approval**
   - Track review status in App Store Connect
   - Respond to reviewer feedback if needed
   - Test approved app before release

### Android Production Steps

1. **Release to Production**

   ```bash
   # Build production Android app
   eas build --platform android --profile production

   # Submit to Google Play
   eas submit --platform android --track production
   ```

2. **Staged Rollout**
   - Start with 5% rollout
   - Monitor crash reports and reviews
   - Increase rollout percentage gradually

### Post-Deployment Monitoring

1. **Key Metrics to Track**

   - Subscription purchase success rate
   - Webhook processing success rate
   - Rate limiting accuracy
   - User subscription status accuracy

2. **Monitoring Queries**

   ```sql
   -- Daily subscription metrics
   SELECT
     subscription_level,
     COUNT(*) as user_count,
     DATE(created_at) as date
   FROM user_subscriptions
   WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'
   GROUP BY subscription_level, DATE(created_at);

   -- Webhook processing success
   SELECT
     event_type,
     COUNT(*) as total_events,
     COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_events
   FROM webhook_events
   WHERE DATE(created_at) = CURRENT_DATE
   GROUP BY event_type;
   ```

---

## Troubleshooting

### Common iOS Issues

1. **"Product not available" Error**

   - Verify Product IDs match exactly
   - Check subscription status in App Store Connect
   - Ensure app version matches submitted version

2. **Sandbox Testing Issues**

   - Sign out of production Apple ID
   - Use fresh sandbox tester account
   - Clear StoreKit cache in simulator

3. **Receipt Validation Failures**
   - Check sandbox vs production endpoints
   - Verify shared secret configuration
   - Handle receipt validation gracefully

### Common Android Issues

1. **"Item not available for purchase" Error**

   - Verify Product IDs match exactly
   - Check product status in Google Play Console
   - Ensure app is signed with release key

2. **License Test Response Issues**

   - Configure test accounts properly
   - Use correct package name
   - Test with signed APK/AAB

3. **Real-time Notifications Not Received**
   - Verify Cloud Pub/Sub configuration
   - Check webhook endpoint accessibility
   - Validate message format

### Database Issues

1. **Rate Limiting Not Working**

   ```sql
   -- Check function exists
   SELECT proname FROM pg_proc WHERE proname = 'get_rate_limits';

   -- Test function manually
   SELECT * FROM get_rate_limits('test-device-id', 'PRODUCT_LOOKUP');
   ```

2. **Subscription Status Not Updating**

   ```sql
   -- Check webhook events
   SELECT * FROM webhook_events WHERE device_id = 'device-id' ORDER BY created_at DESC;

   -- Manually update subscription
   SELECT update_subscription('device-id', 'standard', '2024-12-31'::timestamp, true);
   ```

### Support Contacts

- **iOS Issues**: Apple Developer Support
- **Android Issues**: Google Play Developer Support
- **Payment Processing**: Stripe/Payment Provider Support
- **Technical Issues**: Development team

---

## Security Considerations

1. **API Keys and Secrets**

   - Store all secrets in Supabase Vault
   - Use environment variables for configuration
   - Rotate keys regularly

2. **Webhook Security**

   - Validate all incoming webhook signatures
   - Use HTTPS for all webhook endpoints
   - Implement rate limiting on webhook endpoints

3. **User Data Protection**

   - Store minimal payment information
   - Use device IDs instead of user IDs where possible
   - Implement proper data retention policies

4. **Testing Security**
   - Never use production payment methods in testing
   - Use sandbox/test environments exclusively
   - Implement proper test data cleanup

---

This guide provides a comprehensive roadmap for implementing and testing the subscription system. Follow each section carefully and test thoroughly before production deployment.
