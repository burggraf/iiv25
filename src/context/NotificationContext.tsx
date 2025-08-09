import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { BackgroundJob } from '../types/backgroundJobs'
import { Product } from '../types'
import { ProductLookupService } from '../services/productLookupService'
import JobCompletionCard from '../components/JobCompletionCard'
import { transformJobResultToProduct } from '../utils/jobResultTransform'
import { jobEventManager } from '../services/JobEventManager'

export interface JobNotification {
	id: string
	job: BackgroundJob
	product: Product | null
	message: string
	type: 'success' | 'error'
	timestamp: Date
}

interface NotificationContextType {
	notifications: JobNotification[]
	dismissNotification: (id: string) => void
	clearAllNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
	const context = useContext(NotificationContext)
	if (context === undefined) {
		throw new Error('useNotifications must be used within a NotificationProvider')
	}
	return context
}

interface NotificationProviderProps {
	children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
	const [notifications, setNotifications] = useState<JobNotification[]>([])
	const [pendingJobResults, setPendingJobResults] = useState<Map<string, { job: BackgroundJob; product: Product | null }>>(new Map())
	const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set())
	const [handledConfidenceErrors, setHandledConfidenceErrors] = useState<Set<string>>(new Set())
	
	// Helper function to detect errors for each job type
	const hasJobErrors = (job: BackgroundJob): { hasError: boolean; errorType: 'photo_upload' | 'ingredient_scan' | 'product_creation' | null } => {
		// If job status is failed, this is definitely an error (handles timeouts, etc.)
		if (job.status === 'failed') {
			let errorType: 'photo_upload' | 'ingredient_scan' | 'product_creation';
			switch (job.jobType) {
				case 'product_photo_upload':
					errorType = 'photo_upload';
					break;
				case 'ingredient_parsing':
					errorType = 'ingredient_scan';
					break;
				case 'product_creation':
					errorType = 'product_creation';
					break;
				default:
					return { hasError: true, errorType: null };
			}
			return { hasError: true, errorType };
		}

		// For completed jobs, check for specific error conditions
		switch (job.jobType) {
			case 'product_photo_upload':
				return { 
					hasError: !job.resultData?.success || !!job.resultData?.error || job.resultData?.uploadFailed,
					errorType: 'photo_upload'
				};
			case 'ingredient_parsing':
				return { 
					hasError: job.resultData?.error && job.resultData.error.includes('photo quality too low'),
					errorType: 'ingredient_scan'
				};
			case 'product_creation':
				// Check for confidence errors in product creation (like title scan failures)
				const hasConfidenceError = job.resultData?.error === 'Product title scan failed.';
				
				// For product creation, only consider it an error if the product wasn't actually created
				// Even if resultData has success: false or error, if the product exists in DB, creation succeeded
				const hasResultError = !job.resultData?.success || !!job.resultData?.error;
				const productWasCreated = job.resultData?.productData || job.resultData?.product;
				
				// Mark as error if confidence failed OR (result error AND no product created)
				const actualError = hasConfidenceError || (hasResultError && !productWasCreated);
				
				return { 
					hasError: actualError,
					errorType: actualError ? 'product_creation' : null
				};
			default:
				return { hasError: false, errorType: null };
		}
	};
	
	// Interface for WorkflowState
	interface WorkflowState {
		type: 'add_new_product' | 'individual_action' | 'report_product_issue';
		completedJobs: Set<string>;
		failedJobs: Set<string>;
		errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>;
		totalSteps: number;
		latestProduct: Product | null;
		notificationShown: boolean; // Prevent duplicate completion notifications
	}
	
	// Track workflow completion states
	const [workflowStates, setWorkflowStates] = useState<Map<string, WorkflowState>>(new Map())
	
	// Helper function to handle workflow job completion
	const handleWorkflowJobCompleted = async (job: BackgroundJob) => {
		console.log(`🔔 [Notification] *** WORKFLOW JOB COMPLETION EVENT RECEIVED ***`)
		console.log(`🔔 [Notification] Job details: ${job.id?.slice(-6)}, type: ${job.jobType}, workflowType: ${job.workflowType}`)
		
		if (!job.workflowId || !job.workflowType || !job.workflowSteps) {
			console.log(`🔔 [Notification] ❌ Missing workflow metadata - skipping workflow processing`)
			console.log(`🔔 [Notification] workflowId: ${!!job.workflowId}, workflowType: ${!!job.workflowType}, workflowSteps: ${!!job.workflowSteps}`)
			return
		}
		
		console.log(`🔔 [Notification] ✅ Valid workflow job - processing: ${job.workflowId.slice(-6)} - ${job.jobType} (${job.workflowSteps.current}/${job.workflowSteps.total})`)
		
		// Update workflow state
		setWorkflowStates(prev => {
			const current = prev.get(job.workflowId!) || {
				type: job.workflowType!,
				completedJobs: new Set(),
				failedJobs: new Set(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: job.workflowSteps!.total,
				latestProduct: null,
				notificationShown: false
			}
			
			current.completedJobs.add(job.id)
			
			// Check for errors and track error types
			const { hasError, errorType } = hasJobErrors(job)
			console.log(`🔔 [Notification] ERROR DETECTION DEBUG for job ${job.id.slice(-6)} (${job.jobType}):`)
			console.log(`  - job.resultData?.success: ${job.resultData?.success}`)
			console.log(`  - job.resultData?.error: ${job.resultData?.error}`)
			console.log(`  - hasError: ${hasError}`)
			console.log(`  - errorType: ${errorType}`)
			
			if (hasError && errorType) {
				current.errorTypes.add(errorType)
				current.failedJobs.add(job.id)
				console.log(`🔔 [Notification] ✅ ADDED ERROR TYPE: ${errorType} for job ${job.id.slice(-6)} in workflow ${job.workflowId!.slice(-6)}`)
			} else {
				console.log(`🔔 [Notification] ✅ NO ERROR: Job ${job.id.slice(-6)} (${job.jobType}) completed successfully`)
			}
			
			// Get the latest product data for this workflow
			const getLatestProduct = async () => {
				try {
					// For photo upload jobs, add a delay to ensure the image is fully processed
					if (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation') {
						await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
					}

					let product: Product | null = null
					if (job.upc) {
						console.log(`🔔 [Notification] Getting product data for workflow ${job.workflowId!.slice(-6)}`)
						
						// Skip transformation for ingredient_parsing jobs since they don't contain full product data
						if (job.jobType === 'ingredient_parsing') {
							const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
								context: 'Workflow JobNotification (ingredient parsing)' 
							})
							product = result.product || null
						} else {
							// Try to transform job result data for other job types
							product = await transformJobResultToProduct(job)
							
							if (product) {
								console.log(`🔔 [Notification] Successfully used job result data for workflow`)
							} else {
								// Fallback to fresh lookup if job result transformation failed
								const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
									context: 'Workflow JobNotification (fallback)' 
								})
								product = result.product || null
							}
						}
						
						// For photo-related jobs, ensure we have fresh image URL with cache busting
						if (product && (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation')) {
							console.log(`🔔 [Notification] Adding cache-busting to image for workflow ${job.jobType}: ${product.imageUrl}`)
							
							// Add timestamp to force fresh image load
							if (product.imageUrl && product.imageUrl.includes('[SUPABASE]')) {
								product.imageUrl = `[SUPABASE]?t=${Date.now()}`
							} else if (product.imageUrl && product.imageUrl.includes('supabase.co')) {
								// Add timestamp parameter to existing URL
								const separator = product.imageUrl.includes('?') ? '&' : '?'
								product.imageUrl = `${product.imageUrl}${separator}t=${Date.now()}`
							}
						}
					}
					
					return product
				} catch (error) {
					console.error('Error getting product for workflow:', error)
					return null
				}
			}
			
			// Get product data and update workflow state
			getLatestProduct().then(async (product) => {
				current.latestProduct = product || current.latestProduct
				
				// Check if workflow is complete
				const isComplete = current.completedJobs.size >= current.totalSteps
				const hasErrors = current.errorTypes.size > 0
				
				console.log(`🔔 [Notification] Workflow ${job.workflowId!.slice(-6)} status: ${current.completedJobs.size}/${current.totalSteps} completed, ${current.errorTypes.size} error types: [${Array.from(current.errorTypes).join(', ')}]`)
				
				if ((isComplete || hasErrors) && !current.notificationShown) {
					// Mark notification as shown to prevent duplicates
					current.notificationShown = true
					// Show single workflow notification
					const notificationId = `notification_workflow_${job.workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
					const notification: JobNotification = {
						id: notificationId,
						job: { ...job, id: `workflow_${job.workflowId}` }, // Use workflow ID for the notification job
						product: current.latestProduct,
						message: getWorkflowMessage(current.type, current.errorTypes),
						type: hasErrors ? 'error' : 'success',
						timestamp: new Date(),
					}

					// Show notification if app is in foreground
					if (AppState.currentState === 'active') {
						setNotifications(prev => [notification, ...prev.slice(0, 4)])
					} else {
						setPendingJobResults(prev => new Map(prev).set(`workflow_${job.workflowId}`, { job, product: current.latestProduct }))
					}
					
					// CRITICAL: Update history for completed workflows
					// Since we've disabled individual job processing for workflow jobs in useBackgroundJobs,
					// we need to handle history updates here when workflows complete
					// Add to history if product was successfully created, even if other steps failed
					const productCreationSucceeded = !current.errorTypes.has('product_creation')
					
					console.log(`🔔 [Notification] HISTORY UPDATE DEBUG:`)
					console.log(`  - productCreationSucceeded: ${productCreationSucceeded}`)
					console.log(`  - current.latestProduct exists: ${!!current.latestProduct}`)
					console.log(`  - current.latestProduct barcode: ${current.latestProduct?.barcode || 'N/A'}`)
					console.log(`  - current.type: ${current.type}`)
					console.log(`  - hasErrors: ${hasErrors}`)
					console.log(`  - errorTypes: [${Array.from(current.errorTypes).join(', ')}]`)
					
					// Update history for all workflow types
					if (current.latestProduct) {
						// For add_new_product workflows, only add to history if product creation succeeded
						// For individual_action and report_product_issue workflows, add to history if the workflow completed (regardless of minor errors)
						const shouldAddToHistory = current.type === 'add_new_product' 
							? productCreationSucceeded 
							: true; // individual_action and report_product_issue workflows should always update history when they have a product
						
						if (shouldAddToHistory) {
							const statusMessage = hasErrors ? 'with some errors' : 'successfully'
							console.log(`🔔 [Notification] ✅ ADDING TO HISTORY: ${current.type} workflow ${job.workflowId!.slice(-6)} completed ${statusMessage} - updating history with product ${current.latestProduct.barcode}`)
							try {
								// Import historyService dynamically to avoid circular dependencies
								const { historyService } = await import('../services/HistoryService')
								await historyService.addToHistory(current.latestProduct, true, true)
								console.log(`✅ [Notification] Successfully updated history for ${current.type} workflow: ${current.latestProduct.barcode}`)
							} catch (error) {
								console.error(`❌ [Notification] Error updating history for ${current.type} workflow:`, error)
							}
						} else {
							console.log(`🔔 [Notification] ❌ NOT ADDING TO HISTORY for ${current.type} workflow: product creation failed`)
						}
					} else {
						console.log(`🔔 [Notification] ❌ NOT ADDING TO HISTORY: No latestProduct available`)
					}
					
					// Clean up completed workflow
					setWorkflowStates(prev => {
						const updated = new Map(prev)
						updated.delete(job.workflowId!)
						return updated
					})
				} else {
					// Update the workflow state with the new data
					setWorkflowStates(prev => new Map(prev).set(job.workflowId!, current))
				}
			})
			
			return new Map(prev).set(job.workflowId!, current)
		})
	}
	
	// Helper function to handle workflow job failure
	const handleWorkflowJobFailed = (job: BackgroundJob) => {
		if (!job.workflowId || !job.workflowType) return
		
		console.log(`🔔 [Notification] Workflow job failed: ${job.workflowId.slice(-6)} - ${job.jobType}`)
		
		setProcessedJobIds(prev => new Set(prev).add(job.id))
		
		// Update workflow state with failure
		setWorkflowStates(prev => {
			const current = prev.get(job.workflowId!) || {
				type: job.workflowType!,
				completedJobs: new Set(),
				failedJobs: new Set(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: job.workflowSteps?.total || 1,
				latestProduct: null,
				notificationShown: false
			}
			
			current.failedJobs.add(job.id)
			
			// Detect error type for job failure and add to error types
			const { errorType } = hasJobErrors(job)
			if (errorType) {
				current.errorTypes.add(errorType)
				console.log(`🔔 [Notification] Added ${errorType} error type for failed job ${job.id.slice(-6)}`)
			} else {
				// Fallback: determine error type based on job type
				switch (job.jobType) {
					case 'product_photo_upload':
						current.errorTypes.add('photo_upload')
						break
					case 'ingredient_parsing':
						current.errorTypes.add('ingredient_scan')
						break
					case 'product_creation':
						current.errorTypes.add('product_creation')
						break
				}
			}
			
			// Don't show immediate failure notifications for workflows
			// Let the workflow completion handler show the final notification with proper priority-based messaging
			console.log(`🔔 [Notification] Job ${job.id.slice(-6)} failed, will show notification when workflow completes`)
			
			return new Map(prev).set(job.workflowId!, current)
		})
	}
	
	// Helper function to handle individual job completion (original behavior)
	const handleIndividualJobCompleted = async (job: BackgroundJob) => {
		// CRITICAL: Never show individual notifications for workflow jobs
		// This prevents duplicate notifications when both workflow and individual handlers are triggered
		if (isWorkflowJob(job)) {
			console.log(`🔔 [Notification] Skipping individual job completion notification for workflow job: ${job.id.slice(-6)} (workflow: ${job.workflowId?.slice(-6)})`)
			return
		}
		
		try {
			// For photo upload jobs, add a delay to ensure the image is fully processed
			if (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation') {
				await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
			}

			// Try to use job result data to avoid redundant lookup
			let product: Product | null = null
			if (job.upc) {
				console.log(`🔔 [Notification] Attempting to use job result data for ${job.jobType} - avoiding redundant lookup`)
				
				// Handle ingredient_parsing jobs - check for confidence validation errors
				if (job.jobType === 'ingredient_parsing') {
					console.log(`🔔 [Notification] DEBUG: Ingredient parsing job ${job.id.slice(-6)}`)
					console.log(`🔔 [Notification] DEBUG: job.resultData exists: ${!!job.resultData}`)
					console.log(`🔔 [Notification] DEBUG: job.resultData.error: ${job.resultData?.error}`)
					
					// Check if the job result contains a confidence validation error
					if (job.resultData?.error && job.resultData.error.includes('photo quality too low')) {
						console.log(`🔔 [Notification] *** CONFIDENCE ERROR DETECTED *** Ingredient parsing job failed with confidence error: ${job.resultData.error}`)
						
						// Prevent duplicate error notifications for same job
						if (handledConfidenceErrors.has(job.id)) {
							console.log(`🔔 [Notification] *** ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
							return
						}
						
						setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
						
						// Get product data for error notification to show product info in the card
						let errorProduct: Product | null = null
						try {
							const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
								context: 'Individual JobNotification (confidence error)' 
							})
							errorProduct = result.product || null
							console.log(`🔔 [Notification] Got product data for confidence error notification: ${errorProduct?.name || 'No product found'}`)
						} catch (error) {
							console.log(`🔔 [Notification] Could not fetch product for confidence error notification: ${error}`)
						}
						
						// Show error notification with product information
						const errorNotification: JobNotification = {
							id: `confidence_error_${job.id}`,
							job: job,
							product: errorProduct,
							type: 'error',
							message: `⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.`,
							timestamp: new Date()
						}
						console.log(`🔔 [Notification] *** SHOWING ERROR NOTIFICATION WITH PRODUCT INFO ***`)
						setNotifications(prev => [errorNotification, ...prev.slice(0, 4)])
						return // Exit early, don't show success notification
					} else {
						console.log(`🔔 [Notification] *** NO CONFIDENCE ERROR - PROCEEDING WITH SUCCESS LOGIC ***`)
					}
					
					console.log(`🔔 [Notification] Skipping transformation for ingredient_parsing job - getting product from database`)
					const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
						context: 'Individual JobNotification (ingredient parsing)' 
					})
					product = result.product || null
				} else if (job.jobType === 'product_creation') {
					console.log(`🔔 [Notification] DEBUG: Product creation job ${job.id.slice(-6)}`)
					console.log(`🔔 [Notification] DEBUG: job.resultData exists: ${!!job.resultData}`)
					console.log(`🔔 [Notification] DEBUG: job.resultData.error: ${job.resultData?.error}`)
					
					// Check if the job result contains a confidence validation error
					if (job.resultData?.error === 'Product title scan failed.') {
						console.log(`🔔 [Notification] *** CONFIDENCE ERROR DETECTED *** Product creation job failed with confidence error: ${job.resultData.error}`)
						
						// Prevent duplicate error notifications for same job
						if (handledConfidenceErrors.has(job.id)) {
							console.log(`🔔 [Notification] *** ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
							return
						}
						
						setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
						
						// Show error notification without product lookup since creation failed
						const errorNotification: JobNotification = {
							id: `confidence_error_${job.id}`,
							job: job,
							product: null, // No product since creation failed
							type: 'error',
							message: `⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.`,
							timestamp: new Date()
						}
						console.log(`🔔 [Notification] *** SHOWING ERROR NOTIFICATION FOR PRODUCT CREATION ***`)
						setNotifications(prev => [errorNotification, ...prev.slice(0, 4)])
						return // Exit early, don't show success notification
					} else {
						console.log(`🔔 [Notification] *** NO CONFIDENCE ERROR - PROCEEDING WITH SUCCESS LOGIC ***`)
					}
					
					// For successful product creation, use the product from result data or lookup
					product = job.resultData?.product || null
					if (!product && job.upc) {
						const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
							context: 'Individual JobNotification (product creation)' 
						})
						product = result.product || null
					}
				} else {
					// Try to transform job result data for other job types
					product = await transformJobResultToProduct(job)
					
					if (product) {
						console.log(`🔔 [Notification] Successfully used job result data - avoiding redundant ProductLookupService call`)
						console.log(`🔔 [Notification] Product from job result: ${product.name} (${product.veganStatus})`)
					} else {
						// Fallback to fresh lookup if job result transformation failed
						console.log(`🔔 [Notification] Job result transformation failed - falling back to ProductLookupService lookup`)
						const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
							context: 'Individual JobNotification (fallback)' 
						})
						product = result.product || null
					}
				}
				
				// For photo-related jobs, ensure we have fresh image URL with cache busting
				if (product && (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation')) {
					console.log(`🔔 [Notification] Adding cache-busting to image for ${job.jobType}: ${product.imageUrl}`)
					
					// Add timestamp to force fresh image load
					if (product.imageUrl && product.imageUrl.includes('[SUPABASE]')) {
						product.imageUrl = `[SUPABASE]?t=${Date.now()}`
						console.log(`🔔 [Notification] Updated Supabase marker URL: ${product.imageUrl}`)
					} else if (product.imageUrl && product.imageUrl.includes('supabase.co')) {
						// Add timestamp parameter to existing URL
						const separator = product.imageUrl.includes('?') ? '&' : '?'
						product.imageUrl = `${product.imageUrl}${separator}t=${Date.now()}`
						console.log(`🔔 [Notification] Updated Supabase full URL: ${product.imageUrl}`)
					}
				}
			}

			// Create notification with unique ID to prevent React key conflicts
			const notificationId = `notification_${job.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			// Check for confidence errors in ingredient_parsing jobs FIRST
			let message: string
			let type: 'success' | 'error' = 'success'
			
			if (job.jobType === 'ingredient_parsing' && job.resultData?.error && job.resultData.error.includes('photo quality too low')) {
				// Check if this confidence error was already handled
				if (handledConfidenceErrors.has(job.id)) {
					console.log(`🔔 [Notification] *** PATH 1 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
					return
				}
				setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
				console.log(`🔔 [Notification] *** PATH 1 - CONFIDENCE ERROR DETECTED ***`)
				message = `⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.`
				type = 'error'
			} else if (job.jobType === 'product_creation' && job.resultData?.error === 'Product title scan failed.') {
				// Check if this confidence error was already handled
				if (handledConfidenceErrors.has(job.id)) {
					console.log(`🔔 [Notification] *** PATH 1 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
					return
				}
				setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
				console.log(`🔔 [Notification] *** PATH 1 - PRODUCT CREATION CONFIDENCE ERROR DETECTED ***`)
				message = `⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.`
				type = 'error'
			} else {
				// Only use success message if no error detected
				message = getIndividualSuccessMessage(job.jobType)
			}

			const notification: JobNotification = {
				id: notificationId,
				job,
				product,
				message,
				type,
				timestamp: new Date(),
			}

			// Check if app is in foreground
			if (AppState.currentState === 'active') {
				// Show notification immediately
				setNotifications(prev => [notification, ...prev.slice(0, 4)]) // Keep max 5 notifications
			} else {
				// Store for when app returns to foreground
				setPendingJobResults(prev => new Map(prev).set(job.id, { job, product }))
			}
		} catch (error) {
			console.error('Error handling individual job completion notification:', error)
			// Still show notification even if product fetch failed
			const notificationId = `notification_${job.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			// Check for confidence errors in ingredient_parsing jobs FIRST
			let message: string
			let type: 'success' | 'error' = 'success'
			
			if (job.jobType === 'ingredient_parsing' && job.resultData?.error && job.resultData.error.includes('photo quality too low')) {
				// Check if this confidence error was already handled
				if (handledConfidenceErrors.has(job.id)) {
					console.log(`🔔 [Notification] *** PATH 2 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
					return
				}
				setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
				console.log(`🔔 [Notification] *** PATH 2 - CONFIDENCE ERROR DETECTED ***`)
				message = `⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.`
				type = 'error'
			} else if (job.jobType === 'product_creation' && job.resultData?.error === 'Product title scan failed.') {
				// Check if this confidence error was already handled
				if (handledConfidenceErrors.has(job.id)) {
					console.log(`🔔 [Notification] *** PATH 2 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
					return
				}
				setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
				console.log(`🔔 [Notification] *** PATH 2 - PRODUCT CREATION CONFIDENCE ERROR DETECTED ***`)
				message = `⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.`
				type = 'error'
			} else {
				// Only use success message if no error detected
				message = getIndividualSuccessMessage(job.jobType)
			}

			const notification: JobNotification = {
				id: notificationId,
				job,
				product: null,
				message,
				type,
				timestamp: new Date(),
			}

			if (AppState.currentState === 'active') {
				setNotifications(prev => [notification, ...prev.slice(0, 4)])
			} else {
				setPendingJobResults(prev => new Map(prev).set(job.id, { job, product: null }))
			}
		}
	}
	
	// Helper function to detect if a job belongs to a workflow (even with missing metadata)
	const isWorkflowJob = (job: BackgroundJob): boolean => {
		// Primary detection: explicit workflow metadata
		if (job.workflowId || job.workflowType) {
			return true
		}
		
		// Secondary detection: jobs created within the last 5 minutes that could be part of "Add New Product" workflow
		// This catches workflow jobs that might be missing metadata due to timing or processing issues
		const recentlyCreated = Date.now() - new Date(job.createdAt).getTime() < 5 * 60 * 1000 // 5 minutes
		const isWorkflowJobType = ['product_creation', 'ingredient_parsing', 'product_photo_upload'].includes(job.jobType)
		
		if (recentlyCreated && isWorkflowJobType) {
			// Check if there are any other recent jobs with the same UPC that ARE marked as workflow jobs
			// This is a heuristic to catch orphaned jobs from the same workflow
			console.log(`🔔 [Notification] Checking if job ${job.id.slice(-6)} (${job.jobType}) might be an orphaned workflow job`)
			return true // For now, assume recent workflow-type jobs are workflow jobs
		}
		
		return false
	}

	// Helper function to handle individual job failure (original behavior)
	const handleIndividualJobFailed = (job: BackgroundJob) => {
		// CRITICAL: Never show individual notifications for workflow jobs
		// This prevents duplicate notifications when both workflow and individual handlers are triggered
		if (isWorkflowJob(job)) {
			console.log(`🔔 [Notification] Skipping individual job failure notification for workflow job: ${job.id.slice(-6)} (workflow: ${job.workflowId?.slice(-6)})`)
			return
		}
		
		// Don't show notifications for very old stuck jobs (older than 1 hour)
		const jobAge = Date.now() - new Date(job.createdAt).getTime()
		const oneHour = 60 * 60 * 1000
		
		if (job.errorMessage?.includes('stuck in processing state') && jobAge > oneHour) {
			console.log(`🔔 [Notification] Skipping notification for old stuck job: ${job.id.slice(-6)} (${Math.round(jobAge / 60000)} minutes old)`)
			return
		}
		
		// CRITICAL: Don't show error notifications for cleanup of already completed jobs
		// This happens when the background service cleans up jobs that were actually successful
		// but got stuck due to app backgrounding or other issues
		if (job.errorMessage?.includes('stuck in processing state')) {
			console.log(`🔔 [Notification] Skipping stuck job notification - likely cleanup of successful job: ${job.id.slice(-6)}`)
			return
		}
		
		// Additional filter: Don't show notifications for jobs that have result data
		// This indicates the job actually completed successfully but was misclassified
		if (job.resultData && !job.resultData.error) {
			console.log(`🔔 [Notification] Skipping error notification for job with successful result data: ${job.id.slice(-6)}`)
			return
		}
		
		// Don't show notifications for cleanup-related errors that happen shortly after job creation
		// This catches cases where the cleanup runs too aggressively
		const timeSinceCreated = Date.now() - new Date(job.createdAt).getTime()
		if (job.errorMessage?.includes('automatically cleaned up') && timeSinceCreated < 300000) { // 5 minutes
			console.log(`🔔 [Notification] Skipping cleanup error for recent job: ${job.id.slice(-6)} (${Math.round(timeSinceCreated / 1000)}s old)`)
			return
		}
		
		setProcessedJobIds(prev => new Set(prev).add(job.id))
		
		const notificationId = `notification_${job.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		const notification: JobNotification = {
			id: notificationId,
			job,
			product: null,
			message: getIndividualErrorMessage(job.jobType, job),
			type: 'error',
			timestamp: new Date(),
		}

		if (AppState.currentState === 'active') {
			setNotifications(prev => [notification, ...prev.slice(0, 4)])
		} else {
			setPendingJobResults(prev => new Map(prev).set(job.id, { job, product: null }))
		}
	}

	useEffect(() => {
		// Listen for job completion events
		const handleJobCompleted = async (job: BackgroundJob) => {
			console.log(`🔔 [Notification] *** NOTIFICATION CONTEXT *** Job completed: ${job.id.slice(-6)} (${job.jobType})`)
			
			// Prevent duplicate notifications for the same job
			if (processedJobIds.has(job.id)) {
				console.log(`🔔 [Notification] Skipping duplicate notification for job: ${job.id.slice(-6)}`)
				return
			}
			
			setProcessedJobIds(prev => new Set(prev).add(job.id))
			
			// CRITICAL FIX: Jobs with workflow context should ONLY be handled by workflow logic
			// This prevents duplicate notifications where workflow jobs also trigger individual notifications
			if (job.workflowId && job.workflowType) {
				console.log(`🔔 [Notification] Job ${job.id.slice(-6)} is part of workflow ${job.workflowId.slice(-6)} - using workflow notification logic`)
				await handleWorkflowJobCompleted(job)
			} else {
				console.log(`🔔 [Notification] Job ${job.id.slice(-6)} is an individual job - using individual notification logic`)
				// Handle individual job completion (existing behavior)
				await handleIndividualJobCompleted(job)
			}
		}

		const handleJobFailed = (job: BackgroundJob) => {
			console.log(`🔔 [Notification] Job failed: ${job.id.slice(-6)} (${job.jobType})`)
			
			// Prevent duplicate notifications for the same job
			if (processedJobIds.has(job.id)) {
				console.log(`🔔 [Notification] Skipping duplicate error notification for job: ${job.id.slice(-6)}`)
				return
			}
			
			// Handle workflow-based failure logic
			if (job.workflowId && job.workflowType) {
				handleWorkflowJobFailed(job)
			} else {
				// Handle individual job failure (existing behavior)
				handleIndividualJobFailed(job)
			}
		}

		// Subscribe to job events via central manager
		const unsubscribe = jobEventManager.subscribe('NotificationContext', (event, job) => {
			if (__DEV__) {
				console.log(`🔔 [NotificationContext] EVENT: ${event} | Job: ${job?.id?.slice(-6) || 'none'}`)
			}
			
			if (event === 'job_completed' && job) {
				handleJobCompleted(job)
			} else if (event === 'job_failed' && job) {
				handleJobFailed(job)
			}
		})

		return unsubscribe
	}, [])

	// Handle app state changes to show pending notifications
	useEffect(() => {
		const handleAppStateChange = (nextAppState: string) => {
			if (nextAppState === 'active' && pendingJobResults.size > 0) {
				console.log(`🔔 [Notification] App became active, showing ${pendingJobResults.size} pending notifications`)
				
				// Convert pending results to notifications
				const pendingNotifications: JobNotification[] = []
				pendingJobResults.forEach(({ job, product }, jobId) => {
					// CRITICAL FIX: Skip workflow jobs when showing pending notifications
					// Workflow jobs should only be handled by workflow logic, not shown as individual notifications
					if (isWorkflowJob(job)) {
						console.log(`🔔 [Notification] Skipping pending notification for workflow job ${job.id.slice(-6)} (part of workflow ${job.workflowId?.slice(-6) || 'unknown'})`)
						return
					}
					
					// Check for confidence errors in completed ingredient_parsing jobs
					let message: string
					let type: 'success' | 'error' = 'success'
					
					if (job.status === 'completed' && job.jobType === 'ingredient_parsing' && 
						job.resultData?.error && job.resultData.error.includes('photo quality too low')) {
						// Check if this confidence error was already handled
						if (handledConfidenceErrors.has(job.id)) {
							console.log(`🔔 [Notification] *** PATH 3 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
							return
						}
						setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
						message = '⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.'
						type = 'error'
					} else if (job.status === 'completed' && job.jobType === 'product_creation' && 
						job.resultData?.error === 'Product title scan failed.') {
						// Check if this confidence error was already handled
						if (handledConfidenceErrors.has(job.id)) {
							console.log(`🔔 [Notification] *** PATH 3 - ALREADY HANDLED CONFIDENCE ERROR FOR JOB ${job.id.slice(-6)} - SKIPPING ***`)
							return
						}
						setHandledConfidenceErrors(prev => new Set(prev).add(job.id))
						message = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
						type = 'error'
					} else {
						message = job.status === 'completed' ? getIndividualSuccessMessage(job.jobType) : getIndividualErrorMessage(job.jobType, job)
						type = job.status === 'completed' ? 'success' : 'error'
					}

					const notification: JobNotification = {
						id: `notification_${job.id}`,
						job,
						product,
						message,
						type,
						timestamp: new Date(),
					}
					pendingNotifications.push(notification)
				})

				// Show notifications and clear pending
				setNotifications(prev => [...pendingNotifications, ...prev].slice(0, 5))
				setPendingJobResults(new Map())
			}
		}

		const subscription = AppState.addEventListener('change', handleAppStateChange)
		return () => subscription?.remove()
	}, [pendingJobResults])

	const dismissNotification = (id: string) => {
		setNotifications(prev => prev.filter(notification => notification.id !== id))
	}

	const clearAllNotifications = () => {
		setNotifications([])
	}

	// Cleanup processed job IDs periodically to prevent memory leaks
	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			setProcessedJobIds(prev => {
				// Keep only recent job IDs (last 50) to prevent memory growth - reduced from 100
				const recentJobIds = Array.from(prev).slice(-50)
				return new Set(recentJobIds)
			})
			
			// Also cleanup stale handledConfidenceErrors
			setHandledConfidenceErrors(prev => {
				const recentErrors = Array.from(prev).slice(-20) // Keep last 20
				return new Set(recentErrors)
			})
		}, 5 * 60 * 1000) // Clean up every 5 minutes instead of 10

		return () => clearInterval(cleanupInterval)
	}, [])

	const handleNotificationPress = (notification: JobNotification) => {
		if (notification.product && notification.product.barcode) {
			// Navigate to product detail
			console.log(`🔔 [Notification] Navigating to product: ${notification.product.barcode}`)
			router.push(`/product/${notification.product.barcode}`)
			dismissNotification(notification.id)
		} else {
			dismissNotification(notification.id)
		}
	}

	return (
		<NotificationContext.Provider value={{ notifications, dismissNotification, clearAllNotifications }}>
			{children}
			{/* Render notification cards */}
			{notifications.map((notification, index) => (
				<JobCompletionCard
					key={notification.id}
					notification={notification}
					onPress={() => handleNotificationPress(notification)}
					onDismiss={() => dismissNotification(notification.id)}
					style={{ top: 90 + (index * 10) }} // Stack notifications with offset
				/>
			))}
		</NotificationContext.Provider>
	)
}

// Workflow message functions with priority-based error handling
function getWorkflowMessage(
	workflowType: 'add_new_product' | 'individual_action', 
	errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
): string {
	if (errorTypes.size > 0) {
		// Error priority: product_creation > ingredient_scan > photo_upload
		if (errorTypes.has('product_creation')) {
			return '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
		}
		if (errorTypes.has('ingredient_scan')) {
			return '⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.'
		}
		if (errorTypes.has('photo_upload')) {
			return '⚠️ Product photo upload failed. Please try again.'
		}
	}
	
	// Success cases remain the same
	switch (workflowType) {
		case 'add_new_product':
			return '✅ New product added'
		case 'individual_action':
			return '✅ Action completed'
		default:
			return '✅ Workflow completed'
	}
}

// Individual job message functions (for non-workflow jobs)
function getIndividualSuccessMessage(jobType: string): string {
	switch (jobType) {
		case 'product_creation':
			return 'New product added'
		case 'ingredient_parsing':
			return 'Ingredients updated'
		case 'product_photo_upload':
			return 'Photo updated'
		default:
			return 'Job completed'
	}
}

function getIndividualErrorMessage(jobType: string, job?: BackgroundJob): string {
	if (job?.errorMessage) {
		// Make stuck job messages and timeout messages more user-friendly
		if (job.errorMessage.includes('stuck in processing state') || job.errorMessage.includes('timed out after')) {
			switch (jobType) {
				case 'product_creation':
					return 'Product creation timed out - please try again'
				case 'ingredient_parsing':
					return 'Ingredient scan timed out - please try again'
				case 'product_photo_upload':
					return 'Photo upload timed out - please try again'
				default:
					return 'Job timed out - please try again'
			}
		}
		return job.errorMessage
	}
	
	switch (jobType) {
		case 'product_creation':
			return 'Failed to add product'
		case 'ingredient_parsing':
			return 'Failed to update ingredients'
		case 'product_photo_upload':
			return 'Failed to update photo'
		default:
			return 'Job failed'
	}
}