import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function IndexScreen() {
  const { user, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    console.log('IndexScreen - User:', user?.id, 'IsInitialized:', isInitialized);

    if (user) {
      // User is authenticated, redirect to main app
      console.log('IndexScreen - Redirecting to tabs');
      router.replace('/(tabs)');
    } else {
      // User is not authenticated, redirect to login
      console.log('IndexScreen - Redirecting to login');
      router.replace('/auth/login');
    }
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