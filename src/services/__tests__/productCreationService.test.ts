import { ProductCreationService } from '../productCreationService';

// Mock the dependencies
jest.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: jest.fn()
    }
  }
}));

jest.mock('../backgroundQueueService', () => ({
  backgroundQueueService: {
    queueJob: jest.fn()
  }
}));

import { backgroundQueueService } from '../backgroundQueueService';
const mockQueueJob = backgroundQueueService.queueJob as jest.Mock;

describe('ProductCreationService Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Image Upload Job Queuing', () => {
    it('should not queue image upload job when product creation fails with confidence error', async () => {
      // Mock the edge function to return a confidence error
      const { supabase } = require('../supabaseClient');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          productName: 'unknown product',
          brand: '',
          confidence: 0.75, // Below 90% threshold
          error: 'Product title scan failed.',
          retryable: false,
          apiCost: {
            inputTokens: 100,
            outputTokens: 20,
            totalCost: '0.000100'
          }
        },
        error: null
      });

      // Call the service with image URI
      const result = await ProductCreationService.createProductFromPhoto(
        'base64image',
        '123456789012',
        'file://path/to/image.jpg' // Image URI provided
      );

      // Verify the result contains the error
      expect(result.error).toBe('Product title scan failed.');
      expect(result.confidence).toBe(0.75);
      expect(result.productName).toBe('unknown product');

      // Verify that NO image upload job was queued
      expect(mockQueueJob).not.toHaveBeenCalled();
    });

    it('should queue image upload job when product creation succeeds', async () => {
      // Mock the edge function to return success
      const { supabase } = require('../supabaseClient');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          productName: 'Test Product',
          brand: 'Test Brand',
          confidence: 0.95, // Above 90% threshold
          product: { id: 1, upc: '123456789012' },
          apiCost: {
            inputTokens: 100,
            outputTokens: 20,
            totalCost: '0.000100'
          }
        },
        error: null
      });

      mockQueueJob.mockResolvedValue({
        id: 'job123',
        status: 'pending'
      });

      // Call the service with image URI
      const result = await ProductCreationService.createProductFromPhoto(
        'base64image',
        '123456789012',
        'file://path/to/image.jpg' // Image URI provided
      );

      // Verify the result is successful
      expect(result.error).toBeUndefined();
      expect(result.confidence).toBe(0.95);
      expect(result.productName).toBe('Test Product');

      // Verify that image upload job WAS queued
      expect(mockQueueJob).toHaveBeenCalledWith({
        jobType: 'product_photo_upload',
        imageUri: 'file://path/to/image.jpg',
        upc: '123456789012',
        existingProductData: expect.objectContaining({
          productName: 'Test Product',
          brand: 'Test Brand',
          confidence: 0.95
        }),
        priority: 1
      });
    });

    it('should queue image upload job in workflow context when product creation succeeds', async () => {
      // Mock successful edge function response
      const { supabase } = require('../supabaseClient');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          productName: 'Test Product',
          brand: 'Test Brand',
          confidence: 0.92,
          product: { id: 1, upc: '123456789012' },
          apiCost: {
            inputTokens: 100,
            outputTokens: 20,
            totalCost: '0.000100'
          }
        },
        error: null
      });

      mockQueueJob.mockResolvedValue({
        id: 'workflow_job123',
        status: 'pending'
      });

      // Call with workflow context
      const result = await ProductCreationService.createProductFromPhoto(
        'base64image',
        '123456789012',
        'file://path/to/image.jpg',
        {
          workflowId: 'workflow_abc123',
          workflowType: 'add_new_product'
        }
      );

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.productName).toBe('Test Product');

      // Verify workflow job was queued
      expect(mockQueueJob).toHaveBeenCalledWith({
        jobType: 'product_photo_upload',
        imageUri: 'file://path/to/image.jpg',
        upc: '123456789012',
        existingProductData: expect.objectContaining({
          productName: 'Test Product'
        }),
        priority: 1,
        workflowId: 'workflow_abc123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 3, current: 3 }
      });
    });

    it('should not queue image upload job in workflow context when product creation fails', async () => {
      // Mock confidence error response
      const { supabase } = require('../supabaseClient');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          productName: 'unknown product',
          brand: '',
          confidence: 0.65, // Below threshold
          error: 'Product title scan failed.',
          retryable: false,
          apiCost: {
            inputTokens: 100,
            outputTokens: 20,
            totalCost: '0.000100'
          }
        },
        error: null
      });

      // Call with workflow context
      const result = await ProductCreationService.createProductFromPhoto(
        'base64image',
        '123456789012',
        'file://path/to/image.jpg',
        {
          workflowId: 'workflow_failed123',
          workflowType: 'add_new_product'
        }
      );

      // Verify error response
      expect(result.error).toBe('Product title scan failed.');
      expect(result.confidence).toBe(0.65);

      // Verify NO job was queued despite workflow context
      expect(mockQueueJob).not.toHaveBeenCalled();
    });

    it('should not queue image upload job when no image URI provided', async () => {
      // Mock successful response
      const { supabase } = require('../supabaseClient');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          productName: 'Test Product',
          brand: 'Test Brand',
          confidence: 0.95,
          product: { id: 1, upc: '123456789012' }
        },
        error: null
      });

      // Call WITHOUT image URI
      const result = await ProductCreationService.createProductFromPhoto(
        'base64image',
        '123456789012'
        // No imageUri parameter
      );

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.productName).toBe('Test Product');

      // Verify no job queued since no image URI
      expect(mockQueueJob).not.toHaveBeenCalled();
    });
  });
});