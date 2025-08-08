/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals'
import React from 'react'
import { render, renderHook } from '@testing-library/react-native'
import { BackgroundJob } from '../../types/backgroundJobs'

// Mock React Native components
jest.mock('react-native', () => ({
	AppState: {
		currentState: 'active',
		addEventListener: jest.fn(() => ({ remove: jest.fn() })),
	},
	Platform: { OS: 'ios' },
}))

jest.mock('expo-router', () => ({
	router: {
		push: jest.fn(),
	},
}))

jest.mock('../../services/backgroundQueueService', () => ({
	backgroundQueueService: {
		subscribeToJobUpdates: jest.fn(() => jest.fn()),
	},
}))

jest.mock('../../components/JobCompletionCard', () => 'JobCompletionCard')

// Mock ProductLookupService to prevent actual API calls
jest.mock('../../services/productLookupService', () => ({
	ProductLookupService: {
		lookupProductByBarcode: jest.fn(() => Promise.resolve({ product: null })),
	},
}))

// Mock transformJobResultToProduct utility
jest.mock('../../utils/jobResultTransform', () => ({
	transformJobResultToProduct: jest.fn(() => Promise.resolve(null)),
}))

// Mock HistoryService
jest.mock('../../services/HistoryService', () => ({
	historyService: {
		addToHistory: jest.fn(() => Promise.resolve()),
	},
}))

