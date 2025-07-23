import * as ImagePicker from 'expo-image-picker'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Image,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { IngredientOCRService } from '../services/ingredientOCRService'
import { ProductCreationService } from '../services/productCreationService'
import { ProductImageUploadService } from '../services/productImageUploadService'
import { ProductLookupService } from '../services/productLookupService'
import { supabase } from '../services/supabaseClient'
import { Product, VeganStatus } from '../types'
import Logo from './Logo'
import LogoWhite from './LogoWhite'

interface ProductResultProps {
	product: Product
	onBack: () => void
	hideHeaderBackButton?: boolean
	onProductUpdated?: (updatedProduct: Product) => void
}

interface IngredientClassification {
	title: string
	class: string
}

export default function ProductResult({
	product,
	onBack,
	hideHeaderBackButton = false,
	onProductUpdated,
}: ProductResultProps) {
	const [currentProduct, setCurrentProduct] = useState<Product>(product)
	const [ingredientClassifications, setIngredientClassifications] = useState<
		IngredientClassification[]
	>([])
	const [processingReport, setProcessingReport] = useState(false)
	const [reportType, setReportType] = useState<string>('')
	const [showProcessingModal, setShowProcessingModal] = useState(false)

	// Fetch ingredient classifications from database
	useEffect(() => {
		const fetchIngredientClassifications = async () => {
			if (!currentProduct.barcode) return

			try {
				const { data, error } = await supabase.rpc('get_ingredients_for_upc', {
					input_upc: currentProduct.barcode,
				})

				if (error) {
					console.error('Error fetching ingredient classifications:', error)
				} else {
					setIngredientClassifications(data || [])
				}
			} catch (err) {
				console.error('Exception fetching ingredient classifications:', err)
			}
		}

		fetchIngredientClassifications()
	}, [currentProduct.barcode])

	const refreshProductData = async () => {
		if (!currentProduct.barcode) return

		try {
			const result = await ProductLookupService.lookupProductByBarcode(currentProduct.barcode)

			if (result.product) {
				setCurrentProduct(result.product)

				// Notify parent component of the update
				if (onProductUpdated) {
					onProductUpdated(result.product)
				}

				// Also refresh ingredient classifications for the updated product
				const { data, error } = await supabase.rpc('get_ingredients_for_upc', {
					input_upc: currentProduct.barcode,
				})

				if (!error && data) {
					setIngredientClassifications(data)
				}
			}
		} catch (error) {
			console.error('Error refreshing product data:', error)
			// Don't show an error to user - this is background refresh
		}
	}

	const showReportIssueAlert = () => {
		Alert.alert('Report an issue', 'What would you like to update?', [
			{
				text: 'Take new product photo',
				onPress: () => handleReportIssue('image'),
			},
			{
				text: 'Take photo of product name',
				onPress: () => handleReportIssue('name'),
			},
			{
				text: 'Take photo of ingredients',
				onPress: () => handleReportIssue('ingredients'),
			},
			{
				text: 'Cancel',
				style: 'cancel',
			},
		])
	}

	const handleReportIssue = async (issueType: 'image' | 'name' | 'ingredients') => {
		setProcessingReport(true)
		setReportType(issueType)

		try {
			// Request camera permission
			const { status } = await ImagePicker.requestCameraPermissionsAsync()

			if (status !== 'granted') {
				Alert.alert(
					'Permission Required',
					'Camera permission is required to update product information'
				)
				setProcessingReport(false)
				return
			}

			let cameraConfig = {}
			let successMessage = ''

			switch (issueType) {
				case 'image':
					cameraConfig = {
						mediaTypes: 'images',
						allowsEditing: true,
						aspect: [1, 1],
						quality: 0.8,
						base64: true,
					}
					successMessage = 'Product image updated successfully'
					break
				case 'name':
					cameraConfig = {
						mediaTypes: 'images',
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.8,
						base64: true,
					}
					successMessage = 'Product name and brand updated successfully'
					break
				case 'ingredients':
					cameraConfig = {
						mediaTypes: 'images',
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.8,
						base64: true,
					}
					successMessage = 'Ingredients updated successfully'
					break
			}

			// Launch camera with a small delay to let modal state settle
			await new Promise((resolve) => setTimeout(resolve, 100))
			const result = await ImagePicker.launchCameraAsync(cameraConfig)

			if (result.canceled) {
				setProcessingReport(false)
				return
			}

			const imageUri = result.assets[0].uri
			const imageBase64 = result.assets[0].base64

			if (!imageBase64) {
				Alert.alert('Error', 'Failed to process image')
				setProcessingReport(false)
				return
			}

			// Show processing modal immediately after image capture
			setShowProcessingModal(true)

			// Process based on issue type
			switch (issueType) {
				case 'image':
					await handleImageUpdate(imageUri, imageBase64)
					break
				case 'name':
					await handleNameUpdate(imageBase64)
					break
				case 'ingredients':
					await handleIngredientsUpdate(imageBase64)
					break
			}

			// Hide processing modal, refresh product data, and show success
			setShowProcessingModal(false)
			await refreshProductData()
			Alert.alert('Success', successMessage)
		} catch (error) {
			console.error('Error processing report:', error)
			// Hide processing modal and show error
			setShowProcessingModal(false)
			Alert.alert('Error', `Failed to update product information: ${error}`)
		} finally {
			setProcessingReport(false)
			setReportType('')
		}
	}

	const handleImageUpdate = async (imageUri: string, imageBase64: string) => {
		if (!currentProduct.barcode) return

		// Upload new image to storage
		const uploadResult = await ProductImageUploadService.uploadProductImage(
			imageUri,
			currentProduct.barcode
		)

		if (!uploadResult.success) {
			throw new Error(uploadResult.error || 'Failed to upload image')
		}

		// Update product imageurl in database via edge function with timestamp for cache busting
		const timestampedImageUrl = `[SUPABASE]?t=${Date.now()}`
		const { error } = await supabase.functions.invoke('update-product-image', {
			body: {
				upc: currentProduct.barcode,
				imageUrl: timestampedImageUrl,
			},
		})

		if (error) {
			throw new Error(`Failed to update product image URL: ${error.message}`)
		}
	}

	const handleNameUpdate = async (imageBase64: string) => {
		if (!currentProduct.barcode) return

		// Use product creation service to extract name and brand - this edge function handles the database update
		const response = await ProductCreationService.createProductFromPhoto(
			imageBase64,
			currentProduct.barcode
		)

		if (response.error) {
			throw new Error(response.error)
		}
	}

	const handleIngredientsUpdate = async (imageBase64: string) => {
		if (!currentProduct.barcode) return

		// Extract ingredients using OCR service - this edge function handles the database update
		const ocrResponse = await IngredientOCRService.parseIngredientsFromImage(
			imageBase64,
			currentProduct.barcode
		)

		if (ocrResponse.error) {
			throw new Error(ocrResponse.error)
		}

		if (!ocrResponse.ingredients || ocrResponse.ingredients.length === 0) {
			throw new Error('No ingredients could be extracted from the image')
		}
	}

	const getVerdictColor = (verdict: string): string => {
		switch (verdict) {
			case 'vegan':
				return '#4CAF50' // Green
			case 'vegetarian':
				return '#FF9800' // Orange/Yellow
			case 'not_vegan':
				return '#F44336' // Red
			case 'unknown':
				return '#9E9E9E' // Gray
			default:
				return '#9E9E9E'
		}
	}

	const getVerdictText = (verdict: string): string => {
		switch (verdict) {
			case 'vegan':
				return 'VEGAN'
			case 'vegetarian':
				return 'VEGETARIAN'
			case 'not_vegan':
				return 'NOT VEGAN'
			case 'unknown':
				return 'UNKNOWN'
			default:
				return 'UNKNOWN'
		}
	}

	const getStatusColor = (status: VeganStatus): string => {
		switch (status) {
			case VeganStatus.VEGAN:
				return '#4CAF50' // Green
			case VeganStatus.VEGETARIAN:
				return '#FF9800' // Orange
			case VeganStatus.NOT_VEGAN:
				return '#F44336' // Red
			case VeganStatus.UNKNOWN:
				return '#9E9E9E' // Gray
			default:
				return '#9E9E9E'
		}
	}

	const getStatusIcon = (status: VeganStatus) => {
		switch (status) {
			case VeganStatus.VEGAN:
				return <LogoWhite size={64} />
			case VeganStatus.VEGETARIAN:
				return <Text style={styles.statusIconText}>🥛</Text>
			case VeganStatus.NOT_VEGAN:
				return <Text style={styles.statusIconText}>🥩</Text>
			case VeganStatus.UNKNOWN:
				return <Text style={styles.unknownIconText}>?</Text>
			default:
				return <Text style={styles.unknownIconText}>?</Text>
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

	const getStatusDescription = (status: VeganStatus): string => {
		switch (status) {
			case VeganStatus.VEGAN:
				return 'This product contains no animal-derived ingredients.'
			case VeganStatus.VEGETARIAN:
				return 'This product may contain dairy or eggs but no meat.'
			case VeganStatus.NOT_VEGAN:
				return 'This product contains animal-derived ingredients.'
			case VeganStatus.UNKNOWN:
				return 'Could not determine vegan status. Check ingredients manually.'
			default:
				return 'Could not determine vegan status.'
		}
	}

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			{/* App Header */}
			<View style={[styles.appHeader, hideHeaderBackButton && styles.appHeaderCentered]}>
				{!hideHeaderBackButton && (
					<TouchableOpacity style={styles.backButton} onPress={onBack}>
						<Text style={styles.backButtonText}>← Back</Text>
					</TouchableOpacity>
				)}
				<View style={[styles.centerHeader, hideHeaderBackButton && styles.centerHeaderFullWidth]}>
					<Logo size={32} />
					<Text style={styles.appTitle}>Is It Vegan?</Text>
				</View>
				{!hideHeaderBackButton && <View style={styles.rightSpacer} />}
			</View>

			<ScrollView style={styles.scrollView}>
				{/* Status Header */}
				<View
					style={[
						styles.statusHeader,
						{ backgroundColor: getStatusColor(currentProduct.veganStatus) },
					]}>
					<View style={styles.statusIconContainer}>
						{getStatusIcon(currentProduct.veganStatus)}
					</View>
					<Text style={styles.statusText}>{getStatusText(currentProduct.veganStatus)}</Text>
				</View>

				{/* Product Info */}
				<View style={styles.productInfo}>
					{currentProduct.imageUrl && (
						<Image source={{ uri: currentProduct.imageUrl }} style={styles.productImage} />
					)}

					<Text style={styles.productName}>{currentProduct.name}</Text>

					{currentProduct.brand && <Text style={styles.productBrand}>{currentProduct.brand}</Text>}

					<Text style={styles.productBarcode}>Barcode: {currentProduct.barcode}</Text>

					<Text style={styles.statusDescription}>
						{getStatusDescription(currentProduct.veganStatus)}
					</Text>
				</View>

				{/* Non-Vegan Ingredients Analysis */}
				{currentProduct.nonVeganIngredients && currentProduct.nonVeganIngredients.length > 0 && (
					<View style={styles.analysisSection}>
						<Text style={styles.analysisSectionTitle}>⚠️ Classification Analysis</Text>
						<Text style={styles.analysisSubtitle}>
							{currentProduct.veganStatus === 'vegetarian'
								? 'Contains dairy or eggs but no meat:'
								: currentProduct.veganStatus === 'not_vegan'
								? 'Contains animal products:'
								: 'Uncertain ingredients:'}
						</Text>
						<View style={styles.analysisItemsList}>
							{currentProduct.nonVeganIngredients.map((detail, index) => (
								<View key={index} style={styles.analysisItem}>
									<Text style={styles.analysisIngredient}>• {detail.ingredient}</Text>
									<Text style={styles.analysisReason}>{detail.reason}</Text>
									<View style={styles.analysisLabels}>
										<Text
											style={[
												styles.analysisLabel,
												{
													backgroundColor: getVerdictColor(detail.verdict),
												},
											]}>
											{getVerdictText(detail.verdict)}
										</Text>
									</View>
								</View>
							))}
						</View>
						{currentProduct.classificationMethod && (
							<Text style={styles.classificationMethod}>
								Classification method: {currentProduct.classificationMethod}
							</Text>
						)}
					</View>
				)}

				{/* Non-vegetarian Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === 'non-vegetarian').length > 0 && (
					<View style={styles.nonVegetarianSection}>
						<Text style={styles.nonVegetarianTitle}>❌ Non-vegetarian Ingredients:</Text>
						<View style={styles.nonVegetarianList}>
							{ingredientClassifications
								.filter((ing) => ing.class === 'non-vegetarian')
								.map((ingredient, index) => (
									<Text key={index} style={styles.nonVegetarianIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* Unknown Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === null || ing.class === 'null')
					.length > 0 && (
					<View style={styles.unknownIngredientsSection}>
						<Text style={styles.unknownSectionTitle}>⚠️ Unknown Ingredients:</Text>
						<Text style={styles.unknownSubtitle}>
							The following ingredients are unknown and may alter the outcome of this diagnosis -
							please double-check these ingredients individually.
						</Text>
						<View style={styles.unknownIngredientsList}>
							{ingredientClassifications
								.filter((ing) => ing.class === null || ing.class === 'null')
								.map((ingredient, index) => (
									<Text key={index} style={styles.unknownIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* May Be Non-Vegetarian Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === 'may be non-vegetarian').length >
					0 && (
					<View style={styles.mayBeNonVegSection}>
						<Text style={styles.mayBeNonVegTitle}>⚠️ May Be Non-Vegetarian:</Text>
						<Text style={styles.mayBeNonVegSubtitle}>
							The following ingredients may be derived from either animal sources or plant-based
							sources. Please verify the source of each of these ingredients individually.
						</Text>
						<View style={styles.mayBeNonVegList}>
							{ingredientClassifications
								.filter((ing) => ing.class === 'may be non-vegetarian')
								.map((ingredient, index) => (
									<Text key={index} style={styles.mayBeNonVegIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* Vegetarian Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === 'vegetarian').length > 0 && (
					<View style={styles.vegetarianSection}>
						<Text style={styles.vegetarianTitle}>🥛 Vegetarian Ingredients:</Text>
						<View style={styles.vegetarianList}>
							{ingredientClassifications
								.filter((ing) => ing.class === 'vegetarian')
								.map((ingredient, index) => (
									<Text key={index} style={styles.vegetarianIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* Typically Vegetarian Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === 'typically vegetarian').length >
					0 && (
					<View style={styles.typicallyVegetarianSection}>
						<Text style={styles.typicallyVegetarianTitle}>
							🟡 Typically Vegetarian Ingredients:
						</Text>
						<Text style={styles.typicallyVegetarianSubtitle}>
							The following ingredients are typically vegetarian, but there are rare exceptions.
							Please double-check these ingredients.
						</Text>
						<View style={styles.typicallyVegetarianList}>
							{ingredientClassifications
								.filter((ing) => ing.class === 'typically vegetarian')
								.map((ingredient, index) => (
									<Text key={index} style={styles.typicallyVegetarianIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* Typically Vegan Ingredients */}
				{ingredientClassifications.filter((ing) => ing.class === 'typically vegan').length > 0 && (
					<View style={styles.typicallyVeganSection}>
						<Text style={styles.typicallyVeganTitle}>🟢 Typically Vegan Ingredients:</Text>
						<Text style={styles.typicallyVeganSubtitle}>
							The following ingredients are typically vegan, but in very rare instances these
							ingredients may be sourced from animal products. Please double-check these
							ingredients.
						</Text>
						<View style={styles.typicallyVeganList}>
							{ingredientClassifications
								.filter((ing) => ing.class === 'typically vegan')
								.map((ingredient, index) => (
									<Text key={index} style={styles.typicallyVeganIngredient}>
										• {ingredient.title}
									</Text>
								))}
						</View>
					</View>
				)}

				{/* Ingredients */}
				{currentProduct.ingredients.length > 0 && (
					<View style={styles.ingredientsSection}>
						<Text style={styles.sectionTitle}>All Ingredients:</Text>
						<View style={styles.ingredientsList}>
							{currentProduct.ingredients.map((ingredient, index) => (
								<Text key={index} style={styles.ingredient}>
									• {ingredient}
								</Text>
							))}
						</View>
					</View>
				)}

				{/* Report Issue Button */}
				<View style={styles.reportIssueSection}>
					<TouchableOpacity
						style={styles.reportIssueButton}
						onPress={showReportIssueAlert}
						disabled={processingReport}>
						<Text style={styles.reportIssueButtonText}>Report an issue with this product</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>

			{/* Processing Modal */}
			<Modal
				visible={showProcessingModal}
				transparent={true}
				animationType='fade'
				onRequestClose={() => {}} // Prevent dismissal
			>
				<View style={styles.processingModalOverlay}>
					<View style={styles.processingModalContent}>
						<ActivityIndicator size='large' color='#FF6B35' />
						<Text style={styles.processingModalTitle}>Processing</Text>
						<Text style={styles.processingModalSubtitle}>
							{reportType === 'image' && 'Uploading new image...'}
							{reportType === 'name' && 'Extracting product name and brand...'}
							{reportType === 'ingredients' && 'Analyzing ingredients...'}
						</Text>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'white',
	},
	scrollView: {
		flex: 1,
	},
	appHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
		paddingHorizontal: 16,
		backgroundColor: 'white',
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	appHeaderCentered: {
		justifyContent: 'center',
	},
	backButton: {
		paddingVertical: 8,
		paddingHorizontal: 12,
	},
	backButtonText: {
		fontSize: 16,
		color: '#007AFF',
		fontWeight: '500',
	},
	centerHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		flex: 1,
	},
	centerHeaderFullWidth: {
		flex: 1,
		justifyContent: 'center',
	},
	appTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		marginLeft: 8,
		color: '#333',
	},
	rightSpacer: {
		width: 60, // Same width as back button for centering
	},
	statusHeader: {
		padding: 20,
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusIconContainer: {
		marginBottom: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusIconText: {
		fontSize: 48,
	},
	unknownIconText: {
		fontSize: 60,
		color: 'white',
		fontWeight: 'bold',
	},
	statusText: {
		fontSize: 24,
		fontWeight: 'bold',
		color: 'white',
		textAlign: 'center',
	},
	productInfo: {
		padding: 20,
		alignItems: 'center',
	},
	productImage: {
		width: 150,
		height: 150,
		borderRadius: 8,
		marginBottom: 16,
	},
	productName: {
		fontSize: 22,
		fontWeight: 'bold',
		textAlign: 'center',
		marginBottom: 8,
	},
	productBrand: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		marginBottom: 8,
	},
	productBarcode: {
		fontSize: 12,
		color: '#999',
		textAlign: 'center',
		marginBottom: 16,
	},
	statusDescription: {
		fontSize: 16,
		textAlign: 'center',
		color: '#333',
		lineHeight: 22,
	},
	ingredientsSection: {
		padding: 20,
		borderTopWidth: 1,
		borderTopColor: '#eee',
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		marginBottom: 12,
	},
	ingredientsList: {
		paddingLeft: 8,
	},
	ingredient: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
		textTransform: 'capitalize',
	},
	analysisSection: {
		padding: 20,
		backgroundColor: '#fff5f5',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#F44336',
	},
	analysisSectionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#F44336',
		marginBottom: 8,
	},
	analysisSubtitle: {
		fontSize: 16,
		color: '#333',
		marginBottom: 12,
		fontWeight: '500',
	},
	analysisItemsList: {
		gap: 12,
	},
	analysisItem: {
		backgroundColor: 'white',
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#f0f0f0',
	},
	analysisIngredient: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	analysisReason: {
		fontSize: 14,
		color: '#666',
		marginBottom: 8,
		fontStyle: 'italic',
	},
	analysisLabels: {
		flexDirection: 'row',
		gap: 8,
	},
	analysisLabel: {
		fontSize: 12,
		color: 'white',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	classificationMethod: {
		fontSize: 12,
		color: '#999',
		marginTop: 12,
		fontStyle: 'italic',
		textAlign: 'center',
	},
	nonVegetarianSection: {
		padding: 20,
		backgroundColor: '#ffebee',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#F44336',
	},
	nonVegetarianTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#F44336',
		marginBottom: 12,
	},
	nonVegetarianList: {
		paddingLeft: 8,
	},
	nonVegetarianIngredient: {
		fontSize: 14,
		color: '#F44336',
		marginBottom: 4,
		fontWeight: '500',
	},
	unknownIngredientsSection: {
		padding: 20,
		backgroundColor: '#fff8e1',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#FF9800',
	},
	unknownSectionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#FF9800',
		marginBottom: 8,
	},
	unknownSubtitle: {
		fontSize: 14,
		color: '#333',
		marginBottom: 12,
		lineHeight: 20,
	},
	unknownIngredientsList: {
		paddingLeft: 8,
	},
	unknownIngredient: {
		fontSize: 14,
		color: '#FF9800',
		marginBottom: 4,
		fontWeight: '500',
	},
	mayBeNonVegSection: {
		padding: 20,
		backgroundColor: '#ffeaa7',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#fdcb6e',
	},
	mayBeNonVegTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#e17055',
		marginBottom: 8,
	},
	mayBeNonVegSubtitle: {
		fontSize: 14,
		color: '#333',
		marginBottom: 12,
		lineHeight: 20,
	},
	mayBeNonVegList: {
		paddingLeft: 8,
	},
	mayBeNonVegIngredient: {
		fontSize: 14,
		color: '#e17055',
		marginBottom: 4,
		fontWeight: '500',
	},
	vegetarianSection: {
		padding: 20,
		backgroundColor: '#fff9c4',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#FFC107',
	},
	vegetarianTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#F57C00',
		marginBottom: 12,
	},
	vegetarianList: {
		paddingLeft: 8,
	},
	vegetarianIngredient: {
		fontSize: 14,
		color: '#F57C00',
		marginBottom: 4,
		fontWeight: '500',
	},
	typicallyVegetarianSection: {
		padding: 20,
		backgroundColor: '#f8f9fa',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#6c757d',
	},
	typicallyVegetarianTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#6c757d',
		marginBottom: 8,
	},
	typicallyVegetarianSubtitle: {
		fontSize: 14,
		color: '#333',
		marginBottom: 12,
		lineHeight: 20,
	},
	typicallyVegetarianList: {
		paddingLeft: 8,
	},
	typicallyVegetarianIngredient: {
		fontSize: 14,
		color: '#6c757d',
		marginBottom: 4,
		fontWeight: '500',
	},
	typicallyVeganSection: {
		padding: 20,
		backgroundColor: '#f0f8f0',
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderLeftWidth: 4,
		borderLeftColor: '#4CAF50',
	},
	typicallyVeganTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#4CAF50',
		marginBottom: 8,
	},
	typicallyVeganSubtitle: {
		fontSize: 14,
		color: '#333',
		marginBottom: 12,
		lineHeight: 20,
	},
	typicallyVeganList: {
		paddingLeft: 8,
	},
	typicallyVeganIngredient: {
		fontSize: 14,
		color: '#4CAF50',
		marginBottom: 4,
		fontWeight: '500',
	},
	reportIssueSection: {
		paddingHorizontal: 16,
		paddingVertical: 20,
		alignItems: 'center',
	},
	reportIssueButton: {
		backgroundColor: '#f8f9fa',
		borderWidth: 1,
		borderColor: '#dee2e6',
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
		minWidth: 280,
		alignItems: 'center',
	},
	reportIssueButtonText: {
		fontSize: 16,
		color: '#495057',
		fontWeight: '500',
	},
	processingModalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	processingModalContent: {
		backgroundColor: 'white',
		borderRadius: 12,
		padding: 32,
		alignItems: 'center',
		minWidth: 200,
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	processingModalTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#333',
		marginTop: 16,
		marginBottom: 8,
	},
	processingModalSubtitle: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		lineHeight: 20,
	},
})
