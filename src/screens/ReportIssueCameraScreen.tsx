import React, { useRef, useState, useEffect } from 'react'
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
// Removed: import { useBackgroundJobs } from '../hooks/useBackgroundJobs' - now centralized in AppContext
import { useApp } from '../context/AppContext'
import UnifiedCameraView, { CameraViewRef } from '../components/UnifiedCameraView'
import UnifiedCameraService from '../services/UnifiedCameraService'

export default function ReportIssueCameraScreen() {
	const router = useRouter()
	const { barcode, type } = useLocalSearchParams<{ barcode: string; type: 'product' | 'ingredients' }>()
	const { queueJob } = useApp()
	const cameraService = UnifiedCameraService.getInstance()
	
	console.log(`📷 ReportIssue: Screen loaded with barcode='${barcode}', type='${type}'`)
	
	const cameraRef = useRef<CameraViewRef>(null)
	const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
	const [isPreviewMode, setIsPreviewMode] = useState(false)

	// Initialize unified camera service for photo mode
	useEffect(() => {
		const initializeCamera = async () => {
			// Switch to appropriate photo mode based on photo type
			const mode = type === 'product' ? 'product-photo' : 'ingredients-photo'
			console.log(`📷 ReportIssue: Initializing ${mode} mode for type: ${type}`)
			
			// Debug current camera state before attempting switch
			const currentState = cameraService.getState()
			const currentOwner = cameraService.getCurrentOwner()
			console.log(`📷 ReportIssue: Current camera state before switch - mode: ${currentState.mode}, owner: ${currentOwner?.owner || 'none'}`)
			
			const success = await cameraService.switchToMode(mode, {}, 'ReportIssueScreen')
			console.log(`📷 ReportIssue: Mode switch result: ${success}`)
			
			if (!success) {
				console.error('📷 ReportIssue: Failed to initialize camera mode')
				Alert.alert(
					'Camera Error',
					'Failed to initialize camera. Please try again.',
					[{ text: 'OK', onPress: () => router.back() }]
				)
			} else {
				console.log(`📷 ReportIssue: Successfully initialized ${mode} mode`)
			}
		}
		
		initializeCamera()
		
		return () => {
			// Switch back to inactive mode when component unmounts
			console.log('📷 ReportIssue: Component unmounting, switching to inactive')
			cameraService.switchToMode('inactive', {}, 'ReportIssueScreen')
		}
	}, [type])

	const handleTakePhoto = async () => {
		if (!cameraRef.current || !barcode) {
			Alert.alert('Error', 'Camera not available or missing barcode')
			return
		}

		try {
			const result = await cameraRef.current.takePictureAsync({
				quality: 0.8,
				base64: false,
			})

			if (!result?.uri) {
				Alert.alert('Error', 'Failed to capture image')
				return
			}

			// Set captured photo and enter preview mode
			setCapturedPhoto(result.uri)
			setIsPreviewMode(true)
		} catch (error) {
			console.error('Error capturing photo:', error)
			Alert.alert('Error', 'Failed to capture photo. Please try again.')
		}
	}

	const handleCancel = () => {
		cameraService.switchToMode('inactive', {}, 'ReportIssueScreen')
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
				console.log(`🎯 [ReportIssue] Queuing product_photo_upload job for barcode ${barcode}`)
				await queueJob({
					jobType: 'product_photo_upload',
					imageUri: capturedPhoto,
					upc: barcode,
					priority: 2,
				})
				console.log(`✅ [ReportIssue] Successfully queued product_photo_upload job for ${barcode}`)
			} else if (type === 'ingredients') {
				// Queue the ingredients parsing job
				console.log(`🎯 [ReportIssue] Queuing ingredient_parsing job for barcode ${barcode}`)
				await queueJob({
					jobType: 'ingredient_parsing',
					imageUri: capturedPhoto,
					upc: barcode,
					existingProductData: null,
					priority: 2,
				})
				console.log(`✅ [ReportIssue] Successfully queued ingredient_parsing job for ${barcode}`)
			}
			
			// Go back to product result screen
			cameraService.switchToMode('inactive', {}, 'ReportIssueScreen')
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
	const currentMode = type === 'product' ? 'product-photo' : 'ingredients-photo'
	console.log(`📷 ReportIssue: Rendering with type='${type}', currentMode='${currentMode}'`)
	
	return (
		<View style={styles.container}>
			{/* Unified Camera View */}
			<UnifiedCameraView
				ref={cameraRef}
				mode={currentMode}
				owner="ReportIssueScreen"
				onPhotoCaptured={(uri) => {
					setCapturedPhoto(uri)
					setIsPreviewMode(true)
				}}
				onError={(error) => {
					console.error('Camera error:', error)
					Alert.alert('Camera Error', error)
				}}
				style={styles.camera}
				renderOverlay={(mode, state) => (
					<>
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
						
						{/* Top Overlay */}
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
									style={[styles.captureButton, state.isCapturing && styles.captureButtonDisabled]}
									onPress={handleTakePhoto}
									disabled={state.isCapturing}
								>
									<View style={styles.captureButtonInner} />
								</TouchableOpacity>
							</View>
						</SafeAreaView>
					</>
				)}
			/>
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