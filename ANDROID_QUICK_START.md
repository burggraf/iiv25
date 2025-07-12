# Android Quick Start

## Option 1: Manual Distribution (Easiest)

**No Google Play Console setup needed!**

```bash
# Build APK for direct distribution
npm run build:android
```

1. Download APK from Expo dashboard
2. Share APK file directly with testers
3. Testers install by enabling "Unknown sources" in Android settings

## Option 2: Google Play Console (For Store Distribution)

### Prerequisites
- Google Play Console account ($25)
- One manual APK upload required first

### Quick Setup
1. **Create app** in Play Console
2. **Upload APK manually** once (required)
3. **Enable API** in Google Cloud Console
4. **Create service account** and download JSON key
5. **Grant permissions** in Play Console
6. **Configure EAS** with key path

### Key Commands
```bash
# Build for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Recommendation for New Projects

**Start with Option 1 (APK distribution)** for testing, then move to Option 2 when ready for store distribution.

For detailed setup instructions, see `ANDROID_SETUP.md`.