# Android Play Store Setup Guide

This guide walks through setting up Google Play Console access for automated Android app submissions.

## Prerequisites

- Google Play Console Developer Account ($25 one-time fee)
- Your app must be uploaded to Play Console at least once manually

## Step 1: Create Your App in Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Click "Create app"
3. Fill in app details:
   - **App name**: "Is It Vegan?"
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free

## Step 2: Upload Initial APK/AAB (Required)

**Important**: Google requires at least one manual upload before API access works.

1. Build your first APK: `npm run build:android`
2. Download the APK from Expo dashboard
3. In Play Console, go to "Release" > "Testing" > "Internal testing"
4. Click "Create new release"
5. Upload your APK
6. Fill in release notes and save

## Step 3: Enable Google Play Console API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the "Google Play Developer API":
   - Go to "APIs & Services" > "Library"
   - Search for "Google Play Developer API"
   - Click "Enable"

## Step 4: Create Service Account

1. In Google Cloud Console, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Fill in details:
   - **Name**: `isitvegan-play-console`
   - **Description**: `Service account for Is It Vegan app submissions`
4. Click "Create and Continue"
5. Skip role assignment for now (we'll set it up in Play Console)
6. Click "Done"

## Step 5: Generate Service Account Key

1. Click on your newly created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" format
5. Click "Create"
6. **Save the downloaded JSON file securely** - this is your service account key

## Step 6: Grant Access in Play Console

1. Back in Google Play Console, go to "Setup" > "API access"
2. Click "Link" next to your Google Cloud project
3. Accept the terms and click "Link project"
4. Find your service account in the list
5. Click "Grant access"
6. Set permissions:
   - **Account permissions**: View app information and download bulk reports
   - **App permissions**: 
     - Select "Is It Vegan?" app
     - Check "Release apps to testing tracks"
     - Check "Release apps to production"

## Step 7: Configure EAS

1. Place your service account JSON key in your project:
   ```bash
   mkdir -p android/keys
   mv ~/Downloads/your-service-account-key.json android/keys/play-console-service-account.json
   ```

2. Update your `eas.json`:
   ```json
   {
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "./android/keys/play-console-service-account.json",
           "track": "internal"
         }
       }
     }
   }
   ```

3. Add to `.gitignore`:
   ```
   # Google Play service account keys
   android/keys/
   *.json.key
   ```

## Step 8: Test Submission

Build and submit your app:

```bash
# Build for production
eas build --platform android --profile production

# Submit to Play Console
eas submit --platform android
```

## Submission Tracks

Configure different tracks in `eas.json`:

- **internal**: Internal testing (up to 100 testers)
- **alpha**: Closed testing  
- **beta**: Open testing
- **production**: Live on Play Store

## Troubleshooting

### Common Issues:

1. **"App not found" error**
   - Make sure you uploaded an APK manually first
   - Check the package name matches exactly

2. **"Insufficient permissions" error**
   - Verify service account has correct permissions in Play Console
   - Make sure API is enabled in Google Cloud Console

3. **"Invalid service account key" error**
   - Check JSON file path is correct
   - Ensure file isn't corrupted

### Verification Steps:

1. **Check service account email**: Should end with `@your-project.iam.gserviceaccount.com`
2. **Verify API enabled**: Google Play Developer API should show "Enabled" in Cloud Console
3. **Test permissions**: Try listing apps with Google Play Console API

## Security Notes

- **Never commit service account keys** to version control
- Store keys securely and rotate them periodically
- Use different service accounts for different environments
- Limit permissions to only what's needed

## Alternative: Manual Upload

If you prefer manual uploads:
1. Build APK: `npm run build:android`
2. Download from Expo dashboard
3. Upload manually in Play Console
4. Skip the service account setup entirely