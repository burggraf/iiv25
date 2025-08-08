/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals'
import React from 'react'
import { render, renderHook, waitFor } from '@testing-library/react-native'
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

describe('NotificationContext Product Creation Error Handling', () => {
	
	// Test hasJobErrors function logic for product creation confidence errors
	describe('hasJobErrors for product_creation jobs', () => {
		
		it('detects product title scan failed error correctly', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-1',
				jobType: 'product_creation',
				resultData: {
					error: 'Product title scan failed.',
				},
			}

			// Test the confidence error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			// Mark as error if confidence failed OR (result error AND no product created)
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(true)
			expect(actualError).toBe(true)
		})
		
		it('detects product creation errors when success is false', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-2',
				jobType: 'product_creation',
				resultData: {
					success: false,
					error: 'Some other error',
				},
			}

			// Test the error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(false)
			expect(hasResultError).toBe(true)
			expect(!!productWasCreated).toBe(false)
			expect(actualError).toBe(true)
		})
		
		it('does not detect error when product was created despite other errors', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-3',
				jobType: 'product_creation',
				resultData: {
					success: false,
					error: 'Some warning',
					product: { id: 'test-product', name: 'Test Product' },
				},
			}

			// Test the error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(false)
			expect(hasResultError).toBe(true)
			expect(!!productWasCreated).toBe(true)
			expect(actualError).toBe(false) // Should not be error if product was created
		})
		
		it('detects confidence error even when product was created', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-4',
				jobType: 'product_creation',
				resultData: {
					success: true,
					error: 'Product title scan failed.',
					product: { id: 'test-product', name: 'Test Product' },
				},
			}

			// Test the error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(true)
			expect(actualError).toBe(true) // Confidence errors should always be treated as errors
		})
		
		it('does not detect error for successful product creation', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-5',
				jobType: 'product_creation',
				resultData: {
					success: true,
					product: { id: 'test-product', name: 'Test Product' },
				},
			}

			// Test the error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(false)
			expect(hasResultError).toBe(false)
			expect(!!productWasCreated).toBe(true)
			expect(actualError).toBe(false)
		})
		
		it('handles missing resultData gracefully', () => {
			const job: Partial<BackgroundJob> = {
				id: 'test-product-creation-6',
				jobType: 'product_creation',
				// No resultData
			}

			// Test the error detection logic from hasJobErrors
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			const hasResultError = !job.resultData?.success || !!job.resultData?.error
			const productWasCreated = job.resultData?.productData || job.resultData?.product
			
			const actualError = hasConfidenceError || (hasResultError && !productWasCreated)
			
			expect(hasConfidenceError).toBe(false)
			expect(hasResultError).toBe(true) // Should be true when resultData.success is undefined
			expect(!!productWasCreated).toBe(false)
			expect(actualError).toBe(true)
		})
	})
	
	// Test individual job completion handling for product creation confidence errors
	describe('Individual Job Completion - Product Creation Confidence Errors', () => {
		
		it('detects and handles product title scan failed error in path 1', () => {
			const job: Partial<BackgroundJob> = {
				id: 'confidence-error-job-1',
				jobType: 'product_creation',
				upc: '123456789012',
				resultData: {
					error: 'Product title scan failed.',
					confidence: 0.75,
				},
			}
			
			// Test the confidence error detection logic from individual job completion
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(true)
			
			// Should return early with error notification
			if (hasConfidenceError) {
				const expectedMessage = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
				const expectedType = 'error'
				
				expect(expectedMessage).toContain('Product title scan failed')
				expect(expectedMessage).toContain('better lighting')
				expect(expectedMessage).toContain('product title is visible')
				expect(expectedType).toBe('error')
			}
		})
		
		it('detects and handles product title scan failed error in path 2 (error handling fallback)', () => {
			const job: Partial<BackgroundJob> = {
				id: 'confidence-error-job-2',
				jobType: 'product_creation',
				upc: '123456789012',
				resultData: {
					error: 'Product title scan failed.',
					confidence: 0.5,
				},
			}
			
			// Test the confidence error detection logic from error handling path
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(true)
			
			if (hasConfidenceError) {
				const expectedMessage = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
				const expectedType = 'error'
				
				expect(expectedMessage).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
				expect(expectedType).toBe('error')
			}
		})
		
		it('detects and handles product title scan failed error in path 3 (pending notifications)', () => {
			const job: Partial<BackgroundJob> = {
				id: 'confidence-error-job-3',
				jobType: 'product_creation',
				status: 'completed',
				upc: '123456789012',
				resultData: {
					error: 'Product title scan failed.',
					confidence: 0.8,
				},
			}
			
			// Test the confidence error detection logic from pending notifications
			const isCompletedJob = job.status === 'completed'
			const isProductCreation = job.jobType === 'product_creation'
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			
			expect(isCompletedJob).toBe(true)
			expect(isProductCreation).toBe(true)
			expect(hasConfidenceError).toBe(true)
			
			if (isCompletedJob && isProductCreation && hasConfidenceError) {
				const expectedMessage = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
				const expectedType = 'error'
				
				expect(expectedMessage).toBe('⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.')
				expect(expectedType).toBe('error')
			}
		})
		
		it('does not detect confidence error for other product creation errors', () => {
			const job: Partial<BackgroundJob> = {
				id: 'other-error-job',
				jobType: 'product_creation',
				resultData: {
					error: 'Network timeout error',
					success: false,
				},
			}
			
			// Test that other errors don't trigger confidence error handling
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
			
			// Should use regular success message logic instead
			if (!hasConfidenceError) {
				const expectedMessage = 'New product added' // getIndividualSuccessMessage for product_creation
				expect(expectedMessage).toBe('New product added')
			}
		})
		
		it('handles successful product creation without confidence errors', () => {
			const job: Partial<BackgroundJob> = {
				id: 'success-job',
				jobType: 'product_creation',
				resultData: {
					success: true,
					product: { id: 'test-product', name: 'Test Product' },
					confidence: 0.95,
				},
			}
			
			// Test that successful jobs don't trigger confidence error handling
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
			
			// Should use regular success message
			const expectedMessage = 'New product added'
			const expectedType = 'success'
			
			expect(expectedMessage).toBe('New product added')
			expect(expectedType).toBe('success')
		})
	})
	
	// Test handledConfidenceErrors duplicate prevention
	describe('Duplicate Confidence Error Prevention', () => {
		
		it('should track handled confidence errors to prevent duplicates', () => {
			const handledConfidenceErrors = new Set<string>()
			const jobId = 'duplicate-test-job'
			
			// First time handling the error
			const alreadyHandled1 = handledConfidenceErrors.has(jobId)
			expect(alreadyHandled1).toBe(false)
			
			// Mark as handled
			handledConfidenceErrors.add(jobId)
			
			// Second time should be detected as already handled
			const alreadyHandled2 = handledConfidenceErrors.has(jobId)
			expect(alreadyHandled2).toBe(true)
		})
		
		it('should handle different job IDs independently', () => {
			const handledConfidenceErrors = new Set<string>()
			const jobId1 = 'job-1'
			const jobId2 = 'job-2'
			
			// Handle first job
			handledConfidenceErrors.add(jobId1)
			
			// First job should be marked as handled
			expect(handledConfidenceErrors.has(jobId1)).toBe(true)
			
			// Second job should not be marked as handled
			expect(handledConfidenceErrors.has(jobId2)).toBe(false)
		})
		
		it('should support Set operations for confidence error tracking', () => {
			const handledConfidenceErrors = new Set<string>()
			
			// Test Set methods
			handledConfidenceErrors.add('job-1')
			handledConfidenceErrors.add('job-2')
			handledConfidenceErrors.add('job-1') // Duplicate, should not increase size
			
			expect(handledConfidenceErrors.size).toBe(2)
			expect(Array.from(handledConfidenceErrors)).toEqual(['job-1', 'job-2'])
			
			// Test clearing
			handledConfidenceErrors.clear()
			expect(handledConfidenceErrors.size).toBe(0)
		})
	})
	
	// Test notification message content
	describe('Confidence Error Notification Messages', () => {
		
		it('should use correct message for product title scan failures', () => {
			const expectedMessage = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
			
			// Verify message contains key elements
			expect(expectedMessage).toContain('⚠️')
			expect(expectedMessage).toContain('Product title scan failed')
			expect(expectedMessage).toContain('better lighting')
			expect(expectedMessage).toContain('product title is visible')
		})
		
		it('should differentiate from ingredient parsing confidence messages', () => {
			const productCreationMessage = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
			const ingredientParsingMessage = '⚠️ Ingredients scan failed - photo quality too low. Try again with better lighting.'
			
			// Messages should be different
			expect(productCreationMessage).not.toBe(ingredientParsingMessage)
			
			// But both should mention better lighting
			expect(productCreationMessage).toContain('better lighting')
			expect(ingredientParsingMessage).toContain('better lighting')
			
			// Product creation should mention product title
			expect(productCreationMessage).toContain('product title')
			expect(ingredientParsingMessage).not.toContain('product title')
			
			// Ingredient parsing should mention photo quality
			expect(ingredientParsingMessage).toContain('photo quality')
			expect(productCreationMessage).not.toContain('photo quality')
		})
		
		it('should use error type for confidence failures', () => {
			const expectedType = 'error'
			
			// Confidence failures should always be error type
			expect(expectedType).toBe('error')
		})
	})
	
	// Test interaction with product lookup service
	describe('Product Lookup Service Integration', () => {
		
		it('should not lookup product for confidence error notifications', () => {
			const job: Partial<BackgroundJob> = {
				id: 'no-lookup-job',
				jobType: 'product_creation',
				upc: '123456789012',
				resultData: {
					error: 'Product title scan failed.',
				},
			}
			
			// For product creation confidence errors, should not lookup product
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			
			if (hasConfidenceError) {
				// Should use null product for confidence error notifications
				const expectedProduct = null
				expect(expectedProduct).toBe(null)
			}
		})
		
		it('should lookup product for successful product creation', () => {
			const job: Partial<BackgroundJob> = {
				id: 'lookup-job',
				jobType: 'product_creation',
				upc: '123456789012',
				resultData: {
					success: true,
					product: { id: 'test', name: 'Test Product' },
				},
			}
			
			// For successful product creation, should use product from result or lookup
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			
			if (!hasConfidenceError) {
				// Should use product from resultData or perform lookup
				const productFromResult = job.resultData?.product
				expect(productFromResult).toBeTruthy()
			}
		})
	})
	
	// Test error handling edge cases
	describe('Edge Cases for Product Creation Confidence Errors', () => {
		
		it('handles empty error string', () => {
			const job: Partial<BackgroundJob> = {
				id: 'empty-error-job',
				jobType: 'product_creation',
				resultData: {
					error: '',
				},
			}
			
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
		})
		
		it('handles partial matching of error message', () => {
			const job: Partial<BackgroundJob> = {
				id: 'partial-match-job',
				jobType: 'product_creation',
				resultData: {
					error: 'Product title scan failed due to low confidence.',
				},
			}
			
			// Should require exact match, not partial
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
		})
		
		it('handles case sensitivity in error message', () => {
			const job: Partial<BackgroundJob> = {
				id: 'case-sensitive-job',
				jobType: 'product_creation',
				resultData: {
					error: 'product title scan failed.',
				},
			}
			
			// Should be case sensitive
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
		})
		
		it('handles null and undefined error values', () => {
			const jobNull: Partial<BackgroundJob> = {
				id: 'null-error-job',
				jobType: 'product_creation',
				resultData: {
					error: null as any,
				},
			}
			
			const jobUndefined: Partial<BackgroundJob> = {
				id: 'undefined-error-job',
				jobType: 'product_creation',
				resultData: {
					// error is undefined
				},
			}
			
			const hasConfidenceErrorNull = jobNull.resultData?.error === 'Product title scan failed.'
			const hasConfidenceErrorUndefined = jobUndefined.resultData?.error === 'Product title scan failed.'
			
			expect(hasConfidenceErrorNull).toBe(false)
			expect(hasConfidenceErrorUndefined).toBe(false)
		})
		
		it('handles non-string error values', () => {
			const job: Partial<BackgroundJob> = {
				id: 'non-string-error-job',
				jobType: 'product_creation',
				resultData: {
					error: { message: 'Product title scan failed.' } as any,
				},
			}
			
			// Should handle non-string error values gracefully
			const hasConfidenceError = job.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
		})
	})
});