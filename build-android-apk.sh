#!/bin/bash

# Android APK Build Script for Is It Vegan?
# This script creates production APK builds for beta testing and distribution

set -e  # Exit on any error

echo "🚀 Starting Android APK build for Is It Vegan?"
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ Error: EAS CLI not found. Please install it first:"
    echo "   npm install -g @expo/eas-cli"
    exit 1
fi

# Check if user is logged in to EAS
if ! eas whoami &> /dev/null; then
    echo "❌ Error: Not logged in to EAS. Please login first:"
    echo "   eas login"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Start the build
echo "🔨 Starting EAS build with APK profile..."
echo "   Platform: Android"
echo "   Profile: apk (for sideloading and beta distribution)"
echo ""

# Run the build command
eas build --platform android --profile apk

# Check if build was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Build completed successfully!"
    echo ""
    echo "📱 To install on Android device:"
    echo "   1. Download the APK from the EAS dashboard"
    echo "   2. Enable 'Install unknown apps' in Android settings"
    echo "   3. Install the APK file"
    echo ""
    echo "🔗 Build dashboard: https://expo.dev/accounts/burggraf/projects/isitvegan/builds"
    echo ""
    echo "📧 To distribute to beta testers:"
    echo "   - Send them the APK download link"
    echo "   - Or use a service like Firebase App Distribution"
else
    echo ""
    echo "❌ Build failed. Check the logs above for details."
    exit 1
fi