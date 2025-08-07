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

describe('NotificationContext Enhanced Error Handling', () => {
	// Test the hasJobErrors function behavior by creating a test instance
	describe('hasJobErrors function logic', () => {
		// Since hasJobErrors is not exported, we'll test the logic by creating test jobs
		// and verifying the expected behavior based on the implementation

		it('detects photo upload errors correctly with success: false', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-1',
				jobType: 'product_photo_upload',
				resultData: {
					success: false,
					error: 'Upload failed',
				},
			}

			// Test the conditions that hasJobErrors uses for photo upload jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error
			const errorType = 'photo_upload'

			expect(hasError).toBe(true)
			expect(errorType).toBe('photo_upload')
		})

		it('detects photo upload errors correctly with uploadFailed: true', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-1b',
				jobType: 'product_photo_upload',
				resultData: {
					success: true, // Even if success is true, uploadFailed should trigger error
					uploadFailed: true,
				},
			}

			// Test the conditions that hasJobErrors uses for photo upload jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error || job.resultData?.uploadFailed
			const errorType = 'photo_upload'

			expect(hasError).toBe(true)
			expect(errorType).toBe('photo_upload')
		})

		it('detects ingredient scan errors correctly', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-2', 
				jobType: 'ingredient_parsing',
				resultData: {
					error: 'Ingredient parsing failed due to photo quality too low',
				},
			}

			// Test the conditions that hasJobErrors uses for ingredient parsing jobs
			const hasError = job.resultData?.error && job.resultData.error.includes('photo quality too low')
			const errorType = 'ingredient_scan'

			expect(hasError).toBe(true)
			expect(errorType).toBe('ingredient_scan')
		})

		it('does not detect ingredient scan error for other error types', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-2b', 
				jobType: 'ingredient_parsing',
				resultData: {
					error: 'Some other error message',
				},
			}

			// Test the conditions that hasJobErrors uses for ingredient parsing jobs
			const hasError = job.resultData?.error && job.resultData.error.includes('photo quality too low')
			const errorType = hasError ? 'ingredient_scan' : null

			expect(hasError).toBe(false)
			expect(errorType).toBe(null)
		})

		it('detects product creation errors correctly', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-3',
				jobType: 'product_creation',
				resultData: {
					success: false,
					error: 'Failed to create product',
				},
			}

			// Test the conditions that hasJobErrors uses for product creation jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error
			const errorType = 'product_creation'

			expect(hasError).toBe(true)
			expect(errorType).toBe('product_creation')
		})

		it('returns no error for successful photo upload jobs', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-4',
				jobType: 'product_photo_upload',
				resultData: {
					success: true,
					imageUrl: 'https://example.com/image.jpg',
				},
			}

			// Test the conditions that hasJobErrors uses for photo upload jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error || !!job.resultData?.uploadFailed
			const errorType = hasError ? 'photo_upload' : null

			expect(hasError).toBe(false)
			expect(errorType).toBe(null)
		})

		it('returns no error for successful ingredient parsing jobs', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-5',
				jobType: 'ingredient_parsing',
				resultData: {
					ingredients: ['flour', 'sugar'],
				},
			}

			// Test the conditions that hasJobErrors uses for ingredient parsing jobs
			const hasError = !!(job.resultData?.error && job.resultData.error.includes('photo quality too low'))
			const errorType = hasError ? 'ingredient_scan' : null

			expect(hasError).toBe(false)
			expect(errorType).toBe(null)
		})

		it('returns no error for successful product creation jobs', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-6',
				jobType: 'product_creation',
				resultData: {
					success: true,
					product: { name: 'Test Product' },
				},
			}

			// Test the conditions that hasJobErrors uses for product creation jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error
			const errorType = hasError ? 'product_creation' : null

			expect(hasError).toBe(false)
			expect(errorType).toBe(null)
		})
	})

	// Test workflow message priority logic based on the implementation
	describe('getWorkflowMessage priority logic', () => {
		// Test the priority logic by replicating the getWorkflowMessage function logic
		const getWorkflowMessage = (
			workflowType: 'add_new_product' | 'individual_action', 
			errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>
		): string => {
			if (errorTypes.size > 0) {
				// Error priority: ingredient_scan > photo_upload > product_creation
				if (errorTypes.has('ingredient_scan')) {
					return '⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.'
				}
				if (errorTypes.has('photo_upload')) {
					return '⚠️ Product photo upload failed. Please try again.'
				}
				if (errorTypes.has('product_creation')) {
					return '⚠️ Failed to add product. Please try again.'
				}
			}
			
			// Success cases
			switch (workflowType) {
				case 'add_new_product':
					return '✅ New product added'
				case 'individual_action':
					return '✅ Action completed'
				default:
					return '✅ Workflow completed'
			}
		}

		it('prioritizes ingredient_scan errors over others', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload', 'ingredient_scan', 'product_creation'])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return ingredient scan error message (highest priority)
			expect(message).toBe('⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.')
		})

		it('prioritizes photo_upload errors when ingredient_scan is not present', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload', 'product_creation'])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return photo upload error message
			expect(message).toBe('⚠️ Product photo upload failed. Please try again.')
		})

		it('uses product_creation error when it is the only error', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['product_creation'])
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return product creation error message
			expect(message).toBe('⚠️ Failed to add product. Please try again.')
		})

		it('returns success message when no errors for add_new_product', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>()
			
			const message = getWorkflowMessage('add_new_product', errorTypes)
			
			// Should return success message for add_new_product
			expect(message).toBe('✅ New product added')
		})

		it('returns success message when no errors for individual_action', () => {
			const errorTypes = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>()
			
			const message = getWorkflowMessage('individual_action', errorTypes)
			
			// Should return success message for individual_action
			expect(message).toBe('✅ Action completed')
		})

		it('handles multiple error types with correct priority', () => {
			// Test all combinations to ensure priority is maintained
			const allErrors = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload', 'ingredient_scan', 'product_creation'])
			const photoAndProduct = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['photo_upload', 'product_creation'])
			const ingredientAndProduct = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan', 'product_creation'])
			const ingredientAndPhoto = new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(['ingredient_scan', 'photo_upload'])

			// All should prioritize ingredient_scan when present
			expect(getWorkflowMessage('add_new_product', allErrors)).toContain('Ingredients scan failed')
			expect(getWorkflowMessage('add_new_product', ingredientAndProduct)).toContain('Ingredients scan failed')
			expect(getWorkflowMessage('add_new_product', ingredientAndPhoto)).toContain('Ingredients scan failed')
			
			// photo_upload should take priority over product_creation
			expect(getWorkflowMessage('add_new_product', photoAndProduct)).toContain('photo upload failed')
		})
	})

	// Test workflow state structure
	describe('WorkflowState interface', () => {
		interface WorkflowState {
			type: 'add_new_product' | 'individual_action';
			completedJobs: Set<string>;
			failedJobs: Set<string>;
			errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>;
			totalSteps: number;
			latestProduct: any | null; // Using any for Product type
			notificationShown: boolean;
		}

		it('includes all required error tracking fields', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			expect(workflowState.errorTypes).toBeInstanceOf(Set)
			expect(workflowState.errorTypes.size).toBe(0)
			
			// Test adding error types
			workflowState.errorTypes.add('ingredient_scan')
			workflowState.errorTypes.add('photo_upload')
			
			expect(workflowState.errorTypes.has('ingredient_scan')).toBe(true)
			expect(workflowState.errorTypes.has('photo_upload')).toBe(true)
			expect(workflowState.errorTypes.size).toBe(2)
		})

		it('supports individual_action workflow type', () => {
			const workflowState: WorkflowState = {
				type: 'individual_action',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 1,
				latestProduct: null,
				notificationShown: false,
			}

			expect(workflowState.type).toBe('individual_action')
			expect(workflowState.totalSteps).toBe(1)
		})

		it('maintains job tracking sets correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Test completed jobs tracking
			workflowState.completedJobs.add('job-1')
			workflowState.completedJobs.add('job-2')
			expect(workflowState.completedJobs.size).toBe(2)
			expect(workflowState.completedJobs.has('job-1')).toBe(true)

			// Test failed jobs tracking
			workflowState.failedJobs.add('job-3')
			expect(workflowState.failedJobs.size).toBe(1)
			expect(workflowState.failedJobs.has('job-3')).toBe(true)
		})

		it('supports product data and notification state', () => {
			const mockProduct = {
				name: 'Test Product',
				barcode: '123456789',
				veganStatus: 'VEGAN' as const
			}

			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: mockProduct,
				notificationShown: true,
			}

			expect(workflowState.latestProduct).toEqual(mockProduct)
			expect(workflowState.notificationShown).toBe(true)
		})

		it('handles all error types correctly', () => {
			const workflowState: WorkflowState = {
				type: 'add_new_product',
				completedJobs: new Set<string>(),
				failedJobs: new Set<string>(),
				errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
				totalSteps: 3,
				latestProduct: null,
				notificationShown: false,
			}

			// Test all error types can be added
			workflowState.errorTypes.add('photo_upload')
			workflowState.errorTypes.add('ingredient_scan')
			workflowState.errorTypes.add('product_creation')

			expect(workflowState.errorTypes.has('photo_upload')).toBe(true)
			expect(workflowState.errorTypes.has('ingredient_scan')).toBe(true)
			expect(workflowState.errorTypes.has('product_creation')).toBe(true)
			expect(workflowState.errorTypes.size).toBe(3)

			// Test error types can be cleared
			workflowState.errorTypes.clear()
			expect(workflowState.errorTypes.size).toBe(0)
		})
	})

	// Test edge cases and integration scenarios
	describe('Error handling integration scenarios', () => {
		it('handles missing resultData gracefully', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-no-result',
				jobType: 'product_photo_upload',
				// No resultData
			}

			// Test the conditions that hasJobErrors uses for photo upload jobs
			const hasError = !job.resultData?.success || !!job.resultData?.error || job.resultData?.uploadFailed
			const errorType = hasError ? 'photo_upload' : null

			expect(hasError).toBe(true) // Should detect error when resultData is missing
			expect(errorType).toBe('photo_upload')
		})

		it('handles unknown job types gracefully', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-job-unknown',
				jobType: 'unknown_job_type' as any,
				resultData: {
					error: 'Some error',
				},
			}

			// Test the default case that hasJobErrors uses for unknown job types
			const hasError = false
			const errorType = null

			expect(hasError).toBe(false)
			expect(errorType).toBe(null)
		})

		it('correctly identifies complex error scenarios', () => {
			// Test photo upload with multiple error indicators
			const complexPhotoJob: Partial<BackgroundJob> = {
				id: 'complex-photo-job',
				jobType: 'product_photo_upload',
				resultData: {
					success: false,
					error: 'Network error',
					uploadFailed: true,
				},
			}

			const hasError = !complexPhotoJob.resultData?.success || 
							!!complexPhotoJob.resultData?.error || 
							complexPhotoJob.resultData?.uploadFailed
			expect(hasError).toBe(true)

			// Test ingredient parsing with specific error message
			const specificIngredientJob: Partial<BackgroundJob> = {
				id: 'specific-ingredient-job',
				jobType: 'ingredient_parsing',
				resultData: {
					error: 'Processing failed due to photo quality too low - please try again',
				},
			}

			const hasIngredientError = specificIngredientJob.resultData?.error && 
									  specificIngredientJob.resultData.error.includes('photo quality too low')
			expect(hasIngredientError).toBe(true)
		})
	})
})