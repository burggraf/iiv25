import { BarcodeScanningResult, Camera } from 'expo-camera'
import { isDevice } from 'expo-device'
import { useIsFocused } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import UnifiedCameraService from '../services/UnifiedCameraService'
import UnifiedCameraView, { CameraViewRef } from '../components/UnifiedCameraView'
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
import GearIcon from '../components/icons/GearIcon'
import Logo from '../components/Logo'
import LogoWhite from '../components/LogoWhite'
import ProductDisplayContainer from '../components/ProductDisplayContainer'
import RateLimitModal from '../components/RateLimitModal'
import { ProductImageUrlService } from '../services/productImageUrlService'
import SimulatorBarcodeTester from '../components/SimulatorBarcodeTester'
import TakePhotoButton from '../components/TakePhotoButton'
import { useApp } from '../context/AppContext'
import { IngredientOCRService } from '../services/ingredientOCRService'
import { ProductCreationService } from '../services/productCreationService'
import { ProductLookupService } from '../services/productLookupService'
import { ProductImageUploadService } from '../services/productImageUploadService'
import { SubscriptionService, SubscriptionStatus, UsageStats } from '../services/subscriptionService'
import { cacheService, CacheEventListener } from '../services/CacheService'
import { Product, VeganStatus } from '../types'
import { SoundUtils } from '../utils/soundUtils'
import { validateIngredientParsingResult } from '../utils/ingredientValidation'
import { BackgroundJobsIndicator } from '../components/BackgroundJobsIndicator'
import { JobStatusModal } from '../components/JobStatusModal'
// Removed: import { useBackgroundJobs } from '../hooks/useBackgroundJobs' - now centralized in AppContext
import { backgroundQueueService } from '../services/backgroundQueueService'
import { transformJobResultToProduct } from '../utils/jobResultTransform'
import { BackgroundJob } from '../types/backgroundJobs'
import { CameraErrorBoundary } from '../components/CameraErrorBoundary'


