import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { backgroundQueueService } from '../services/backgroundQueueService'
import { BackgroundJob } from '../types/backgroundJobs'
import { Product } from '../types'
import { ProductLookupService } from '../services/productLookupService'
import JobCompletionCard from '../components/JobCompletionCard'
import { transformJobResultToProduct } from '../utils/jobResultTransform'

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
	
	// Track workflow completion states
	const [workflowStates, setWorkflowStates] = useState<Map<string, {
		type: 'add_new_product' | 'individual_action';
		completedJobs: Set<string>;
		failedJobs: Set<string>;
		totalSteps: number;
		latestProduct: Product | null;
		notificationShown: boolean; // Prevent duplicate completion notifications
	}>>(new Map())
	
	// Helper function to handle workflow job completion
	const handleWorkflowJobCompleted = async (job: BackgroundJob) => {
		if (!job.workflowId || !job.workflowType || !job.workflowSteps) return
		
		console.log(`🔔 [Notification] Workflow job completed: ${job.workflowId.slice(-6)} - ${job.jobType} (${job.workflowSteps.current}/${job.workflowSteps.total})`)
		
		// Update workflow state
		setWorkflowStates(prev => {
			const current = prev.get(job.workflowId!) || {
				type: job.workflowType!,
				completedJobs: new Set(),
				failedJobs: new Set(),
				totalSteps: job.workflowSteps!.total,
				latestProduct: null,
				notificationShown: false
			}
			
			current.completedJobs.add(job.id)
			
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
				const hasFailed = current.failedJobs.size > 0
				
				console.log(`🔔 [Notification] Workflow ${job.workflowId!.slice(-6)} status: ${current.completedJobs.size}/${current.totalSteps} completed, ${current.failedJobs.size} failed`)
				
				if ((isComplete || hasFailed) && !current.notificationShown) {
					// Mark notification as shown to prevent duplicates
					current.notificationShown = true
					// Show single workflow notification
					const notificationId = `notification_workflow_${job.workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
					const notification: JobNotification = {
						id: notificationId,
						job: { ...job, id: `workflow_${job.workflowId}` }, // Use workflow ID for the notification job
						product: current.latestProduct,
						message: getWorkflowMessage(current.type, hasFailed),
						type: hasFailed ? 'error' : 'success',
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
					if (!hasFailed && current.latestProduct && current.type === 'add_new_product') {
						console.log(`🔔 [Notification] Workflow ${job.workflowId!.slice(-6)} completed successfully - updating history with product ${current.latestProduct.barcode}`)
						try {
							// Import historyService dynamically to avoid circular dependencies
							const { historyService } = await import('../services/HistoryService')
							await historyService.addToHistory(current.latestProduct, true, true)
							console.log(`✅ [Notification] Successfully updated history for completed workflow: ${current.latestProduct.barcode}`)
						} catch (error) {
							console.error(`❌ [Notification] Error updating history for completed workflow:`, error)
						}
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
				totalSteps: job.workflowSteps?.total || 1,
				latestProduct: null,
				notificationShown: false
			}
			
			current.failedJobs.add(job.id)
			
			// Show immediate failure notification for workflows
			const notificationId = `notification_workflow_failed_${job.workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			const notification: JobNotification = {
				id: notificationId,
				job: { ...job, id: `workflow_failed_${job.workflowId}` },
				product: null,
				message: getWorkflowMessage(current.type, true),
				type: 'error',
				timestamp: new Date(),
			}

			if (AppState.currentState === 'active') {
				setNotifications(prev => [notification, ...prev.slice(0, 4)])
			} else {
				setPendingJobResults(prev => new Map(prev).set(`workflow_failed_${job.workflowId}`, { job, product: null }))
			}
			
			// Clean up failed workflow
			const updated = new Map(prev)
			updated.delete(job.workflowId!)
			return updated
		})
	}
	
	// Helper function to handle individual job completion (original behavior)
	const handleIndividualJobCompleted = async (job: BackgroundJob) => {
		try {
			// For photo upload jobs, add a delay to ensure the image is fully processed
			if (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation') {
				await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
			}

			// Try to use job result data to avoid redundant lookup
			let product: Product | null = null
			if (job.upc) {
				console.log(`🔔 [Notification] Attempting to use job result data for ${job.jobType} - avoiding redundant lookup`)
				
				// Skip transformation for ingredient_parsing jobs since they don't contain full product data
				if (job.jobType === 'ingredient_parsing') {
					console.log(`🔔 [Notification] Skipping transformation for ingredient_parsing job - getting product from database`)
					const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
						context: 'Individual JobNotification (ingredient parsing)' 
					})
					product = result.product || null
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
			const notification: JobNotification = {
				id: notificationId,
				job,
				product,
				message: getIndividualSuccessMessage(job.jobType),
				type: 'success',
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
			const notification: JobNotification = {
				id: notificationId,
				job,
				product: null,
				message: getIndividualSuccessMessage(job.jobType),
				type: 'success',
				timestamp: new Date(),
			}

			if (AppState.currentState === 'active') {
				setNotifications(prev => [notification, ...prev.slice(0, 4)])
			} else {
				setPendingJobResults(prev => new Map(prev).set(job.id, { job, product: null }))
			}
		}
	}
	
	// Helper function to handle individual job failure (original behavior)
	const handleIndividualJobFailed = (job: BackgroundJob) => {
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
			console.log(`🔔 [Notification] Job completed: ${job.id.slice(-6)} (${job.jobType})`)
			
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

		// Subscribe to job events
		const unsubscribe = backgroundQueueService.subscribeToJobUpdates((event, job) => {
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
					if (job.workflowId && job.workflowType) {
						console.log(`🔔 [Notification] Skipping pending notification for workflow job ${job.id.slice(-6)} (part of workflow ${job.workflowId.slice(-6)})`)
						return
					}
					
					const notification: JobNotification = {
						id: `notification_${job.id}`,
						job,
						product,
						message: job.status === 'completed' ? getIndividualSuccessMessage(job.jobType) : getIndividualErrorMessage(job.jobType, job),
						type: job.status === 'completed' ? 'success' : 'error',
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
				// Keep only recent job IDs (last 100) to prevent memory growth
				const recentJobIds = Array.from(prev).slice(-100)
				return new Set(recentJobIds)
			})
		}, 10 * 60 * 1000) // Clean up every 10 minutes

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

// Workflow message functions
function getWorkflowMessage(workflowType: 'add_new_product' | 'individual_action', hasFailed: boolean): string {
	if (hasFailed) {
		switch (workflowType) {
			case 'add_new_product':
				return 'Failed to add product'
			case 'individual_action':
				return 'Action failed'
			default:
				return 'Workflow failed'
		}
	} else {
		switch (workflowType) {
			case 'add_new_product':
				return 'New product added'
			case 'individual_action':
				return 'Action completed'
			default:
				return 'Workflow completed'
		}
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
		// Make stuck job messages more user-friendly
		if (job.errorMessage.includes('stuck in processing state')) {
			switch (jobType) {
				case 'product_creation':
					return 'Product creation timed out'
				case 'ingredient_parsing':
					return 'Ingredient scan timed out'
				case 'product_photo_upload':
					return 'Photo upload timed out'
				default:
					return 'Job timed out'
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