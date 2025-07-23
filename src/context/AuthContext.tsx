import { AuthError as SupabaseAuthError } from '@supabase/supabase-js'
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { AuthContextValue, AuthState } from '../types/auth'
import { testPolyfill } from '../utils/test-polyfill'
import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

// Required for web only
WebBrowser.maybeCompleteAuthSession()

const createSessionFromUrl = async (url: string) => {
	const { params, errorCode } = QueryParams.getQueryParams(url)

	if (errorCode) throw new Error(errorCode)
	const { access_token, refresh_token } = params

	if (!access_token) return

	const { data, error } = await supabase.auth.setSession({
		access_token,
		refresh_token,
	})
	if (error) throw error
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
		
		// Handle deep linking for OAuth callback
		const handleDeepLink = (url: string) => {
			if (url) {
				createSessionFromUrl(url).catch(console.error)
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
			data: { authSubscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			console.log('Auth state changed:', event, session?.user?.id)

			setAuthState({
				user: session?.user ?? null,
				session: session,
				isLoading: false,
				isInitialized: true,
			})
		})

		return () => {
			authSubscription.unsubscribe()
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
			// Use custom scheme for mobile redirect
			const redirectTo = makeRedirectUri({
				scheme: 'net.isitvegan.app',
				path: 'auth/callback',
			})
			console.log('OAuth redirect URI:', redirectTo)

			const { data, error } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo,
					skipBrowserRedirect: true,
				},
			})

			if (error) {
				handleAuthError(error)
				return
			}

			const res = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo)

			if (res.type === 'success') {
				const { url } = res
				await createSessionFromUrl(url)
			}
		} catch (error) {
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
