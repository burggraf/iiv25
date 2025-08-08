/**
 * Tests for PhotoErrorHandler Service
 */

import { PhotoErrorHandler } from '../PhotoErrorHandler';
import { BackgroundJob } from '../../types/backgroundJobs';

describe('PhotoErrorHandler', () => {
  describe('analyzeJobError', () => {
    it('should detect photo quality error in ingredient parsing job', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'ingredient_parsing',
        status: 'completed',
        priority: 2,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          error: 'photo quality too low',
          success: false,
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      
      expect(error).toBeDefined();
      expect(error?.type).toBe('photo_quality_too_low');
      expect(error?.isRecoverable).toBe(true);
      expect(error?.retryable).toBe(true);
      expect(error?.suggestedActions).toContain('Take a clearer photo with better lighting');
    });

    it('should detect confidence threshold error in product creation', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_creation',
        status: 'completed',
        priority: 3,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          error: 'Product title scan failed.',
          success: false,
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      
      expect(error).toBeDefined();
      expect(error?.type).toBe('confidence_threshold_not_met');
      expect(error?.userMessage).toContain('Unable to read the product information clearly');
    });

    it('should detect upload failure in photo upload job', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_photo_upload',
        status: 'completed',
        priority: 2,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          uploadFailed: true,
          success: false,
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      
      expect(error).toBeDefined();
      expect(error?.type).toBe('photo_upload_failed');
    });

    it('should return null for successful job', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_creation',
        status: 'completed',
        priority: 3,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          success: true,
          productData: { id: '123', name: 'Test Product' },
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      expect(error).toBeNull();
    });

    it('should detect network error from error message', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_creation',
        status: 'failed',
        priority: 3,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        errorMessage: 'Network connection timeout',
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      
      expect(error).toBeDefined();
      expect(error?.type).toBe('network_error');
      expect(error?.suggestedActions).toContain('Check your internet connection');
    });
  });

  describe('getRecoveryOptions', () => {
    it('should provide correct recovery options for photo quality error', () => {
      const options = PhotoErrorHandler.getRecoveryOptions(
        'photo_quality_too_low',
        'add_new_product',
        1
      );

      expect(options.allowRetry).toBe(true);
      expect(options.maxRetryAttempts).toBe(3);
      expect(options.alternativeActions).toHaveLength(3); // Take New Photo, Retry, Cancel
      expect(options.alternativeActions.some(action => action.action === 'different_photo')).toBe(true);
    });

    it('should not allow skip for critical add_new_product workflow', () => {
      const options = PhotoErrorHandler.getRecoveryOptions(
        'network_error',
        'add_new_product',
        0
      );

      expect(options.allowSkip).toBe(false);
      expect(options.alternativeActions.every(action => action.action !== 'skip')).toBe(true);
    });

    it('should allow skip for report workflows', () => {
      const options = PhotoErrorHandler.getRecoveryOptions(
        'network_error',
        'report_product_issue',
        0
      );

      expect(options.allowSkip).toBe(true);
      expect(options.alternativeActions.some(action => action.action === 'skip')).toBe(true);
    });

    it('should limit retries based on retry count', () => {
      const options = PhotoErrorHandler.getRecoveryOptions(
        'photo_quality_too_low',
        'add_new_product',
        3 // Already at max retries
      );

      expect(options.allowRetry).toBe(false);
      expect(options.alternativeActions.every(action => action.action !== 'retry')).toBe(true);
    });

    it('should not allow retry for camera permission error', () => {
      const options = PhotoErrorHandler.getRecoveryOptions(
        'camera_permission_denied',
        'add_new_product',
        0
      );

      expect(options.allowRetry).toBe(false);
      // But should still show "Try Again" action
      expect(options.alternativeActions.some(action => action.action === 'retry')).toBe(true);
    });
  });

  describe('formatErrorForUser', () => {
    it('should format error with title, message, and suggestions', () => {
      const photoError = {
        type: 'photo_quality_too_low' as const,
        message: 'Photo quality too low',
        userMessage: 'The photo quality is too low to process. Please take a clearer photo.',
        isRecoverable: true,
        retryable: true,
        suggestedActions: ['Take a clearer photo', 'Use better lighting'],
      };

      const formatted = PhotoErrorHandler.formatErrorForUser(photoError);
      
      expect(formatted.title).toBe('Photo Quality Too Low');
      expect(formatted.message).toBe('The photo quality is too low to process. Please take a clearer photo.');
      expect(formatted.suggestions).toEqual(['Take a clearer photo', 'Use better lighting']);
    });

    it('should provide fallback title for unknown error', () => {
      const photoError = {
        type: 'unknown_error' as const,
        message: 'Something went wrong',
        userMessage: 'An unexpected error occurred.',
        isRecoverable: true,
        retryable: true,
        suggestedActions: [],
      };

      const formatted = PhotoErrorHandler.formatErrorForUser(photoError);
      expect(formatted.title).toBe('Error Occurred');
    });
  });

  describe('error categorization edge cases', () => {
    it('should handle product creation with partial success', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_creation',
        status: 'completed',
        priority: 3,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          error: 'Low confidence',
          success: false,
          product: { id: '123' }, // Product was still created despite error
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      // Should not be an error since product was created
      expect(error).toBeNull();
    });

    it('should categorize storage error correctly', () => {
      const job: BackgroundJob = {
        id: 'test_job',
        jobType: 'product_photo_upload',
        status: 'failed',
        priority: 2,
        upc: '12345',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        errorMessage: 'Storage quota exceeded',
      };

      const error = PhotoErrorHandler.analyzeJobError(job);
      
      expect(error).toBeDefined();
      expect(error?.type).toBe('photo_upload_failed'); // Falls back to upload error for this job type
    });
  });
});