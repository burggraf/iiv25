import '../src/utils/rn-polyfill'; // Import polyfills first
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
// import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import 'react-native-reanimated'; // Temporarily disabled due to crashes

import { useColorScheme } from '../hooks/useColorScheme';
import { AppProvider } from '../src/context/AppContext';
import { AuthProvider } from '../src/context/AuthContext';
import { NotificationProvider } from '../src/context/NotificationContext.refactored';
import EnvironmentBanner from '../src/components/EnvironmentBanner';
import { jobEventManager } from '../src/services/JobEventManager';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    // Initialize the central job event manager
    jobEventManager.initialize();

    if (loaded) {
      SplashScreen.hideAsync();
    } else {
      // Add timeout for Android - don't wait forever for fonts
      const timer = setTimeout(() => {
        SplashScreen.hideAsync();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loaded]);

  // Don't block rendering on font loading - especially for Android compatibility
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <NotificationProvider>
            {/* <GestureHandlerRootView style={{ flex: 1 }}> */}
              <View style={{ flex: 1 }}>
                <EnvironmentBanner style={{ position: 'absolute', top: 50, left: 10, right: 10, zIndex: 1000 }} />
                <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                  <Stack>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="auth/login" options={{ headerShown: false }} />
                    <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
                    <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
                    <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
                    <Stack.Screen name="product/[barcode]" options={{ headerShown: false }} />
                    <Stack.Screen 
                      name="product-creation/[barcode]" 
                      options={{ 
                        headerShown: false, 
                        presentation: 'fullScreenModal',
                        gestureEnabled: false 
                      }} 
                    />
                    <Stack.Screen 
                      name="report-issue/[barcode]/[type]" 
                      options={{ 
                        headerShown: false, 
                        presentation: 'fullScreenModal',
                        gestureEnabled: false 
                      }} 
                    />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <StatusBar style="auto" />
                </ThemeProvider>
              </View>
            {/* </GestureHandlerRootView> */}
          </NotificationProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
