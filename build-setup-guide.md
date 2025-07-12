# Is It Vegan? - Build Setup Guide

This guide will help you create test builds for iOS (TestFlight) and Android (APK).

## Prerequisites

✅ EAS CLI is already installed (`eas-cli/16.15.0`)
✅ Configuration files are set up (`app.json`, `eas.json.template`)

## Step 0: Setup EAS Configuration

If you don't have an `eas.json` file yet:
```bash
cp eas.json.template eas.json
```

**Note**: `eas.json` is gitignored for security since it may contain sensitive info like Apple ID.

## Step 1: Login to Expo Account

```bash
eas login
```

Enter your Expo account credentials. If you don't have an Expo account, create one at https://expo.dev

## Step 2: Configure Project ID

After logging in, initialize EAS for your project:

```bash
eas init
```

This will create a project ID and update your `app.json` file automatically.

## Step 3: Update Bundle Identifiers (Important!)

Before building, you need to update the bundle identifiers in `app.json`:

**Replace `com.yourcompany.isitvegan` with your actual bundle identifier:**
- iOS: `bundleIdentifier: "com.yourname.isitvegan"`
- Android: `package: "com.yourname.isitvegan"`

## Step 4: Build for Android (APK)

To create an Android APK for testing:

```bash
eas build --platform android --profile apk
```

This will:
- Build your app in the cloud
- Generate an APK file
- Provide a download link when complete (usually takes 5-10 minutes)

## Step 5: Build for iOS (TestFlight)

### Option A: Internal Distribution (Easier)
```bash
eas build --platform ios --profile testflight
```

### Option B: App Store Connect (Requires Apple Developer Account)
```bash
eas build --platform ios --profile production
```

## Step 6: Submit to TestFlight (iOS only)

First, add submission configuration to your `eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "your-app-store-connect-app-id"
      }
    }
  }
}
```

Then submit to TestFlight:

```bash
eas submit --platform ios
```

You'll need:
- Apple ID credentials
- App Store Connect access
- App Store Connect app ID

## Alternative: Local Preview Builds

If you want to test locally first:

### Android Preview
```bash
eas build --platform android --profile preview
```

### iOS Simulator
```bash
eas build --platform ios --profile preview
```

## Build Status & Downloads

Monitor your builds at: https://expo.dev/accounts/[your-username]/projects/isitvegan/builds

## Troubleshooting

### Common Issues:

1. **Bundle Identifier Conflicts**
   - Make sure your bundle ID is unique
   - Use reverse domain notation: `com.yourname.isitvegan`

2. **Camera Permissions**
   - Already configured in `app.json`
   - iOS: NSCameraUsageDescription
   - Android: CAMERA permission

3. **Build Failures**
   - Check build logs in Expo dashboard
   - Ensure all dependencies are compatible

4. **TestFlight Issues**
   - Requires Apple Developer Program membership ($99/year)
   - App must pass App Store Review guidelines

## Next Steps After Build

### For Android APK:
1. Download APK from build link
2. Install on Android device
3. Share with testers via direct APK distribution

### For iOS TestFlight:
1. App automatically appears in TestFlight
2. Add testers via Apple Developer portal
3. Testers receive invitation email
4. Install TestFlight app and access your build

## Build Profiles Explained

- **apk**: Android APK for direct installation
- **testflight**: iOS internal distribution
- **preview**: Development builds with debugging
- **production**: Store-ready builds

## Cost

- EAS Build: Free tier includes limited builds per month
- Paid plans available for unlimited builds
- TestFlight: Free (requires Apple Developer account)