export default function ScannerScreen() {
	const isFocused = useIsFocused()
	const router = useRouter()
	const { addToHistory, deviceId, queueJob, clearAllJobs, activeJobs } = useApp()
	const [pendingJobCallbacks, setPendingJobCallbacks] = useState<Map<string, (product: Product) => void>>(new Map())
	const cameraService = UnifiedCameraService.getInstance()

	// State declarations
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
	const [showIngredientScanSuccess, setShowIngredientScanSuccess] = useState(false)
	const [showProductCreationSuccess, setShowProductCreationSuccess] = useState(false)
	const [retryableError, setRetryableError] = useState<{error: string, imageBase64: string, imageUri?: string} | null>(null)
	const [ingredientScanError, setIngredientScanError] = useState<string | null>(null)
	const [productCreationError, setProductCreationError] = useState<{error: string, imageBase64: string, imageUri?: string, retryable: boolean} | null>(null)
	const [productPhotoError, setProductPhotoError] = useState<string | null>(null)
	const [isCapturingPhoto, setIsCapturingPhoto] = useState(false)
	const [showRateLimitModal, setShowRateLimitModal] = useState(false)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
	const [showCacheHitMessage, setShowCacheHitMessage] = useState(false)
	const [showJobsModal, setShowJobsModal] = useState(false)
	const [productCreationMode, setProductCreationMode] = useState<'off' | 'front-photo' | 'ingredients-photo'>('off')
	const [frontPhotoTaken, setFrontPhotoTaken] = useState(false)
	// Generate unique workflow ID for add_new_product workflow
	const [workflowId] = useState(() => `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
	const processingBarcodeRef = useRef<string | null>(null)
	const lastScannedBarcodeRef = useRef<string | null>(null)
	const lastScannedTimeRef = useRef<number>(0)
	const cameraRef = useRef<CameraViewRef>(null)
	const [cameraMode, setCameraMode] = useState<'scanner' | 'inactive'>('inactive')

	// Temporary debugging - log stuck jobs on screen load
	useEffect(() => {
		if (activeJobs && activeJobs.length > 0) {
			console.log(`🚨 [DEBUG] Found ${activeJobs.length} stuck jobs on scanner load:`, 
				activeJobs.map(j => `${j.id.slice(-6)} (${j.jobType}, ${j.status}, created: ${j.createdAt})`));
		}
	}, [activeJobs])

	// Listen to job completion events to avoid redundant ProductLookupService calls
	useEffect(() => {
		console.log(`🎯 [ScannerScreen] Setting up job completion listener`)
		
		const unsubscribe = backgroundQueueService.subscribeToJobUpdates(async (event, job) => {
			if (event === 'job_completed' && job && job.upc === currentBarcode) {
				console.log(`🎯 [ScannerScreen] Job completed for current barcode: ${job.jobType}`)
				
				// Check if we have a callback waiting for this job
				const callback = pendingJobCallbacks.get(job.id)
				if (callback) {
					console.log(`🎯 [ScannerScreen] Found pending callback for job ${job.id.slice(-6)}`)
					
					// Try to get product data from job result instead of fresh lookup
					const productFromJob = await transformJobResultToProduct(job)
					if (productFromJob) {
						console.log(`🎯 [ScannerScreen] Using product data from job result - avoiding ProductLookupService call`)
						callback(productFromJob)
						
						// Remove the callback
						setPendingJobCallbacks(prev => {
							const updated = new Map(prev)
							updated.delete(job.id)
							return updated
						})
					} else {
						console.log(`🎯 [ScannerScreen] Job result transformation failed - callback will use fallback`)
					}
				}
			}
		})
		
		return unsubscribe
	}, [currentBarcode, pendingJobCallbacks])
	
	// Cache service integration (unified caching)

	// Helper function to show success feedback before closing modal
	const showSuccessFeedback = (
		setSuccessState: (value: boolean) => void,
		setModalState: (value: boolean) => void
	) => {
		setSuccessState(true)
		setTimeout(() => {
			setSuccessState(false)
			setModalState(false)
		}, 500)
	}

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
			// Only cleanup camera if we own it
			const currentState = cameraService.getState()
			const currentOwner = cameraService.getCurrentOwner()
			if (currentState.mode === 'scanner' && currentOwner?.owner === 'ScannerScreen') {
				console.log('📷 Scanner: Component unmount - releasing scanner mode')
				cameraService.switchToMode('inactive', {}, 'ScannerScreen')
			}
			setCameraMode('inactive')
		}
	}, [])

	const loadSubscriptionData = useCallback(async () => {
		try {
			if (!deviceId) {
				console.log('Device ID not available, skipping subscription data load')
				return
			}

			// Load subscription status and usage stats in parallel
			const [status, stats] = await Promise.all([
				SubscriptionService.getSubscriptionStatus(deviceId),
				SubscriptionService.getUsageStats(deviceId)
			])

			setSubscriptionStatus(status)
			setUsageStats(stats)
			
		} catch (error) {
			console.error('Failed to load subscription data:', error)
		}
	}, [deviceId])

	// Load subscription data when deviceId becomes available
	useEffect(() => {
		if (deviceId) {
			loadSubscriptionData()
		}
	}, [deviceId, loadSubscriptionData])

	// Camera resource management based on screen focus
	useEffect(() => {
		console.log(`📷 Scanner: useEffect triggered - focused: ${isFocused}, permission: ${hasPermission}, showDetail: ${showProductDetail}`)
		const shouldActivate = isFocused && hasPermission && !showProductDetail

		if (shouldActivate) {
			// Only take control if camera is truly available (inactive mode AND no other owner)
			const currentState = cameraService.getState()
			const currentOwner = cameraService.getCurrentOwner()
			console.log(`📷 Scanner: Should activate - current mode: ${currentState.mode}, owner: ${currentOwner?.owner || 'none'}`)
			
			if ((currentState.mode === 'inactive' && !currentOwner) || 
				(currentState.mode === 'scanner' && currentOwner?.owner === 'ScannerScreen')) {
				console.log('📷 Scanner: Camera available, switching to scanner mode')
				cameraService.switchToMode('scanner', {}, 'ScannerScreen')
				setCameraMode('scanner')
			} else {
				console.log(`📷 Scanner: Camera busy - mode: ${currentState.mode}, owner: ${currentOwner?.owner || 'none'}, not taking control`)
				setCameraMode('inactive')
			}
		} else {
			// Only switch to inactive if we currently own the camera in scanner mode
			const currentState = cameraService.getState()
			const currentOwner = cameraService.getCurrentOwner()
			console.log(`📷 Scanner: Should not activate - current mode: ${currentState.mode}, owner: ${currentOwner?.owner || 'none'}`)
			
			if (currentState.mode === 'scanner' && currentOwner?.owner === 'ScannerScreen') {
				console.log('📷 Scanner: Releasing scanner mode (going inactive)')
				cameraService.switchToMode('inactive', {}, 'ScannerScreen')
				setCameraMode('inactive')
			} else {
				// Camera is owned by another screen, don't interfere at all
				console.log(`📷 Scanner: Camera owned by ${currentOwner?.owner || 'none'} in ${currentState.mode} mode, NOT INTERFERING`)
				setCameraMode('inactive')
			}
		}
		
		return () => {
			// Only cleanup if we currently own the camera (scanner mode)
			const currentState = cameraService.getState()
			const currentOwner = cameraService.getCurrentOwner()
			
			if (currentState.mode === 'scanner' && currentOwner?.owner === 'ScannerScreen') {
				console.log('📷 Scanner: Cleanup - releasing scanner mode')
				cameraService.switchToMode('inactive', {}, 'ScannerScreen')
				setCameraMode('inactive')
			} else {
				console.log(`📷 Scanner: Cleanup - camera owned by ${currentOwner?.owner || 'none'}, not releasing`)
			}
		}
	}, [isFocused, hasPermission, showProductDetail])

	// Cache invalidation is now handled by CacheInvalidationService
	// No need for individual component listeners

	// Listen for cache updates to refresh scanner product card
	useEffect(() => {
		const cacheListener: CacheEventListener = {
			onCacheUpdated: async (barcode: string, updatedProduct: Product) => {
				// Update scanner product card if it matches the currently displayed product
				if (scannedProduct && scannedProduct.barcode === barcode) {
					console.log(`📱 [ScannerScreen] Cache updated for ${barcode}, refreshing product card`);
					setScannedProduct(updatedProduct);
				}
			}
		};
		
		cacheService.addListener(cacheListener);
		
		return () => {
			cacheService.removeListener(cacheListener);
		};
	}, [scannedProduct])

	const refreshUsageStats = async () => {
		try {
			if (!deviceId) return

			const stats = await SubscriptionService.getUsageStats(deviceId)
			setUsageStats(stats)
			
		} catch (error) {
			console.error('Failed to refresh usage stats:', error)
		}
	}

	const handleBarcodeScanned = async (data: string) => {
		console.log(`🔍 handleBarcodeScanned called with: ${data}`)
		
		// Only process barcodes when screen is focused and no modal is shown, and not in product creation mode
		if (!isFocused || showCreateProductModal || showIngredientScanModal || showProductCreationModal || productCreationMode !== 'off') {
			console.log(`❌ Early return - focus/modal check failed`)
			return
		}

		const currentTime = Date.now()
		
		// Prevent concurrent processing
		if (processingBarcodeRef.current !== null) {
			console.log(`❌ Early return - already processing: ${processingBarcodeRef.current}`)
			return
		}

		// Check if this barcode is for the currently displayed product - if so, don't beep or process
		if (scannedProduct && scannedProduct.barcode === data) {
			console.log(`❌ Early return - same as currently displayed product`)
			// Update last scanned info to reset debounce timer
			lastScannedBarcodeRef.current = data
			lastScannedTimeRef.current = currentTime
			return
		}

		// Debounce same barcode scans - ignore if same barcode scanned within last 3 seconds
		if (lastScannedBarcodeRef.current === data && currentTime - lastScannedTimeRef.current < 3000) {
			console.log(`❌ Early return - debounced (last scanned ${currentTime - lastScannedTimeRef.current}ms ago)`)
			return
		}

		console.log(`📱 Barcode scanned: ${data}`)

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

		// Check if we have this UPC in our unified cache
		const cachedProduct = await cacheService.getProduct(data)
		if (cachedProduct) {
			// If cached product has no ingredients but status is UNKNOWN, check database for updates
			const hasNoIngredients = !cachedProduct.ingredients || cachedProduct.ingredients.length === 0
			const isUnknownStatus = cachedProduct.veganStatus === VeganStatus.UNKNOWN
			
			if (hasNoIngredients && isUnknownStatus) {
				console.log(`🔍 Cached product ${data} has no ingredients - checking database for updates`)
				// Don't return early - let it fall through to database lookup
			} else {
				console.log(`💾 Using cached result for ${data}`)
				setScannedProduct(cachedProduct)
				await addToHistory(cachedProduct)
				showOverlay()
				
				// Show "FREE!" message for cached scans (free users only)
				if (subscriptionStatus?.subscription_level === 'free') {
					setShowCacheHitMessage(true)
					// Hide message after 3 seconds
					setTimeout(() => {
						setShowCacheHitMessage(false)
					}, 3000)
				}
				
				return
			}
		}

		// Let server handle rate limiting - the phantom entry issue needs to be fixed server-side

		// Set processing flag
		processingBarcodeRef.current = data
		setIsLoading(true)
		setError(null)

		try {
			const result = await ProductLookupService.lookupProductByBarcode(data, { context: 'Scanner' })

			if (result.isRateLimited) {
				setShowRateLimitModal(true)
				return
			}

			if (result.product) {
				// Add to unified cache
				await cacheService.setProduct(data, result.product)
				
				setScannedProduct(result.product)
				await addToHistory(result.product)
				showOverlay()
				
				// Refresh usage stats after successful scan
				refreshUsageStats()
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

	// Cache management is now handled by CacheService

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
		// Navigate to the dedicated camera screen for ingredient scanning
		if (currentBarcode) {
			router.push(`/report-issue/${currentBarcode}/ingredients`)
		} else {
			Alert.alert('Error', 'No barcode found')
		}
	}

	const handleScanIngredientsBackground = async () => {
		// Use the unified camera system instead of ImagePicker
		handleScanIngredients()
	}

	const handleCreateProduct = async () => {
		// Navigate to dedicated product creation camera screen
		setError(null)
		hideOverlay()
		
		if (currentBarcode) {
			router.push(`/product-creation/${currentBarcode}`)
		} else {
			Alert.alert('Error', 'No barcode found')
		}
	}

	const handleCancelProductCreation = () => {
		setProductCreationMode('off')
		setFrontPhotoTaken(false)
		setError(null)
	}

	const handleTakeProductCreationPhoto = async () => {
		try {
			if (!cameraRef.current) {
				setError('Camera not available')
				return
			}

			if (!currentBarcode) {
				setError('No barcode found')
				return
			}

			// Take photo using the camera ref
			if (!cameraRef.current || cameraMode !== 'scanner') {
				setError('Camera not available')
				return
			}
			
			const photo = await cameraRef.current.takePictureAsync({
				quality: 0.8,
				base64: false,
			})

			if (!photo?.uri) {
				setError('Failed to capture image')
				return
			}

			if (productCreationMode === 'front-photo') {
				// Queue the front product photo for processing
				await queueJob({
					jobType: 'product_creation',
					imageUri: photo.uri,
					upc: currentBarcode,
					priority: 3, // Highest priority for product creation
					workflowId,
					workflowType: 'add_new_product',
					workflowSteps: { total: 3, current: 1 },
				})
				
				// Move to ingredients photo step
				setFrontPhotoTaken(true)
				setProductCreationMode('ingredients-photo')
			} else if (productCreationMode === 'ingredients-photo') {
				// Queue the ingredients photo for processing
				await queueJob({
					jobType: 'ingredient_parsing',
					imageUri: photo.uri,
					upc: currentBarcode,
					existingProductData: null, // Product doesn't exist yet
					priority: 2,
					workflowId,
					workflowType: 'add_new_product',
					workflowSteps: { total: 3, current: 2 },
				})
				
				// Complete the flow
				setProductCreationMode('off')
				setFrontPhotoTaken(false)
				
				// Show confirmation
				Alert.alert(
					"Photos Queued",
					"Both product and ingredients photos have been queued for processing. You'll receive notifications when they're complete. You can continue using the app.",
					[{ text: "OK" }]
				)
			}

		} catch (err) {
			console.error('Error in photo capture flow:', err)
			setError('Failed to capture photo. Please try again.')
		}
	}

	const handleCreateProductCancel = () => {
		setShowCreateProductModal(false)
		// Clear error state and hide overlay to allow new scans
		hideOverlay()
	}

	const handleCreateProductConfirm = async () => {
		// Use the unified camera system instead of ImagePicker
		setShowCreateProductModal(false)
		handleCreateProduct()
	}

	const handleCreateProductBackground = async () => {
		// Use the unified camera system instead of ImagePicker
		setShowCreateProductModal(false)
		handleCreateProduct()
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

	const handleClearScreen = () => {
		console.log('🧹 handleClearScreen called')
		console.log(`   Before clear - lastScannedBarcodeRef: ${lastScannedBarcodeRef.current}`)
		console.log(`   Before clear - processingBarcodeRef: ${processingBarcodeRef.current}`)
		
		// Reset all state back to initial scanner state
		setScannedProduct(null)
		setError(null)
		setIsLoading(false)
		setParsedIngredients(null)
		setCurrentBarcode(null)
		setShowProductDetail(false)
		setIsParsingIngredients(false)
		setIsCreatingProduct(false)
		setShowCreateProductModal(false)
		setShowIngredientScanModal(false)
		setShowProductCreationModal(false)
		setShowIngredientScanSuccess(false)
		setShowProductCreationSuccess(false)
		setRetryableError(null)
		setIngredientScanError(null)
		setProductCreationError(null)
		setShowCacheHitMessage(false)
		// Clear barcode refs to allow re-scanning the same barcode
		lastScannedBarcodeRef.current = null
		lastScannedTimeRef.current = 0
		processingBarcodeRef.current = null
		
		// Clear the camera component's last scanned barcode
		cameraRef.current?.clearLastScannedBarcode()
		
		console.log('   After clear - all refs set to null')
	}

	const handleCancelRetry = () => {
		setRetryableError(null);
		// Clear error state and hide overlay to allow new scans
		hideOverlay();
	}

	const handleIngredientScanRetry = () => {
		setIngredientScanError(null);
		handleScanIngredientsBackground();
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

	const handleRateLimitClose = () => {
		setShowRateLimitModal(false);
		// Clear processing state to allow new scans
		processingBarcodeRef.current = null;
		setIsLoading(false);
	}

	const processProductCreation = async (imageBase64: string, imageUri?: string) => {
		let isSuccess = false
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

			// Register callback to handle job completion instead of direct refresh
			console.log(`🔄 Registering callback for product creation job completion`)
			
			// Get the job that was just created from the queueJob call above
			// Note: We need to modify this to get the actual job ID from the queueJob result
			console.log(`🎯 [ScannerScreen] Note: Job coordination will be handled by background job events`)
			
			// OPTIMIZATION: Skip direct refresh - let job completion events handle this
			console.log(`🎯 [ScannerScreen] OPTIMIZATION: Skipping direct ProductLookupService call`)
			console.log(`🎯 [ScannerScreen] Product data will be provided by optimized job completion events`)
			
			// Note: The background job events (useBackgroundJobs, CacheInvalidationService, NotificationContext) 
			// are now optimized to use job result data instead of fresh lookups
			isSuccess = true
			
			// Show success immediately - the actual product data will come from job events
			console.log(`✅ Product creation queued successfully - waiting for job completion`)
			
			// Clear error since product creation was successful
			setError(null)
			
			// TODO: Consider showing a "Processing..." state here instead of immediate success
			/*
			// COMMENTED OUT: This direct refresh call is redundant with job completion events
			try {
				const refreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'ProductCreation' })
				if (refreshResult.product) {
					console.log(`✅ Product created and refreshed: ${refreshResult.product.name}`)
					setScannedProduct(refreshResult.product)
					await addToHistory(refreshResult.product)
					// Update cache with new product data
					await cacheService.setProduct(currentBarcode, refreshResult.product)
					
					// Clear error since we're now showing the full product
					setError(null)
					isSuccess = true
					
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
			*/

			// OPTIMIZED: Secondary refresh now handled by background job events
			console.log(`🎯 [ScannerScreen] Secondary image refresh will be handled by job completion events`)
			
			// TODO: Remove the following setTimeout once job coordination is fully implemented
			/*
			setTimeout(async () => {
				try {
					console.log(`🔄 LEGACY: Secondary refresh to catch uploaded image (should be replaced by job events)`)
					const secondRefreshResult = await ProductLookupService.lookupProductByBarcode(currentBarcode, { context: 'ProductCreationImage' })
					if (secondRefreshResult.product && secondRefreshResult.product.imageUrl) {
						console.log(`✅ Product image found on second refresh`)
						setScannedProduct(secondRefreshResult.product)
						await cacheService.setProduct(currentBarcode, secondRefreshResult.product)
					}
				} catch (secondRefreshError) {
					console.error('Error in secondary refresh after product creation:', secondRefreshError)
					// Silent fail - don't show error for secondary refresh
				}
			}, 2500); // Wait 2.5 seconds (1s delay + 1.5s for upload)
			*/
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
			// Show success feedback before closing modal (only on success)
			if (isSuccess) {
				showSuccessFeedback(setShowProductCreationSuccess, setShowProductCreationModal)
			} else {
				setShowProductCreationModal(false)
			}
		}
	}

	const handleTakeProductPhoto = async () => {
		if (!scannedProduct?.barcode) return
		
		// Navigate to the dedicated camera screen for product photos
		router.push(`/report-issue/${scannedProduct.barcode}/product`)
	}

	const captureProductPhoto = async () => {
		// Use the unified camera system instead of ImagePicker
		handleTakeProductPhoto()
	}

	const processProductPhotoUpload = async (imageUri: string) => {
		try {
			if (!currentBarcode || !scannedProduct) {
				setProductPhotoError('No product available for photo upload');
				setIsCapturingPhoto(false)
				return
			}

			console.log(`📸 Queueing photo upload job for product: ${scannedProduct.name}`)

			// Queue the photo upload as a background job instead of processing directly
			const job = await backgroundQueueService.queueJob({
				jobType: 'product_photo_upload',
				imageUri: imageUri,
				upc: currentBarcode,
				existingProductData: scannedProduct,
				priority: 1
			});

			console.log(`✅ Photo upload job queued: ${job.id.slice(-8)}`)
			console.log(`📱 Job will process in background and trigger cache invalidation when complete`)
			
			// No need to manually refresh - the background job will trigger cache invalidation
			// which will automatically update the UI when the job completes

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

	const handleProductUpdated = async (updatedProduct: Product) => {
		// Update the current scanned product state
		setScannedProduct(updatedProduct)
		
		// Update the cache to reflect the changes
		if (updatedProduct.barcode) {
			await cacheService.setProduct(updatedProduct.barcode, updatedProduct)
		}
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
				return <LogoWhite size={24} />
			case VeganStatus.VEGETARIAN:
				return <Text style={styles.overlayStatusIcon}>🥛</Text>
			case VeganStatus.NOT_VEGETARIAN:
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
				{/* Queue Management Button */}
				<TouchableOpacity 
					style={styles.queueButton}
					onPress={() => setShowJobsModal(true)}
				>
					<GearIcon size={24} color="#ccc" />
					{activeJobs && activeJobs.length > 0 && (
						<View style={styles.queueBadge}>
							<Text style={styles.queueBadgeText}>
								{activeJobs.length}
							</Text>
						</View>
					)}
				</TouchableOpacity>
			</View>

			<View style={styles.instructionsContainer}>
				<Text style={styles.instructionText}>
					{productCreationMode !== 'off' 
						? '📷 Product Creation Mode'
						: isLoading 
							? '🔍 Looking up product...' 
							: '📷 Point your camera\nat a food product barcode'}
				</Text>
				<TouchableOpacity style={styles.bellIconContainer} onPress={handleSoundToggle}>
					<BellIcon size={24} color="#666" filled={isSoundEnabled} />
					<Text style={styles.bellIconText}>
						{isSoundEnabled ? 'ON' : 'OFF'}
					</Text>
				</TouchableOpacity>
			</View>

			{/* Background Jobs Indicator */}
			<BackgroundJobsIndicator onPress={() => setShowJobsModal(true)} />

			{/* Camera View */}
			<View style={styles.cameraContainer}>
				{!isDevice || Platform.OS === 'web' ? (
					<SimulatorBarcodeTester onBarcodeScanned={({ data }: BarcodeScanningResult) => handleBarcodeScanned(data)} />
				) : (
					<UnifiedCameraView
						ref={cameraRef}
						mode={cameraMode}
						owner="ScannerScreen"
						onBarcodeScanned={handleBarcodeScanned}
						onError={(error) => {
							console.error('📷 Scanner: Camera error:', error);
							setError(`Camera error: ${error}`);
						}}
						renderOverlay={(mode, state) => {
							// Only render scanner overlay when in scanner mode
							if (mode !== 'scanner' || !state.isActive) return null;
							
							return (
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
							);
						}}
						style={styles.camera}
					/>
				)}

				{/* Loading Indicator */}
				{isLoading && (
					<View style={styles.loadingOverlay}>
						<ActivityIndicator size='large' color='#007AFF' />
						<Text style={styles.loadingText}>Looking up product...</Text>
					</View>
				)}

				{/* Product Creation Instruction Overlay */}
				{productCreationMode !== 'off' && (
					<View style={styles.productCreationOverlay}>
						<View style={styles.productCreationHeader}>
							<Text style={styles.productCreationTitle}>
								{productCreationMode === 'front-photo' 
									? 'Step 1 of 2: Product Front' 
									: 'Step 2 of 2: Ingredients'}
							</Text>
							<TouchableOpacity 
								style={styles.productCreationCancelButton}
								onPress={handleCancelProductCreation}
							>
								<Text style={styles.productCreationCancelText}>Cancel</Text>
							</TouchableOpacity>
						</View>
						<View style={styles.productCreationInstructions}>
							<Text style={styles.productCreationInstructionText}>
								{productCreationMode === 'front-photo' 
									? 'Take a clear photo of the front of the product, making sure the name and brand information is visible.'
									: 'Take a clear photo of the product ingredients.'}
							</Text>
						</View>
						<TouchableOpacity 
							style={styles.productCreationCaptureButton}
							onPress={handleTakeProductCreationPhoto}
						>
							<Text style={styles.productCreationCaptureText}>📷 Capture Photo</Text>
						</TouchableOpacity>
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
										<Image source={{ 
											uri: (() => {
												const baseUrl = ProductImageUrlService.resolveImageUrl(scannedProduct.imageUrl, scannedProduct.barcode);
												if (!baseUrl) return undefined;
												const timestamp = Date.now();
												const separator = baseUrl.includes('?') ? '&' : '?';
												const cacheBustedUrl = `${baseUrl}${separator}scanner_cache_bust=${timestamp}`;
												console.log(`📱 [ScannerScreen] FRESH image URL for ${scannedProduct.barcode}:`, cacheBustedUrl);
												return cacheBustedUrl;
											})()
										}} style={styles.overlayImage} />
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
							<Text style={styles.overlayErrorText}>{error}</Text>
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
				{/* Cache Hit Message */}
				{showCacheHitMessage && subscriptionStatus?.subscription_level === 'free' && (
					<Text style={styles.cacheHitText}>
						FREE! (Recently scanned items do not count toward your quota.)
					</Text>
				)}
				
				{/* Free Plan Scan Counter */}
				{subscriptionStatus?.subscription_level === 'free' && usageStats && (() => {
					// Calculate remaining scans out of the full limit
					const scansRemaining = Math.max(0, usageStats.product_lookups_limit - usageStats.product_lookups_today)
					return (
						<Text style={styles.scanCounterText}>
							Free Plan: {scansRemaining} of {usageStats.product_lookups_limit} scans remaining today
						</Text>
					)
				})()}
				<View style={styles.tipContainer}>
					<Text style={styles.tipText}>💡 Scan food product barcodes{'\n'}Tap product to view details</Text>
					<TouchableOpacity
						style={[
							styles.clearButton,
							{
								opacity: (scannedProduct || error || isLoading || parsedIngredients || currentBarcode) ? 1 : 0.3
							}
						]}
						onPress={handleClearScreen}
						disabled={!scannedProduct && !error && !isLoading && !parsedIngredients && !currentBarcode}
					>
						<Text style={styles.clearButtonText}>Clear</Text>
					</TouchableOpacity>
				</View>
			</View>

			{/* Ingredient Scan Modal */}
			{showIngredientScanModal && (
				<View style={styles.loadingModal}>
					<View style={styles.loadingModalContent}>
						<LogoWhite size={48} />
						<Text style={styles.loadingModalTitle}>
							{showIngredientScanSuccess ? 'Analysis complete!' : 'Analyzing ingredients...'}
						</Text>
						{showIngredientScanSuccess ? (
							<Text style={styles.successCheckmark}>✅</Text>
						) : (
							<ActivityIndicator size="large" color="#007AFF" style={styles.loadingSpinner} />
						)}
					</View>
				</View>
			)}

			{/* Product Creation Modal */}
			{showProductCreationModal && (
				<View style={styles.loadingModal}>
					<View style={styles.loadingModalContent}>
						<BarcodeIcon size={48} color="#FF6B35" />
						<Text style={styles.loadingModalTitle}>
							{showProductCreationSuccess ? 'Product added!' : 'Adding new product...'}
						</Text>
						{showProductCreationSuccess ? (
							<Text style={styles.successCheckmark}>✅</Text>
						) : (
							<ActivityIndicator size="large" color="#FF6B35" style={styles.loadingSpinner} />
						)}
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

			{/* Rate Limit Modal */}
			<RateLimitModal 
				isVisible={showRateLimitModal}
				onClose={handleRateLimitClose}
			/>

			{/* Create Product Modal */}
			{showCreateProductModal && (
				<View style={styles.createProductModal}>
					<View style={styles.createProductModalContent}>
						<View style={styles.createProductModalHeader}>
							<BarcodeIcon size={48} color="#FF6B35" />
							<Text style={styles.createProductModalTitle}>Add New Product</Text>
							<Text style={styles.createProductModalSubtitle}>
								Take two photos:{'\n'}
								1. Take a clear photo of the front of the product showing the product's name and brand.{'\n'}
								2. Take a clear photo of the product ingredients.{'\n'}
								Both will be processed in the background so you can continue scanning.
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
								<Text style={styles.createProductModalConfirmText}>Take Photos</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

			{/* Product Detail Overlay */}
			{showProductDetail && scannedProduct && (
				<ProductDisplayContainer
					product={scannedProduct}
					onBack={handleBackFromDetail}
					backButtonText="← Back to Scanner"
					onProductUpdated={handleProductUpdated}
					iconType="scanner"
				/>
			)}

			{/* Background Jobs Modal */}
			<JobStatusModal 
				isVisible={showJobsModal}
				onClose={() => setShowJobsModal(false)}
			/>
		</SafeAreaView>
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
		flex: 1,
	},
	appTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		marginLeft: 8,
		color: '#333',
	},
	queueButton: {
		backgroundColor: 'transparent',
		paddingHorizontal: 8,
		paddingVertical: 8,
		borderRadius: 20,
		position: 'absolute',
		right: 16,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	queueBadge: {
		position: 'absolute',
		top: -2,
		right: -2,
		backgroundColor: '#888',
		borderRadius: 10,
		minWidth: 20,
		height: 20,
		justifyContent: 'center',
		alignItems: 'center',
	},
	queueBadgeText: {
		color: 'white',
		fontSize: 12,
		fontWeight: '600',
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
	tipContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	tipText: {
		fontSize: 14,
		textAlign: 'left',
		color: '#666',
		fontStyle: 'italic',
		flex: 1,
	},
	clearButton: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		backgroundColor: '#666',
		borderRadius: 6,
		marginLeft: 16,
	},
	clearButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	scanCounterText: {
		fontSize: 12,
		textAlign: 'center',
		color: '#888',
		marginBottom: 8,
	},
	cacheHitText: {
		fontSize: 12,
		textAlign: 'center',
		color: '#4CAF50',
		fontWeight: 'bold',
		marginBottom: 4,
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
		gap: 12,
		width: '100%',
		justifyContent: 'space-between',
	},
	createProductModalCancelButton: {
		flex: 1,
		backgroundColor: '#f0f0f0',
		paddingVertical: 16,
		paddingHorizontal: 8,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	createProductModalCancelText: {
		color: '#666',
		fontSize: 16,
		fontWeight: '600',
		textAlign: 'center',
	},
	createProductModalConfirmButton: {
		flex: 1,
		backgroundColor: '#FF6B35',
		paddingVertical: 16,
		paddingHorizontal: 8,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	createProductModalConfirmText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
		textAlign: 'center',
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
	successCheckmark: {
		fontSize: 48,
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
	productCreationOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		paddingTop: 60,
		paddingHorizontal: 20,
		paddingBottom: 20,
		zIndex: 1000,
	},
	productCreationHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	productCreationTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: 'white',
	},
	productCreationCancelButton: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		backgroundColor: 'rgba(255, 255, 255, 0.2)',
		borderRadius: 6,
	},
	productCreationCancelText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '500',
	},
	productCreationInstructions: {
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		borderRadius: 12,
		padding: 16,
		marginBottom: 20,
	},
	productCreationInstructionText: {
		fontSize: 16,
		color: '#333',
		textAlign: 'center',
		lineHeight: 22,
	},
	productCreationCaptureButton: {
		backgroundColor: '#FF6B35',
		paddingVertical: 16,
		paddingHorizontal: 24,
		borderRadius: 12,
		alignItems: 'center',
		alignSelf: 'center',
		minWidth: 180,
	},
	productCreationCaptureText: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
	},
	permissionContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 40,
		backgroundColor: 'black',
	},
	permissionText: {
		color: 'white',
		fontSize: 18,
		textAlign: 'center',
		marginBottom: 24,
		lineHeight: 24,
	},
	permissionSubText: {
		color: '#ccc',
		fontSize: 14,
		textAlign: 'center',
		lineHeight: 20,
		marginBottom: 20,
	},
	permissionButton: {
		backgroundColor: '#007AFF',
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
	},
	permissionButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
})