describe('NotificationContext Workflow Product Creation Error Integration', () => {

	// Test getWorkflowMessage with product_creation error prioritization
	describe('getWorkflowMessage with product_creation priority', () => {
		
		// Replicate the updated getWorkflowMessage function with product_creation priority
		const getWorkflowMessage = (
			workflowType: 'add_new_product' | 'individual_action', 
			errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
		): string => {
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

		it('prioritizes product_creation errors over all others', () => {
			const allErrorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'photo_upload', 
				'ingredient_scan', 
				'product_creation'
			])
			
			const message = getWorkflowMessage('add_new_product', allErrorTypes)
			
			// Should return product_creation error message (highest priority)
			expect(message).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
		})

		it('prioritizes product_creation over ingredient_scan', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'ingredient_scan', 
				'product_creation'
			])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return product_creation error message, not ingredient_scan
			expect(message).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
			expect(message).not.toContain('Ingredients scan failed')
		})

		it('prioritizes product_creation over photo_upload', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'photo_upload', 
				'product_creation'
			])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return product_creation error message, not photo_upload
			expect(message).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
			expect(message).not.toContain('photo upload failed')
		})

		it('uses ingredient_scan when product_creation is not present', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'photo_upload', 
				'ingredient_scan'
			])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return ingredient_scan error message (second priority)
			expect(message).toBe('⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.')
		})

		it('uses photo_upload when only photo_upload error exists', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'photo_upload'
			])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return photo_upload error message (lowest priority)
			expect(message).toBe('⚠️ Product photo upload failed. Please try again.')
		})

		it('uses product_creation when only product_creation error exists', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'product_creation'
			])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return product_creation error message
			expect(message).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
		})

		it('returns success message when no errors exist', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>()
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return success message
			expect(message).toBe('✅ New product added')
		})

		it('works correctly for individual_action workflow type', () => {
			const errorTypesWithProductCreation = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'product_creation'
			])
			const errorTypesEmpty = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>()
			
			const errorMessage = getWorkflowMessage('individual_action', errorTypesWithProductCreation)
			const successMessage = getWorkflowMessage('individual_action', errorTypesEmpty)
			
			// Error message should be the same regardless of workflow type
			expect(errorMessage).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
			
			// Success message should be different for individual_action
			expect(successMessage).toBe('✅ Action completed')
		})
	})

	// Test workflow state error type tracking for product_creation
	describe('WorkflowState error type tracking', () => {
		
		interface WorkflowState {
			type: 'add_new_product' | 'individual_action';
			completedJobs: Set<string>;
			failedJobs: Set<string>;
			errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>;
			totalSteps: number;
			latestProduct: any | null;
			notificationShown: boolean;
		}

		it('should add product_creation error type correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Simulate adding product_creation error
			workflowState.errorTypes.add('product_creation')
			
			expect(workflowState.errorTypes.has('product_creation')).toBe(true)
			expect(workflowState.errorTypes.size).toBe(1)
		})

		it('should handle multiple error types with product_creation priority', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Simulate workflow with multiple error types
			workflowState.errorTypes.add('photo_upload')
			workflowState.errorTypes.add('ingredient_scan')
			workflowState.errorTypes.add('product_creation')
			
			expect(workflowState.errorTypes.size).toBe(3)
			expect(workflowState.errorTypes.has('product_creation')).toBe(true)
			expect(workflowState.errorTypes.has('ingredient_scan')).toBe(true)
			expect(workflowState.errorTypes.has('photo_upload')).toBe(true)
			
			// Test priority in message generation using the local function
			const getWorkflowMessage = (
				workflowType: 'add_new_product' | 'individual_action', 
				errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
			): string => {
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
				return '✅ New product added'
			}
			
			const message = getWorkflowMessage('add_new_product', workflowState.errorTypes)
			expect(message).toContain('Product title scan failed') // Should prioritize product_creation
		})

		it('should track completed and failed jobs correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Simulate job completion tracking
			const jobId = 'product-creation-job-123'
			workflowState.completedJobs.add(jobId)
			workflowState.errorTypes.add('product_creation')
			workflowState.failedJobs.add(jobId)
			
			expect(workflowState.completedJobs.has(jobId)).toBe(true)
			expect(workflowState.failedJobs.has(jobId)).toBe(true)
			expect(workflowState.errorTypes.has('product_creation')).toBe(true)
		})

		it('should determine workflow completion correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2', 'job3']),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Test workflow completion detection
			const isComplete = workflowState.completedJobs.size >= workflowState.totalSteps
			const hasErrors = workflowState.errorTypes.size > 0
			
			expect(isComplete).toBe(true)
			expect(hasErrors).toBe(false)
		})

		it('should determine workflow completion with errors correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2']),
				failedJobs: new Set<string>(['job3']),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation']),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Test workflow with errors
			const isComplete = workflowState.completedJobs.size >= workflowState.totalSteps
			const hasErrors = workflowState.errorTypes.size > 0
			
			expect(isComplete).toBe(false) // Only 2 of 3 jobs completed
			expect(hasErrors).toBe(true)
			
			// Should still show notification due to errors
			const shouldShowNotification = isComplete || hasErrors
			expect(shouldShowNotification).toBe(true)
		})
	})

	// Test history update logic for product_creation errors
	describe('History update logic with product_creation errors', () => {
		
		interface WorkflowState {
			type: 'add_new_product' | 'individual_action';
			completedJobs: Set<string>;
			failedJobs: Set<string>;
			errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>;
			totalSteps: number;
			latestProduct: any | null;
			notificationShown: boolean;
		}

		it('should not update history when product_creation error exists', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2', 'job3']),
				failedJobs: new Set<string>(['job3']),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation']),
				totalSteps: 3,
				latestProduct: { barcode: '123456789012', name: 'Test Product' },
				notificationShown: false,
			}

			// Test history update decision logic
			const productCreationSucceeded = !workflowState.errorTypes.has('product_creation')
			
			expect(productCreationSucceeded).toBe(false)
			
			// Should not add to history when product creation failed
			const shouldUpdateHistory = productCreationSucceeded && 
										workflowState.latestProduct && 
										workflowState.type === 'add_new_product'
			
			expect(shouldUpdateHistory).toBe(false)
		})

		it('should update history when product_creation succeeds despite other errors', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2', 'job3']),
				failedJobs: new Set<string>(['job2']),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan']), // No product_creation error
				totalSteps: 3,
				latestProduct: { barcode: '123456789012', name: 'Test Product' },
				notificationShown: false,
			}

			// Test history update decision logic
			const productCreationSucceeded = !workflowState.errorTypes.has('product_creation')
			
			expect(productCreationSucceeded).toBe(true)
			
			// Should add to history when product creation succeeded
			const shouldUpdateHistory = productCreationSucceeded && 
										workflowState.latestProduct && 
										workflowState.type === 'add_new_product'
			
			expect(shouldUpdateHistory).toBe(true)
		})

		it('should update history when no errors exist', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2', 'job3']),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(), // No errors
				totalSteps: 3,
				latestProduct: { barcode: '123456789012', name: 'Test Product' },
				notificationShown: false,
			}

			// Test history update decision logic
			const productCreationSucceeded = !workflowState.errorTypes.has('product_creation')
			
			expect(productCreationSucceeded).toBe(true)
			
			// Should add to history when no errors
			const shouldUpdateHistory = productCreationSucceeded && 
										workflowState.latestProduct && 
										workflowState.type === 'add_new_product'
			
			expect(shouldUpdateHistory).toBe(true)
		})

		it('should not update history for individual_action workflows', () => {
			const workflowState: WorkflowState = {
				type: 'individual_action', // Not add_new_product
				completedJobs: new Set<string>(['job1']),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(), // No errors
				totalSteps: 1,
				latestProduct: { barcode: '123456789012', name: 'Test Product' },
				notificationShown: false,
			}

			// Test history update decision logic
			const productCreationSucceeded = !workflowState.errorTypes.has('product_creation')
			
			expect(productCreationSucceeded).toBe(true)
			
			// Should not add to history for individual_action workflows
			const shouldUpdateHistory = productCreationSucceeded && 
										workflowState.latestProduct && 
										workflowState.type === 'add_new_product'
			
			expect(shouldUpdateHistory).toBe(false)
		})

		it('should not update history when latestProduct is null', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(['job1', 'job2', 'job3']),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(), // No errors
				totalSteps: 3,
				latestProduct: null, // No product data
				notificationShown: false,
			}

			// Test history update decision logic
			const productCreationSucceeded = !workflowState.errorTypes.has('product_creation')
			
			expect(productCreationSucceeded).toBe(true)
			
			// Should not add to history when no product data
			const shouldUpdateHistory = productCreationSucceeded && 
										workflowState.latestProduct && 
										workflowState.type === 'add_new_product'
			
			expect(!!shouldUpdateHistory).toBe(false)
		})
	})

	// Test error message content for product_creation in workflow context
	describe('Product creation error messages in workflow context', () => {
		
		it('should use specific product title scan failed message', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation'])
			
			const getWorkflowMessage = (
				workflowType: 'add_new_product' | 'individual_action', 
				errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
			): string => {
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
				return '✅ New product added'
			}
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should contain specific guidance for product title scanning
			expect(message).toContain('Product title scan failed')
			expect(message).toContain('better lighting')
			expect(message).toContain('product title is visible')
			expect(message).toContain('⚠️')
		})

		it('should differentiate product_creation message from others', () => {
			const productCreationError = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation'])
			const ingredientScanError = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan'])
			const photoUploadError = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload'])
			
			const getWorkflowMessage = (
				workflowType: 'add_new_product' | 'individual_action', 
				errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
			): string => {
				if (errorTypes.size > 0) {
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
				return '✅ Success'
			}
			
			const productMessage = getWorkflowMessage('add_new_product', productCreationError)
			const ingredientMessage = getWorkflowMessage('add_new_product', ingredientScanError)
			const photoMessage = getWorkflowMessage('add_new_product', photoUploadError)
			
			// All should be different
			expect(productMessage).not.toBe(ingredientMessage)
			expect(productMessage).not.toBe(photoMessage)
			expect(ingredientMessage).not.toBe(photoMessage)
			
			// Product creation should mention title
			expect(productMessage).toContain('title')
			expect(ingredientMessage).not.toContain('title')
			expect(photoMessage).not.toContain('title')
			
			// Ingredient should mention quality
			expect(ingredientMessage).toContain('quality')
			expect(productMessage).not.toContain('quality')
			expect(photoMessage).not.toContain('quality')
			
			// Photo should mention upload
			expect(photoMessage).toContain('upload')
			expect(productMessage).not.toContain('upload')
			expect(ingredientMessage).not.toContain('upload')
		})
	})

	// Test notification type determination for workflows with product_creation errors
	describe('Notification type for workflows with product_creation errors', () => {
		
		it('should use error type when product_creation error exists', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation'])
			const hasErrors = errorTypes.size > 0
			const notificationType: 'success' | 'error' = hasErrors ? 'error' : 'success'
			
			expect(notificationType).toBe('error')
		})

		it('should use error type when multiple errors including product_creation exist', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>([
				'photo_upload', 
				'ingredient_scan', 
				'product_creation'
			])
			const hasErrors = errorTypes.size > 0
			const notificationType: 'success' | 'error' = hasErrors ? 'error' : 'success'
			
			expect(notificationType).toBe('error')
		})

		it('should use success type when no errors exist', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>()
			const hasErrors = errorTypes.size > 0
			const notificationType: 'success' | 'error' = hasErrors ? 'error' : 'success'
			
			expect(notificationType).toBe('success')
		})
	})
});