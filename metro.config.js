const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfill resolver
config.resolver.alias = {
  ...config.resolver.alias,
  'react-native-polyfill-globals': require.resolve('react-native-polyfill-globals'),
};

module.exports = config;