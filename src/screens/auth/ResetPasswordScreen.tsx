import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { Input, Button } from 'react-native-elements';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';

const { height: screenHeight } = Dimensions.get('window');

export default function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ token_hash?: string; type?: string; code?: string; error?: string; error_code?: string }>();
  
  // DEBUG: Log all parameters we receive (can be removed in production)
  // console.log('🔍 ALL URL PARAMS RECEIVED:', JSON.stringify(searchParams, null, 2));
  
  // Handle both token_hash (older format) and code (current format) parameters
  const token_hash = searchParams.token_hash || searchParams.code;
  const type = searchParams.type || 'recovery';
  const error = searchParams.error;
  const error_code = searchParams.error_code;
  
  const [formState, setFormState] = useState({
    password: '',
    confirmPassword: '',
    isLoading: false,
    error: null as string | null,
    isValidated: false,
  });

  useEffect(() => {
    console.log('ResetPasswordScreen - useEffect triggered');
    console.log('ResetPasswordScreen - token_hash:', token_hash);
    console.log('ResetPasswordScreen - type:', type);
    console.log('ResetPasswordScreen - error:', error);
    console.log('ResetPasswordScreen - error_code:', error_code);
    
    // Check for errors first
    if (error || error_code) {
      let errorMessage = 'This password reset link is invalid or expired.';
      if (error_code === 'otp_expired') {
        errorMessage = 'This password reset link has expired. Please request a new one.';
      }
      Alert.alert(
        'Invalid Link',
        errorMessage,
        [{ text: 'OK', onPress: () => router.push('/auth/forgot-password') }]
      );
      return;
    }
    
    // Validate that we have the required parameters for password reset
    if (!token_hash || type !== 'recovery') {
      console.log('ResetPasswordScreen - Invalid parameters detected, showing alert');
      Alert.alert(
        'Invalid Link',
        'This password reset link is invalid or expired. Please request a new one.',
        [{ text: 'OK', onPress: () => router.push('/auth/forgot-password') }]
      );
      return;
    }
    
    console.log('Reset password screen - Valid parameters detected:', { token_hash, type });
    setFormState(prev => ({ 
      ...prev, 
      isValidated: true 
    }));
  }, [token_hash, type, error, error_code, router]);

  const handleInputChange = (field: 'password' | 'confirmPassword', value: string) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      error: null,
    }));
  };

  const validateForm = (): boolean => {
    if (!formState.password || !formState.confirmPassword) {
      setFormState(prev => ({
        ...prev,
        error: 'Please fill in both password fields',
      }));
      return false;
    }

    if (formState.password !== formState.confirmPassword) {
      setFormState(prev => ({
        ...prev,
        error: 'Passwords do not match',
      }));
      return false;
    }

    if (formState.password.length < 6) {
      setFormState(prev => ({
        ...prev,
        error: 'Password must be at least 6 characters long',
      }));
      return false;
    }

    return true;
  };

  const handleResetPassword = async () => {
    if (!validateForm()) return;
    
    if (!formState.isValidated || !token_hash || type !== 'recovery') {
      setFormState(prev => ({
        ...prev,
        error: 'Password reset link is not valid. Please request a new one.',
      }));
      return;
    }

    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Import supabase client to verify the token and update password
      const { supabase } = await import('../../services/supabaseClient');
      
      console.log('Attempting password reset with token:', token_hash);
      console.log('Token type:', type);
      
      // If we received a "code" parameter, always use exchangeCodeForSession
      // This is the modern PKCE flow - the email contains pkce_ but gets transformed to code
      console.log('Using exchangeCodeForSession for password reset code');
      
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(token_hash);
      
      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        throw new Error('Invalid or expired reset link. Please request a new one.');
      }
      
      console.log('Code exchange successful, session created');
      
      // Now update the password (user should be authenticated after token exchange/verification)
      const { error: updateError } = await supabase.auth.updateUser({
        password: formState.password,
      });
      
      if (updateError) {
        console.error('Password update error:', updateError);
        throw updateError;
      }
      
      console.log('Password updated successfully');
      
      Alert.alert(
        'Password Updated',
        'Your password has been successfully updated. You can now sign in with your new password.',
        [{ text: 'OK', onPress: () => router.push('/auth/login') }]
      );
    } catch (error) {
      console.error('Password reset error:', error);
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to update password',
      }));
    }
  };

  const navigateToLogin = () => {
    router.push('/auth/login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <Logo size={80} />
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Enter your new password below
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            placeholder="New Password"
            value={formState.password}
            onChangeText={(text) => handleInputChange('password', text)}
            secureTextEntry
            leftIcon={{ type: 'feather', name: 'lock', color: '#14A44A' }}
            inputStyle={styles.inputText}
            containerStyle={styles.inputContainer}
            errorMessage={formState.error && formState.error.includes('Password') ? formState.error : undefined}
          />

          <Input
            placeholder="Confirm New Password"
            value={formState.confirmPassword}
            onChangeText={(text) => handleInputChange('confirmPassword', text)}
            secureTextEntry
            leftIcon={{ type: 'feather', name: 'lock', color: '#14A44A' }}
            inputStyle={styles.inputText}
            containerStyle={styles.inputContainer}
            errorMessage={formState.error && formState.error.includes('match') ? formState.error : undefined}
          />

          {formState.error && !formState.error.includes('Password') && !formState.error.includes('match') && (
            <Text style={styles.errorText}>{formState.error}</Text>
          )}

          <Button
            title="Update Password"
            onPress={handleResetPassword}
            loading={formState.isLoading}
            disabled={formState.isLoading}
            buttonStyle={[styles.primaryButton, styles.updateButton]}
            titleStyle={styles.primaryButtonText}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Remember your password?{' '}
              <Text style={styles.linkText} onPress={navigateToLogin}>
                Sign In
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#14A44A',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  form: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputText: {
    fontSize: 16,
    color: '#333',
  },
  primaryButton: {
    backgroundColor: '#14A44A',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 30,
  },
  updateButton: {
    marginTop: 10,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  linkText: {
    color: '#14A44A',
    fontWeight: '600',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
});