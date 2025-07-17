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
} from 'react-native';
import { Input, Button } from 'react-native-elements';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';

const { height: screenHeight } = Dimensions.get('window');

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();
  const { token, email } = useLocalSearchParams<{ token: string; email: string }>();
  
  const [formState, setFormState] = useState({
    password: '',
    confirmPassword: '',
    isLoading: false,
    error: null as string | null,
  });

  useEffect(() => {
    // Validate that we have the required parameters
    if (!token || !email) {
      Alert.alert(
        'Invalid Link',
        'This password reset link is invalid or expired. Please request a new one.',
        [{ text: 'OK', onPress: () => router.push('/auth/forgot-password') }]
      );
    }
  }, [token, email, router]);

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

    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await updatePassword(formState.password);
      Alert.alert(
        'Password Updated',
        'Your password has been successfully updated. You can now sign in with your new password.',
        [{ text: 'OK', onPress: () => router.push('/auth/login') }]
      );
    } catch (error) {
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    minHeight: screenHeight * 0.9,
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
    justifyContent: 'center',
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