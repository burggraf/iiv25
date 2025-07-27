const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidIAPConfig(config) {
  return withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;
    
    // Add missingDimensionStrategy for react-native-iap variants
    const iapConfig = `
android {
    defaultConfig {
        missingDimensionStrategy 'store', 'play'
    }
}`;

    // Check if the configuration is already present
    if (!buildGradle.includes("missingDimensionStrategy 'store'")) {
      // Find the android block and add the configuration
      const androidBlockRegex = /android\s*{/;
      if (androidBlockRegex.test(buildGradle)) {
        config.modResults.contents = buildGradle.replace(
          /android\s*{\s*([^}]*defaultConfig\s*{[^}]*})/,
          (match, defaultConfigBlock) => {
            if (defaultConfigBlock.includes("missingDimensionStrategy")) {
              return match;
            }
            return match.replace(
              /defaultConfig\s*{([^}]*)}/,
              `defaultConfig {$1
        missingDimensionStrategy 'store', 'play'
    }`
            );
          }
        );
      } else {
        // If no android block found, add it
        config.modResults.contents = buildGradle + iapConfig;
      }
    }
    
    return config;
  });
};