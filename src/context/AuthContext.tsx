import { AuthError as SupabaseAuthError } from '@supabase/supabase-js'
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { AuthContextValue, AuthState } from '../types/auth'
import { testPolyfill } from '../utils/test-polyfill'
import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { SubscriptionService } from '../services/subscriptionService'
import deviceIdService from '../services/deviceIdService'

// Required for web only
WebBrowser.maybeCompleteAuthSession()

const createSessionFromUrl = async (url: string) => {
	console.log('Creating session from OAuth URL:', url)
	
	// ABSOLUTELY SKIP password reset URLs - let Expo Router handle them
	if (url.includes('auth/reset-password')) {
		console.log('🚫 PASSWORD RESET URL DETECTED - COMPLETELY SKIPPING OAUTH PROCESSING')
		return
	}
	
	// Only process URLs that contain OAuth tokens or code
	if (!url.includes('access_token') && !url.includes('error=') && !url.includes('code=')) {
		console.log('URL does not contain OAuth parameters, skipping')
		return
	}
	
	const { params, errorCode } = QueryParams.getQueryParams(url)

	console.log('OAuth URL params:', params)
	console.log('OAuth error code:', errorCode)

	if (errorCode) {
		console.error('OAuth error code:', errorCode)
		throw new Error(errorCode)
	}
	
	const { access_token, refresh_token, code } = params

	// Handle OAuth code flow (PKCE)
	if (code) {
		// Clean the code parameter - remove any fragments or extra characters
		const cleanCode = code.replace(/#.*$/, '').trim()
		console.log('Exchanging OAuth code for session...', { originalCode: code, cleanCode })
		
		const { data, error } = await supabase.auth.exchangeCodeForSession(cleanCode)
		
		if (error) {
			console.error('Error exchanging code for session:', error)
			throw error
		}
		
		console.log('OAuth session created successfully from code:', data.user?.id)
		return data.session
	}
	
	// Handle legacy implicit flow (for backwards compatibility)
	if (!access_token) {
		console.error('No access token or code found in OAuth URL params')
		return
	}

	console.log('Setting session with OAuth tokens...')
	const { data, error } = await supabase.auth.setSession({
		access_token,
		refresh_token,
	})
	
	if (error) {
		console.error('Error setting OAuth session:', error)
		throw error
	}
	
	console.log('OAuth session created successfully:', data.user?.id)
	return data.session
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthProviderProps {
	children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [authState, setAuthState] = useState<AuthState>({
		user: null,
		session: null,
		isLoading: true,
		isInitialized: false,
	})

	useEffect(() => {
		// Test polyfill on initialization
		testPolyfill()
		
		// Handle deep linking for OAuth callback and password reset
		const handleDeepLink = (url: string) => {
			if (!url) return
			
			console.log('🔗 Processing deep link:', url)
			
			// Fix Supabase URL fragments (#) to query parameters (?) for React Navigation
			let processedUrl = url;
			if (url.includes('#')) {
				console.log('🔧 Converting URL fragment to query parameters');
				// Only replace the first # with & if there are already query parameters, otherwise with ?
				if (url.includes('?')) {
					processedUrl = url.replace('#', '&');
				} else {
					processedUrl = url.replace('#', '?');
				}
				console.log('🔧 Converted URL:', processedUrl);
			}
			
			// Check if it's a password reset URL first (more specific check)
			const isPasswordResetUrl = processedUrl.includes('auth/reset-password')
			
			// Check if it's an OAuth URL - but exclude password reset URLs
			const isOAuthUrl = !isPasswordResetUrl && (processedUrl.includes('access_token') || processedUrl.includes('error=') || processedUrl.includes('code='))
			
			const hasTokenHash = processedUrl.includes('token_hash')
			const hasRecoveryType = processedUrl.includes('type=recovery')
			
			console.log('🔍 URL analysis:', { 
				isOAuthUrl, 
				isPasswordResetUrl, 
				hasTokenHash, 
				hasRecoveryType,
				originalUrl: url,
				processedUrl: processedUrl 
			})
			
			if (isPasswordResetUrl) {
				console.log('🔑 Processing password reset deep link - prioritizing over OAuth')
				console.log('✅ Password reset URL detected, letting Expo Router handle navigation')
				// COMPLETELY SKIP OAuth processing for password reset URLs
			} else if (isOAuthUrl) {
				console.log('🔐 Processing OAuth deep link')
				// TEMPORARILY DISABLED - createSessionFromUrl(processedUrl).catch(console.error)
				console.log('🚫 OAuth processing temporarily disabled for debugging')
			} else {
				console.log('❌ Ignoring unrecognized deep link:', url)
			}
		}

		// Check for initial URL
		Linking.getInitialURL().then((url) => {
			if (url) handleDeepLink(url)
		})

		// Listen for URL changes
		const subscription = Linking.addEventListener('url', ({ url }) => {
			handleDeepLink(url)
		})

		// Get initial session
		const getInitialSession = async () => {
			try {
				const {
					data: { session },
					error,
				} = await supabase.auth.getSession()
				if (error) {
					console.error('Error getting initial session:', error)
				}

				setAuthState({
					user: session?.user ?? null,
					session: session,
					isLoading: false,
					isInitialized: true,
				})

				// Update user_subscription table for initial session
				if (session?.user) {
					Promise.resolve().then(async () => {
						try {
							console.log('Getting device ID for initial session subscription update...')
							const deviceId = await deviceIdService.getDeviceId()
							console.log('Initial session - Device ID:', deviceId, 'User ID:', session.user.id)
							await SubscriptionService.handleAuthStateChange(deviceId, session.user.id)
							console.log('Initial session subscription update completed successfully')
						} catch (subscriptionError) {
							console.error('Failed to update subscription on initial session:', subscriptionError)
							console.error('Initial session error details:', (subscriptionError as Error).message, (subscriptionError as Error).stack)
						}
					}).catch((error) => {
						console.error('Promise rejection in initial session subscription update:', error)
					})
				}
			} catch (error) {
				console.error('Error in getInitialSession:', error)
				setAuthState({
					user: null,
					session: null,
					isLoading: false,
					isInitialized: true,
				})
			}
		}

		getInitialSession()

		// Listen for auth changes
		const {
			data: { subscription: authSubscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			console.log('Auth state changed:', event, session?.user?.id)

			setAuthState({
				user: session?.user ?? null,
				session: session,
				isLoading: false,
				isInitialized: true,
			})

			// Update user_subscription table when auth state changes
			// Only update for meaningful auth changes: sign in/out, or initial session with user
			if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && session?.user)) {
				Promise.resolve().then(async () => {
					try {
						console.log('Getting device ID for subscription update...')
						const deviceId = await deviceIdService.getDeviceId()
						console.log('Device ID obtained:', deviceId, 'User ID:', session?.user?.id)
						await SubscriptionService.handleAuthStateChange(deviceId, session?.user?.id)
						console.log('Subscription update completed successfully')
					} catch (error) {
						console.error('Failed to update subscription on auth change:', error)
						console.error('Error details:', (error as Error).message, (error as Error).stack)
					}
				}).catch((error) => {
					console.error('Promise rejection in subscription update:', error)
				})
			}
		})

		return () => {
			authSubscription?.unsubscribe()
			subscription?.remove()
		}
	}, [])

	const handleAuthError = (error: SupabaseAuthError | Error): never => {
		console.error('Auth error:', error)
		const message = error.message || 'An unexpected error occurred'
		throw new Error(message)
	}

	const signIn = async (email: string, password: string): Promise<void> => {
		try {
			console.log('AuthContext - signIn called with:', email)
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
			})

			if (error) {
				console.log('AuthContext - signIn error:', error)
				handleAuthError(error)
			}

			console.log('AuthContext - signIn success:', data.user?.id)
		} catch (error) {
			console.log('AuthContext - signIn exception:', error)
			handleAuthError(error as Error)
		}
	}

	const signUp = async (
		email: string,
		password: string,
		options?: { data?: Record<string, any> }
	): Promise<void> => {
		try {
			const { error } = await supabase.auth.signUp({
				email,
				password,
				options,
			})

			if (error) {
				handleAuthError(error)
			}
		} catch (error) {
			handleAuthError(error as Error)
		}
	}

	const signOut = async (): Promise<void> => {
		try {
			console.log('SignOut: Starting sign out process...')
			const { error } = await supabase.auth.signOut()
			if (error) {
				console.error('SignOut: Supabase signOut error:', error)
				// Don't throw error - just log it and continue with local cleanup
				console.log('SignOut: Error occurred but continuing with local cleanup')
			} else {
				console.log('SignOut: Successfully signed out from Supabase')
			}
			
			// Force local state update to ensure user is cleared
			console.log('SignOut: Forcing local auth state update')
			setAuthState({
				user: null,
				session: null,
				isLoading: false,
				isInitialized: true,
			})
		} catch (error) {
			console.error('SignOut: Unexpected error during sign out:', error)
			// Force local state update even if there was an error
			setAuthState({
				user: null,
				session: null,
				isLoading: false,
				isInitialized: true,
			})
		}
	}

	const signInWithGoogle = async (): Promise<void> => {
		try {
			// OAuth requires development build - cannot work in Expo Go
			const redirectTo = makeRedirectUri({ scheme: 'net.isitvegan.app' })
			console.log('OAuth redirect URI:', redirectTo)

			const { data, error } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo,
					skipBrowserRedirect: true,
				},
			})

			if (error) {
				console.error('OAuth initiation error:', error)
				handleAuthError(error)
				return
			}

			console.log('Opening OAuth URL:', data?.url)
			const res = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo)

			console.log('OAuth session result:', res.type, res.type === 'success' ? res.url : 'No URL')

			if (res.type === 'success' && res.url) {
				await createSessionFromUrl(res.url)
			} else if (res.type === 'cancel') {
				console.log('User cancelled OAuth flow')
			} else {
				console.error('OAuth flow failed with type:', res.type)
			}
		} catch (error) {
			console.error('Google sign-in error:', error)
			handleAuthError(error as Error)
		}
	}

	const signInAnonymously = async (): Promise<void> => {
		try {
			const { error } = await supabase.auth.signInAnonymously()

			if (error) {
				handleAuthError(error)
			}
		} catch (error) {
			handleAuthError(error as Error)
		}
	}

	const resetPassword = async (email: string): Promise<void> => {
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: 'net.isitvegan.app://auth/reset-password',
			})

			if (error) {
				handleAuthError(error)
			}
		} catch (error) {
			handleAuthError(error as Error)
		}
	}

	const updatePassword = async (password: string): Promise<void> => {
		try {
			const { error } = await supabase.auth.updateUser({
				password,
			})

			if (error) {
				handleAuthError(error)
			}
		} catch (error) {
			handleAuthError(error as Error)
		}
	}

	const refreshSession = async (): Promise<void> => {
		try {
			const { error } = await supabase.auth.refreshSession()
			if (error) {
				handleAuthError(error)
			}
		} catch (error) {
			handleAuthError(error as Error)
		}
	}

	const value: AuthContextValue = {
		...authState,
		signIn,
		signUp,
		signOut,
		signInWithGoogle,
		signInAnonymously,
		resetPassword,
		updatePassword,
		refreshSession,
		isAnonymous: authState.user?.is_anonymous ?? false,
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
	const context = useContext(AuthContext)
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}
