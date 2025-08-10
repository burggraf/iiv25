import { OpenFoodFactsService } from './openFoodFactsApi'
import { SupabaseService } from './supabaseService'
import { supabase } from './supabaseClient'
import { Product, VeganStatus } from '../types'
import { ProductImageUrlService } from './productImageUrlService'

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

// Request deduplication to prevent multiple simultaneous lookups for the same barcode
interface PendingRequest {
	promise: Promise<ProductLookupResult>
	timestamp: number
	contexts: string[]
}

export class ProductLookupService {
	private static pendingRequests = new Map<string, PendingRequest>()
	private static readonly DEDUP_WINDOW_MS = 30000 // 30 seconds deduplication window (extended for debugging)
	private static lastCleanup = 0
	private static readonly CLEANUP_INTERVAL_MS = 60000 // Clean up every 60 seconds
	
	// Call tracking for debugging (tracks all calls for each barcode)
	private static callHistory = new Map<string, {context: string, timestamp: number, wasDeduped: boolean}[]>()
	private static readonly CALL_HISTORY_LIMIT = 50 // Keep last 50 calls per barcode
	
	static async lookupProductByBarcode(
		barcode: string,
		options: ProductLookupOptions = {}
	): Promise<ProductLookupResult> {
		const context = options.context || 'Product Lookup'
		const now = Date.now()
		
		// Track this call for debugging
		this.trackCall(barcode, context, now, false)
		
		// Check for existing pending request for the same barcode
		const existingRequest = this.pendingRequests.get(barcode)
		if (existingRequest) {
			const age = now - existingRequest.timestamp
			if (age < this.DEDUP_WINDOW_MS) {
				console.log(`🔄 [ProductLookup] DEDUPLICATION: Request for ${barcode} already in progress (${Math.round(age)}ms ago)`)
				console.log(`🔄 [ProductLookup] Original contexts: [${existingRequest.contexts.join(', ')}]`)
				console.log(`🔄 [ProductLookup] Current context: [${context}]`)
				console.log(`🔄 [ProductLookup] Returning existing promise instead of making new request`)
				
				// Update call tracking to mark this as deduped
				this.trackCall(barcode, context, now, true)
				
				// Add current context to the existing request for tracking
				if (!existingRequest.contexts.includes(context)) {
					existingRequest.contexts.push(context)
				}
				
				return existingRequest.promise
			} else {
				// Request is too old, remove it and proceed with new request
				console.log(`🔄 [ProductLookup] Removing stale request for ${barcode} (${Math.round(age)}ms old)`)
				this.pendingRequests.delete(barcode)
			}
		}
		
		// Periodic cleanup of stale requests to prevent memory leaks
		this.cleanupStaleRequests()
		
		// Create new request
		console.log(`🔄 [ProductLookup] Creating new request for ${barcode} with context: [${context}]`)
		const promise = this.performLookup(barcode, context)
		
		// Store the pending request for deduplication
		this.pendingRequests.set(barcode, {
			promise,
			timestamp: Date.now(),
			contexts: [context]
		})
		
		// Clean up the request when it completes (success or failure)
		promise.finally(() => {
			const request = this.pendingRequests.get(barcode)
			if (request && request.timestamp === this.pendingRequests.get(barcode)?.timestamp) {
				console.log(`🔄 [ProductLookup] Cleaning up completed request for ${barcode}`)
				console.log(`🔄 [ProductLookup] Final contexts served: [${request.contexts.join(', ')}]`)
				this.pendingRequests.delete(barcode)
			}
		})
		
		return promise
	}
	
	private static cleanupStaleRequests(): void {
		const now = Date.now()
		if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
			return // Don't clean up too frequently
		}
		
		let cleanedCount = 0
		const cutoffTime = now - (this.DEDUP_WINDOW_MS * 2) // Clean up requests older than 2x the dedup window
		
		for (const [barcode, request] of this.pendingRequests.entries()) {
			if (request.timestamp < cutoffTime) {
				this.pendingRequests.delete(barcode)
				cleanedCount++
			}
		}
		
		if (cleanedCount > 0) {
			console.log(`🧹 [ProductLookup] Cleaned up ${cleanedCount} stale pending requests`)
		}
		
