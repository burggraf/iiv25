#!/bin/bash

# Deploy to TestFlight with automated tester management
# Usage: ./scripts/deploy-testflight.sh "Your changelog here"

set -e

# Load environment variables
if [ -f .env.fastlane ]; then
    export $(cat .env.fastlane | grep -v '#' | awk '/=/ {print $1}')
fi

# Get changelog from first argument or use default
CHANGELOG="${1:-Bug fixes and improvements}"

echo "🚀 Starting EAS build for TestFlight..."

# Build with EAS and capture the output to get the artifact URL
BUILD_OUTPUT=$(eas build --platform ios --profile testflight --non-interactive 2>&1)
echo "$BUILD_OUTPUT"

# Extract the artifact URL from the build output
IPA_URL=$(echo "$BUILD_OUTPUT" | grep -o 'https://expo.dev/artifacts/eas/[^[:space:]]*\.ipa' | head -1)

if [ -z "$IPA_URL" ]; then
    echo "❌ Could not find IPA URL in build output"
    echo "Build output was:"
    echo "$BUILD_OUTPUT"
    exit 1
fi

echo "📱 Found IPA URL: $IPA_URL"

# Download the IPA
echo "📥 Downloading IPA from EAS..."
IPA_PATH="./build.ipa"
curl -L -o "$IPA_PATH" "$IPA_URL"

echo "🚀 Uploading to TestFlight with Fastlane..."

# Navigate to iOS directory and run Fastlane
cd ios && bundle exec fastlane testflight_eas ipa_path:"../$IPA_PATH" changelog:"$CHANGELOG"

# Clean up
rm "../$IPA_PATH"

echo "✅ TestFlight deployment complete!"
echo "📧 Your testers have been notified automatically."