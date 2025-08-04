import { CameraView } from 'expo-camera'
import React, { useRef, useState } from 'react'
import {
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	Alert,
	Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'

export default function ReportIssueCameraScreen() {
	const router = useRouter()
	const { barcode, type } = useLocalSearchParams<{ barcode: string; type: 'product' | 'ingredients' }>()
	const { queueJob } = useBackgroundJobs()
	
	const cameraRef = useRef<CameraView>(null)
	const [isCapturing, setIsCapturing] = useState(false)
	const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
	const [isPreviewMode, setIsPreviewMode] = useState(false)

	const handleTakePhoto = async () => {
		if (!cameraRef.current || !barcode) {
			Alert.alert('Error', 'Camera not available or missing barcode')
			return
		}

		setIsCapturing(true)
		try {
			const photo = await cameraRef.current.takePictureAsync({
				quality: 0.8,
				base64: false,
			})

			if (!photo?.uri) {
				Alert.alert('Error', 'Failed to capture image')
				return
			}

			// Set captured photo and enter preview mode
			setCapturedPhoto(photo.uri)
			setIsPreviewMode(true)
		} catch (error) {
			console.error('Error capturing photo:', error)
			Alert.alert('Error', 'Failed to capture photo. Please try again.')
		} finally {
			setIsCapturing(false)
		}
	}

	const handleCancel = () => {
		router.back()
	}

	const handleRetakePhoto = () => {
		setCapturedPhoto(null)
		setIsPreviewMode(false)
	}

	const handleUsePhoto = async () => {
		if (!capturedPhoto || !barcode || !type) return

		try {
			if (type === 'product') {
				// Queue the photo upload job for existing product photo update
				await queueJob({
					jobType: 'product_photo_upload',
					imageUri: capturedPhoto,
					upc: barcode,
					priority: 2,
				})
			} else if (type === 'ingredients') {
				// Queue the ingredients parsing job
				await queueJob({
					jobType: 'ingredient_parsing',
					imageUri: capturedPhoto,
					upc: barcode,
					existingProductData: null,
					priority: 2,
				})
			}
			
			// Go back to product result screen
			router.back()
		} catch (error) {
			console.error('Error processing photo:', error)
			Alert.alert('Error', 'Failed to process photo. Please try again.')
		}
	}

	const getInstructionText = () => {
		if (type === 'product') {
			return 'Take a clear photo of the front of the product, making sure the name and brand information is visible.'
		} else {
			return 'Take a clear photo of the product ingredients.'
		}
	}

	const getStepText = () => {
		return type === 'product' ? 'Product Photo' : 'Ingredients Photo'
	}

	if (isPreviewMode && capturedPhoto) {
		// Preview Mode - Show captured photo with crop overlay
		return (
			<View style={styles.container}>
				{/* Preview Image */}
				<Image source={{ uri: capturedPhoto }} style={styles.previewImage} />
				
				{/* Photo Frame Overlay */}
				<View style={styles.frameOverlay}>
					<View style={styles.frameTopBottom} />
					<View style={styles.frameMiddle}>
						<View style={styles.frameSide} />
						<View style={styles.photoFrame}>
							<View style={[styles.frameCorner, styles.frameCornerTopLeft]} />
							<View style={[styles.frameCorner, styles.frameCornerTopRight]} />
							<View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
							<View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
						</View>
						<View style={styles.frameSide} />
					</View>
					<View style={styles.frameTopBottom} />
				</View>

				{/* Bottom Controls for Preview */}
				<SafeAreaView style={styles.bottomControlsContainer}>
					<View style={styles.previewControls}>
						<TouchableOpacity style={styles.retakeButton} onPress={handleRetakePhoto}>
							<Text style={styles.retakeButtonText}>Retake</Text>
						</TouchableOpacity>
						<TouchableOpacity style={styles.usePhotoButton} onPress={handleUsePhoto}>
							<Text style={styles.usePhotoButtonText}>Use Photo</Text>
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			</View>
		)
	}

	// Camera Mode - Normal camera view
	return (
		<View style={styles.container}>
			{/* Full Screen Camera */}
			<CameraView
				ref={cameraRef}
				style={styles.camera}
				facing="back"
			/>
			
			{/* Photo Frame Overlay */}
			<View style={styles.frameOverlay}>
				<View style={styles.frameTopBottom} />
				<View style={styles.frameMiddle}>
					<View style={styles.frameSide} />
					<View style={styles.photoFrame}>
						<View style={[styles.frameCorner, styles.frameCornerTopLeft]} />
						<View style={[styles.frameCorner, styles.frameCornerTopRight]} />
						<View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
						<View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
					</View>
					<View style={styles.frameSide} />
				</View>
				<View style={styles.frameTopBottom} />
			</View>
			
			{/* Minimal Top Overlay - Text Only */}
			<SafeAreaView style={styles.topOverlay}>
				<View style={styles.instructionContainer}>
					<Text style={styles.stepText}>{getStepText()}</Text>
					<Text style={styles.instructionText}>{getInstructionText()}</Text>
				</View>
				<TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
					<Text style={styles.cancelButtonText}>Cancel</Text>
				</TouchableOpacity>
			</SafeAreaView>

			{/* Bottom Camera Button */}
			<SafeAreaView style={styles.bottomControlsContainer}>
				<View style={styles.bottomControls}>
					<TouchableOpacity
						style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
						onPress={handleTakePhoto}
						disabled={isCapturing}
					>
						<View style={styles.captureButtonInner} />
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'black',
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 9999,
	},
	camera: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	frameOverlay: {
		...StyleSheet.absoluteFillObject,
		zIndex: 2,
	},
	frameTopBottom: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.4)',
	},
	frameMiddle: {
		flexDirection: 'row',
		height: 420,
	},
	frameSide: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.4)',
	},
	photoFrame: {
		width: 340,
		backgroundColor: 'transparent',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 2,
		borderColor: 'rgba(255, 255, 255, 0.8)',
		borderRadius: 8,
	},
	frameCorner: {
		position: 'absolute',
		width: 20,
		height: 20,
		borderColor: 'white',
	},
	frameCornerTopLeft: {
		top: 8,
		left: 8,
		borderTopWidth: 3,
		borderLeftWidth: 3,
	},
	frameCornerTopRight: {
		top: 8,
		right: 8,
		borderTopWidth: 3,
		borderRightWidth: 3,
	},
	frameCornerBottomLeft: {
		bottom: 8,
		left: 8,
		borderBottomWidth: 3,
		borderLeftWidth: 3,
	},
	frameCornerBottomRight: {
		bottom: 8,
		right: 8,
		borderBottomWidth: 3,
		borderRightWidth: 3,
	},
	topOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		paddingHorizontal: 20,
		paddingBottom: 15,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		zIndex: 3,
	},
	instructionContainer: {
		flex: 1,
		paddingRight: 15,
	},
	stepText: {
		color: 'white',
		fontSize: 16,
		fontWeight: 'bold',
		marginBottom: 5,
	},
	instructionText: {
		color: 'white',
		fontSize: 14,
		lineHeight: 18,
	},
	cancelButton: {
		backgroundColor: 'rgba(255, 255, 255, 0.2)',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	cancelButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	bottomControlsContainer: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		zIndex: 3,
	},
	bottomControls: {
		alignItems: 'center',
		paddingBottom: 40,
	},
	captureButton: {
		width: 70,
		height: 70,
		borderRadius: 35,
		backgroundColor: 'white',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 3,
		borderColor: 'rgba(255, 255, 255, 0.5)',
	},
	captureButtonDisabled: {
		opacity: 0.6,
	},
	captureButtonInner: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: 'white',
	},
	previewImage: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	previewControls: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 40,
		paddingBottom: 40,
		width: '100%',
	},
	retakeButton: {
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: 'rgba(255, 255, 255, 0.3)',
	},
	retakeButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	usePhotoButton: {
		backgroundColor: 'white',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 20,
	},
	usePhotoButtonText: {
		color: 'black',
		fontSize: 16,
		fontWeight: '600',
	},
})