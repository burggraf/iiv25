import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import BarcodeIcon from '../../src/components/icons/BarcodeIcon'
import HistoryIcon from '../../src/components/icons/HistoryIcon'
import ManualIcon from '../../src/components/icons/ManualIcon'
import SearchIcon from '../../src/components/icons/SearchIcon'
import Logo from '../../src/components/Logo'
import UserAccountModal from '../../src/components/UserAccountModal'
import { useAuth } from '../../src/context/AuthContext'

export default function HomeScreen() {
	const { user } = useAuth()
	const [showUserModal, setShowUserModal] = useState(false)

	const navigateToTab = (tabName: string) => {
		router.push(`/(tabs)/${tabName}` as any)
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
						Our app analyzes product ingredients using the Open Food Facts database to determine if
						products are vegan, vegetarian, or contain animal-derived ingredients.
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
			</ScrollView>

			{/* User Account Modal */}
			<UserAccountModal
				visible={showUserModal}
				onClose={() => setShowUserModal(false)}
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
})
