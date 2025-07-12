# Quick Build Commands

## Setup (One-time)
```bash
eas login              # Login to Expo account
eas init               # Initialize project (creates project ID)
```

## Android APK (for testing)
```bash
npm run build:android
# OR
eas build --platform android --profile apk
```

## iOS TestFlight
```bash
npm run build:ios
# OR  
eas build --platform ios --profile testflight
```

## Preview Builds (both platforms)
```bash
npm run build:preview
# OR
eas build --platform all --profile preview
```

## Submit to TestFlight
```bash
npm run submit:ios
# OR
eas submit --platform ios
```

## Monitor Builds
Visit: https://expo.dev/accounts/[your-username]/projects/isitvegan/builds

## Important Notes

1. **Update bundle identifiers** in `app.json` before building:
   - Change `com.yourcompany.isitvegan` to `com.yourname.isitvegan`

2. **Build times**: Usually 5-15 minutes

3. **Download links**: Check your email or Expo dashboard

4. **TestFlight**: Requires Apple Developer Program ($99/year)