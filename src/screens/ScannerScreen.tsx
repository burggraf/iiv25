import { BarcodeScanningResult, Camera, CameraView } from 'expo-camera'
import { isDevice } from 'expo-device'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useIsFocused } from '@react-navigation/native'
import React, { useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Animated,
	Image,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import BarcodeIcon from '../components/icons/BarcodeIcon'
import BellIcon from '../components/icons/BellIcon'
import Logo from '../components/Logo'
import LogoWhite from '../components/LogoWhite'
import ProductResult from '../components/ProductResult'
import SimulatorBarcodeTester from '../components/SimulatorBarcodeTester'
import TakePhotoButton from '../components/TakePhotoButton'
import { useApp } from '../context/AppContext'
import { IngredientOCRService } from '../services/ingredientOCRService'
import { ProductCreationService } from '../services/productCreationService'
import { ProductLookupService } from '../services/productLookupService'
import { ProductImageUploadService } from '../services/productImageUploadService'
import { Product, VeganStatus } from '../types'
import { SoundUtils } from '../utils/soundUtils'


export default function ScannerScreen() {
	const isFocused = useIsFocused()
	const { addToHistory } = useApp()
	const [hasPermission, setHasPermission] = useState<boolean | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [scannedProduct, setScannedProduct] = useState<Product | null>(null)
	const [showProductDetail, setShowProductDetail] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [overlayHeight] = useState(new Animated.Value(0))
	const [isParsingIngredients, setIsParsingIngredients] = useState(false)
	const [isCreatingProduct, setIsCreatingProduct] = useState(false)
	const [parsedIngredients, setParsedIngredients] = useState<string[] | null>(null)
	const [currentBarcode, setCurrentBarcode] = useState<string | null>(null)
	const [isSoundEnabled, setIsSoundEnabled] = useState(true)
	const [showCreateProductModal, setShowCreateProductModal] = useState(false)
	const [showIngredientScanModal, setShowIngredientScanModal] = useState(false)
	const [showProductCreationModal, setShowProductCreationModal] = useState(false)
	const [retryableError, setRetryableError] = useState<{error: string, imageBase64: string, imageUri?: string} | null>(null)
	const [ingredientScanError, setIngredientScanError] = useState<string | null>(null)
	const [productCreationError, setProductCreationError] = useState<{error: string, imageBase64: string, imageUri?: string, retryable: boolean} | null>(null)
	const [productPhotoError, setProductPhotoError] = useState<string | null>(null)
	const [isCapturingPhoto, setIsCapturingPhoto] = useState(false)
	const processingBarcodeRef = useRef<string | null>(null)
	const lastScannedBarcodeRef = useRef<string | null>(null)
	const lastScannedTimeRef = useRef<number>(0)
	
	// Simple cache for last 20 scanned UPCs and their results
	const scannedUPCQueue = useRef<string[]>([])
	const scannedResultsCache = useRef<Map<string, Product>>(new Map())

	useEffect(() => {
		const getCameraPermissions = async () => {
			const { status } = await Camera.requestCameraPermissionsAsync()
			setHasPermission(status === 'granted')
		}

		const loadSoundPreference = async () => {
			try {
				const savedPreference = await AsyncStorage.getItem('soundEnabled')
				if (savedPreference !== null) {
					setIsSoundEnabled(JSON.parse(savedPreference))
				}
			} catch (error) {
				console.log('Error loading sound preference:', error)
			}
		}

		getCameraPermissions()
		loadSoundPreference()
		SoundUtils.initializeBeepSound()

		// Cleanup on unmount
		return () => {
			SoundUtils.cleanup()
		}
	}, [])


	const handleBarcodeScanned = async ({ type, data }: BarcodeScanningResult) => {
		// Only process barcodes when screen is focused and no modal is shown
		if (!isFocused || showCreateProductModal || showIngredientScanModal || showProductCreationModal) {
			return
		}

		const currentTime = Date.now()
		
		// Prevent concurrent processing
		if (processingBarcodeRef.current !== null) {
			return
		}

		// Check if this barcode is for the currently displayed product - if so, don't beep or process
		if (scannedProduct && scannedProduct.barcode === data) {
			// Update last scanned info to reset debounce timer
			lastScannedBarcodeRef.current = data
			lastScannedTimeRef.current = currentTime
			return
		}

		// Debounce same barcode scans - ignore if same barcode scanned within last 3 seconds
		if (lastScannedBarcodeRef.current === data && currentTime - lastScannedTimeRef.current < 3000) {
			return
		}

		console.log(`📱 Barcode scanned: ${type} - ${data}`)

		// Play beep sound if enabled (only for different products)
		if (isSoundEnabled) {
			SoundUtils.playBeep()
		}

		// Clear any existing error state when scanning a new barcode
		if (error && lastScannedBarcodeRef.current !== data) {
			setError(null)
			hideOverlay()
		}

		// Update last scanned info
		lastScannedBarcodeRef.current = data
		lastScannedTimeRef.current = currentTime
		setCurrentBarcode(data)

		// Check if we have this UPC in our recent cache
		const cachedProduct = scannedResultsCache.current.get(data)
		if (cachedProduct) {
			console.log(`💾 Using cached result for ${data}`)
			setScannedProduct(cachedProduct)
			addToHistory(cachedProduct)
			showOverlay()
			return
		}

		// Set processing flag
		processingBarcodeRef.current = data
		setIsLoading(true)
		setError(null)

		try {
			const result = await ProductLookupService.lookupProductByBarcode(data, { context: 'Scanner' })

			if (result.isRateLimited) {
				setError(result.error!)
				showErrorOverlay()
				return
			}

			if (result.product) {
				// Add to cache and queue
				addToCache(data, result.product)
				
				setScannedProduct(result.product)
				addToHistory(result.product)
				showOverlay()
			} else {
				setError(result.error!)
				showErrorOverlay()
			}
		} catch (err) {
			setError('Failed to lookup product. Please try again.')
			console.error('Error looking up product:', err)
			showErrorOverlay()
		} finally {
			setIsLoading(false)
			processingBarcodeRef.current = null
		}
	}

	const addToCache = (upc: string, product: Product) => {
		// Add UPC to queue, maintaining max size of 20
		const queue = scannedUPCQueue.current
		if (!queue.includes(upc)) {
			queue.push(upc)
			if (queue.length > 20) {
				const oldestUPC = queue.shift()
				if (oldestUPC) {
					scannedResultsCache.current.delete(oldestUPC)
					console.log(`🗑️ Removed ${oldestUPC} from cache (queue full)`)
				}
			}
		}
		
		// Add product to cache
		scannedResultsCache.current.set(upc, product)
		console.log(`💾 Cached result for ${upc} (cache size: ${scannedResultsCache.current.size})`)
	}

	const showOverlay = () => {
		// Use larger height only if product is UNKNOWN AND has no ingredients (to accommodate scan button)
		const needsScanButton = scannedProduct?.veganStatus === VeganStatus.UNKNOWN && 
								(!scannedProduct.ingredients || scannedProduct.ingredients.length === 0)
		const height = needsScanButton ? 160 : 120
		Animated.timing(overlayHeight, {
			toValue: height,
			duration: 300,
			useNativeDriver: false,
		}).start()
	}

	const showErrorOverlay = () => {
		Animated.timing(overlayHeight, {
			toValue: 120, // Increased height to accommodate button
			duration: 300,
			useNativeDriver: false,
		}).start()

		// Don't auto-hide error overlay anymore since it has interaction
	}

	const hideOverlay = () => {
		Animated.timing(overlayHeight, {
			toValue: 0,
			duration: 300,
			useNativeDriver: false,
		}).start()
		
		setScannedProduct(null)
		setError(null)
		setParsedIngredients(null)
		setCurrentBarcode(null)
	}


	const handleScanIngredients = async () => {
		try {
			setIsParsingIngredients(true)
			setParsedIngredients(null)
			setShowIngredientScanModal(true)

			// Request camera permission for image picker
			const { status } = await ImagePicker.requestCameraPermissionsAsync()
			if (status !== 'granted') {
				setError('Camera permission is required to scan ingredients')
				setShowIngredientScanModal(false)
				return
			}

			// Launch camera to take photo
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: 'images',
				allowsEditing: true,
				aspect: [4, 3],
				quality: 0.8,
				base64: true,
			})

			if (result.canceled) {
				setShowIngredientScanModal(false)
				// Clear error state and hide overlay to allow new scans
				hideOverlay()
				return
			}

			if (!result.assets[0].base64) {
				setError('Failed to capture image data')
				setShowIngredientScanModal(false)
				return
			}

			// Call ingredient OCR service with UPC and Open Food Facts data if available
			if (!currentBarcode) {
				setError('No barcode available for ingredient processing')
				setShowIngredientScanModal(false)
				return
			}

			const data = await IngredientOCRService.parseIngredientsFromImage(
				result.assets[0].base64,
				currentBarcode,
				scannedProduct || undefined
			)

			if (data.error) {
				setIngredientScanError(data.error)
				setShowIngredientScanModal(false)
				return
			}

			if (!data.isValidIngredientsList || data.confidence < 0.7) {
				setIngredientScanError(
					'Could not clearly read ingredients from the image. Please try again with better lighting.'
				)
				setShowIngredientScanModal(false)
				return
			}

			setParsedIngredients(data.ingredients)
			setError(null)

			// Always refresh the product data after successful ingredient processing
			console.log(`🔄 Refreshing product data after ingredient processing`)
			try {
				const refreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'IngredientOCR' })
				if (refreshResult.product) {
					console.log(`✅ Product refreshed with updated classification: ${refreshResult.product.veganStatus}`)
					setScannedProduct(refreshResult.product)
					addToHistory(refreshResult.product)
					// Update cache with new product data
					addToCache(currentBarcode, refreshResult.product)
					
					// Clear parsed ingredients since we're now showing the full product
					setParsedIngredients(null)
					
					// Show normal product overlay instead of ingredients list
					showOverlay()
				} else {
					// Fallback: show parsed ingredients if refresh failed
					console.log('⚠️ Product refresh failed, showing parsed ingredients')
					// Update overlay to show parsed ingredients
					Animated.timing(overlayHeight, {
						toValue: 200, // Larger height for ingredients list
						duration: 300,
						useNativeDriver: false,
					}).start()
				}
			} catch (refreshError) {
				console.error('Error refreshing product after OCR:', refreshError)
				// Fallback: show parsed ingredients if refresh failed
				console.log('⚠️ Product refresh error, showing parsed ingredients')
				// Update overlay to show parsed ingredients
				Animated.timing(overlayHeight, {
					toValue: 200, // Larger height for ingredients list
					duration: 300,
					useNativeDriver: false,
				}).start()
			}
		} catch (err) {
			console.error('Error parsing ingredients:', err)
			setError('Failed to parse ingredients. Please try again.')
		} finally {
			setIsParsingIngredients(false)
			setShowIngredientScanModal(false)
		}
	}

	const handleCreateProduct = async () => {
		// Show full screen modal instead of alert
		setShowCreateProductModal(true)
	}

	const handleCreateProductCancel = () => {
		setShowCreateProductModal(false)
		// Clear error state and hide overlay to allow new scans
		hideOverlay()
	}

	const handleCreateProductConfirm = async () => {
		try {
			setShowCreateProductModal(false)
			setIsCreatingProduct(true)
			setError(null)

			// Request camera permission for image picker
			const { status } = await ImagePicker.requestCameraPermissionsAsync()
			if (status !== 'granted') {
				setProductCreationError({
					error: 'Camera permission is required to create product',
					imageBase64: '',
					imageUri: '',
					retryable: false
				});
				setIsCreatingProduct(false)
				return
			}

			// Launch camera to take photo
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: 'images',
				allowsEditing: true,
				aspect: [4, 3],
				quality: 0.8,
				base64: true,
			})

			if (result.canceled) {
				setIsCreatingProduct(false)
				// Clear error state and hide overlay to allow new scans
				hideOverlay()
				return
			}

			if (!result.assets[0].base64) {
				setProductCreationError({
					error: 'Failed to capture image data',
					imageBase64: '',
					imageUri: '',
					retryable: true
				});
				setIsCreatingProduct(false)
				return
			}

			await processProductCreation(result.assets[0].base64, result.assets[0].uri)
		} catch (err) {
			console.error('Error in camera flow:', err)
			setProductCreationError({
				error: 'Failed to capture photo. Please try again.',
				imageBase64: '',
				imageUri: '',
				retryable: true
			});
			setIsCreatingProduct(false)
		}
	}

	const handleRetryProductCreation = async () => {
		if (!retryableError || !currentBarcode) {
			console.error('No retryable error or barcode available');
			return;
		}

		console.log('Retrying product creation...');
		setRetryableError(null); // Clear the retry error
		await processProductCreation(retryableError.imageBase64, retryableError.imageUri);
	}

	const handleCancelRetry = () => {
		setRetryableError(null);
		// Clear error state and hide overlay to allow new scans
		hideOverlay();
	}

	const handleIngredientScanRetry = () => {
		setIngredientScanError(null);
		handleScanIngredients();
	}

	const handleIngredientScanCancel = () => {
		setIngredientScanError(null);
	}

	const handleProductCreationRetry = () => {
		if (!productCreationError) return;
		const { imageBase64, imageUri } = productCreationError;
		setProductCreationError(null);
		processProductCreation(imageBase64, imageUri);
	}

	const handleProductCreationCancel = () => {
		setProductCreationError(null);
		hideOverlay();
	}

	const handleProductPhotoRetry = () => {
		setProductPhotoError(null);
		handleTakeProductPhoto();
	}

	const handleProductPhotoCancel = () => {
		setProductPhotoError(null);
	}

	const processProductCreation = async (imageBase64: string, imageUri?: string) => {
		try {
			setShowProductCreationModal(true)
			
			// Call product creation service with UPC
			if (!currentBarcode) {
				setError('No barcode available for product creation')
				setIsCreatingProduct(false)
				setShowProductCreationModal(false)
				return
			}

			const data = await ProductCreationService.createProductFromPhoto(
				imageBase64,
				currentBarcode,
				imageUri
			)

			if (data.error) {
				console.log('Product creation error:', data.error, 'Retryable:', data.retryable);
				setProductCreationError({
					error: data.error,
					imageBase64,
					imageUri,
					retryable: data.retryable || false
				});
				setIsCreatingProduct(false)
				setShowProductCreationModal(false)
				return
			}

			// Clear any retryable error since we succeeded
			setRetryableError(null);

			// Always refresh the product data after successful product creation
			console.log(`🔄 Refreshing product data after product creation`)
			try {
				const refreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'ProductCreation' })
				if (refreshResult.product) {
					console.log(`✅ Product created and refreshed: ${refreshResult.product.name}`)
					setScannedProduct(refreshResult.product)
					addToHistory(refreshResult.product)
					// Update cache with new product data
					addToCache(currentBarcode, refreshResult.product)
					
					// Clear error since we're now showing the full product
					setError(null)
					
					// Animate overlay to show the product
					Animated.timing(overlayHeight, {
						toValue: 120, // Standard overlay height
						duration: 300,
						useNativeDriver: false,
					}).start()
				} else {
					// Fallback: show error if refresh failed
					console.log('⚠️ Product refresh failed after creation')
					setError('Product created but could not load details. Please scan again.')
				}

				// Add delayed refresh to catch async image upload
				// The ProductCreationService uploads the image with a 1-second delay
				setTimeout(async () => {
					try {
						console.log(`🔄 Secondary refresh to catch uploaded image`)
						const secondRefreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'ProductCreationImage' })
						if (secondRefreshResult.product && secondRefreshResult.product.imageUrl) {
							console.log(`✅ Product image found on second refresh`)
							setScannedProduct(secondRefreshResult.product)
							addToCache(currentBarcode, secondRefreshResult.product)
						}
					} catch (secondRefreshError) {
						console.error('Error in secondary refresh after product creation:', secondRefreshError)
						// Silent fail - don't show error for secondary refresh
					}
				}, 2500); // Wait 2.5 seconds (1s delay + 1.5s for upload)

			} catch (refreshError) {
				console.error('Error refreshing product after creation:', refreshError)
				setError('Product created but could not load details. Please scan again.')
			}
		} catch (err) {
			console.error('Error creating product:', err)
			setProductCreationError({
				error: 'Failed to create product. Please try again.',
				imageBase64,
				imageUri: imageUri || '',
				retryable: true
			});
		} finally {
			setIsCreatingProduct(false)
			setShowProductCreationModal(false)
		}
	}

	const handleTakeProductPhoto = async () => {
		// Show prompt first, like in product creation
		Alert.alert(
			"Add Product Photo",
			"Take a photo of the entire front of the product package.",
			[
				{
					text: "Cancel",
					style: "cancel"
				},
				{
					text: "Take Photo",
					onPress: async () => {
						await captureProductPhoto()
					}
				}
			]
		)
	}

	const captureProductPhoto = async () => {
		try {
			setIsCapturingPhoto(true)
			setError(null)

			// Request camera permission for image picker
			const { status } = await ImagePicker.requestCameraPermissionsAsync()
			if (status !== 'granted') {
				setProductPhotoError('Camera permission is required to take product photo');
				setIsCapturingPhoto(false)
				return
			}

			// Launch camera to take photo
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: 'images',
				allowsEditing: true,
				aspect: [4, 3],
				quality: 0.8,
				base64: true,
			})

			if (result.canceled) {
				setIsCapturingPhoto(false)
				return
			}

			if (!result.assets[0].base64 || !result.assets[0].uri) {
				setProductPhotoError('Failed to capture image data');
				setIsCapturingPhoto(false)
				return
			}

			// Process the photo upload
			await processProductPhotoUpload(result.assets[0].uri)

		} catch (err) {
			console.error('Error in photo capture flow:', err)
			setProductPhotoError('Failed to capture photo. Please try again.');
			setIsCapturingPhoto(false)
		}
	}

	const processProductPhotoUpload = async (imageUri: string) => {
		try {
			if (!currentBarcode || !scannedProduct) {
				setProductPhotoError('No product available for photo upload');
				setIsCapturingPhoto(false)
				return
			}

			console.log(`📸 Starting photo upload for product: ${scannedProduct.name}`)

			// Upload image and update database using existing service
			const uploadResult = await ProductImageUploadService.uploadProductImage(imageUri, currentBarcode)
			
			if (!uploadResult.success || !uploadResult.imageUrl) {
				setProductPhotoError(uploadResult.error || 'Failed to upload image');
				setIsCapturingPhoto(false)
				return
			}

			// Update the database with the new image URL using edge function
			const updateSuccess = await ProductImageUploadService.updateProductImageUrl(currentBarcode, uploadResult.imageUrl)
			
			if (!updateSuccess) {
				setProductPhotoError('Image uploaded but failed to update product record');
				setIsCapturingPhoto(false)
				return
			}

			console.log(`✅ Successfully added photo for product: ${scannedProduct.name}`)

			// Refresh the product data to show the new image
			try {
				const refreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'PhotoUpload' })
				if (refreshResult.product) {
					setScannedProduct(refreshResult.product)
					addToCache(currentBarcode, refreshResult.product)
					console.log(`✅ Product refreshed with new image`)
				}
			} catch (refreshError) {
				console.error('Error refreshing product after photo upload:', refreshError)
				// Don't show error for refresh failure since upload succeeded
			}

		} catch (err) {
			console.error('Error uploading product photo:', err)
			setProductPhotoError('Failed to upload photo. Please try again.');
		} finally {
			setIsCapturingPhoto(false)
		}
	}

	const handleOverlayPress = () => {
		if (scannedProduct) {
			setShowProductDetail(true)
		}
	}

	const handleBackFromDetail = () => {
		setShowProductDetail(false)
	}


	const handleSoundToggle = async () => {
		try {
			const newSoundState = !isSoundEnabled
			setIsSoundEnabled(newSoundState)
			await AsyncStorage.setItem('soundEnabled', JSON.stringify(newSoundState))
		} catch (error) {
			console.log('Error saving sound preference:', error)
		}
	}

	const getStatusColor = (status: VeganStatus): string => {
		switch (status) {
			case VeganStatus.VEGAN:
				return '#4CAF50'
			case VeganStatus.VEGETARIAN:
				return '#FF9800'
			case VeganStatus.NOT_VEGAN:
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
			case VeganStatus.NOT_VEGAN:
				return 'NOT VEGAN'
			case VeganStatus.UNKNOWN:
				return 'UNKNOWN'
			default:
				return 'UNKNOWN'
		}
	}

	const getStatusIcon = (status: VeganStatus) => {
		switch (status) {
			case VeganStatus.VEGAN:
				return <LogoWhite size={24} />
			case VeganStatus.VEGETARIAN:
				return <Text style={styles.overlayStatusIcon}>🥛</Text>
			case VeganStatus.NOT_VEGAN:
				return <Text style={styles.overlayStatusIcon}>🥩</Text>
			case VeganStatus.UNKNOWN:
				return <Text style={styles.overlayUnknownIcon}>?</Text>
			default:
				return <Text style={styles.overlayUnknownIcon}>?</Text>
		}
	}


	if (hasPermission === null) {
		return (
			<View style={styles.permissionContainer}>
				<Text>Requesting camera permission...</Text>
			</View>
		)
	}

	if (hasPermission === false) {
		return (
			<View style={styles.permissionContainer}>
				<Text style={styles.permissionText}>No access to camera</Text>
				<Text style={styles.permissionSubText}>
					Please enable camera permissions in your device settings to scan barcodes.
				</Text>
			</View>
		)
	}

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			{/* Header */}
			<View style={styles.header}>
				<View style={styles.centerHeader}>
					<Logo size={32} />
					<Text style={styles.appTitle}>Is It Vegan?</Text>
				</View>
			</View>

			<View style={styles.instructionsContainer}>
				<Text style={styles.instructionText}>
					{isLoading ? '🔍 Looking up product...' : '📷 Point your camera\nat a food product barcode'}
				</Text>
				<TouchableOpacity style={styles.bellIconContainer} onPress={handleSoundToggle}>
					<BellIcon size={24} color="#666" filled={isSoundEnabled} />
					<Text style={styles.bellIconText}>
						{isSoundEnabled ? 'ON' : 'OFF'}
					</Text>
				</TouchableOpacity>
			</View>

			{/* Camera View */}
			<View style={styles.cameraContainer}>
				{!isDevice || Platform.OS === 'web' ? (
					<SimulatorBarcodeTester onBarcodeScanned={handleBarcodeScanned} />
				) : isFocused ? (
					<>
						<CameraView
							style={styles.camera}
							facing='back'
							onBarcodeScanned={handleBarcodeScanned}
							barcodeScannerSettings={{
								barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'],
							}}
						/>
						<View style={styles.overlay}>
							<View style={styles.unfocusedContainer}></View>
							<View style={styles.middleContainer}>
								<View style={styles.unfocusedContainer}></View>
								<View style={styles.focusedContainer}>
									<View style={styles.scanningFrame} />
								</View>
								<View style={styles.unfocusedContainer}></View>
							</View>
							<View style={styles.unfocusedContainer}></View>
						</View>
					</>
				) : (
					<View style={styles.inactiveCamera}>
						<Text style={styles.inactiveCameraText}>Scanner inactive</Text>
					</View>
				)}

				{/* Loading Indicator */}
				{isLoading && (
					<View style={styles.loadingOverlay}>
						<ActivityIndicator size='large' color='#007AFF' />
						<Text style={styles.loadingText}>Looking up product...</Text>
					</View>
				)}

				{/* Product Overlay */}
				<Animated.View style={[styles.productOverlay, { height: overlayHeight }]}>
					{parsedIngredients ? (
						<View style={styles.overlayIngredientsContent}>
							<Text style={styles.overlayIngredientsTitle}>Parsed Ingredients:</Text>
							<View style={styles.ingredientsList}>
								{parsedIngredients.slice(0, 6).map((ingredient, index) => (
									<Text key={index} style={styles.ingredientItem}>
										• {ingredient}
									</Text>
								))}
								{parsedIngredients.length > 6 && (
									<Text style={styles.ingredientItem}>
										... and {parsedIngredients.length - 6} more
									</Text>
								)}
							</View>
							<TouchableOpacity
								style={styles.dismissButton}
								onPress={() => {
									setParsedIngredients(null)
									hideOverlay()
								}}>
								<Text style={styles.dismissButtonText}>Close</Text>
							</TouchableOpacity>
						</View>
					) : scannedProduct && !error ? (
						<View style={styles.overlayContent}>
							<TouchableOpacity style={styles.overlayProductInfo} onPress={handleOverlayPress}>
								<View style={styles.overlayLeft}>
									{scannedProduct.imageUrl ? (
										<Image source={{ uri: scannedProduct.imageUrl }} style={styles.overlayImage} />
									) : (
										<TakePhotoButton 
											onPress={handleTakeProductPhoto}
											style={[styles.overlayImage, isCapturingPhoto && styles.overlayImageLoading]}
										/>
									)}
									{isCapturingPhoto && (
										<View style={styles.overlayImageLoadingOverlay}>
											<ActivityIndicator size="small" color="white" />
										</View>
									)}
								</View>
								<View style={styles.overlayCenter}>
									<Text style={styles.overlayProductName} numberOfLines={1}>
										{scannedProduct.name}
									</Text>
									{scannedProduct.brand && (
										<Text style={styles.overlayProductBrand} numberOfLines={1}>
											{scannedProduct.brand}
										</Text>
									)}
								</View>
								<View style={styles.overlayRight}>
									<View
										style={[
											styles.overlayStatusBadge,
											{ backgroundColor: getStatusColor(scannedProduct.veganStatus) },
										]}>
										{getStatusIcon(scannedProduct.veganStatus)}
										<Text style={styles.overlayStatusText}>
											{getStatusText(scannedProduct.veganStatus)}
										</Text>
									</View>
									{scannedProduct.veganStatus === VeganStatus.VEGAN && scannedProduct.issues && scannedProduct.issues.trim() !== '' && (
										<View style={styles.overlayWarningRow}>
											<Text style={styles.overlayWarningIcon}>⚠️</Text>
											<Text style={styles.overlayWarningText}>see product detail</Text>
										</View>
									)}
								</View>
							</TouchableOpacity>
							{scannedProduct.veganStatus === VeganStatus.UNKNOWN && 
							 (!scannedProduct.ingredients || scannedProduct.ingredients.length === 0) && (
								<TouchableOpacity
									style={styles.scanIngredientsButtonSmall}
									onPress={handleScanIngredients}
									disabled={isParsingIngredients}>
									{isParsingIngredients ? (
										<ActivityIndicator size='small' color='white' />
									) : (
										<Text style={styles.scanIngredientsButtonTextSmall}>📷 Scan Ingredients</Text>
									)}
								</TouchableOpacity>
							)}
						</View>
					) : error && !parsedIngredients ? (
						<View style={styles.overlayErrorContent}>
							<Text style={styles.overlayErrorText}>❌ {error}</Text>
							{error.includes('Product not found for barcode:') ? (
								// Only show Create Product button for unknown products
								<TouchableOpacity
									style={styles.createProductButton}
									onPress={handleCreateProduct}
									disabled={isCreatingProduct || isParsingIngredients}>
									{isCreatingProduct ? (
										<ActivityIndicator size='small' color='white' />
									) : (
										<View style={styles.createProductButtonContent}>
											<BarcodeIcon size={16} color="white" />
											<Text style={styles.createProductButtonText}>Add New Product</Text>
										</View>
									)}
								</TouchableOpacity>
							) : (
								// Show both buttons for other error types (like ingredient parsing errors)
								<>
									<TouchableOpacity
										style={styles.createProductButton}
										onPress={handleCreateProduct}
										disabled={isCreatingProduct || isParsingIngredients}>
										{isCreatingProduct ? (
											<ActivityIndicator size='small' color='white' />
										) : (
											<View style={styles.createProductButtonContent}>
												<BarcodeIcon size={16} color="white" />
												<Text style={styles.createProductButtonText}>Add New Product</Text>
											</View>
										)}
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.scanIngredientsButton}
										onPress={handleScanIngredients}
										disabled={isParsingIngredients || isCreatingProduct}>
										{isParsingIngredients ? (
											<ActivityIndicator size='small' color='white' />
										) : (
											<Text style={styles.scanIngredientsButtonText}>📷 Scan Ingredients</Text>
										)}
									</TouchableOpacity>
								</>
							)}
						</View>
					) : null}
				</Animated.View>
			</View>

			{/* Bottom Instructions */}
			<View style={styles.bottomInstructions}>
				<Text style={styles.tipText}>💡 Scan continuously{'\n'}Tap product card to view details</Text>
			</View>

			{/* Ingredient Scan Modal */}
			{showIngredientScanModal && (
				<View style={styles.loadingModal}>
					<View style={styles.loadingModalContent}>
						<LogoWhite size={48} />
						<Text style={styles.loadingModalTitle}>Analyzing ingredients...</Text>
						<ActivityIndicator size="large" color="#007AFF" style={styles.loadingSpinner} />
					</View>
				</View>
			)}

			{/* Product Creation Modal */}
			{showProductCreationModal && (
				<View style={styles.loadingModal}>
					<View style={styles.loadingModalContent}>
						<BarcodeIcon size={48} color="#FF6B35" />
						<Text style={styles.loadingModalTitle}>Adding new product...</Text>
						<ActivityIndicator size="large" color="#FF6B35" style={styles.loadingSpinner} />
					</View>
				</View>
			)}

			{/* Retry Error Modal */}
			{retryableError && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<Text style={styles.retryErrorIcon}>⚠️</Text>
							<Text style={styles.createProductModalTitle}>Service Temporarily Unavailable</Text>
							<Text style={styles.createProductModalSubtitle}>
								{retryableError.error}
							</Text>
						</View>
						<View style={styles.createProductModalButtons}>
							<TouchableOpacity
								style={styles.createProductModalCancelButton}
								onPress={handleCancelRetry}>
								<Text style={styles.createProductModalCancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.createProductModalConfirmButton}
								onPress={handleRetryProductCreation}
								disabled={isCreatingProduct}>
								{isCreatingProduct ? (
									<ActivityIndicator size='small' color='white' />
								) : (
									<Text style={styles.createProductModalConfirmText}>Try Again</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			{/* Ingredient Scan Error Modal */}
			{ingredientScanError && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<Text style={styles.retryErrorIcon}>❌</Text>
							<Text style={styles.createProductModalTitle}>Ingredient Scan Failed</Text>
							<Text style={styles.createProductModalSubtitle}>
								{ingredientScanError}
							</Text>
						</View>
						<View style={styles.createProductModalButtons}>
							<TouchableOpacity
								style={styles.createProductModalCancelButton}
								onPress={handleIngredientScanCancel}>
								<Text style={styles.createProductModalCancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.createProductModalConfirmButton}
								onPress={handleIngredientScanRetry}
								disabled={isParsingIngredients}>
								{isParsingIngredients ? (
									<ActivityIndicator size='small' color='white' />
								) : (
									<Text style={styles.createProductModalConfirmText}>Try Again</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			{/* Product Creation Error Modal */}
			{productCreationError && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<Text style={styles.retryErrorIcon}>❌</Text>
							<Text style={styles.createProductModalTitle}>Product Creation Failed</Text>
							<Text style={styles.createProductModalSubtitle}>
								{productCreationError.error}
							</Text>
						</View>
						<View style={styles.createProductModalButtons}>
							<TouchableOpacity
								style={styles.createProductModalCancelButton}
								onPress={handleProductCreationCancel}>
								<Text style={styles.createProductModalCancelText}>Cancel</Text>
							</TouchableOpacity>
							{productCreationError.retryable && (
								<TouchableOpacity
									style={styles.createProductModalConfirmButton}
									onPress={handleProductCreationRetry}
									disabled={isCreatingProduct}>
									{isCreatingProduct ? (
										<ActivityIndicator size='small' color='white' />
									) : (
										<Text style={styles.createProductModalConfirmText}>Try Again</Text>
									)}
								</TouchableOpacity>
							)}
						</View>
					</View>
				</View>
			)}

			{/* Product Photo Error Modal */}
			{productPhotoError && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<Text style={styles.retryErrorIcon}>❌</Text>
							<Text style={styles.createProductModalTitle}>Photo Upload Failed</Text>
							<Text style={styles.createProductModalSubtitle}>
								{productPhotoError}
							</Text>
						</View>
						<View style={styles.createProductModalButtons}>
							<TouchableOpacity
								style={styles.createProductModalCancelButton}
								onPress={handleProductPhotoCancel}>
								<Text style={styles.createProductModalCancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.createProductModalConfirmButton}
								onPress={handleProductPhotoRetry}
								disabled={isCapturingPhoto}>
								{isCapturingPhoto ? (
									<ActivityIndicator size='small' color='white' />
								) : (
									<Text style={styles.createProductModalConfirmText}>Try Again</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			{/* Create Product Modal */}
			{showCreateProductModal && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<BarcodeIcon size={48} color="#FF6B35" />
							<Text style={styles.createProductModalTitle}>Add New Product</Text>
							<Text style={styles.createProductModalSubtitle}>
								Take a photo of the entire front of the product package.
							</Text>
						</View>
						<View style={styles.createProductModalButtons}>
							<TouchableOpacity
								style={styles.createProductModalCancelButton}
								onPress={handleCreateProductCancel}>
								<Text style={styles.createProductModalCancelText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.createProductModalConfirmButton}
								onPress={handleCreateProductConfirm}>
								<Text style={styles.createProductModalConfirmText}>Take Photo</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			{/* Product Detail Overlay */}
			{showProductDetail && scannedProduct && (
				<View style={styles.productDetailOverlay}>
					<ProductResult product={scannedProduct} onBack={handleBackFromDetail} hideHeaderBackButton={true} />
					<View style={styles.buttonContainer}>
						<TouchableOpacity onPress={handleBackFromDetail}>
							<Text style={styles.backToScannerButton}>
								← Back to Scanner
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			)}
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'white',
	},
	permissionContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	permissionText: {
		fontSize: 18,
		fontWeight: 'bold',
		textAlign: 'center',
		marginBottom: 20,
	},
	permissionSubText: {
		fontSize: 14,
		textAlign: 'center',
		color: '#666',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 12,
		paddingHorizontal: 16,
		backgroundColor: 'white',
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	centerHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	appTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		marginLeft: 8,
		color: '#333',
	},
	instructionsContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 16,
		paddingHorizontal: 20,
		backgroundColor: 'white',
	},
	instructionText: {
		fontSize: 16,
		textAlign: 'center',
		color: '#333',
		fontWeight: '500',
		flex: 1,
	},
	bellIconContainer: {
		flexDirection: 'column',
		alignItems: 'center',
		padding: 8,
		marginLeft: 16,
		backgroundColor: 'transparent',
		borderRadius: 20,
	},
	bellIconText: {
		fontSize: 12,
		fontWeight: '500',
		color: '#666',
		marginTop: 2,
		textAlign: 'center',
	},
	cameraContainer: {
		flex: 1,
		backgroundColor: 'black',
		position: 'relative',
	},
	camera: {
		flex: 1,
	},
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0,0,0,0.5)',
	},
	unfocusedContainer: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.7)',
	},
	middleContainer: {
		flexDirection: 'row',
		flex: 1.5,
	},
	focusedContainer: {
		flex: 6,
		backgroundColor: 'transparent',
		justifyContent: 'center',
		alignItems: 'center',
	},
	scanningFrame: {
		width: '80%',
		height: '60%',
		borderWidth: 3,
		borderColor: '#00ff00',
		borderRadius: 12,
		backgroundColor: 'transparent',
	},
	loadingOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		color: 'white',
		fontSize: 16,
		marginTop: 12,
	},
	productOverlay: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: 'white',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: -2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	overlayContent: {
		flex: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	overlayProductInfo: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	overlayLeft: {
		width: 60,
		height: 60,
		marginRight: 12,
	},
	overlayImage: {
		width: 60,
		height: 60,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
	},
	overlayImageLoading: {
		opacity: 0.7,
	},
	overlayImageLoadingOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		borderRadius: 8,
	},
	overlayCenter: {
		flex: 1,
		marginRight: 12,
	},
	overlayProductName: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 4,
	},
	overlayProductBrand: {
		fontSize: 14,
		color: '#666',
	},
	overlayRight: {
		alignItems: 'flex-end',
	},
	overlayStatusBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
		minWidth: 100,
		justifyContent: 'center',
	},
	overlayStatusIcon: {
		fontSize: 16,
		marginRight: 4,
	},
	overlayUnknownIcon: {
		fontSize: 16,
		color: 'white',
		fontWeight: 'bold',
		marginRight: 4,
	},
	overlayStatusText: {
		color: 'white',
		fontSize: 12,
		fontWeight: 'bold',
	},
	overlayWarningRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 6,
		backgroundColor: '#fff3cd',
		paddingVertical: 4,
		paddingHorizontal: 8,
		borderRadius: 8,
	},
	overlayWarningIcon: {
		fontSize: 10,
		marginRight: 3,
	},
	overlayWarningText: {
		fontSize: 9,
		color: '#856404',
		fontWeight: '600',
	},
	overlayErrorContent: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 16,
	},
	overlayErrorText: {
		fontSize: 16,
		color: '#F44336',
		textAlign: 'center',
		marginBottom: 12,
	},
	processingText: {
		fontSize: 18,
		color: '#FF6B35',
		fontWeight: '600',
		textAlign: 'center',
		marginTop: 12,
		marginBottom: 4,
	},
	processingSubText: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
	},
	createProductButton: {
		backgroundColor: '#FF6B35',
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 20,
		minWidth: 140,
		alignItems: 'center',
		marginBottom: 8,
	},
	createProductButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
		marginLeft: 6,
	},
	createProductButtonContent: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	scanIngredientsButton: {
		backgroundColor: '#007AFF',
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 20,
		minWidth: 140,
		alignItems: 'center',
	},
	scanIngredientsButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	scanIngredientsButtonSmall: {
		backgroundColor: '#007AFF',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
		alignSelf: 'center',
		marginTop: 8,
	},
	scanIngredientsButtonTextSmall: {
		color: 'white',
		fontSize: 12,
		fontWeight: '600',
	},
	overlayIngredientsContent: {
		flex: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	overlayIngredientsTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 8,
	},
	ingredientsList: {
		flex: 1,
		marginBottom: 12,
	},
	ingredientItem: {
		fontSize: 14,
		color: '#666',
		marginBottom: 2,
	},
	dismissButton: {
		backgroundColor: '#666',
		paddingHorizontal: 20,
		paddingVertical: 8,
		borderRadius: 16,
		alignSelf: 'center',
	},
	dismissButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '500',
	},
	bottomInstructions: {
		paddingVertical: 16,
		paddingHorizontal: 20,
		backgroundColor: 'white',
	},
	tipText: {
		fontSize: 14,
		textAlign: 'center',
		color: '#666',
		fontStyle: 'italic',
	},
	productDetailOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'white',
		zIndex: 1000,
	},
	buttonContainer: {
		padding: 20,
		backgroundColor: 'white',
		borderTopWidth: 1,
		borderTopColor: '#eee',
	},
	backToScannerButton: {
		fontSize: 18,
		color: '#007AFF',
		textAlign: 'center',
		padding: 16,
		backgroundColor: '#f0f0f0',
		borderRadius: 8,
		fontWeight: 'bold',
	},
	createProductModal: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 2000,
	},
	createProductModalContent: {
		backgroundColor: 'white',
		borderRadius: 20,
		padding: 32,
		margin: 20,
		alignItems: 'center',
		maxWidth: 350,
		width: '90%',
	},
	createProductModalHeader: {
		alignItems: 'center',
		marginBottom: 32,
	},
	createProductModalTitle: {
		fontSize: 24,
		fontWeight: 'bold',
		color: '#333',
		marginTop: 16,
		marginBottom: 12,
		textAlign: 'center',
	},
	createProductModalSubtitle: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		lineHeight: 22,
	},
	createProductModalButtons: {
		flexDirection: 'row',
		gap: 16,
		width: '100%',
	},
	createProductModalCancelButton: {
		flex: 1,
		backgroundColor: '#f0f0f0',
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: 'center',
	},
	createProductModalCancelText: {
		color: '#666',
		fontSize: 16,
		fontWeight: '600',
	},
	createProductModalConfirmButton: {
		flex: 1,
		backgroundColor: '#FF6B35',
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: 'center',
	},
	createProductModalConfirmText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	loadingModal: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.95)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 3000,
	},
	loadingModalContent: {
		backgroundColor: 'white',
		borderRadius: 20,
		padding: 40,
		margin: 20,
		alignItems: 'center',
		maxWidth: 320,
		width: '85%',
	},
	loadingModalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: '#333',
		marginTop: 20,
		marginBottom: 30,
		textAlign: 'center',
	},
	loadingSpinner: {
		marginTop: 10,
	},
	inactiveCamera: {
		flex: 1,
		backgroundColor: '#000',
		justifyContent: 'center',
		alignItems: 'center',
	},
	inactiveCameraText: {
		color: '#666',
		fontSize: 16,
		fontStyle: 'italic',
	},
	retryErrorIcon: {
		fontSize: 32,
		textAlign: 'center',
		marginBottom: 8,
	},
})
