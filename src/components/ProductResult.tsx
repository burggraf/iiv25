import React, { useCallback, useEffect, useState, useMemo } from 'react'
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
import { useRouter } from 'expo-router'

import { useApp } from '../context/AppContext'
import { ProductLookupService } from '../services/productLookupService'
import { supabase } from '../services/supabaseClient'
import { cacheService, CacheEventListener } from '../services/CacheService'
import { ProductImageUrlService } from '../services/productImageUrlService'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'
import { transformJobResultToProduct } from '../utils/jobResultTransform'
import { Product, VeganStatus } from '../types'
import Logo from './Logo'
import LogoWhite from './LogoWhite'
import TakePhotoButton from './TakePhotoButton'

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
	const router = useRouter()
	const { addToHistory } = useApp()
	const [currentProduct, setCurrentProduct] = useState<Product>(product)
	const { activeJobs, completedJobs } = useBackgroundJobs() // Listen to job completion directly
	
	// FORCE IMAGE REFRESH - Add timestamp when image URL changes to bust browser cache
	const resolvedImageUrl = useMemo(() => {
		if (!currentProduct.imageUrl) return undefined;
		
		const baseUrl = ProductImageUrlService.resolveImageUrl(currentProduct.imageUrl, currentProduct.barcode);
		if (!baseUrl) return undefined;
		
		// Add cache busting timestamp to force browser to reload image
		const timestamp = Date.now();
		const separator = baseUrl.includes('?') ? '&' : '?';
		const finalUrl = `${baseUrl}${separator}cache_bust=${timestamp}`;
		
		console.log(`📱 [ProductResult] FORCE REFRESH - Image URL:`, {
			barcode: currentProduct.barcode,
			originalUrl: currentProduct.imageUrl,
			baseUrl: baseUrl,
			finalUrl: finalUrl
		});
		
		return finalUrl;
	}, [currentProduct.imageUrl, currentProduct.barcode]);
	
	// Listen for completed background jobs for this product and update UI directly
	useEffect(() => {
		const relevantCompletedJob = completedJobs.find(job => 
			job.upc === currentProduct.barcode && 
			job.jobType === 'product_photo_upload' &&
			job.status === 'completed' &&
			job.resultData?.success
		);
		
		if (relevantCompletedJob) {
			console.log(`📱 [ProductResult] *** DIRECT JOB COMPLETION UPDATE ***`);
			console.log(`📱 [ProductResult] Found completed photo upload job for ${currentProduct.barcode}`);
			console.log(`📱 [ProductResult] Job result:`, relevantCompletedJob.resultData);
			
			// Transform job result to product and update UI directly
			transformJobResultToProduct(relevantCompletedJob).then(productFromJob => {
				if (productFromJob) {
					console.log(`📱 [ProductResult] ✅ Updating UI directly from completed job`);
					console.log(`📱 [ProductResult] New image URL: ${productFromJob.imageUrl}`);
					setCurrentProduct(productFromJob);
				}
			});
		}
	}, [completedJobs, currentProduct.barcode]);

	const [ingredientClassifications, setIngredientClassifications] = useState<
		IngredientClassification[]
	>([])

	// Fetch ingredient classifications from database
	const fetchIngredientClassifications = useCallback(async (barcode?: string) => {
		const targetBarcode = barcode || currentProduct.barcode;
		if (!targetBarcode) return;

		try {
			const { data, error } = await supabase.rpc('get_ingredients_for_upc', {
				input_upc: targetBarcode,
			});

			if (error) {
				console.error('Error fetching ingredient classifications:', error);
			} else {
				setIngredientClassifications(data || []);
			}
		} catch (err) {
			console.error('Exception fetching ingredient classifications:', err);
		}
	}, [currentProduct.barcode]);

	// TEMPORARILY DISABLED - Cache listener might be causing photo revert
	// useEffect(() => {
	// 	console.log(`📱 [ProductResult] Setting up cache listener for barcode: ${currentProduct.barcode}`);
	// 	
	// 	const cacheListener: CacheEventListener = {
	// 		onCacheUpdated: async (barcode: string, updatedProduct: Product) => {
	// 			console.log(`📱 [ProductResult] *** CACHE EVENT DEBUG ***`);
	// 			console.log(`📱 [ProductResult] Cache event received for barcode: ${barcode}, current product: ${currentProduct.barcode}`);
	// 			console.log(`📱 [ProductResult] Current product imageUrl: ${currentProduct.imageUrl}`);
	// 			console.log(`📱 [ProductResult] Updated product imageUrl: ${updatedProduct.imageUrl}`);
	// 			console.log(`📱 [ProductResult] URLs are same: ${currentProduct.imageUrl === updatedProduct.imageUrl}`);
	// 			console.log(`📱 [ProductResult] Event timestamp: ${new Date().toISOString()}`);
	// 			
	// 			if (barcode === currentProduct.barcode) {
	// 				console.log(`📱 [ProductResult] ✅ Cache updated for ${barcode}, refreshing UI with new product data`);
	// 				
	// 				// Always accept cache updates - let the background job system handle cache invalidation
	// 				
	// 				setCurrentProduct(updatedProduct);
	// 				
	// 				// DON'T notify parent component - this would cause a loop since parent might update cache again
	// 				// The cache update already originated from the system, no need to propagate it back
	// 				
	// 				// Refresh ingredient classifications for updated product
	// 				console.log(`📱 [ProductResult] Refreshing ingredient classifications`);
	// 				await fetchIngredientClassifications(updatedProduct.barcode);
	// 			} else {
	// 				console.log(`📱 [ProductResult] Cache event for different product (${barcode}), ignoring`);
	// 			}
	// 		}
	// 	};
	// 	
	// 	cacheService.addListener(cacheListener);
	// 	console.log(`📱 [ProductResult] Cache listener added for ${currentProduct.barcode}`);
	// 	
	// 	return () => {
	// 		console.log(`📱 [ProductResult] Removing cache listener for ${currentProduct.barcode}`);
	// 		cacheService.removeListener(cacheListener);
	// 	};
	// }, [currentProduct.barcode, onProductUpdated, fetchIngredientClassifications]);

	// Job completion is now handled via direct monitoring of completedJobs above
	// No need for separate event subscription to avoid duplicate handling

	useEffect(() => {
		fetchIngredientClassifications();
	}, [currentProduct.barcode, fetchIngredientClassifications]);

	const refreshProductData = async () => {
		if (!currentProduct.barcode) return

		// NOTE: This function is now primarily a fallback. 
		// ProductResult should ideally get updated data from job completion events
		// or cache events rather than making direct ProductLookupService calls
		console.log(`📱 [ProductResult] FALLBACK: refreshProductData called for ${currentProduct.barcode}`)

		try {
			const result = await ProductLookupService.lookupProductByBarcode(currentProduct.barcode, {
				context: 'ProductResult refresh (fallback)'
			})

			if (result.product) {
				setCurrentProduct(result.product)

				// Update unified cache with fresh product data
				await cacheService.setProduct(currentProduct.barcode, result.product)

				// Notify parent component of the update
				if (onProductUpdated) {
					onProductUpdated(result.product)
				}

				// Update the product in history as well (HistoryService will handle cache integration)
				await addToHistory(result.product)

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

	const handleTakePhoto = () => {
		router.push(`/report-issue/${currentProduct.barcode}/product`)
	}

	const showReportIssueAlert = () => {
		Alert.alert('Report an issue', 'What would you like to update?', [
			{
				text: 'Take photo of product',
				onPress: () => router.push(`/report-issue/${currentProduct.barcode}/product`),
			},
			{
				text: 'Take photo of ingredients',
				onPress: () => router.push(`/report-issue/${currentProduct.barcode}/ingredients`),
			},
			{
				text: 'Cancel',
				style: 'cancel',
			},
		])
	}



	const getVerdictColor = (verdict: string): string => {
		switch (verdict) {
			case 'vegan':
				return '#4CAF50' // Green
			case 'vegetarian':
				return '#FF9800' // Orange/Yellow
			case 'not_vegetarian':
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
			case 'not_vegetarian':
				return 'NOT VEGETARIAN'
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
			case VeganStatus.NOT_VEGETARIAN:
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
			case VeganStatus.NOT_VEGETARIAN:
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
			case VeganStatus.NOT_VEGETARIAN:
				return 'NOT VEGETARIAN'
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
			case VeganStatus.NOT_VEGETARIAN:
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
					{resolvedImageUrl ? (
						<Image source={{ uri: resolvedImageUrl }} style={styles.productImage} />
					) : (
						<TakePhotoButton 
							onPress={handleTakePhoto}
							style={styles.takePhotoImage}
						/>
					)}

					<Text style={styles.productName}>{currentProduct.name}</Text>

					{currentProduct.brand && <Text style={styles.productBrand}>{currentProduct.brand}</Text>}

					<Text style={styles.productBarcode}>UPC: {currentProduct.barcode}</Text>

					<Text style={styles.statusDescription}>
						{getStatusDescription(currentProduct.veganStatus)}
					</Text>
				</View>

				{/* Non-Vegetarian Ingredients Analysis */}
				{currentProduct.nonVeganIngredients && currentProduct.nonVeganIngredients.length > 0 && (
					<View style={styles.analysisSection}>
						<Text style={styles.analysisSectionTitle}>⚠️ Product Summary:</Text>
						<Text style={styles.analysisSubtitle}>
							{currentProduct.veganStatus === 'vegetarian'
								? 'Contains dairy or eggs but no meat:'
								: currentProduct.veganStatus === 'not_vegetarian'
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
						onPress={showReportIssueAlert}>
						<Text style={styles.reportIssueButtonText}>Report an issue with this product</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>

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
	takePhotoImage: {
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
})