		this.lastCleanup = now
	}
	
	/**
	 * Track a call for debugging purposes
	 */
	private static trackCall(barcode: string, context: string, timestamp: number, wasDeduped: boolean): void {
		if (!this.callHistory.has(barcode)) {
			this.callHistory.set(barcode, [])
		}
		
		const history = this.callHistory.get(barcode)!
		history.push({ context, timestamp, wasDeduped })
		
		// Keep only the last N calls per barcode
		if (history.length > this.CALL_HISTORY_LIMIT) {
			history.splice(0, history.length - this.CALL_HISTORY_LIMIT)
		}
	}
	
	/**
	 * Get call history for a specific barcode (for debugging)
	 */
	static getCallHistory(barcode: string): {context: string, timestamp: number, wasDeduped: boolean, timeFromStart: number}[] {
		const history = this.callHistory.get(barcode) || []
		if (history.length === 0) return []
		
		const startTime = history[0].timestamp
		return history.map(call => ({
			...call,
			timeFromStart: call.timestamp - startTime
		}))
	}
	
	/**
	 * Get summary statistics for a barcode (for debugging)
	 */
	static getCallSummary(barcode: string): {
		totalCalls: number;
		actualLookups: number;
		dedupedCalls: number;
		dedupRate: number;
		timeSpan: number;
		contexts: string[];
	} {
		const history = this.callHistory.get(barcode) || []
		if (history.length === 0) {
			return {
				totalCalls: 0,
				actualLookups: 0,
				dedupedCalls: 0,
				dedupRate: 0,
				timeSpan: 0,
				contexts: []
			}
		}
		
		const totalCalls = history.length
		const dedupedCalls = history.filter(call => call.wasDeduped).length
		const actualLookups = totalCalls - dedupedCalls
		const dedupRate = totalCalls > 0 ? (dedupedCalls / totalCalls) * 100 : 0
		const timeSpan = history[history.length - 1].timestamp - history[0].timestamp
		const contexts = [...new Set(history.map(call => call.context))]
		
		return {
			totalCalls,
			actualLookups,
			dedupedCalls,
			dedupRate,
			timeSpan,
			contexts
		}
	}
	
	/**
	 * Get current deduplication statistics (for debugging)
	 */
	static getDeduplicationStats(): {
		pendingRequestsCount: number;
		pendingBarcodes: string[];
		oldestRequestAge: number;
	} {
		const now = Date.now()
		let oldestAge = 0
		
		for (const request of this.pendingRequests.values()) {
			const age = now - request.timestamp
			if (age > oldestAge) {
				oldestAge = age
			}
		}
		
		return {
			pendingRequestsCount: this.pendingRequests.size,
			pendingBarcodes: Array.from(this.pendingRequests.keys()),
			oldestRequestAge: oldestAge
		}
	}
	
	private static async performLookup(barcode: string, context: string): Promise<ProductLookupResult> {
		let finalProduct: Product | null = null
		let dataSource: string = ''
		let decisionLog: string[] = []

		try {
			console.log('='.repeat(80))
			console.log(`🔍 HYBRID PRODUCT LOOKUP (${context})`)
			console.log('='.repeat(80))
			console.log(`📊 Barcode: ${barcode}`)
			console.log(`⏰ Timestamp: ${new Date().toISOString()}`)
			console.log(`🔢 Current pending requests: ${this.pendingRequests.size}`)
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

					// Always use database product if found, regardless of classification status
					console.log(`🎯 Using database result: ${veganStatus}`)
					const classificationSource = `classification field "${supabaseResult.product.classification}"`
					decisionLog.push(`✅ Database hit: Using ${classificationSource} → ${veganStatus}`)

					// Create product from database data
					finalProduct = {
						id: barcode, // Use the actual scanned/entered barcode
						barcode: barcode,
						name: supabaseResult.product.product_name || 'Unknown Product',
						brand: supabaseResult.product.brand || undefined,
						ingredients: supabaseResult.product.ingredients
							? supabaseResult.product.ingredients.split(',').map((i) => i.trim())
							: [],
						veganStatus: veganStatus,
						imageUrl: ProductImageUrlService.resolveImageUrl(supabaseResult.product.imageurl, barcode) || undefined,
						issues: supabaseResult.product.issues || undefined,
						lastScanned: new Date(),
						classificationMethod: 'structured',
					}

					dataSource = 'supabase'

					// Special handling for "undetermined" classification - check if we already have ingredients
					if (supabaseResult.product.classification === 'undetermined' && veganStatus === VeganStatus.UNKNOWN) {
						console.log('🔍 Product has "undetermined" classification - checking if ingredients exist...')
						
						// If we already have ingredients from the database result, don't offer ingredient scanning
						if (supabaseResult.product.ingredients && supabaseResult.product.ingredients.trim() !== '') {
							console.log('✅ Product already has ingredients on file - keeping as UNKNOWN without scan option')
							console.log(`   Ingredients: ${supabaseResult.product.ingredients}`)
							decisionLog.push('📝 Product has undetermined classification but ingredients exist - no scan needed')
							
							// Keep as UNKNOWN but the UI will know not to show scan button since ingredients exist
							// The ingredients array will be populated, indicating no scan is needed
						} else {
							console.log('❌ No ingredients found - scan option will be available')
							decisionLog.push('Product has undetermined classification and no ingredients - scan option available')
						}
					}

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
								finalProduct.imageUrl = ProductImageUrlService.resolveImageUrl(offProduct.imageUrl, barcode) || undefined
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
					console.log('Product not found in Supabase database')
					decisionLog.push('Product not found in Supabase database')
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

						// Always create product in database when found in OpenFoodFacts
						console.log('🔄 Product found in OpenFoodFacts - triggering database creation...')
						
						if (productData.ingredients && productData.ingredients.length > 0) {
							console.log('✅ Product has ingredients - creating with classification')
							decisionLog.push('🔄 Triggering database creation with ingredients')
							
							// Fire and forget - create product in database and get our classification
							ProductLookupService.createProductInDatabaseAsync(barcode, originalClassification, finalProduct).catch((err) => {
								console.log('⚠️ Async product creation failed (non-blocking):', err)
							})
						} else {
							console.log('Product has no ingredients - creating basic record for future ingredient scanning')
							decisionLog.push('🔄 Creating database record without ingredients - ready for user ingredient scan')
							
							// Fire and forget - create basic product record using update-product-from-off edge function
							ProductLookupService.createProductFromOFFAsync(barcode).catch((err) => {
								console.log('⚠️ Async OpenFoodFacts product creation failed (non-blocking):', err)
							})
						}
					} else {
						console.log('Product not found in OpenFoodFacts')
						decisionLog.push('Product not found in OpenFoodFacts')
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
				
				// Log call summary for this barcode
				const summary = this.getCallSummary(barcode)
				console.log(`📊 Call Summary for ${barcode}:`)
				console.log(`   Total calls: ${summary.totalCalls} | Actual lookups: ${summary.actualLookups} | Deduped: ${summary.dedupedCalls} (${summary.dedupRate.toFixed(1)}%)`)
				console.log(`   Time span: ${Math.round(summary.timeSpan)}ms | Contexts: [${summary.contexts.join(', ')}]`)
				console.log('='.repeat(80))

				return {
					product: finalProduct,
					error: null,
					isRateLimited: false,
				}
			} else {
				console.log('❌ No product data found from any source')
				
				// Log call summary for this barcode even on failure
				const summary = this.getCallSummary(barcode)
				console.log(`📊 Call Summary for ${barcode}:`)
				console.log(`   Total calls: ${summary.totalCalls} | Actual lookups: ${summary.actualLookups} | Deduped: ${summary.dedupedCalls} (${summary.dedupRate.toFixed(1)}%)`)
				console.log(`   Time span: ${Math.round(summary.timeSpan)}ms | Contexts: [${summary.contexts.join(', ')}]`)
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
	 * Asynchronously create a basic product record from OpenFoodFacts data
	 * Used when product exists in OpenFoodFacts but has no ingredients
	 */
	private static async createProductFromOFFAsync(barcode: string): Promise<void> {
		try {
			console.log(`🔄 Creating basic product record from OpenFoodFacts for barcode: ${barcode}`)
			
			const { data, error } = await supabase.functions.invoke('update-product-from-off', {
				body: { upc: barcode }
			})
			
			if (error) {
				console.log(`⚠️ Product creation from OFF edge function error for ${barcode}:`, error.message)
				return
			} 
			
			console.log(`✅ Basic product record created from OpenFoodFacts for ${barcode}:`, data)
			
			if (data && data.success) {
				console.log(`📋 Product record created - ready for ingredient scanning`)
				console.log(`📊 Next scan of ${barcode} will load from database`)
			}
		} catch (err) {
			console.log(`❌ Failed to create basic product record from OpenFoodFacts for ${barcode}:`, err)
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
				return VeganStatus.NOT_VEGETARIAN
			case 'undetermined':
			default:
				return VeganStatus.UNKNOWN
		}
	}
}