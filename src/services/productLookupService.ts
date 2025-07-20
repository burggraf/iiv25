import { OpenFoodFactsService } from './openFoodFactsApi'
import { SupabaseService } from './supabaseService'
import { supabase } from './supabaseClient'
import { Product, VeganStatus } from '../types'

export interface ProductLookupResult {
	product: Product | null
	error: string | null
	isRateLimited: boolean
	rateLimitInfo?: {
		rateLimit: number
		subscriptionLevel: string
	}
}

export interface ProductLookupOptions {
	context?: string // For logging context (e.g., "Scanner", "Manual Entry", "Test")
}

export class ProductLookupService {
	static async lookupProductByBarcode(
		barcode: string,
		options: ProductLookupOptions = {}
	): Promise<ProductLookupResult> {
		const context = options.context || 'Product Lookup'
		let finalProduct: Product | null = null
		let dataSource: string = ''
		let decisionLog: string[] = []

		try {
			console.log('='.repeat(80))
			console.log(`🔍 HYBRID PRODUCT LOOKUP (${context})`)
			console.log('='.repeat(80))
			console.log(`📊 Barcode: ${barcode}`)
			console.log('🏪 Step 1: Checking Supabase database...')

			// Step 1: Check our Supabase database first
			try {
				const supabaseResult = await SupabaseService.searchProductByBarcode(barcode)

				if (supabaseResult.isRateLimited) {
					console.log('⏰ Rate limit exceeded - returning error')
					decisionLog.push('⏰ Rate limit exceeded for database lookup')
					return {
						product: null,
						error: `Rate limit exceeded. You can search ${supabaseResult.rateLimitInfo?.rateLimit} products per hour on ${supabaseResult.rateLimitInfo?.subscriptionLevel} plan.`,
						isRateLimited: true,
						rateLimitInfo: supabaseResult.rateLimitInfo,
					}
				}

				if (supabaseResult.product) {
					console.log('✅ Found product in Supabase database')
					console.log(`📝 Product: ${supabaseResult.product.product_name}`)
					console.log(`🏷️ Classification: ${supabaseResult.product.classification}`)

					// Use the classification field
					const veganStatus = SupabaseService.getProductVeganStatus(supabaseResult.product)

					// Check if we have a valid classification
					if (veganStatus !== VeganStatus.UNKNOWN) {
						console.log(`🎯 Using database result: ${veganStatus}`)
						const classificationSource = `classification field "${supabaseResult.product.classification}"`
						decisionLog.push(`✅ Database hit: Using ${classificationSource} → ${veganStatus}`)

						// Create product from database data
						finalProduct = {
							id: supabaseResult.product.ean13 || barcode,
							barcode: barcode,
							name: supabaseResult.product.product_name || 'Unknown Product',
							brand: supabaseResult.product.brand || undefined,
							ingredients: supabaseResult.product.ingredients
								? supabaseResult.product.ingredients.split(',').map((i) => i.trim())
								: [],
							veganStatus: veganStatus,
							imageUrl: supabaseResult.product.imageurl || undefined,
							lastScanned: new Date(),
							classificationMethod: 'structured',
						}

						dataSource = 'supabase'

						// Check if we need to fetch image from OpenFoodFacts
						if (supabaseResult.product.imageurl) {
							console.log('✅ Using image from database')
							decisionLog.push('🖼️ Using existing image from database')
						} else {
							console.log('🖼️ No image in database - fetching from OpenFoodFacts...')
							try {
								const offProduct = await OpenFoodFactsService.getProductByBarcode(barcode)
								console.log('🌐 OpenFoodFacts image fetch result:', offProduct)
								if (offProduct?.imageUrl) {
									finalProduct.imageUrl = offProduct.imageUrl
									console.log('✅ Got product image from OpenFoodFacts')
									decisionLog.push('🖼️ Product image fetched from OpenFoodFacts')
									
									// Trigger async update to save image to database
									console.log('🔄 Database missing image - triggering async update...')
									// Fire and forget - don't await this
									ProductLookupService.updateProductImageAsync(barcode).catch((err) => {
										console.log('⚠️ Async image update failed (non-blocking):', err)
									})
									decisionLog.push('🔄 Triggered async database image update')
								} else {
									console.log('❌ No image available from OpenFoodFacts')
									decisionLog.push('❌ No image available from OpenFoodFacts')
								}
							} catch (imgErr) {
								console.log('⚠️ Failed to fetch image from OpenFoodFacts:', imgErr)
								decisionLog.push('⚠️ Failed to fetch image from OpenFoodFacts')
							}
						}
					} else {
						console.log(
							`❓ Database result has no valid classification - falling back to OpenFoodFacts`
						)
						console.log(`   Classification: "${supabaseResult.product.classification || 'none'}"`)
						decisionLog.push(
							`❓ Database result has no valid classification - falling back to OpenFoodFacts`
						)
					}
				} else {
					console.log('❌ Product not found in Supabase database')
					decisionLog.push('❌ Product not found in Supabase database')
				}
			} catch (supabaseErr) {
				console.log('⚠️ Supabase lookup error:', supabaseErr)
				decisionLog.push('⚠️ Supabase lookup error - falling back to OpenFoodFacts')
			}

			// Step 2: Fall back to OpenFoodFacts if no valid database result
			if (!finalProduct) {
				console.log('🌐 Step 2: Falling back to OpenFoodFacts API...')

				try {
					const productData = await OpenFoodFactsService.getProductByBarcode(barcode)

					if (productData) {
						console.log('✅ Found product in OpenFoodFacts')
						console.log(`📝 Product: ${productData.name}`)
						console.log(`🎯 Vegan Status: ${productData.veganStatus}`)

						// Store the OpenFoodFacts classification for comparison
						const originalClassification = productData.veganStatus
						
						finalProduct = productData
						dataSource = 'openfoodfacts'
						decisionLog.push(
							`✅ OpenFoodFacts hit: ${productData.veganStatus} (${productData.classificationMethod})`
						)

						// Check if product has valid ingredients to add to database
						if (productData.ingredients && productData.ingredients.length > 0) {
							console.log('🔄 Product has ingredients - triggering database creation...')
							decisionLog.push('🔄 Triggering database creation with ingredients')
							
							// Fire and forget - create product in database and get our classification
							ProductLookupService.createProductInDatabaseAsync(barcode, originalClassification, finalProduct).catch((err) => {
								console.log('⚠️ Async product creation failed (non-blocking):', err)
							})
						} else {
							console.log('⚠️ Product has no ingredients - skipping database creation')
							decisionLog.push('⚠️ Product has no ingredients - skipping database creation')
						}
					} else {
						console.log('❌ Product not found in OpenFoodFacts')
						decisionLog.push('❌ Product not found in OpenFoodFacts')
					}
				} catch (offErr) {
					console.log('⚠️ OpenFoodFacts lookup error:', offErr)
					decisionLog.push('⚠️ OpenFoodFacts lookup error')
				}
			}

			// Step 3: Process results
			console.log('='.repeat(40))
			console.log('📋 DECISION SUMMARY:')
			decisionLog.forEach((log, index) => {
				console.log(`${index + 1}. ${log}`)
			})
			console.log('='.repeat(40))

			if (finalProduct) {
				console.log(
					`🎉 Final Result: ${finalProduct.name} (${finalProduct.veganStatus}) from ${dataSource}`
				)
				console.log('='.repeat(80))

				return {
					product: finalProduct,
					error: null,
					isRateLimited: false,
				}
			} else {
				console.log('❌ No product data found from any source')
				console.log('='.repeat(80))
				return {
					product: null,
					error: `Product not found for barcode: ${barcode}`,
					isRateLimited: false,
				}
			}
		} catch (err) {
			console.log('='.repeat(80))
			console.log(`🚨 PRODUCT LOOKUP ERROR (${context})`)
			console.log('='.repeat(80))
			console.log(`📊 Barcode: ${barcode}`)
			console.log('❌ Error Details:')
			console.log(JSON.stringify(err, null, 2))
			console.log('='.repeat(80))

			console.error('Error looking up product:', err)
			return {
				product: null,
				error: 'Failed to lookup product. Please try again.',
				isRateLimited: false,
			}
		}
	}

