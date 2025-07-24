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
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

import Logo from './Logo'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
	PaymentProduct,
	PaymentService,
	SUBSCRIPTION_PRODUCT_IDS,
} from '../services/paymentService'
import {
	SubscriptionService,
	SubscriptionStatus,
	UsageStats,
} from '../services/subscriptionService'

interface UserAccountModalProps {
	visible: boolean
	onClose: () => void
}

export default function UserAccountModal({ visible, onClose }: UserAccountModalProps) {
	const { user, signOut, isAnonymous } = useAuth()
	const { deviceId } = useApp()
	const [isLoading, setIsLoading] = useState(false)
	const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [availableProducts, setAvailableProducts] = useState<PaymentProduct[]>([])
	const [isPaymentInitialized, setIsPaymentInitialized] = useState(false)
	const [isPurchasing, setIsPurchasing] = useState(false)
	const [isRestoring, setIsRestoring] = useState(false)

	useEffect(() => {
		if (visible) {
			loadSubscriptionStatus()
			loadUsageStats()
			initializePaymentService()
		}
	}, [visible, user, deviceId])

	// Handle auth state changes to update user_subscription table
	useEffect(() => {
		if (visible && deviceId) {
			SubscriptionService.handleAuthStateChange(deviceId, user?.id).catch((error) => {
				console.error('Failed to update user subscription for auth change:', error)
			})
		}
	}, [visible, user, deviceId])

	// Cleanup payment service on unmount
	useEffect(() => {
		return () => {
			if (isPaymentInitialized) {
				PaymentService.cleanup()
			}
		}
	}, [isPaymentInitialized])

	const loadSubscriptionStatus = async () => {
		try {
			if (!deviceId) {
				console.log('Device ID not available yet, skipping subscription status load')
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
			if (!deviceId) {
				console.log('Device ID not available yet, skipping usage stats load')
				return
			}

			const stats = await SubscriptionService.getUsageStats(deviceId)
			setUsageStats(stats)
		} catch (error) {
			console.error('Failed to load usage stats:', error)
		}
	}

	const initializePaymentService = async () => {
		try {
			console.log('Initializing payment service...')
			const initialized = await PaymentService.initialize()
			setIsPaymentInitialized(initialized)

			if (initialized) {
				const products = await PaymentService.getAvailableProducts()
				setAvailableProducts(products)
				console.log('Payment service initialized with products:', products.length)
			} else {
				console.warn('Payment service failed to initialize')
				// Set empty products array to show appropriate UI message
				setAvailableProducts([])
			}
		} catch (error) {
			console.error('Failed to initialize payment service:', error)
			setIsPaymentInitialized(false)
			setAvailableProducts([])
		}
	}

	const handleSignOut = async () => {
		try {
			setIsLoading(true)
			await signOut()
			onClose()
			router.replace('/auth/login')
		} catch (error) {
			Alert.alert('Error', 'Failed to sign out. Please try again.')
		} finally {
			setIsLoading(false)
		}
	}

	const handleUpgrade = async (productId: string) => {
		if (!deviceId || !isPaymentInitialized) {
			Alert.alert('Error', 'Payment system not available. Please try again later.')
			return
		}

		const product = availableProducts.find((p) => p.productId === productId)
		if (!product) {
			Alert.alert('Error', 'Product not found. Please try again.')
			return
		}

		Alert.alert(
			'Confirm Purchase',
			`Would you like to purchase ${product.title} for ${product.localizedPrice}?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Purchase',
					onPress: () => processPurchase(productId),
				},
			]
		)
	}

	const processPurchase = async (productId: string) => {
		if (!deviceId) return

		try {
			setIsPurchasing(true)
			console.log('Starting purchase for:', productId)

			const result = await PaymentService.purchaseSubscription(productId as any, deviceId)

			if (result.success) {
				Alert.alert(
					'Purchase Initiated',
					'Your purchase is being processed. You will receive a confirmation shortly.',
					[{ text: 'OK' }]
				)

				// Refresh subscription status after a short delay
				setTimeout(() => {
					loadSubscriptionStatus()
					loadUsageStats()
				}, 2000)
			} else {
				Alert.alert('Purchase Failed', result.error || 'Unable to complete purchase.')
			}
		} catch (error) {
			console.error('Purchase error:', error)
			Alert.alert('Purchase Failed', 'An unexpected error occurred. Please try again.')
		} finally {
			setIsPurchasing(false)
		}
	}

	const handleRestorePurchases = async () => {
		if (!deviceId || !isPaymentInitialized) {
			Alert.alert('Error', 'Payment system not available. Please try again later.')
			return
		}

		try {
			setIsRestoring(true)
			console.log('Restoring purchases...')

			const result = await PaymentService.restorePurchases(deviceId)

			if (result.success) {
				if (result.restoredCount > 0) {
					Alert.alert(
						'Purchases Restored',
						`Successfully restored ${result.restoredCount} purchase(s).`,
						[{ text: 'OK' }]
					)

					// Refresh subscription status
					loadSubscriptionStatus()
					loadUsageStats()
				} else {
					Alert.alert(
						'No Purchases Found',
						'No previous purchases were found for this Apple ID / Google account.',
						[{ text: 'OK' }]
					)
				}
			} else {
				Alert.alert('Restore Failed', result.error || 'Unable to restore purchases.')
			}
		} catch (error) {
			console.error('Restore error:', error)
			Alert.alert('Restore Failed', 'An unexpected error occurred. Please try again.')
		} finally {
			setIsRestoring(false)
		}
	}

	const handleManageSubscription = () => {
		PaymentService.showSubscriptionManagement()
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
			<SafeAreaView style={styles.container}>
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
					{!isPremium && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Upgrade Your Plan</Text>
							<Text style={styles.sectionSubtitle}>
								Unlock unlimited scans and searches with a premium subscription
							</Text>

							{!isPaymentInitialized && (
								<View style={styles.card}>
									<Text style={styles.cardLabel}>Loading subscription options...</Text>
								</View>
							)}

							{isPaymentInitialized && availableProducts.length === 0 && (
								<View style={styles.card}>
									<Text style={styles.cardLabel}>
										Subscription options not available at this time.
									</Text>
								</View>
							)}

							{availableProducts.map((product) => {
								const isLifetime = product.productId === SUBSCRIPTION_PRODUCT_IDS.LIFETIME
								return (
									<TouchableOpacity
										key={product.productId}
										style={[styles.tierCard, isLifetime && styles.tierCardHighlight]}
										onPress={() => handleUpgrade(product.productId)}
										disabled={isPurchasing}>
										<View style={styles.tierHeader}>
											<Text style={[styles.tierName, isLifetime && styles.tierNameHighlight]}>
												{product.title}
											</Text>
											<View style={styles.tierPrice}>
												<Text
													style={[styles.tierPriceAmount, isLifetime && styles.tierPriceHighlight]}>
													{product.localizedPrice}
												</Text>
												<Text
													style={[styles.tierPriceDuration, isLifetime && styles.tierPriceHighlight]}>
													{product.duration}
												</Text>
											</View>
										</View>
										<View style={styles.tierFeatures}>
											<Text style={[styles.tierFeature, isLifetime && styles.tierFeatureHighlight]}>
												• Unlimited product scans
											</Text>
											<Text style={[styles.tierFeature, isLifetime && styles.tierFeatureHighlight]}>
												• Unlimited ingredient searches
											</Text>
											<Text style={[styles.tierFeature, isLifetime && styles.tierFeatureHighlight]}>
												• No advertisements
											</Text>
											{product.savings && (
												<Text style={[styles.tierFeature, isLifetime && styles.tierFeatureHighlight]}>
													• {product.savings}
												</Text>
											)}
										</View>
										{isPurchasing && (
											<View style={styles.purchasingOverlay}>
												<ActivityIndicator size='small' color='white' />
												<Text style={styles.purchasingText}>Processing...</Text>
											</View>
										)}
									</TouchableOpacity>
								)
							})}
						</View>
					)}

					{/* Premium User Management */}
					{isPremium && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Subscription Management</Text>
							<View style={styles.card}>
								<Text style={styles.cardLabel}>You have an active premium subscription!</Text>
							</View>

							<TouchableOpacity style={styles.actionButton} onPress={handleManageSubscription}>
								<Text style={styles.actionButtonText}>Manage Subscription</Text>
							</TouchableOpacity>
						</View>
					)}

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

						<TouchableOpacity
							style={styles.actionButton}
							onPress={handleRestorePurchases}
							disabled={!isPaymentInitialized || isRestoring}>
							{isRestoring ? (
								<ActivityIndicator size='small' color='white' />
							) : (
								<Text style={styles.actionButtonText}>Restore Purchases</Text>
							)}
						</TouchableOpacity>

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
			</SafeAreaView>
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
	tierCard: {
		backgroundColor: 'white',
		borderRadius: 12,
		padding: 16,
		marginBottom: 12,
		borderWidth: 2,
		borderColor: '#e9ecef',
	},
	tierCardHighlight: {
		borderColor: '#4CAF50',
		backgroundColor: '#f8fff8',
	},
	tierHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	tierName: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#333',
	},
	tierNameHighlight: {
		color: '#4CAF50',
	},
	tierPrice: {
		alignItems: 'flex-end',
	},
	tierPriceAmount: {
		fontSize: 20,
		fontWeight: 'bold',
		color: '#333',
	},
	tierPriceHighlight: {
		color: '#4CAF50',
	},
	tierPriceDuration: {
		fontSize: 12,
		color: '#666',
		marginTop: 2,
	},
	tierFeatures: {
		marginTop: 8,
	},
	tierFeature: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
		lineHeight: 20,
	},
	tierFeatureHighlight: {
		color: '#2e7d32',
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
	purchasingOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		justifyContent: 'center',
		alignItems: 'center',
		borderRadius: 12,
		flexDirection: 'row',
	},
	purchasingText: {
		color: 'white',
		marginLeft: 8,
		fontSize: 16,
		fontWeight: '600',
	},
})