import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Modal,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import Constants from 'expo-constants'

import Logo from './Logo'
import ManageSubscriptionModal from './ManageSubscriptionModal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
	SubscriptionService,
	SubscriptionStatus,
	UsageStats,
} from '../services/subscriptionService'
import { EmailConfirmationService } from '../services/emailConfirmationService'

interface UserAccountModalProps {
	visible: boolean
	onClose: () => void
	onSubscriptionChanged?: () => void
}

export default function UserAccountModal({ visible, onClose, onSubscriptionChanged }: UserAccountModalProps) {
	const { user, signOut, isAnonymous } = useAuth()
	const { deviceId } = useApp()
	const insets = useSafeAreaInsets()
	const [isLoading, setIsLoading] = useState(false)
	const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [showManageSubscription, setShowManageSubscription] = useState(false)
	const [isVerifyingEmail, setIsVerifyingEmail] = useState(false)

	useEffect(() => {
		if (visible && user && deviceId) {
			loadSubscriptionStatus()
			loadUsageStats()
		}
	}, [visible, user, deviceId])

	// Handle auth state changes to update user_subscription table
	useEffect(() => {
		if (visible && deviceId && user) {
			SubscriptionService.handleAuthStateChange(deviceId, user.id).catch((error) => {
				console.error('Failed to update user subscription for auth change:', error)
			})
		}
	}, [visible, user, deviceId])


	const loadSubscriptionStatus = async () => {
		try {
			if (!deviceId || !user) {
				console.log('Device ID or user not available, skipping subscription status load')
				return
			}

			const status = await SubscriptionService.getSubscriptionStatus(deviceId)
			setSubscriptionStatus(status)
		} catch (error) {
			console.error('Failed to load subscription status:', error)
			// Fallback to free tier
			setSubscriptionStatus({
				subscription_level: 'free',
				is_active: true,
				device_id: deviceId || undefined,
				email_is_verified: false,
			})
		}
	}

	const loadUsageStats = async () => {
		try {
			if (!deviceId || !user) {
				console.log('Device ID or user not available, skipping usage stats load')
				return
			}

			const stats = await SubscriptionService.getUsageStats(deviceId)
			setUsageStats(stats)
		} catch (error) {
			console.error('Failed to load usage stats:', error)
		}
	}

	const handleSubscriptionChanged = () => {
		loadSubscriptionStatus()
		loadUsageStats()
		onSubscriptionChanged?.()
	}

	const handleVerifyEmail = async () => {
		try {
			setIsVerifyingEmail(true)
			await EmailConfirmationService.sendEmailConfirmation()
			
			Alert.alert(
				'Check Your Email',
				'We\'ve sent a verification link to your email address. Please check your inbox and spam folder. Click the link to verify your email.',
				[{ text: 'OK', style: 'default' }]
			)
		} catch (error) {
			console.error('Failed to send email verification:', error)
			
			// Handle specific error messages
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			
			if (errorMessage === 'email already verified') {
				Alert.alert(
					'Email Already Verified',
					'Your email is already verified! No further action is needed.',
					[{ text: 'OK', style: 'default' }]
				)
			} else if (errorMessage === 'please wait 10 minutes before sending another confirmation email') {
				Alert.alert(
					'Please Wait',
					'Please wait 10 minutes before requesting another verification email.',
					[{ text: 'OK', style: 'default' }]
				)
			} else {
				Alert.alert(
					'Error',
					'Failed to send verification email. Please try again later.',
					[{ text: 'OK', style: 'default' }]
				)
			}
		} finally {
			setIsVerifyingEmail(false)
		}
	}

	const handleSignOut = async () => {
		try {
			setIsLoading(true)
			// Clear state before signing out to prevent stale data
			setSubscriptionStatus(null)
			setUsageStats(null)
			
			await signOut()
			onClose()
			router.replace('/auth/login')
		} catch (error) {
			Alert.alert('Error', 'Failed to sign out. Please try again.')
		} finally {
			setIsLoading(false)
		}
	}



	const isPremium =
		subscriptionStatus?.subscription_level === 'standard' ||
		subscriptionStatus?.subscription_level === 'premium'

	return (
		<Modal
			animationType="slide"
			transparent={false}
			visible={visible}
			onRequestClose={onClose}
			presentationStyle="fullScreen">
			<View style={[styles.container, { paddingTop: insets.top }]}>
				{/* Header with Close Button */}
				<View style={styles.header}>
					<TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
						<Ionicons name="close" size={24} color="#333" />
					</TouchableOpacity>
					<View style={styles.headerContent}>
						<Logo size={32} />
						<Text style={styles.appTitle}>User Account</Text>
					</View>
					<View style={styles.placeholder} />
				</View>

				<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
					{/* Authentication Status */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Account Status</Text>
						<View style={styles.card}>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Status:</Text>
								<Text style={[styles.cardValue, { color: user ? '#4CAF50' : '#FF3B30' }]}>
									{user ? (isAnonymous ? 'Anonymous User' : 'Signed In') : 'Not Signed In'}
								</Text>
							</View>
							{user?.email && (
								<>
									<View style={styles.cardRow}>
										<Text style={styles.cardLabel}>Email:</Text>
										<Text style={styles.cardValue}>{user.email}</Text>
									</View>
									<View style={styles.cardRow}>
										<Text style={styles.cardLabel}></Text>
										<View style={styles.verifyEmailContainer}>
											{subscriptionStatus?.email_is_verified ? (
												<Text style={[styles.verifyEmailText, { color: '#4CAF50', textDecorationLine: 'none' }]}>
													✓ verified email
												</Text>
											) : (
												<TouchableOpacity 
													onPress={handleVerifyEmail}
													disabled={isVerifyingEmail}
													style={styles.verifyEmailLink}>
													{isVerifyingEmail ? (
														<ActivityIndicator size="small" color="#007AFF" />
													) : (
														<Text style={styles.verifyEmailText}>verify your email address</Text>
													)}
												</TouchableOpacity>
											)}
										</View>
									</View>
								</>
							)}
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Device ID:</Text>
								<Text style={[styles.cardValue, styles.deviceId]}>{deviceId}</Text>
							</View>
						</View>
					</View>

					{/* Subscription Status */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Subscription</Text>
						<View style={styles.card}>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Plan:</Text>
								<Text
									style={[
										styles.cardValue,
										{
											color: isPremium ? '#4CAF50' : '#FF9500',
											fontWeight: '700',
										},
									]}>
									{subscriptionStatus
										? SubscriptionService.getSubscriptionDisplayName(
												subscriptionStatus.subscription_level
										  )
										: 'Loading...'}
								</Text>
							</View>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Expires:</Text>
								<Text style={styles.cardValue}>
									{subscriptionStatus?.expires_at 
										? SubscriptionService.formatExpirationDate(subscriptionStatus.expires_at)
										: 'never'
									}
								</Text>
							</View>
						</View>
					</View>


					{/* Account Actions */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Account Actions</Text>

						{!user && (
							<TouchableOpacity
								style={styles.actionButton}
								onPress={() => {
									// TODO: Navigate to authentication screen
									Alert.alert('Coming Soon', 'Sign in functionality will be available soon!')
								}}>
								<Text style={styles.actionButtonText}>Sign In / Sign Up</Text>
							</TouchableOpacity>
						)}

						{user && (
							<TouchableOpacity
								style={[styles.actionButton, styles.signOutButton]}
								onPress={handleSignOut}
								disabled={isLoading}>
								{isLoading ? (
									<ActivityIndicator size='small' color='white' />
								) : (
									<Text style={[styles.actionButtonText, styles.signOutButtonText]}>Sign Out</Text>
								)}
							</TouchableOpacity>
						)}

						<TouchableOpacity 
							style={styles.actionButton} 
							onPress={() => setShowManageSubscription(true)}>
							<Text style={styles.actionButtonText}>
								Manage Subscription
							</Text>
						</TouchableOpacity>

						<TouchableOpacity 
							style={styles.actionButton} 
							onPress={() => {
								onClose();
								router.push('/notification-settings');
							}}>
							<Text style={styles.actionButtonText}>
								Manage Notifications
							</Text>
						</TouchableOpacity>
					</View>

					{/* App Information */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>App Information</Text>
						<View style={styles.card}>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Version:</Text>
								<Text style={styles.cardValue}>{Constants.expoConfig?.version || '4.0.0'}</Text>
							</View>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Platform:</Text>
								<Text style={styles.cardValue}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
							</View>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Environment:</Text>
								<Text style={[styles.cardValue, { 
									color: (process.env.EXPO_PUBLIC_ENVIRONMENT || process.env.ENVIRONMENT) === 'production' ? '#4CAF50' : '#FF9500',
									fontWeight: '700' 
								}]}>
									{(process.env.EXPO_PUBLIC_ENVIRONMENT || process.env.ENVIRONMENT)?.toUpperCase() || 'UNKNOWN'}
								</Text>
							</View>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>App Name:</Text>
								<Text style={styles.cardValue}>{process.env.EXPO_PUBLIC_APP_NAME || 'Is It Vegan?'}</Text>
							</View>
						</View>
					</View>

					<View style={styles.bottomPadding} />
				</ScrollView>
			</View>

			{/* Manage Subscription Modal */}
			<ManageSubscriptionModal
				visible={showManageSubscription}
				onClose={() => setShowManageSubscription(false)}
				onSubscriptionChanged={handleSubscriptionChanged}
			/>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'white',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
		paddingHorizontal: 16,
		backgroundColor: 'white',
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	closeButton: {
		padding: 8,
		width: 40,
		height: 40,
		justifyContent: 'center',
		alignItems: 'center',
	},
	headerContent: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		flex: 1,
	},
	placeholder: {
		width: 40,
	},
	appTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		marginLeft: 8,
		color: '#333',
	},
	content: {
		flex: 1,
		padding: 20,
	},
	section: {
		marginBottom: 28,
	},
	sectionTitle: {
		fontSize: 22,
		fontWeight: '700',
		color: '#1a1a1a',
		marginBottom: 16,
		flexShrink: 1,
	},
	sectionSubtitle: {
		fontSize: 16,
		color: '#666',
		marginBottom: 16,
		lineHeight: 22,
	},
	card: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
		borderWidth: 1,
		borderColor: '#f0f0f0',
	},
	cardRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginBottom: 12,
		minHeight: 24,
	},
	cardLabel: {
		fontSize: 16,
		color: '#666',
		fontWeight: '500',
		width: 140,
		flexShrink: 0,
		marginRight: 16,
	},
	cardValue: {
		fontSize: 16,
		color: '#1a1a1a',
		fontWeight: '600',
		flex: 1,
		flexWrap: 'wrap',
	},
	deviceId: {
		fontSize: 12,
		fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
		color: '#888',
		flexWrap: 'wrap',
	},
	actionButton: {
		backgroundColor: '#007AFF',
		borderRadius: 16,
		padding: 18,
		alignItems: 'center',
		marginBottom: 12,
		shadowColor: '#007AFF',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	actionButtonText: {
		color: 'white',
		fontSize: 18,
		fontWeight: '700',
	},
	signOutButton: {
		backgroundColor: '#FF3B30',
		shadowColor: '#FF3B30',
	},
	signOutButtonText: {
		color: 'white',
	},
	bottomPadding: {
		height: 40,
	},
	verifyEmailContainer: {
		flex: 1,
		alignItems: 'flex-start',
	},
	verifyEmailLink: {
		alignItems: 'flex-start',
	},
	verifyEmailText: {
		color: '#007AFF',
		fontSize: 14,
		textDecorationLine: 'underline',
		fontWeight: '600',
	},
})