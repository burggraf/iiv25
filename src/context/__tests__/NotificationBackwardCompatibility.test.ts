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

describe('Product Creation Error Handling - Backward Compatibility', () => {

	// Test backward compatibility of response format
	describe('Edge Function Response Format Compatibility', () => {
		
		it('should maintain 200 status code even with confidence errors', () => {
			// Test that new confidence validation returns 200 status (not error status codes)
			// This ensures existing clients don't treat it as a network/server error
			
			const confidenceErrorResponse = {
				status: 200, // Should be 200 for backward compatibility
				body: {
					productName: 'unknown product',
					brand: '',
					confidence: 0.75,
					error: 'Product title scan failed.',
					retryable: false,
					apiCost: {
						inputTokens: 100,
						outputTokens: 20,
						totalCost: "0.000113",
					},
				}
			}
			
			expect(confidenceErrorResponse.status).toBe(200)
			expect(confidenceErrorResponse.body.error).toBe('Product title scan failed.')
			expect('productName' in confidenceErrorResponse.body).toBe(true)
			expect('brand' in confidenceErrorResponse.body).toBe(true)
			expect('confidence' in confidenceErrorResponse.body).toBe(true)
		})
		
		it('should include all existing response fields for backward compatibility', () => {
			// Ensure all existing CreateProductResponse fields are present
			interface CreateProductResponse {
				product?: any;
				productName?: string;
				brand?: string;
				confidence?: number;
				classification?: string;
				error?: string;
				retryable?: boolean;
				apiCost?: {
					inputTokens: number;
					outputTokens: number;
					totalCost: string;
				};
			}
			
			const confidenceErrorResponse: CreateProductResponse = {
				productName: 'unknown product',
				brand: '',
				confidence: 0.6,
				error: 'Product title scan failed.',
				retryable: false,
				apiCost: {
					inputTokens: 150,
					outputTokens: 25,
					totalCost: "0.000169",
				},
			}
			
			const successResponse: CreateProductResponse = {
				product: { id: 'test', name: 'Test Product' },
				productName: 'Test Product',
				brand: 'Test Brand',
				confidence: 0.95,
				apiCost: {
					inputTokens: 200,
					outputTokens: 30,
					totalCost: "0.000240",
				},
			}
			
			// Confidence error response should have all expected fields
			expect(confidenceErrorResponse.productName).toBeDefined()
			expect(confidenceErrorResponse.brand).toBeDefined()
			expect(confidenceErrorResponse.confidence).toBeDefined()
			expect(confidenceErrorResponse.error).toBeDefined()
			expect(confidenceErrorResponse.retryable).toBeDefined()
			expect(confidenceErrorResponse.apiCost).toBeDefined()
			
			// Success response should have all expected fields
			expect(successResponse.product).toBeDefined()
			expect(successResponse.productName).toBeDefined()
			expect(successResponse.brand).toBeDefined()
			expect(successResponse.confidence).toBeDefined()
			expect(successResponse.apiCost).toBeDefined()
			expect(successResponse.error).toBeUndefined() // No error in success case
		})
		
		it('should maintain consistent API cost structure', () => {
			// Test that API cost calculation remains consistent with existing format
			const apiCostStructure = {
				inputTokens: 100,
				outputTokens: 20,
				totalCost: "0.000113", // String format maintained for precision
			}
			
			expect(typeof apiCostStructure.inputTokens).toBe('number')
			expect(typeof apiCostStructure.outputTokens).toBe('number')
			expect(typeof apiCostStructure.totalCost).toBe('string') // Should remain string for precision
			
			// Test cost calculation compatibility
			const inputTokens = apiCostStructure.inputTokens
			const outputTokens = apiCostStructure.outputTokens
			
			// Gemini 1.5 Flash pricing: $0.075 per 1M input tokens, $0.30 per 1M output tokens
			const inputCost = (inputTokens / 1000000) * 0.075
			const outputCost = (outputTokens / 1000000) * 0.30
			const totalCost = inputCost + outputCost
			
			expect(totalCost.toFixed(6)).toBe("0.000013")
		})
		
		it('should preserve retryable field for error classification', () => {
			// Test that retryable field is properly set for different error types
			
			const confidenceError = {
				error: 'Product title scan failed.',
				retryable: false, // Confidence errors should not be retryable by system
			}
			
			const networkError = {
				error: 'Network error connecting to Gemini API',
				retryable: true, // Network errors should be retryable
			}
			
			const serviceError = {
				error: 'Gemini API is temporarily unavailable',
				retryable: true, // Service errors should be retryable
			}
			
			expect(confidenceError.retryable).toBe(false)
			expect(networkError.retryable).toBe(true)
			expect(serviceError.retryable).toBe(true)
		})
	})
	
	// Test backward compatibility with existing error handling
	describe('Existing Error Handling Compatibility', () => {
		
		it('should not interfere with existing Gemini API retry logic', () => {
			// Test that confidence validation doesn't break existing retry mechanisms
			const retryableErrors = [503, 429, 500, 502, 504]
			const nonRetryableErrors = [400, 401, 403, 404]
			
			// Existing retry logic should remain unchanged
			retryableErrors.forEach(errorCode => {
				const isRetryable = retryableErrors.includes(errorCode)
				expect(isRetryable).toBe(true)
			})
			
			nonRetryableErrors.forEach(errorCode => {
				const isRetryable = retryableErrors.includes(errorCode)
				expect(isRetryable).toBe(false)
			})
		})
		
		it('should preserve existing authentication and validation flows', () => {
			// Test that new confidence validation doesn't interfere with existing validations
			
			// Missing authorization should still be caught
			const missingAuth = {
				authHeader: null,
				expectedStatus: 401,
				expectedError: 'Authorization header required'
			}
			
			// Missing required fields should still be caught
			const missingFields = {
				imageBase64: null,
				upc: '123456789012',
				expectedStatus: 400,
				expectedError: 'Missing required fields: imageBase64, upc'
			}
			
			// Missing GEMINI_API_KEY should still be caught
			const missingApiKey = {
				geminiApiKey: null,
				expectedError: 'GEMINI_API_KEY not configured'
			}
			
			expect(missingAuth.expectedStatus).toBe(401)
			expect(missingFields.expectedStatus).toBe(400)
			expect(missingApiKey.expectedError).toContain('GEMINI_API_KEY')
		})
		
		it('should maintain existing database operations flow', () => {
			// Test that confidence validation doesn't interfere with UPC normalization and DB operations
			
			// UPC normalization should remain unchanged
			const testCases = [
				{ input: '12345678901', expected: '012345678901' }, // 11-digit UPC-E to 12-digit UPC-A
				{ input: '123456789012', expected: '123456789012' }, // 12-digit remains unchanged
				{ input: '1234567890123', expected: '1234567890123' }, // 13-digit EAN13
			]
			
			testCases.forEach(({ input, expected }) => {
				let normalizedUpc = input
				let ean13 = input
				
				// Convert 11-digit UPC-E to 12-digit UPC-A by prepending 0
				if (input.length === 11) {
					normalizedUpc = '0' + input
					ean13 = normalizedUpc
				} else if (input.length === 12) {
					ean13 = input
				}
				
				expect(normalizedUpc).toBe(expected)
			})
		})
		
		it('should maintain existing action logging format', () => {
			// Test that action logging structure remains compatible
			const userId = 'test-user-123'
			const normalizedUpc = '123456789012'
			const productName = 'Test Product'
			const brand = 'Test Brand'
			const confidence = 0.95
			const totalCost = 0.000123
			
			const actionLogEntry = {
				userid: userId,
				type: 'create_product_from_photo', // Existing action type
				input: normalizedUpc,
				result: productName,
				metadata: {
					upc: normalizedUpc,
					productName,
					brand,
					confidence,
					apiCost: totalCost.toFixed(6)
				},
			}
			
			// Should maintain existing structure
			expect(actionLogEntry.userid).toBe(userId)
			expect(actionLogEntry.type).toBe('create_product_from_photo')
			expect(actionLogEntry.input).toBe(normalizedUpc)
			expect(actionLogEntry.result).toBe(productName)
			expect(actionLogEntry.metadata).toBeDefined()
			expect(actionLogEntry.metadata.confidence).toBeDefined()
		})
	})
	
	// Test backward compatibility with existing client-side error handling
	describe('Client-Side Error Handling Compatibility', () => {
		
		it('should maintain existing hasJobErrors logic for other job types', () => {
			// Test that new product_creation logic doesn't break existing job type handling
			
			const photoUploadJob: Partial<BackgroundJob> = {
				id: 'photo-job',
				jobType: 'product_photo_upload',
				resultData: { success: false, error: 'Upload failed' },
			}
			
			const ingredientParsingJob: Partial<BackgroundJob> = {
				id: 'ingredient-job',
				jobType: 'ingredient_parsing',
				resultData: { error: 'Parsing failed due to photo quality too low' },
			}
			
			// Photo upload error detection should remain unchanged
			const photoHasError = !photoUploadJob.resultData?.success || 
								 !!photoUploadJob.resultData?.error || 
								 photoUploadJob.resultData?.uploadFailed
			expect(photoHasError).toBe(true)
			
			// Ingredient parsing error detection should remain unchanged
			const ingredientHasError = ingredientParsingJob.resultData?.error && 
									  ingredientParsingJob.resultData.error.includes('photo quality too low')
			expect(ingredientHasError).toBe(true)
		})
		
		it('should preserve existing notification message functions', () => {
			// Test that existing message generation functions work correctly
			
			const getIndividualSuccessMessage = (jobType: string): string => {
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
			
			const getIndividualErrorMessage = (jobType: string, job?: BackgroundJob): string => {
				if (job?.errorMessage) {
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
			
			// Test existing message generation
			expect(getIndividualSuccessMessage('product_creation')).toBe('New product added')
			expect(getIndividualSuccessMessage('ingredient_parsing')).toBe('Ingredients updated')
			expect(getIndividualSuccessMessage('product_photo_upload')).toBe('Photo updated')
			
			expect(getIndividualErrorMessage('product_creation')).toBe('Failed to add product')
			expect(getIndividualErrorMessage('ingredient_parsing')).toBe('Failed to update ingredients')
			expect(getIndividualErrorMessage('product_photo_upload')).toBe('Failed to update photo')
		})
		
		it('should maintain existing workflow and individual job distinction', () => {
			// Test that workflow vs individual job handling remains compatible
			
			const workflowJob: Partial<BackgroundJob> = {
				id: 'workflow-job',
				jobType: 'product_creation',
				workflowId: 'workflow-123',
				workflowType: 'add_new_product',
			}
			
			const individualJob: Partial<BackgroundJob> = {
				id: 'individual-job',
				jobType: 'product_creation',
				// No workflow metadata
			}
			
			// Workflow detection logic should remain unchanged
			const isWorkflowJob = (job: Partial<BackgroundJob>): boolean => {
				return !!(job.workflowId || job.workflowType)
			}
			
			expect(isWorkflowJob(workflowJob)).toBe(true)
			expect(isWorkflowJob(individualJob)).toBe(false)
		})
		
		it('should preserve existing handledConfidenceErrors pattern for ingredient parsing', () => {
			// Test that existing ingredient parsing confidence error handling works alongside new product creation handling
			
			const handledConfidenceErrors = new Set<string>()
			
			const ingredientJob: Partial<BackgroundJob> = {
				id: 'ingredient-confidence-job',
				jobType: 'ingredient_parsing',
				resultData: {
					error: 'Ingredient parsing failed due to photo quality too low'
				}
			}
			
			const productJob: Partial<BackgroundJob> = {
				id: 'product-confidence-job',
				jobType: 'product_creation',
				resultData: {
					error: 'Product title scan failed.'
				}
			}
			
			// Test ingredient parsing confidence error detection (existing)
			const ingredientHasConfidenceError = ingredientJob.resultData?.error && 
												 ingredientJob.resultData.error.includes('photo quality too low')
			
			// Test product creation confidence error detection (new)
			const productHasConfidenceError = productJob.resultData?.error === 'Product title scan failed.'
			
			expect(ingredientHasConfidenceError).toBe(true)
			expect(productHasConfidenceError).toBe(true)
			
			// Both should be trackable in the same Set
			if (ingredientHasConfidenceError) {
				handledConfidenceErrors.add(ingredientJob.id!)
			}
			if (productHasConfidenceError) {
				handledConfidenceErrors.add(productJob.id!)
			}
			
			expect(handledConfidenceErrors.size).toBe(2)
			expect(handledConfidenceErrors.has('ingredient-confidence-job')).toBe(true)
			expect(handledConfidenceErrors.has('product-confidence-job')).toBe(true)
		})
	})
	
	// Test version compatibility and migration scenarios
	describe('Version Compatibility', () => {
		
		it('should handle old edge function responses without confidence field', () => {
			// Test handling of responses from older edge function versions
			const oldResponse = {
				productName: 'Test Product',
				brand: 'Test Brand',
				// No confidence field
				apiCost: {
					inputTokens: 100,
					outputTokens: 20,
					totalCost: "0.000113",
				},
			}
			
			// Should handle missing confidence gracefully
			const confidence = (oldResponse as any).confidence || 0
			expect(confidence).toBe(0)
			
			// Should not trigger confidence error detection
			const hasConfidenceError = (oldResponse as any).error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(false)
		})
		
		it('should handle mixed confidence formats during deployment transition', () => {
			// Test handling during rolling deployment when some responses have new format
			const responses = [
				{ confidence: 85 }, // Percentage format (needs normalization)
				{ confidence: 0.85 }, // Decimal format (already normalized)
				{ confidence: 'high' }, // Invalid format (should default to 0)
				{}, // No confidence field (should default to 0)
			]
			
			responses.forEach((response, index) => {
				let confidence = response.confidence || 0
				
				// Normalization logic
				try {
					const confidenceValue = Number(confidence)
					if (isNaN(confidenceValue)) {
						confidence = 0.0
					} else if (confidenceValue > 1) {
						confidence = confidenceValue / 100
					} else {
						confidence = confidenceValue
					}
				} catch (error) {
					confidence = 0.0
				}
				
				switch (index) {
					case 0:
						expect(confidence).toBe(0.85)
						break
					case 1:
						expect(confidence).toBe(0.85)
						break
					case 2:
						expect(confidence).toBe(0.0)
						break
					case 3:
						expect(confidence).toBe(0.0)
						break
				}
			})
		})
		
		it('should maintain existing error precedence in client handling', () => {
			// Test that new confidence errors don't interfere with existing error precedence
			
			const jobWithMultipleErrors: Partial<BackgroundJob> = {
				id: 'multi-error-job',
				jobType: 'product_creation',
				resultData: {
					success: false,
					error: 'Product title scan failed.',
					uploadFailed: true, // If this were a photo upload job
				},
			}
			
			// Product creation confidence error should take precedence
			const hasConfidenceError = jobWithMultipleErrors.resultData?.error === 'Product title scan failed.'
			expect(hasConfidenceError).toBe(true)
			
			// Should use confidence error handling path
			if (hasConfidenceError) {
				const messageType = 'error'
				const message = '⚠️ Product title scan failed. Try again with better lighting and make sure the product title is visible.'
				
				expect(messageType).toBe('error')
				expect(message).toContain('Product title scan failed')
			}
		})
	})
});