	/**
	 * Asynchronously trigger the update-product-image-from-off edge function
	 * This is a fire-and-forget operation that doesn't block the main flow
	 */
	private static async updateProductImageAsync(barcode: string): Promise<void> {
		try {
			console.log(`🔄 Calling update-product-image-from-off for barcode: ${barcode}`)
			
			const { data, error } = await supabase.functions.invoke('update-product-image-from-off', {
				body: { upc: barcode }
			})
			
			if (error) {
				console.log(`⚠️ Edge function error for ${barcode}:`, error.message)
			} else {
				console.log(`✅ Edge function success for ${barcode}:`, data)
			}
		} catch (err) {
			console.log(`❌ Failed to call edge function for ${barcode}:`, err)
			// Don't throw - this is fire and forget
		}
	}

	/**
	 * Asynchronously create a product in the database from OpenFoodFacts data
	 * This will call the update-product-from-off edge function and potentially re-classify
	 */
	private static async createProductInDatabaseAsync(
		barcode: string, 
		originalClassification: VeganStatus,
		currentProduct: Product
	): Promise<void> {
		try {
			console.log(`🔄 Creating product in database for barcode: ${barcode}`)
			console.log(`📊 Original OpenFoodFacts classification: ${originalClassification}`)
			
			const { data, error } = await supabase.functions.invoke('update-product-from-off', {
				body: { upc: barcode }
			})
			
			if (error) {
				console.log(`⚠️ Product creation edge function error for ${barcode}:`, error.message)
				return
			} 

			console.log(`✅ Product creation response for ${barcode}:`, data)

			// Check if classification changed
			if (data && data.success && data.classificationResult) {
				const newClassification = ProductLookupService.mapDatabaseClassificationToVeganStatus(data.classificationResult)
				console.log(`🔍 Database classification: ${data.classificationResult} → ${newClassification}`)
				
				if (newClassification !== originalClassification) {
					console.log(`🔄 Classification changed from ${originalClassification} to ${newClassification}`)
					console.log(`📢 NOTE: Updated classification available - would need UI refresh to show new result`)
					
					// The user could potentially trigger a re-fetch here by calling:
					// ProductLookupService.lookupProductByBarcode(barcode) again
					// But since this is async, we don't update the current UI state
					
					// Optionally, emit an event or call a callback to notify the UI
					// For now, just log that the updated data is available in database
					console.log(`📊 Next scan of ${barcode} will show: ${newClassification}`)
				} else {
					console.log(`✅ Classification unchanged: ${originalClassification}`)
				}
			}
		} catch (err) {
			console.log(`❌ Failed to create product in database for ${barcode}:`, err)
			// Don't throw - this is fire and forget
		}
	}

	/**
	 * Map database classification strings to VeganStatus enum
	 */
	private static mapDatabaseClassificationToVeganStatus(classification: string): VeganStatus {
		switch (classification?.toLowerCase()) {
			case 'vegan':
				return VeganStatus.VEGAN
			case 'vegetarian':
				return VeganStatus.VEGETARIAN
			case 'non-vegetarian':
				return VeganStatus.NOT_VEGAN
			case 'undetermined':
			default:
				return VeganStatus.UNKNOWN
		}
	}
}