import { AuthError as SupabaseAuthError } from '@supabase/supabase-js'
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { AuthContextValue, AuthState } from '../types/auth'
import { testPolyfill } from '../utils/test-polyfill'

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
			data: { subscription },
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
			subscription.unsubscribe()
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
			const { error } = await supabase.auth.signInWithOAuth({
				provider: 'google',
			})

			if (error) {
				handleAuthError(error)
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
