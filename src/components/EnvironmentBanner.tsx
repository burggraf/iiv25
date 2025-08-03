import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface EnvironmentBannerProps {
  style?: any;
}

const EnvironmentBanner: React.FC<EnvironmentBannerProps> = ({ style }) => {
  const environment = process.env.ENVIRONMENT;
  
  // Only show banner for non-production environments
  if (environment === 'production') {
    return null;
  }

  const getBannerConfig = () => {
    switch (environment) {
      case 'development':
        return {
          backgroundColor: '#FF6B35',
          text: '🚧 DEVELOPMENT',
          textColor: '#FFFFFF'
        };
      case 'preview':
        return {
          backgroundColor: '#FFA500',
          text: '🔍 PREVIEW',
          textColor: '#FFFFFF'
        };
      case 'testflight':
        return {
          backgroundColor: '#007AFF',
          text: '✈️ TESTFLIGHT',
          textColor: '#FFFFFF'
        };
      default:
        return {
          backgroundColor: '#9B59B6',
          text: `⚠️ ${environment?.toUpperCase() || 'UNKNOWN'}`,
          textColor: '#FFFFFF'
        };
    }
  };

  const config = getBannerConfig();

  return (
    <View style={[styles.banner, { backgroundColor: config.backgroundColor }, style]}>
      <Text style={[styles.bannerText, { color: config.textColor }]}>
        {config.text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default EnvironmentBanner;