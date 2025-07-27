import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';

const { height: screenHeight } = Dimensions.get('window');

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  
  const [formState, setFormState] = useState({
    email: '',
    isLoading: false,
    error: null as string | null,
  });

  const handleInputChange = (value: string) => {
    setFormState(prev => ({
      ...prev,
      email: value,
      error: null,
    }));
  };

  const handleResetPassword = async () => {
    if (!formState.email) {
      setFormState(prev => ({
        ...prev,
        error: 'Please enter your email address',
      }));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formState.email)) {
      setFormState(prev => ({
        ...prev,
        error: 'Please enter a valid email address',
      }));
      return;
    }

    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await resetPassword(formState.email);
      Alert.alert(
        'Reset Email Sent',
        'Check your email for a password reset link. Make sure to check your spam folder.',
        [{ text: 'OK', onPress: () => router.push('/auth/login') }]
      );
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to send reset email',
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
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we&apos;ll send you a link to reset your password
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            placeholder="Email"
            value={formState.email}
            onChangeText={handleInputChange}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon={{ type: 'feather', name: 'mail', color: '#14A44A' }}
            inputStyle={styles.inputText}
            containerStyle={styles.inputContainer}
            errorMessage={formState.error || undefined}
          />

          <Button
            title="Send Reset Link"
            onPress={handleResetPassword}
            loading={formState.isLoading}
            disabled={formState.isLoading}
            buttonStyle={[styles.primaryButton, styles.resetButton]}
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
    marginBottom: 20,
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
  resetButton: {
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
});