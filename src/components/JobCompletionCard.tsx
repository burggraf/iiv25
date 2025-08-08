import React, { useEffect, useRef } from 'react'
import {
	Animated,
	Dimensions,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { JobNotification } from '../context/NotificationContext.refactored'
import { VeganStatus } from '../types'
import { ProductImageUrlService } from '../services/productImageUrlService'
import LogoWhite from './LogoWhite'

const { width: screenWidth } = Dimensions.get('window')

interface JobCompletionCardProps {
	notification: JobNotification
	onPress: () => void
	onDismiss: () => void
	style?: any
}

export default function JobCompletionCard({
	notification,
	onPress,
	onDismiss,
	style,
}: JobCompletionCardProps) {
	const translateY = useRef(new Animated.Value(-100)).current
	const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const insets = useSafeAreaInsets()

	const { job, product, message, type } = notification

	useEffect(() => {
		// Slide in from top
		Animated.spring(translateY, {
			toValue: 0,
			useNativeDriver: true,
			tension: 100,
			friction: 8,
		}).start()

		// Auto dismiss after 8 seconds for success, 10 seconds for error (longer to allow stacking)
		const duration = type === 'success' ? 8000 : 10000
		dismissTimeoutRef.current = setTimeout(() => {
			handleDismiss()
		}, duration) as any

		return () => {
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current)
				dismissTimeoutRef.current = null
			}
		}
	}, [])

	const handleDismiss = () => {
		if (dismissTimeoutRef.current) {
			clearTimeout(dismissTimeoutRef.current)
			dismissTimeoutRef.current = null
		}
		
		// Slide out to top
		Animated.timing(translateY, {
			toValue: -100,  
			duration: 300,
			useNativeDriver: true,
		}).start(() => {
			// Defer the state update to avoid insertion effect conflicts
			setTimeout(() => {
				onDismiss()
			}, 0)
		})
	}

	const handlePress = () => {
		if (dismissTimeoutRef.current) {
			clearTimeout(dismissTimeoutRef.current)
		}
		onPress()
	}

	const getStatusColor = (status: VeganStatus): string => {
		switch (status) {
			case VeganStatus.VEGAN:
				return '#4CAF50'
			case VeganStatus.VEGETARIAN:
				return '#FF9800'
			case VeganStatus.NOT_VEGETARIAN:
				return '#F44336'
			case VeganStatus.UNKNOWN:
				return '#9E9E9E'
			default:
				return '#9E9E9E'
		}
	}

	const getStatusText = (status: VeganStatus): string => {
		switch (status) {
			case VeganStatus.VEGAN:
				return 'VEGAN'
			case VeganStatus.VEGETARIAN:
				return 'VEGETARIAN'
			case VeganStatus.NOT_VEGETARIAN:
				return 'NOT VEGETARIAN'
			case VeganStatus.UNKNOWN:
				return 'UNKNOWN'
			default:
				return 'UNKNOWN'
		}
	}

	const getStatusIcon = (status: VeganStatus) => {
		switch (status) {
			case VeganStatus.VEGAN:
				return <LogoWhite size={20} />
			case VeganStatus.VEGETARIAN:
				return <Text style={styles.statusIconText}>🥛</Text>
			case VeganStatus.NOT_VEGETARIAN:
				return <Text style={styles.statusIconText}>🥩</Text>
			case VeganStatus.UNKNOWN:
				return <Text style={styles.unknownIconText}>?</Text>
			default:
				return <Text style={styles.unknownIconText}>?</Text>
		}
	}

	return (
		<Animated.View
			style={[
				styles.container,
				{
					top: insets.top + 10,
					transform: [{ translateY }],
				},
				style,
			]}>
			<TouchableOpacity
				style={styles.card}
				onPress={handlePress}
				activeOpacity={0.9}>
					<View style={styles.cardContent}>
						{/* Left: Product Image */}
						<View style={styles.leftSection}>
							{product?.imageUrl ? (
								<Image 
									source={{ uri: ProductImageUrlService.resolveImageUrl(product.imageUrl, product.barcode) || product.imageUrl }} 
									style={styles.productImage} 
								/>
							) : (
								<View style={styles.placeholderImage}>
									<Text style={styles.placeholderText}>📦</Text>
								</View>
							)}
						</View>

						{/* Center: Product Info with status inline */}
						<View style={styles.centerSection}>
							{product ? (
								<>
									{/* Top line: Product name + small status indicator */}
									<View style={styles.topLine}>
										<Text style={styles.productName} numberOfLines={1}>
											{product.name}
										</Text>
										{type !== 'error' && (
											<View
												style={[
													styles.statusBadgeSmall,
													{ backgroundColor: getStatusColor(product.veganStatus) },
												]}>
												{getStatusIcon(product.veganStatus)}
												<Text style={styles.statusTextSmall}>
													{getStatusText(product.veganStatus)}
												</Text>
											</View>
										)}
									</View>
									{/* Bottom line: Full message with more space */}
									<Text style={[styles.jobMessage, type === 'error' && styles.errorMessage]} numberOfLines={type === 'error' ? 3 : 2}>
										{message}
									</Text>
								</>
							) : (
								<Text style={[styles.jobMessage, type === 'error' && styles.errorMessage]} numberOfLines={type === 'error' ? 3 : 2}>
									{message}
								</Text>
							)}
						</View>
							
						{/* Show warning if there are issues (not for error notifications) */}
						{product?.veganStatus === VeganStatus.VEGAN && product.issues && product.issues.trim() !== '' && type !== 'error' && (
							<View style={styles.warningRow}>
								<Text style={styles.warningIcon}>⚠️</Text>
								<Text style={styles.warningText}>see product detail</Text>
							</View>
						)}
					</View>

					{/* Dismiss Button */}
					<TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
						<Text style={styles.dismissButtonText}>×</Text>
					</TouchableOpacity>
				</TouchableOpacity>
			</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		left: 16,
		right: 16,
		zIndex: 9999,
	},
	card: {
		backgroundColor: 'white',
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
		borderWidth: 1,
		borderColor: '#eee',
	},
	cardContent: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 80,
	},
	leftSection: {
		width: 60,
		height: 60,
		marginRight: 12,
	},
	productImage: {
		width: 60,
		height: 60,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
	},
	placeholderImage: {
		width: 60,
		height: 60,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
		alignItems: 'center',
		justifyContent: 'center',
	},
	placeholderText: {
		fontSize: 24,
	},
	centerSection: {
		flex: 1,
		marginRight: 12,
	},
	topLine: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 4,
	},
	jobMessage: {
		fontSize: 12,
		fontWeight: '600',
		color: '#007AFF',
		marginBottom: 2,
	},
	errorMessage: {
		color: '#F44336', // Red color for error messages
	},
	productName: {
		fontSize: 14,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	rightSection: {
		alignItems: 'flex-end',
	},
	statusBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 16,
		minWidth: 80,
		justifyContent: 'center',
	},
	statusIcon: {
		fontSize: 14,
		color: 'white',
	},
	statusIconText: {
		fontSize: 12,
		marginRight: 3,
	},
	unknownIconText: {
		fontSize: 12,
		color: 'white',
		fontWeight: 'bold',
		marginRight: 3,
	},
	statusText: {
		color: 'white',
		fontSize: 10,
		fontWeight: 'bold',
	},
	statusBadgeSmall: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 10,
		minWidth: 50,
		justifyContent: 'center',
	},
	statusTextSmall: {
		color: 'white',
		fontSize: 8,
		fontWeight: 'bold',
	},
	warningRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 4,
		backgroundColor: '#fff3cd',
		paddingVertical: 2,
		paddingHorizontal: 6,
		borderRadius: 6,
	},
	warningIcon: {
		fontSize: 8,
		marginRight: 2,
	},
	warningText: {
		fontSize: 8,
		color: '#856404',
		fontWeight: '600',
	},
	dismissButton: {
		position: 'absolute',
		top: 8,
		right: 8,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: 'rgba(0, 0, 0, 0.1)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	dismissButtonText: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#666',
		lineHeight: 18,
	},
})