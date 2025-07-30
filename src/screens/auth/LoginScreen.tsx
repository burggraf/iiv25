import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { AuthFormState } from '../../types/auth';
import Logo from '../../components/Logo';

const { height: screenHeight } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithApple, signInAnonymously, user } = useAuth();
  
  const [formState, setFormState] = useState<AuthFormState>({
    email: '',
    password: '',
    isLoading: false,
    error: null,
  });

  // Handle navigation when user is successfully authenticated
  useEffect(() => {
    if (user) {
      console.log('LoginScreen - User authenticated, navigating to main app');
      router.replace('/(tabs)');
    }
  }, [user, router]);

  const handleInputChange = (field: keyof AuthFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      error: null,
    }));
  };

  const handleSignIn = async () => {
    if (!formState.email || !formState.password) {
      setFormState(prev => ({
        ...prev,
        error: 'Please enter both email and password',
      }));
      return;
    }

    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await signIn(formState.email, formState.password);
      // Reset loading state after successful sign in
      setFormState(prev => ({ ...prev, isLoading: false }));
      // Navigation will be handled by auth state change
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      }));
    }
  };

  const handleGoogleSignIn = async () => {
    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await signInWithGoogle();
      // Reset loading state after successful sign in
      setFormState(prev => ({ ...prev, isLoading: false }));
      // Navigation will be handled by auth state change
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Google sign in failed',
      }));
    }
  };

  const handleAppleSignIn = async () => {
    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await signInWithApple();
      // Reset loading state after successful sign in
      setFormState(prev => ({ ...prev, isLoading: false }));
      // Navigation will be handled by auth state change
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Apple sign in failed',
      }));
    }
  };

  const handleSkipLogin = async () => {
    setFormState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await signInAnonymously();
      // Reset loading state after successful sign in
      setFormState(prev => ({ ...prev, isLoading: false }));
      // Navigation will be handled by auth state change
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Anonymous sign in failed',
      }));
    }
  };

  const navigateToSignUp = () => {
    router.push('/auth/signup');
  };

  const navigateToForgotPassword = () => {
    router.push('/auth/forgot-password');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
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
          <Text style={styles.title}>Is It Vegan?</Text>
          <Text style={styles.subtitle}>
            Just scan to find out!
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            placeholder="Email"
            value={formState.email}
            onChangeText={(text) => handleInputChange('email', text)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon={{ type: 'feather', name: 'mail', color: '#14A44A' }}
            inputStyle={styles.inputText}
            containerStyle={styles.inputContainer}
            errorMessage={formState.error && formState.error.includes('email') ? formState.error : undefined}
          />

          <Input
            placeholder="Password"
            value={formState.password}
            onChangeText={(text) => handleInputChange('password', text)}
            secureTextEntry
            leftIcon={{ type: 'feather', name: 'lock', color: '#14A44A' }}
            inputStyle={styles.inputText}
            containerStyle={styles.inputContainer}
            errorMessage={formState.error && !formState.error.includes('email') ? formState.error : undefined}
          />

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={formState.isLoading}
            disabled={formState.isLoading}
            buttonStyle={[styles.primaryButton, styles.signInButton]}
            titleStyle={styles.primaryButtonText}
          />

          <TouchableOpacity
            onPress={navigateToForgotPassword}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            loading={formState.isLoading}
            disabled={formState.isLoading}
            buttonStyle={[styles.secondaryButton, styles.googleButton]}
            titleStyle={styles.secondaryButtonText}
            icon={{ type: 'font-awesome', name: 'google', color: '#666', size: 18 }}
          />

          {Platform.OS === 'ios' && (
            <Button
              title="Continue with Apple"
              onPress={handleAppleSignIn}
              loading={formState.isLoading}
              disabled={formState.isLoading}
              buttonStyle={[styles.secondaryButton, styles.appleButton]}
              titleStyle={styles.secondaryButtonText}
              icon={{ type: 'font-awesome', name: 'apple', color: '#666', size: 18 }}
            />
          )}

          <Button
            title="Skip Login"
            onPress={handleSkipLogin}
            loading={formState.isLoading}
            disabled={formState.isLoading}
            buttonStyle={[styles.tertiaryButton, styles.skipButton]}
            titleStyle={styles.tertiaryButtonText}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don&apos;t have an account?{' '}
              <Text style={styles.linkText} onPress={navigateToSignUp}>
                Sign Up
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
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
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
    marginBottom: 16,
  },
  signInButton: {
    marginTop: 10,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 12,
  },
  googleButton: {
    marginBottom: 16,
  },
  appleButton: {
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  tertiaryButton: {
    backgroundColor: 'transparent',
    borderColor: '#14A44A',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 20,
  },
  skipButton: {
    marginBottom: 30,
  },
  tertiaryButtonText: {
    color: '#14A44A',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginBottom: 20,
  },
  forgotPasswordText: {
    color: '#14A44A',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#666',
    fontSize: 14,
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