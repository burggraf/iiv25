# Is It Vegan? - App Store Deployment Checklist

## ✅ Assets Generated

All required icons and splash screens have been generated for both iOS and Android platforms.

### iOS Assets
- **App Bundle Icons:** 17 sizes generated (20px to 180px) in `assets/images/`
- **App Store Icon:** 1024x1024 in `appstore/ios/app-store-icon-1024.png`
- **Splash Screens:** 9 device-specific sizes in `assets/` and `appstore/ios/`

### Android Assets  
- **App Bundle Icons:** 6 density sizes (36px to 192px) in `assets/images/`
- **Play Store Icon:** 512x512 in `appstore/android/play-store-icon-512.png`
- **Splash Screens:** 6 density sizes in `assets/android/` and `appstore/android/`

## 📋 Remaining Tasks for App Store Submission

### 1. Screenshots Required

#### iOS App Store Connect
- **iPhone Screenshots:** Need 3-10 screenshots
  - Sizes: 1290×2796 (iPhone 15 Pro Max) or 1179×2556 (iPhone 15 Pro)
  - Place in: `appstore/ios/screenshots/`

- **iPad Screenshots:** Need 3-10 screenshots  
  - Sizes: 2048×2732 (iPad Pro 12.9") or 1668×2388 (iPad Pro 11")
  - Place in: `appstore/ios/screenshots/`

#### Google Play Console
- **Phone Screenshots:** Need 2-8 screenshots
  - Minimum 320px width, maximum 3840px
  - Place in: `appstore/android/screenshots/`

- **Tablet Screenshots:** Need 2-8 screenshots
  - Minimum 320px width, maximum 3840px  
  - Place in: `appstore/android/screenshots/`

- **Feature Graphic:** Create 1024×500px banner image
  - Required for Play Store listing
  - Should showcase app features visually

### 2. App Store Metadata

#### iOS App Store Connect
- [ ] App Name: "Is It Vegan?"
- [ ] Subtitle: Brief tagline (30 characters max)
- [ ] Keywords: Comma-separated (100 characters max)
- [ ] Description: Detailed app description
- [ ] What's New: Version notes
- [ ] Support URL: Website with support info
- [ ] Privacy Policy URL: Required
- [ ] Category: Food & Drink
- [ ] Content Rating: 4+ (suitable for all ages)

#### Google Play Console
- [ ] Title: "Is It Vegan?" (50 characters max)
- [ ] Short Description: Brief summary (80 characters max)
- [ ] Full Description: Detailed description (4000 characters max)
- [ ] Category: Food & Drink
- [ ] Content Rating: Complete questionnaire
- [ ] Privacy Policy URL: Required
- [ ] Target Audience: All ages

### 3. Build Configuration

#### Current Configuration (app.json)
```json
{
  "name": "Is It Vegan?",
  "version": "4.0.1",
  "bundleIdentifier": "net.isitvegan.free",
  "package": "net.isitvegan.free"
}
```

#### Build Commands Ready
```bash
# iOS TestFlight Build
npm run build:ios

# Android Production Build  
npm run build:android

# Submit to App Store (iOS)
npm run submit:ios
```

### 4. Legal Requirements

- [ ] **Privacy Policy:** Must be accessible via URL
- [ ] **Terms of Service:** Recommended
- [ ] **Data Usage Disclosure:** Required for both stores
- [ ] **App Store Review Guidelines:** Review compliance
- [ ] **Google Play Policy:** Review compliance

### 5. Testing Checklist

- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Verify all icons display correctly
- [ ] Verify splash screens display correctly
- [ ] Test core functionality (barcode scanning)
- [ ] Test offline functionality
- [ ] Verify permissions work correctly
- [ ] Test on different screen sizes

### 6. Store-Specific Requirements

#### iOS App Store
- [ ] Apple Developer Account active ($99/year)
- [ ] TestFlight testing completed
- [ ] App Review Guidelines compliance
- [ ] Human Interface Guidelines compliance

#### Google Play Store
- [ ] Google Play Developer Account active ($25 one-time)
- [ ] Internal testing completed
- [ ] Google Play Policies compliance
- [ ] Target API level compliance

## 🔍 Quick Start for Screenshots

### Taking App Screenshots
1. Build the app for device testing
2. Run on target devices (iPhone, iPad, Android phone, tablet)
3. Navigate to key screens:
   - Home/Scanner screen
   - Scanning in progress
   - Vegan product result
   - Non-vegan product result
   - History screen
   - Manual entry screen

### Screenshot Tips
- Use devices with notches for iOS (iPhone X and newer)
- Capture actual product scans with recognizable brands
- Show clear vegan/vegetarian/not-vegan results
- Include variety of products in history
- Use high-quality, well-lit photos

## 📦 Asset Locations

```
appstore/
├── README.md                    # Detailed asset documentation
├── ios/
│   ├── app-store-icon-1024.png  # Required for App Store
│   ├── screenshots/             # Add iPhone/iPad screenshots here
│   └── splash-*.png             # iOS splash screens
└── android/
    ├── play-store-icon-512.png  # Required for Play Store
    ├── screenshots/             # Add phone/tablet screenshots here
    └── splash-*.png             # Android splash screens

assets/
├── images/
│   └── app-icon-*.png           # All app bundle icons
├── android/
│   └── splash-*.png             # Android splash screens
└── splash-*.png                 # iOS splash screens
```

All generated assets are production-ready and optimized for their respective platforms. The app is configured with the correct bundle identifiers and is ready for store submission once screenshots and metadata are completed.