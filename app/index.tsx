import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAuth } from '../src/context/AuthContext';

export default function IndexScreen() {
  const { user, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('IndexScreen - Effect triggered. User:', user?.id, 'IsInitialized:', isInitialized);
    
    if (!isInitialized) {
      console.log('IndexScreen - Not initialized yet, waiting...');
      return;
    }

    // Check if the app was opened with a password reset deep link
    const checkForPasswordResetLink = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('IndexScreen - Initial URL:', initialUrl);
        
        if (initialUrl && initialUrl.includes('auth/reset-password')) {
          console.log('IndexScreen - Password reset deep link detected, navigating to reset screen');
          
          // Extract query parameters from the deep link
          // Deep link format: net.isitvegan.app://auth/reset-password?token_hash=xxx&type=recovery
          const queryStartIndex = initialUrl.indexOf('?');
          const searchParams = queryStartIndex !== -1 ? initialUrl.substring(queryStartIndex) : '';
          console.log('IndexScreen - Extracted params:', searchParams);
          
          // Navigate to the reset password screen with parameters
          router.replace(`/auth/reset-password${searchParams}`);
          return;
        }
      } catch (error) {
        console.error('IndexScreen - Error checking initial URL:', error);
      }

      // Normal authentication flow
      if (user) {
        // User is authenticated, redirect to main app
        console.log('IndexScreen - User is authenticated, redirecting to tabs');
        router.replace('/(tabs)');
      } else {
        // User is not authenticated, redirect to login
        console.log('IndexScreen - User is not authenticated, redirecting to login');
        router.replace('/auth/login');
      }
    };

    checkForPasswordResetLink();
  }, [user, isInitialized, router]);

  // Show loading screen while checking authentication
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#14A44A" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  text: {
    fontSize: 18,
    color: '#333333',
  },
});