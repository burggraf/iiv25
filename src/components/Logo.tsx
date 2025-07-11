import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

interface LogoProps {
  size?: number;
  style?: any;
}

export default function Logo({ size = 60, style }: LogoProps) {
  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={[styles.logo, { width: size, height: size }]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderRadius: 8,
  },
});