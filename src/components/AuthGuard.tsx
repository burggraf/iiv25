import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../context/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, isInitialized } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === 'auth';
    console.log('AuthGuard - User:', user?.id, 'InAuthGroup:', inAuthGroup, 'Segments:', segments);

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated and not in auth group
      console.log('AuthGuard - Redirecting to login');
      router.replace('/auth/login');
    } else if (user && inAuthGroup) {
      // Redirect to main app if authenticated and in auth group
      console.log('AuthGuard - Redirecting to main app');
      router.replace('/');
    }
  }, [user, isInitialized, segments, router]);

  // Show loading screen while checking authentication
  if (isLoading || !isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14A44A" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});