# App Store Assets for Is It Vegan?

This folder contains all the assets required for submitting "Is It Vegan?" to both the iOS App Store and Google Play Store.

## iOS App Store Assets (`/ios/`)

### App Icons
- `app-store-icon-1024.png` - **Required for App Store listing** (1024x1024px)
- `app-store-icon-512.png` - Alternative size (512x512px)
- `app-store-icon-256.png` - Alternative size (256x256px)

### App Bundle Icons (Generated in `/assets/images/`)
- `app-icon-180.png` - iPhone app icon @3x (60pt × 3 = 180px)
- `app-icon-167.png` - iPad Pro app icon @2x (83.5pt × 2 = 167px)
- `app-icon-152.png` - iPad app icon @2x (76pt × 2 = 152px)
- `app-icon-120.png` - iPhone app icon @2x (60pt × 2 = 120px)
- `app-icon-114.png` - iPhone app icon @2x (57pt × 2 = 114px) - Legacy
- `app-icon-100.png` - iPad app icon @2x (50pt × 2 = 100px)
- `app-icon-87.png` - iPhone app icon @3x (29pt × 3 = 87px)
- `app-icon-80.png` - iPhone/iPad app icon @2x (40pt × 2 = 80px)
- `app-icon-76.png` - iPad app icon @1x (76pt × 1 = 76px)
- `app-icon-72.png` - iPad app icon @1x (72pt × 1 = 72px) - Legacy
- `app-icon-60.png` - iPhone app icon @1x (60pt × 1 = 60px)
- `app-icon-58.png` - iPhone/iPad Settings icon @2x (29pt × 2 = 58px)
- `app-icon-57.png` - iPhone app icon @1x (57pt × 1 = 57px) - Legacy
- `app-icon-50.png` - iPad Spotlight icon @1x (50pt × 1 = 50px)
- `app-icon-40.png` - iPhone/iPad Spotlight icon @1x (40pt × 1 = 40px)
- `app-icon-29.png` - iPhone/iPad Settings icon @1x (29pt × 1 = 29px)
- `app-icon-20.png` - iPhone/iPad Notification icon @1x (20pt × 1 = 20px)

### Splash Screens
- `splash-iphone-15-pro-max.png` - iPhone 15 Pro Max, 14 Pro Max, 13 Pro Max, 12 Pro Max (1290×2796)
- `splash-iphone-15-pro.png` - iPhone 15 Pro, 14 Pro, 13 Pro, 12 Pro (1179×2556)
- `splash-iphone-15.png` - iPhone 15, 14, 13, 12 (1170×2532)
- `splash-iphone-13-mini.png` - iPhone 13 mini, 12 mini (1080×2340)
- `splash-iphone-11-pro-max.png` - iPhone 11 Pro Max, XS Max (1242×2688)
- `splash-iphone-11-pro.png` - iPhone 11 Pro, XS, X (1125×2436)
- `splash-iphone-11.png` - iPhone 11, XR (828×1792)
- `splash-iphone-8-plus.png` - iPhone 8 Plus, 7 Plus, 6s Plus, 6 Plus (1242×2208)
- `splash-iphone-8.png` - iPhone 8, 7, 6s, 6, SE (750×1334)
- `splash-ipad-pro-12-9.png` - iPad Pro 12.9" (2048×2732)
- `splash-ipad-pro-11.png` - iPad Pro 11" (1668×2388)
- `splash-ipad-air-5.png` - iPad Air 5th, 4th gen (1640×2360)
- `splash-ipad-10.png` - iPad 10th gen (1620×2160)
- `splash-ipad-9.png` - iPad 9th, 8th, 7th gen (1536×2048)
- `splash-ipad-mini-6.png` - iPad mini 6th gen (1488×2266)

### Screenshots Folder (`/ios/screenshots/`)
**You need to add actual app screenshots here:**
- iPhone screenshots: 1290×2796, 1179×2556, or 1170×2532 pixels
- iPad screenshots: 2048×2732 or 1668×2388 pixels
- **Required:** 3-10 screenshots per device type

## Android/Google Play Store Assets (`/android/`)

### App Icons
- `play-store-icon-512.png` - **Required for Play Store listing** (512×512px)
- `play-store-icon-1024.png` - Hi-res icon for Play Store (1024×1024px)

### App Bundle Icons (Generated in `/assets/images/`)
- `app-icon-192.png` - XXXHDPI (192×192) - launcher icon
- `app-icon-144.png` - XXHDPI (144×144) - launcher icon
- `app-icon-96.png` - XHDPI (96×96) - launcher icon
- `app-icon-72.png` - HDPI (72×72) - launcher icon
- `app-icon-48.png` - MDPI (48×48) - launcher icon
- `app-icon-36.png` - LDPI (36×36) - launcher icon

### Splash Screens
- `splash-ldpi.png` - LDPI (320×426)
- `splash-mdpi-new.png` - MDPI (320×470)
- `splash-hdpi-new.png` - HDPI (480×640)
- `splash-xhdpi-new.png` - XHDPI (720×960)
- `splash-xxhdpi-new.png` - XXHDPI (960×1280)
- `splash-xxxhdpi-new.png` - XXXHDPI (1280×1920)

### Screenshots Folder (`/android/screenshots/`)
**You need to add actual app screenshots here:**
- Phone screenshots: Minimum 320px, maximum 3840px
- Tablet screenshots: Minimum 320px, maximum 3840px
- **Required:** 2-8 screenshots per device type

## App Store Listing Requirements

### iOS App Store Connect
1. **App Icon:** Use `app-store-icon-1024.png`
2. **Screenshots:** Add device-specific screenshots to `/ios/screenshots/`
3. **App Preview Videos:** Optional, max 30 seconds each
4. **Metadata:** App name, subtitle, keywords, description
5. **Privacy Policy:** URL required
6. **Support URL:** URL required

### Google Play Console
1. **Hi-res Icon:** Use `play-store-icon-512.png`
2. **Feature Graphic:** 1024×500px (create this separately)
3. **Screenshots:** Add device-specific screenshots to `/android/screenshots/`
4. **App Videos:** Optional YouTube videos
5. **Metadata:** Title, short description, full description
6. **Content Rating:** Complete questionnaire
7. **Privacy Policy:** URL required

## Next Steps

1. **Take Screenshots:** Capture actual app screenshots on various devices
2. **Create Feature Graphic:** Design a 1024×500px banner for Google Play
3. **Prepare Metadata:** Write compelling app descriptions
4. **Review Guidelines:** Check both stores' submission guidelines
5. **Test on Devices:** Verify all icons and splash screens display correctly

## App Bundle Configuration

The main app icons and splash screens are already configured in `app.json`. The generated assets in `/assets/images/` are automatically used by Expo during the build process.

### Bundle IDs
- **iOS:** net.isitvegan.app
- **Android:** net.isitvegan.app

All assets have been generated from the original high-quality source files and are optimized for their respective platforms.