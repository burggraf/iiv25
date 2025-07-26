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

import Logo from './Logo'
import ManageSubscriptionModal from './ManageSubscriptionModal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
	SubscriptionService,
	SubscriptionStatus,
	UsageStats,
} from '../services/subscriptionService'

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
								<Text style={[styles.cardValue, { color: user ? '#4CAF50' : '#FF6B35' }]}>
									{user ? (isAnonymous ? 'Anonymous User' : 'Signed In') : 'Not Signed In'}
								</Text>
							</View>
							{user?.email && (
								<View style={styles.cardRow}>
									<Text style={styles.cardLabel}>Email:</Text>
									<Text style={styles.cardValue}>{user.email}</Text>
								</View>
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
											color: isPremium ? '#4CAF50' : '#FF6B35',
											fontWeight: 'bold',
										},
									]}>
									{subscriptionStatus
										? SubscriptionService.getSubscriptionDisplayName(
												subscriptionStatus.subscription_level
										  )
										: 'Loading...'}
								</Text>
							</View>
							{subscriptionStatus?.expires_at && (
								<View style={styles.cardRow}>
									<Text style={styles.cardLabel}>Expires:</Text>
									<Text style={styles.cardValue}>
										{SubscriptionService.formatExpirationDate(subscriptionStatus.expires_at)}
									</Text>
								</View>
							)}
						</View>
					</View>

					{/* Usage Statistics */}
					{usageStats && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Today&apos;s Usage</Text>
							<View style={styles.card}>
								<View style={styles.cardRow}>
									<Text style={styles.cardLabel}>Product Lookups:</Text>
									<Text
										style={[
											styles.cardValue,
											{
												color: isPremium
													? '#4CAF50'
													: usageStats.product_lookups_today >= usageStats.product_lookups_limit
													? '#F44336'
													: '#333',
											},
										]}>
										{isPremium
											? 'Unlimited'
											: `${usageStats.product_lookups_today}/${usageStats.product_lookups_limit}`}
									</Text>
								</View>
								<View style={styles.cardRow}>
									<Text style={styles.cardLabel}>Ingredient Searches:</Text>
									<Text
										style={[
											styles.cardValue,
											{
												color: isPremium
													? '#4CAF50'
													: usageStats.searches_today >= usageStats.searches_limit
													? '#F44336'
													: '#333',
											},
										]}>
										{isPremium
											? 'Unlimited'
											: `${usageStats.searches_today}/${usageStats.searches_limit}`}
									</Text>
								</View>
							</View>
						</View>
					)}

					{/* Subscription Management */}
					<View style={styles.section}>
						<TouchableOpacity 
							style={styles.actionButton} 
							onPress={() => setShowManageSubscription(true)}>
							<Text style={styles.actionButtonText}>
								Manage Subscription
							</Text>
						</TouchableOpacity>
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
					</View>

					{/* App Information */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>App Information</Text>
						<View style={styles.card}>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Version:</Text>
								<Text style={styles.cardValue}>4.0.0</Text>
							</View>
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Platform:</Text>
								<Text style={styles.cardValue}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
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
		padding: 16,
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 8,
	},
	sectionSubtitle: {
		fontSize: 14,
		color: '#666',
		marginBottom: 16,
		lineHeight: 20,
	},
	card: {
		backgroundColor: '#f8f9fa',
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e9ecef',
	},
	cardRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	cardLabel: {
		fontSize: 14,
		color: '#666',
		fontWeight: '500',
		flex: 1,
	},
	cardValue: {
		fontSize: 14,
		color: '#333',
		fontWeight: '600',
		flex: 2,
		textAlign: 'right',
	},
	deviceId: {
		fontSize: 10,
		fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
	},
	actionButton: {
		backgroundColor: '#007AFF',
		borderRadius: 12,
		padding: 16,
		alignItems: 'center',
		marginBottom: 12,
	},
	actionButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	signOutButton: {
		backgroundColor: '#F44336',
	},
	signOutButtonText: {
		color: 'white',
	},
	bottomPadding: {
		height: 32,
	},
})