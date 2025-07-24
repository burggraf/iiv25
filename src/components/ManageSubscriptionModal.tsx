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

interface ManageSubscriptionModalProps {
	visible: boolean
	onClose: () => void
}

export default function ManageSubscriptionModal({ visible, onClose }: ManageSubscriptionModalProps) {
	const { user } = useAuth()
	const { deviceId } = useApp()
	const insets = useSafeAreaInsets()
	const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [availableProducts, setAvailableProducts] = useState<PaymentProduct[]>([])
	const [isPaymentInitialized, setIsPaymentInitialized] = useState(false)
	const [isInitializingPayment, setIsInitializingPayment] = useState(false)
	const [isPurchasing, setIsPurchasing] = useState(false)
	const [isRestoring, setIsRestoring] = useState(false)
	const [isCancelling, setIsCancelling] = useState(false)

	useEffect(() => {
		if (visible && user && deviceId) {
			loadSubscriptionData()
			initializePaymentService()
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

	const loadSubscriptionData = async () => {
		await Promise.all([
			loadSubscriptionStatus(),
			loadUsageStats()
		])
	}

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

	const initializePaymentService = async () => {
		try {
			setIsInitializingPayment(true)
			console.log('Initializing payment service...')
			const initialized = await PaymentService.initialize()
			setIsPaymentInitialized(initialized)

			if (initialized) {
				const products = await PaymentService.getAvailableProducts()
				setAvailableProducts(products)
				console.log('Payment service initialized with products:', products.length)
			} else {
				console.warn('Payment service failed to initialize')
				setAvailableProducts([])
			}
		} catch (error) {
			console.error('Failed to initialize payment service:', error)
			setIsPaymentInitialized(false)
			setAvailableProducts([])
		} finally {
			setIsInitializingPayment(false)
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
					loadSubscriptionData()
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

	const handleCancelSubscription = async () => {
		Alert.alert(
			'Cancel Subscription',
			'Are you sure you want to cancel your subscription? You will continue to have standard access until the current billing period ends.',
			[
				{ text: 'Keep Subscription', style: 'cancel' },
				{
					text: 'Cancel Subscription',
					style: 'destructive',
					onPress: () => confirmCancelSubscription(),
				},
			]
		)
	}

	const confirmCancelSubscription = async () => {
		try {
			setIsCancelling(true)
			
			// On mobile platforms, direct users to platform-specific subscription management
			if (Platform.OS === 'ios') {
				Alert.alert(
					'Cancel Subscription',
					'To cancel your subscription:\n\n1. Open Settings on your device\n2. Tap your Apple ID at the top\n3. Tap "Subscriptions"\n4. Find "Is It Vegan?" and tap it\n5. Tap "Cancel Subscription"',
					[
						{ text: 'Open Settings', onPress: () => PaymentService.showSubscriptionManagement() },
						{ text: 'Later', style: 'cancel' }
					]
				)
			} else {
				Alert.alert(
					'Cancel Subscription',
					'To cancel your subscription:\n\n1. Open the Google Play Store app\n2. Tap Menu → Subscriptions\n3. Find "Is It Vegan?" and tap it\n4. Tap "Cancel subscription"',
					[
						{ text: 'Open Play Store', onPress: () => PaymentService.showSubscriptionManagement() },
						{ text: 'Later', style: 'cancel' }
					]
				)
			}
		} catch (error) {
			console.error('Cancel subscription error:', error)
			Alert.alert('Error', 'Unable to cancel subscription. Please try again later.')
		} finally {
			setIsCancelling(false)
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
					loadSubscriptionData()
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

	// const handleManageSubscription = () => {
	// 	PaymentService.showSubscriptionManagement()
	// }

	const isPremium =
		subscriptionStatus?.subscription_level === 'standard' ||
		subscriptionStatus?.subscription_level === 'premium'

	const currentProductId = getCurrentProductId()
	
	// Sort products by price from highest to lowest
	const sortedProducts = [...availableProducts].sort((a, b) => {
		// Extract numeric price from localizedPrice (e.g., "$9.99" -> 9.99)
		const priceA = parseFloat(a.localizedPrice.replace(/[^0-9.]/g, '')) || 0
		const priceB = parseFloat(b.localizedPrice.replace(/[^0-9.]/g, '')) || 0
		
		// Sort descending (highest to lowest)
		return priceB - priceA
	})

	function getCurrentProductId(): string | null {
		if (!isPremium) return null
		
		// For lifetime subscriptions (no expiration date)
		if (!subscriptionStatus?.expires_at) {
			return SUBSCRIPTION_PRODUCT_IDS.LIFETIME
		}
		
		// Calculate remaining time to make best guess about subscription type
		const now = new Date()
		const expiresAt = new Date(subscriptionStatus.expires_at)
		const remainingMs = expiresAt.getTime() - now.getTime()
		const remainingDays = Math.round(remainingMs / (1000 * 60 * 60 * 24))
		
		// Use remaining days to infer the subscription type
		// This is approximate since we don't know exactly when it was purchased
		if (remainingDays > 300) return SUBSCRIPTION_PRODUCT_IDS.ANNUAL      // Annual subscription
		if (remainingDays > 150) return SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL  // 6-month subscription  
		if (remainingDays > 60)  return SUBSCRIPTION_PRODUCT_IDS.QUARTERLY   // 3-month subscription
		if (remainingDays > 0)   return SUBSCRIPTION_PRODUCT_IDS.MONTHLY     // Monthly subscription
		
		// If expired, still try to determine what it was based on how recently it expired
		const expiredDaysAgo = Math.abs(remainingDays)
		if (expiredDaysAgo < 40)  return SUBSCRIPTION_PRODUCT_IDS.MONTHLY     // Recently expired monthly
		if (expiredDaysAgo < 100) return SUBSCRIPTION_PRODUCT_IDS.QUARTERLY   // Recently expired quarterly
		if (expiredDaysAgo < 200) return SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL  // Recently expired 6-month
		
		return SUBSCRIPTION_PRODUCT_IDS.ANNUAL // Default to annual for old expired subs
	}

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
						<Text style={styles.appTitle}>Manage Subscription</Text>
					</View>
					<View style={styles.placeholder} />
				</View>

				<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
					{/* Current Subscription Status */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Current Plan</Text>
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
							<View style={styles.cardRow}>
								<Text style={styles.cardLabel}>Status:</Text>
								<Text style={[styles.cardValue, { color: isPremium ? '#4CAF50' : '#666' }]}>
									{isPremium ? 'Active' : 'Free Plan'}
								</Text>
							</View>
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


					{/* Available Plans */}
					{availableProducts.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>
								{isPremium ? 'Change Plan' : 'Upgrade Your Plan'}
							</Text>
							<Text style={styles.sectionSubtitle}>
								{isPremium 
									? 'Switch to a different subscription plan'
									: 'Unlock unlimited scans and searches with a standard subscription'
								}
							</Text>

							{sortedProducts.map((product) => {
								const isLifetime = product.productId === SUBSCRIPTION_PRODUCT_IDS.LIFETIME
								const isCurrentPlan = product.productId === currentProductId
								return (
									<TouchableOpacity
										key={product.productId}
										style={[
											styles.tierCard, 
											isLifetime && styles.tierCardHighlight,
											isCurrentPlan && styles.currentPlanCard
										]}
										onPress={() => handleUpgrade(product.productId)}
										disabled={isPurchasing || isCurrentPlan}>
										<View style={styles.tierHeader}>
											<View style={styles.tierNameContainer}>
												<Text style={[
													styles.tierName, 
													isLifetime && styles.tierNameHighlight,
													isCurrentPlan && styles.currentPlanText
												]}>
													{product.title}
													{isCurrentPlan && ' (Current)'}
												</Text>
											</View>
											<View style={styles.tierPrice}>
												<Text
													style={[
														styles.tierPriceAmount, 
														isLifetime && styles.tierPriceHighlight,
														isCurrentPlan && styles.currentPlanText
													]}>
													{product.localizedPrice}
												</Text>
												<Text
													style={[
														styles.tierPriceDuration, 
														isLifetime && styles.tierPriceHighlight,
														isCurrentPlan && styles.currentPlanText
													]}>
													{product.duration}
												</Text>
											</View>
										</View>
										<View style={styles.tierFeatures}>
											<Text style={[
												styles.tierFeature, 
												isLifetime && styles.tierFeatureHighlight,
												isCurrentPlan && styles.currentPlanText
											]}>
												• Unlimited product scans
											</Text>
											<Text style={[
												styles.tierFeature, 
												isLifetime && styles.tierFeatureHighlight,
												isCurrentPlan && styles.currentPlanText
											]}>
												• Unlimited ingredient searches
											</Text>
											<Text style={[
												styles.tierFeature, 
												isLifetime && styles.tierFeatureHighlight,
												isCurrentPlan && styles.currentPlanText
											]}>
												• No advertisements
											</Text>
											{product.savings && (
												<Text style={[
													styles.tierFeature, 
													isLifetime && styles.tierFeatureHighlight,
													isCurrentPlan && styles.currentPlanText
												]}>
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

					{/* No Products Available */}
					{availableProducts.length === 0 && !isPremium && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Upgrade Your Plan</Text>
							<View style={styles.card}>
								<Text style={styles.cardLabel}>
									{isInitializingPayment ? 
										"Loading subscription options..." : 
										"Subscription options not available at this time."
									}
								</Text>
							</View>
						</View>
					)}

					{/* Additional Actions */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Additional Actions</Text>

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
					</View>

					{/* Cancel Subscription - Bottom of Screen */}
					{isPremium && (
						<View style={styles.section}>
							<TouchableOpacity
								style={[styles.actionButton, styles.cancelButton]}
								onPress={handleCancelSubscription}
								disabled={isCancelling}>
								{isCancelling ? (
									<ActivityIndicator size='small' color='white' />
								) : (
									<Text style={[styles.actionButtonText, styles.cancelButtonText]}>
										Cancel Subscription
									</Text>
								)}
							</TouchableOpacity>
						</View>
					)}

					<View style={styles.bottomPadding} />
				</ScrollView>
			</View>
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
	tierCard: {
		backgroundColor: 'white',
		borderRadius: 12,
		padding: 16,
		marginBottom: 14,
		borderWidth: 1.5,
		borderColor: '#e9ecef',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	tierCardHighlight: {
		borderColor: '#4CAF50',
		backgroundColor: '#f8fff8',
	},
	currentPlanCard: {
		borderColor: '#2196F3',
		backgroundColor: '#f0f7ff',
		borderWidth: 2,
		shadowColor: '#2196F3',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	tierHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 12,
	},
	tierNameContainer: {
		flex: 1,
		marginRight: 8,
	},
	tierName: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#333',
		flexWrap: 'wrap',
	},
	tierNameHighlight: {
		color: '#4CAF50',
	},
	currentPlanText: {
		color: '#1976D2',
		fontWeight: '600',
	},
	tierPrice: {
		alignItems: 'flex-end',
		minWidth: 80,
		flexShrink: 0,
	},
	tierPriceAmount: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#333',
		textAlign: 'right',
	},
	tierPriceHighlight: {
		color: '#4CAF50',
	},
	tierPriceDuration: {
		fontSize: 11,
		color: '#666',
		marginTop: 2,
		textAlign: 'right',
		lineHeight: 14,
	},
	tierFeatures: {
		marginTop: 12,
	},
	tierFeature: {
		fontSize: 14,
		color: '#666',
		marginBottom: 6,
		lineHeight: 20,
		paddingLeft: 4,
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
	cancelButton: {
		backgroundColor: '#F44336',
	},
	cancelButtonText: {
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