import React, { useEffect, useRef } from 'react'
import {
	Animated,
	Dimensions,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const { width: screenWidth } = Dimensions.get('window')

export interface ToastNotificationProps {
	visible: boolean
	message: string
	type: 'success' | 'error'
	onDismiss: () => void
	onPress?: () => void
	autoDismiss?: boolean
	duration?: number
}

export default function ToastNotification({
	visible,
	message,
	type,
	onDismiss,
	onPress,
	autoDismiss = true,
	duration = 4000,
}: ToastNotificationProps) {
	const translateY = useRef(new Animated.Value(-100)).current
	const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const insets = useSafeAreaInsets()

	useEffect(() => {
		if (visible) {
			// Slide in from top
			Animated.spring(translateY, {
				toValue: 0,
				useNativeDriver: true,
				tension: 100,
				friction: 8,
			}).start()

			// Auto dismiss if enabled
			if (autoDismiss) {
				dismissTimeoutRef.current = setTimeout(() => {
					handleDismiss()
				}, duration) as any
			}
		} else {
			// Slide out to top
			Animated.timing(translateY, {
				toValue: -100,
				duration: 300,
				useNativeDriver: true,
			}).start()
		}

		return () => {
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current)
				dismissTimeoutRef.current = null
			}
		}
	}, [visible, autoDismiss, duration])

	const handleDismiss = () => {
		if (dismissTimeoutRef.current) {
			clearTimeout(dismissTimeoutRef.current)
			dismissTimeoutRef.current = null
		}
		// Defer the state update to avoid insertion effect conflicts
		setTimeout(() => {
			onDismiss()
		}, 0)
	}

	const backgroundColor = type === 'success' ? '#4CAF50' : '#F44336'
	const icon = type === 'success' ? '✅' : '❌'

	if (!visible) return null

	return (
		<Animated.View
			style={[
				styles.container,
				{
					backgroundColor,
					top: insets.top + 10,
					transform: [{ translateY }],
				},
			]}>
			<TouchableOpacity
				style={styles.content}
				onPress={() => {
					if (onPress) {
						onPress()
					}
					handleDismiss()
				}}
				activeOpacity={onPress ? 0.8 : 1}>
				<Text style={styles.icon}>{icon}</Text>
				<Text style={styles.message} numberOfLines={2}>
					{message}
				</Text>
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
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
		zIndex: 9999,
	},
	content: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 56,
	},
	icon: {
		fontSize: 20,
		marginRight: 12,
	},
	message: {
		flex: 1,
		fontSize: 14,
		fontWeight: '600',
		color: 'white',
		lineHeight: 18,
	},
	dismissButton: {
		marginLeft: 8,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: 'rgba(255, 255, 255, 0.2)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	dismissButtonText: {
		fontSize: 18,
		fontWeight: 'bold',
		color: 'white',
		lineHeight: 20,
	},
})