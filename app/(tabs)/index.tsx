import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import BarcodeIcon from '../../src/components/icons/BarcodeIcon'
import HistoryIcon from '../../src/components/icons/HistoryIcon'
import ManualIcon from '../../src/components/icons/ManualIcon'
import SearchIcon from '../../src/components/icons/SearchIcon'
import Logo from '../../src/components/Logo'
import UserAccountModal from '../../src/components/UserAccountModal'
import { useApp } from '../../src/context/AppContext'
import { useAuth } from '../../src/context/AuthContext'
import { SubscriptionService, SubscriptionStatus } from '../../src/services/subscriptionService'

export default function HomeScreen() {
	const { user } = useAuth()
	const { deviceId } = useApp()
	const { openSubscription } = useLocalSearchParams<{ openSubscription?: string }>()
	const [showUserModal, setShowUserModal] = useState(false)
	const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)

	const navigateToTab = (tabName: string) => {
		router.push(`/(tabs)/${tabName}` as any)
	}

	// Load subscription status
	useEffect(() => {
		if (user && deviceId) {
			loadSubscriptionStatus()
		}
	}, [user, deviceId, loadSubscriptionStatus])

	// Auto-open UserAccountModal when openSubscription parameter is present
	useEffect(() => {
		if (openSubscription === 'true') {
			setShowUserModal(true)
			// Clear the parameter after opening the modal
			router.setParams({ openSubscription: undefined })
		}
	}, [openSubscription])

	const loadSubscriptionStatus = useCallback(async () => {
		try {
			if (!deviceId || !user) {
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
	}, [deviceId, user])

	const handleUserModalClose = () => {
		setShowUserModal(false)
		// Refresh subscription status when modal closes
		loadSubscriptionStatus()
	}

	const handleSubscriptionChanged = () => {
		// Refresh subscription status immediately when subscription changes
		loadSubscriptionStatus()
	}

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				{/* Header Section */}
				<View style={styles.header}>
					<Logo size={100} style={styles.logo} />
					<Text style={styles.title}>Is It Vegan?</Text>
					<Text style={styles.subtitle}>Just scan to find out!</Text>
				</View>

				{/* Quick Actions Section */}
				<View style={styles.actionsSection}>
					<View style={styles.actionsSectionHeader}>
						<Text style={styles.sectionTitle}>Quick Actions</Text>
						<View style={styles.headerButtons}>
							{subscriptionStatus && (
								<TouchableOpacity
									style={styles.planChicklet}
									onPress={() => setShowUserModal(true)}
									activeOpacity={0.7}>
									<Text style={styles.planChickletText}>
										{SubscriptionService.getSubscriptionDisplayName(
											subscriptionStatus.subscription_level
										)}
									</Text>
								</TouchableOpacity>
							)}
							<TouchableOpacity
								style={styles.userIconButton}
								onPress={() => setShowUserModal(true)}
								activeOpacity={0.7}>
								<Ionicons
									name={user?.is_anonymous ? 'person-outline' : 'person-circle-outline'}
									size={28}
									color='#14A44A'
								/>
							</TouchableOpacity>
						</View>
					</View>

					<View style={styles.actionGrid}>
						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => navigateToTab('manual')}
							activeOpacity={0.7}>
							<View style={styles.iconContainer}>
								<ManualIcon size={32} color='#14A44A' />
							</View>
							<Text style={styles.actionTitle}>Manual Entry</Text>
							<Text style={styles.actionDescription}>Type UPC codes manually</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => navigateToTab('scanner')}
							activeOpacity={0.7}>
							<View style={styles.iconContainer}>
								<BarcodeIcon size={32} color='#14A44A' />
							</View>
							<Text style={styles.actionTitle}>Scanner</Text>
							<Text style={styles.actionDescription}>Scan barcodes with your camera</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => navigateToTab('history')}
							activeOpacity={0.7}>
							<View style={styles.iconContainer}>
								<HistoryIcon size={32} color='#14A44A' />
							</View>
							<Text style={styles.actionTitle}>History</Text>
							<Text style={styles.actionDescription}>View your past scans</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => navigateToTab('search')}
							activeOpacity={0.7}>
							<View style={styles.iconContainer}>
								<SearchIcon size={32} color='#14A44A' />
							</View>
							<Text style={styles.actionTitle}>Search</Text>
							<Text style={styles.actionDescription}>Find products & ingredients</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Info Section */}
				<View style={styles.infoSection}>
					<Text style={styles.infoTitle}>How It Works</Text>
					<Text style={styles.infoText}>
						Simply scan the barcode on the package of any food or beverage product, and you
						instantly see whether the product is vegan, vegetarian, or neither. Click the product
						card to show all the product&apos;s information, including a categorized list of any
						non-vegan ingredients, and the original list of ingredients for the product.
					</Text>
					<View style={styles.statusIndicators}>
						<View style={styles.statusItem}>
							<View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
							<Text style={styles.statusLabel}>Vegan</Text>
						</View>
						<View style={styles.statusItem}>
							<View style={[styles.statusDot, { backgroundColor: '#FF9800' }]} />
							<Text style={styles.statusLabel}>Vegetarian</Text>
						</View>
						<View style={styles.statusItem}>
							<View style={[styles.statusDot, { backgroundColor: '#F44336' }]} />
							<Text style={styles.statusLabel}>Not Vegetarian</Text>
						</View>
					</View>
				</View>

				{/* More Information Section */}
				<View style={styles.infoBox}>
					<Text style={styles.infoBoxTitle}>More Information:</Text>
					<Text style={styles.infoBoxText}>
						After putting each ingredient into a category, Is It Vegan then decides whether the
						product is suitable for a vegan or vegetarian diet. Our database has information on
						hundreds of thousands of food and beverage products and verifies each of them using a
						master list containing thousands of classified ingredients.
					</Text>
					<Text style={styles.infoBoxText}>
						If a product is not yet in our app, you will be prompted to take a photo of the
						packaging, and/or one of the ingredients list. Is It Vegan will then categorize the
						ingredients, and automatically add it to our database for any future scans.
					</Text>
					<Text style={styles.infoBoxText}>
						Is It Vegan now works on food labels in over 100 languages with our built-in ingredient
						translator.
					</Text>
				</View>

				{/* Disclaimer Section */}
				<View style={styles.disclaimerBox}>
					<Text style={styles.disclaimerTitle}>Disclaimer:</Text>
					<Text style={styles.disclaimerText}>
						This app is designed for educational and entertainment purposes only. This app is
						designed to provide accurate information regarding the subject matter covered. It is not
						intended as a substitute for medical advice from a qualified physician. This app does
						not identify allergens or other health-related issues related to food, but rather is a
						guideline for individuals who, for various reasons, wish to eliminate animal-derived
						products from their diet. You should consult your medical doctor or a competent
						professional before making any dietary changes.
					</Text>
					<Text style={styles.disclaimerText}>
						The developers of this app disclaim all responsibility for any liability, loss, or risk,
						personal or otherwise, from the use and application of any of the contents of this app
						or any related web site or other documentation (either printed or electronic).
					</Text>
					<Text style={styles.disclaimerText}>
						Portions of the data contained in this app are sourced from the following sources:
						&copy; Open Food Facts contributors — https://world.openfoodfacts.org
					</Text>
					<Text style={styles.disclaimerText}>
						The rest of the data contained in this app is &copy; Is It Vegan, Conner Burggraf, all
						rights reserved worldwide
					</Text>
				</View>
			</ScrollView>

			{/* User Account Modal */}
			<UserAccountModal 
				visible={showUserModal} 
				onClose={handleUserModalClose}
				onSubscriptionChanged={handleSubscriptionChanged}
			/>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f8f9fa',
	},
	scrollContent: {
		flexGrow: 1,
		paddingHorizontal: 20,
		paddingBottom: 20,
	},
	headerButtons: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	planChicklet: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		backgroundColor: '#14A44A',
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 2,
	},
	planChickletText: {
		color: 'white',
		fontSize: 12,
		fontWeight: '600',
	},
	userIconButton: {
		padding: 8,
		backgroundColor: 'white',
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 2,
	},
	header: {
		alignItems: 'center',
		paddingVertical: 32,
		backgroundColor: 'white',
		borderRadius: 16,
		marginTop: 16,
		marginBottom: 24,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
	},
	logo: {
		marginBottom: 16,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#14A44A',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		textAlign: 'center',
		color: '#666',
		lineHeight: 22,
	},
	actionsSection: {
		marginBottom: 32,
	},
	actionsSectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
	},
	actionGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		gap: 12,
	},
	actionCard: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 20,
		width: '48%',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		borderWidth: 1,
		borderColor: '#f0f0f0',
	},
	iconContainer: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: '#f8f9fa',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 12,
	},
	actionTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
		textAlign: 'center',
	},
	actionDescription: {
		fontSize: 12,
		color: '#666',
		textAlign: 'center',
		lineHeight: 16,
	},
	infoSection: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 24,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
	},
	infoTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	infoText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 20,
	},
	statusIndicators: {
		flexDirection: 'row',
		justifyContent: 'space-around',
	},
	statusItem: {
		alignItems: 'center',
	},
	statusDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginBottom: 6,
	},
	statusLabel: {
		fontSize: 12,
		color: '#666',
		fontWeight: '500',
	},
	infoBox: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 24,
		marginTop: 20,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
	},
	infoBoxTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	infoBoxText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 12,
	},
	disclaimerBox: {
		backgroundColor: '#fff8dc',
		borderRadius: 16,
		padding: 24,
		marginTop: 20,
		borderWidth: 1,
		borderColor: '#f0c040',
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
	},
	disclaimerTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#d2691e',
		marginBottom: 12,
	},
	disclaimerText: {
		fontSize: 12,
		color: '#8b6914',
		lineHeight: 18,
		marginBottom: 10,
	},
})
