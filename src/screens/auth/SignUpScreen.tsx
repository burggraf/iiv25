import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useState } from 'react'
import {
	Alert,
	Dimensions,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native'
import { Button, Input } from 'react-native-elements'

import Logo from '../../components/Logo'
import { useAuth } from '../../context/AuthContext'
import { SignUpCredentials } from '../../types/auth'

const { height: screenHeight } = Dimensions.get('window')

export default function SignUpScreen() {
	const router = useRouter()
	const { signUp, signInWithGoogle, user } = useAuth()

	const [formState, setFormState] = useState<
		SignUpCredentials & { isLoading: boolean; error: string | null }
	>({
		email: '',
		password: '',
		confirmPassword: '',
		isLoading: false,
		error: null,
	})

	// Handle navigation when user is successfully authenticated
	useEffect(() => {
		if (user) {
			console.log('SignUpScreen - User authenticated, navigating to main app')
			router.replace('/(tabs)')
		}
	}, [user, router])

	const handleInputChange = (field: keyof SignUpCredentials, value: string) => {
		setFormState((prev) => ({
			...prev,
			[field]: value,
			error: null,
		}))
	}

	const validateForm = (): boolean => {
		if (!formState.email || !formState.password || !formState.confirmPassword) {
			setFormState((prev) => ({
				...prev,
				error: 'Please fill in all fields',
			}))
			return false
		}

		if (formState.password !== formState.confirmPassword) {
			setFormState((prev) => ({
				...prev,
				error: 'Passwords do not match',
			}))
			return false
		}

		if (formState.password.length < 6) {
			setFormState((prev) => ({
				...prev,
				error: 'Password must be at least 6 characters long',
			}))
			return false
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(formState.email)) {
			setFormState((prev) => ({
				...prev,
				error: 'Please enter a valid email address',
			}))
			return false
		}

		return true
	}

	const handleSignUp = async () => {
		if (!validateForm()) return

		setFormState((prev) => ({ ...prev, isLoading: true, error: null }))

		try {
			await signUp(formState.email, formState.password)
			Alert.alert(
				'Account Created',
				'Please check your email for a link to verify your email address.',
				[{ text: 'OK', onPress: () => router.push('/auth/login') }]
			)
		} catch (error) {
			setFormState((prev) => ({
				...prev,
				isLoading: false,
				error: error instanceof Error ? error.message : 'Sign up failed',
			}))
		}
	}

	const handleGoogleSignUp = async () => {
		setFormState((prev) => ({ ...prev, isLoading: true, error: null }))

		try {
			await signInWithGoogle()
			// Reset loading state after successful sign up
			setFormState((prev) => ({ ...prev, isLoading: false }))
			// Navigation will be handled by auth state change
		} catch (error) {
			setFormState((prev) => ({
				...prev,
				isLoading: false,
				error: error instanceof Error ? error.message : 'Google sign up failed',
			}))
		}
	}

	const navigateToLogin = () => {
		router.push('/auth/login')
	}

	return (
		<KeyboardAvoidingView
			style={styles.container}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
			<StatusBar style='dark' />
			<ScrollView
				contentContainerStyle={styles.scrollContent}
				keyboardShouldPersistTaps='handled'
				showsVerticalScrollIndicator={false}>
				<View style={styles.header}>
					<Logo size={80} />
					<Text style={styles.title}>Create Account</Text>
					<Text style={styles.subtitle}>Join thousands of users making informed vegan choices</Text>
				</View>

				<View style={styles.form}>
					<Input
						placeholder='Email'
						value={formState.email}
						onChangeText={(text) => handleInputChange('email', text)}
						keyboardType='email-address'
						autoCapitalize='none'
						autoCorrect={false}
						leftIcon={{ type: 'feather', name: 'mail', color: '#14A44A' }}
						inputStyle={styles.inputText}
						containerStyle={styles.inputContainer}
						errorMessage={
							formState.error && formState.error.includes('email') ? formState.error : undefined
						}
					/>

					<Input
						placeholder='Password'
						value={formState.password}
						onChangeText={(text) => handleInputChange('password', text)}
						secureTextEntry
						leftIcon={{ type: 'feather', name: 'lock', color: '#14A44A' }}
						inputStyle={styles.inputText}
						containerStyle={styles.inputContainer}
						errorMessage={
							formState.error && formState.error.includes('Password') ? formState.error : undefined
						}
					/>

					<Input
						placeholder='Confirm Password'
						value={formState.confirmPassword}
						onChangeText={(text) => handleInputChange('confirmPassword', text)}
						secureTextEntry
						leftIcon={{ type: 'feather', name: 'lock', color: '#14A44A' }}
						inputStyle={styles.inputText}
						containerStyle={styles.inputContainer}
						errorMessage={
							formState.error && formState.error.includes('match') ? formState.error : undefined
						}
					/>

					{formState.error &&
						!formState.error.includes('email') &&
						!formState.error.includes('Password') &&
						!formState.error.includes('match') && (
							<Text style={styles.errorText}>{formState.error}</Text>
						)}

					<Button
						title='Create Account'
						onPress={handleSignUp}
						loading={formState.isLoading}
						disabled={formState.isLoading}
						buttonStyle={[styles.primaryButton, styles.signUpButton]}
						titleStyle={styles.primaryButtonText}
					/>

					<View style={styles.divider}>
						<View style={styles.dividerLine} />
						<Text style={styles.dividerText}>or</Text>
						<View style={styles.dividerLine} />
					</View>

					<Button
						title='Continue with Google'
						onPress={handleGoogleSignUp}
						loading={formState.isLoading}
						disabled={formState.isLoading}
						buttonStyle={[styles.secondaryButton, styles.googleButton]}
						titleStyle={styles.secondaryButtonText}
						icon={{ type: 'font-awesome', name: 'google', color: '#666', size: 18 }}
					/>

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							Already have an account?{' '}
							<Text style={styles.linkText} onPress={navigateToLogin}>
								Sign In
							</Text>
						</Text>
					</View>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	)
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
		marginBottom: 16,
	},
	signUpButton: {
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
		marginBottom: 30,
	},
	secondaryButtonText: {
		color: '#666',
		fontSize: 16,
		fontWeight: '600',
		marginLeft: 8,
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
	errorText: {
		color: '#F44336',
		fontSize: 14,
		textAlign: 'center',
		marginBottom: 16,
	},
})
