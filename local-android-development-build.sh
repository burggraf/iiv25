#!/bin/bash

# local-android-development-build.sh
# Script to build Android APK locally for beta testing

set -e  # Exit on any error

echo "🚀 Starting local Android development build..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set Android environment variables
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"

# Check if Android SDK is installed
if [ ! -d "$ANDROID_HOME" ]; then
    echo -e "${RED}❌ Android SDK not found at $ANDROID_HOME. Please install Android SDK.${NC}"
    exit 1
fi

# Check if Java is installed
if ! command -v java &> /dev/null; then
    echo -e "${RED}❌ Java is not installed. Please install Java JDK.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment checks passed${NC}"

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
rm -rf android/app/build/outputs/apk/

# Set environment variables for local build
export EXPO_PUBLIC_SUPABASE_URL="https://wlatnzsnrlwykkriovwd.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsYXRuenNucmx3eWtrcmlvdndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMjY5NTcsImV4cCI6MjA2NzkwMjk1N30.dJaysEtKuM4td0LnZUtcVaBk9VWW0TBvvkDRqLpzh4s"
export EXPO_PUBLIC_APP_NAME="Is It Vegan?"
export EXPO_PUBLIC_APP_VERSION="4.0.0"
export ENVIRONMENT="development"

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}🔧 Prebuild for Android...${NC}"
npx expo prebuild --platform android --clean

echo -e "${YELLOW}🏗️  Building Android APK...${NC}"
cd android && ./gradlew assembleRelease

# Check if build was successful
if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    
    # Copy APK to root directory with timestamp
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    APK_NAME="IsItVegan_v4.0.0_${TIMESTAMP}.apk"
    cp app/build/outputs/apk/release/app-release.apk "../${APK_NAME}"
    
    echo -e "${GREEN}📱 APK ready for beta testing: ${APK_NAME}${NC}"
    echo -e "${GREEN}📍 Location: $(pwd)/../${APK_NAME}${NC}"
    
    # Show APK info
    APK_SIZE=$(du -h "../${APK_NAME}" | cut -f1)
    echo -e "${GREEN}📊 APK Size: ${APK_SIZE}${NC}"
    
    echo ""
    echo -e "${YELLOW}📋 Next steps for beta testing:${NC}"
    echo "1. Send the APK file to your beta testers"
    echo "2. Testers need to enable 'Install from unknown sources' on their Android devices"
    echo "3. Testers can install the APK by opening it on their device"
    echo ""
    echo -e "${GREEN}🎉 Build complete!${NC}"
else
    echo -e "${RED}❌ Build failed! Check the logs above for errors.${NC}"
    exit 1
fi