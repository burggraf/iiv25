import React from 'react'
import {
	Modal,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface LifetimePurchaseDialogProps {
	visible: boolean
	onClose: () => void
	onOpenSubscriptionManagement?: () => void
}

export default function LifetimePurchaseDialog({ 
	visible, 
	onClose,
	onOpenSubscriptionManagement 
}: LifetimePurchaseDialogProps) {
	if (!visible) {
		return null
	}
	const getCancelInstructions = () => {
		if (Platform.OS === 'ios') {
			return {
				title: 'Cancel Your Existing iOS Subscription',
				steps: [
					'Open Settings on your device',
					'Tap your Apple ID at the top',
					'Tap "Subscriptions"',
					'Find "Is It Vegan?" and tap it',
					'Tap "Cancel Subscription"'
				],
				buttonText: 'Open Settings'
			}
		} else {
			return {
				title: 'Cancel Your Existing Android Subscription',
				steps: [
					'Open the Google Play Store app',
					'Tap Menu → Subscriptions',
					'Find "Is It Vegan?" and tap it',
					'Tap "Cancel subscription"'
				],
				buttonText: 'Open Play Store'
			}
		}
	}

	const instructions = getCancelInstructions()

	return (
		<Modal
			animationType="slide"
			transparent={true}
			visible={true}
			onRequestClose={onClose}>
			<View style={styles.overlay}>
				<View style={styles.container}>
					<ScrollView 
						style={styles.scrollView}
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}>
					{/* Header */}
					<View style={styles.header}>
						<View style={styles.iconContainer}>
							<Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
						</View>
						<Text style={styles.title}>Lifetime Purchase Complete!</Text>
						<Text style={styles.subtitle}>
							Thank you for your purchase. You now have lifetime access to all premium features.
						</Text>
					</View>

					{/* Important Notice */}
					<View style={styles.noticeContainer}>
						<View style={styles.warningIconContainer}>
							<Ionicons name="warning" size={24} color="#FF9800" />
						</View>
						<View style={styles.noticeContent}>
							<Text style={styles.noticeTitle}>Important: Cancel Existing Subscription</Text>
							<Text style={styles.noticeText}>
								If you have an existing subscription, you&apos;ll need to manually cancel it or it will continue to renew.
							</Text>
						</View>
					</View>

					{/* Cancel Instructions */}
					<View style={styles.instructionsContainer}>
						<Text style={styles.instructionsTitle}>{instructions.title}</Text>
						<View style={styles.stepsList}>
							{instructions.steps.map((step, index) => (
								<View key={index} style={styles.stepRow}>
									<View style={styles.stepNumber}>
										<Text style={styles.stepNumberText}>{index + 1}</Text>
									</View>
									<Text style={styles.stepText}>{step}</Text>
								</View>
							))}
						</View>
					</View>

					{/* Action Buttons */}
					<View style={styles.buttonContainer}>
						{onOpenSubscriptionManagement && (
							<TouchableOpacity
								style={styles.primaryButton}
								onPress={() => {
									onOpenSubscriptionManagement()
									onClose()
								}}>
								<Text style={styles.primaryButtonText}>{instructions.buttonText}</Text>
							</TouchableOpacity>
						)}
						
						<TouchableOpacity
							style={styles.secondaryButton}
							onPress={onClose}>
							<Text style={styles.secondaryButtonText}>I&apos;ll Do This Later</Text>
						</TouchableOpacity>
					</View>
					</ScrollView>
				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	container: {
		backgroundColor: 'white',
		borderRadius: 16,
		maxWidth: 400,
		width: '100%',
		maxHeight: '85%',
		overflow: 'hidden',
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		padding: 24,
	},
	header: {
		alignItems: 'center',
		marginBottom: 24,
	},
	iconContainer: {
		marginBottom: 16,
	},
	title: {
		fontSize: 22,
		fontWeight: 'bold',
		color: '#333',
		textAlign: 'center',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: '#666',
		textAlign: 'center',
		lineHeight: 20,
	},
	noticeContainer: {
		flexDirection: 'row',
		backgroundColor: '#FFF3E0',
		borderRadius: 12,
		padding: 16,
		marginBottom: 24,
		borderLeftWidth: 4,
		borderLeftColor: '#FF9800',
	},
	warningIconContainer: {
		marginRight: 12,
		marginTop: 2,
	},
	noticeContent: {
		flex: 1,
	},
	noticeTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 4,
	},
	noticeText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
	},
	instructionsContainer: {
		marginBottom: 24,
	},
	instructionsTitle: {
		fontSize: 17,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 14,
	},
	stepsList: {
		gap: 10,
	},
	stepRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
	},
	stepNumber: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: '#2196F3',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
		marginTop: 2,
	},
	stepNumberText: {
		color: 'white',
		fontSize: 12,
		fontWeight: 'bold',
	},
	stepText: {
		flex: 1,
		fontSize: 14,
		color: '#333',
		lineHeight: 20,
	},
	buttonContainer: {
		gap: 10,
	},
	primaryButton: {
		backgroundColor: '#2196F3',
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 24,
		alignItems: 'center',
	},
	primaryButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	secondaryButton: {
		backgroundColor: 'transparent',
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 24,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#ddd',
	},
	secondaryButtonText: {
		color: '#666',
		fontSize: 16,
		fontWeight: '500',
	},
})