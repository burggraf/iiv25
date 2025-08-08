import { cacheInvalidationService } from '../CacheInvalidationService';
import { cacheService } from '../CacheService';
import { backgroundQueueService } from '../backgroundQueueService';
import { ProductLookupService } from '../productLookupService';
import { BackgroundJob } from '../../types/backgroundJobs';
import { VeganStatus } from '../../types';

// Mock dependencies
jest.mock('../CacheService', () => ({
  cacheService: {
    setProduct: jest.fn(),
    invalidateProduct: jest.fn(),
  }
}));

jest.mock('../backgroundQueueService', () => ({
  backgroundQueueService: {
    subscribeToJobUpdates: jest.fn(),
    getQueueStats: jest.fn().mockReturnValue({
      active: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
    }),
  }
}));

jest.mock('../productLookupService', () => ({
  ProductLookupService: {
    lookupProductByBarcode: jest.fn(),
  }
}));

const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;
const mockBackgroundQueueService = backgroundQueueService as jest.Mocked<typeof backgroundQueueService>;
const mockProductLookupService = ProductLookupService as jest.Mocked<typeof ProductLookupService>;

describe('CacheInvalidationService', () => {
  const mockJob: BackgroundJob = {
    id: 'job123',
    jobType: 'ingredient_parsing',
    status: 'completed',
    priority: 1,
    upc: '12345',
    deviceId: 'device123',
    imageUri: 'file://test.jpg',
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    estimatedCompletionAt: new Date('2024-01-01T00:01:00Z'),
    completedAt: new Date('2024-01-01T00:00:30Z'),
    resultData: {
      success: true,
      updatedProduct: {
        id: '12345',
        barcode: '12345',
        name: 'Test Product',
        ingredients: ['water', 'sugar', 'salt'],
        veganStatus: VeganStatus.VEGAN,
      }
    }
  };

  let mockJobUpdateCallback: (event: string, job?: BackgroundJob) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the subscription callback
    mockBackgroundQueueService.subscribeToJobUpdates.mockImplementation((callback) => {
      mockJobUpdateCallback = callback;
      return jest.fn(); // Return unsubscribe function
    });
    
    // Reset service state
    (cacheInvalidationService as any).isInitialized = false;
  });

  afterEach(() => {
    cacheInvalidationService.cleanup();
  });

  describe('initialize', () => {
    it('should initialize and subscribe to background job updates', async () => {
      await cacheInvalidationService.initialize();
      
      expect(mockBackgroundQueueService.subscribeToJobUpdates).toHaveBeenCalled();
      expect(cacheInvalidationService.getStatus().isInitialized).toBe(true);
      expect(cacheInvalidationService.getStatus().isListeningToJobs).toBe(true);
    });

    it('should not initialize twice', async () => {
      await cacheInvalidationService.initialize();
      await cacheInvalidationService.initialize();
      
      expect(mockBackgroundQueueService.subscribeToJobUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleJobCompleted - ingredient_parsing', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should update cache when ingredient parsing succeeds with updated product', async () => {
      mockCacheService.setProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', mockJob);
      
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(
        '12345',
        mockJob.resultData.updatedProduct
      );
    });

    it('should invalidate cache when ingredient parsing succeeds but no updated product', async () => {
      const jobWithoutUpdatedProduct = {
        ...mockJob,
        resultData: { success: true }
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', jobWithoutUpdatedProduct);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'ingredient parsing completed (no updates)'
      );
    });

    it('should invalidate cache when ingredient parsing fails', async () => {
      const failedJob = {
        ...mockJob,
        resultData: { success: false, error: 'parsing failed' }
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', failedJob);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'ingredient parsing completed (no updates)'
      );
    });
  });

  describe('handleJobCompleted - product_creation', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should invalidate cache when product creation completes', async () => {
      const productCreationJob = {
        ...mockJob,
        jobType: 'product_creation' as const,
        resultData: { success: true, productId: '12345' }
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', productCreationJob);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'new product created'
      );
    });
  });

  describe('handleJobCompleted - product_photo_upload', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should refresh cache with image cache busting when photo upload completes', async () => {
      const photoUploadJob = {
        ...mockJob,
        jobType: 'product_photo_upload' as const,
        resultData: { success: true, imageUrl: 'https://example.com/image.jpg' }
      };
      
      const mockFreshProduct = {
        id: '12345',
        barcode: '12345',
        name: 'Test Product',
        ingredients: ['water', 'sugar'],
        imageUrl: '[SUPABASE]',
        veganStatus: VeganStatus.VEGAN,
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockFreshProduct,
        error: null,
        isRateLimited: false
      });
      mockCacheService.setProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', photoUploadJob);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'product photo updated'
      );
      expect(mockProductLookupService.lookupProductByBarcode).toHaveBeenCalledWith(
        '12345',
        { context: 'CacheInvalidation' }
      );
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          ...mockFreshProduct,
          imageUrl: expect.stringMatching(/^\[SUPABASE\]\?v=\d+$/)
        })
      );
    });

    it('should fallback to regular invalidation if fresh product lookup fails', async () => {
      const photoUploadJob = {
        ...mockJob,
        jobType: 'product_photo_upload' as const,
        resultData: { success: true, imageUrl: 'https://example.com/image.jpg' }
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: null,
        error: 'Product not found',
        isRateLimited: false
      });
      
      await mockJobUpdateCallback('job_completed', photoUploadJob);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'product photo updated'
      );
      expect(mockCacheService.setProduct).not.toHaveBeenCalled();
    });

    it('should handle cache busting for full Supabase URLs', async () => {
      const photoUploadJob = {
        ...mockJob,
        jobType: 'product_photo_upload' as const,
        resultData: { success: true, imageUrl: 'https://example.com/image.jpg' }
      };
      
      const mockFreshProduct = {
        id: '12345',
        barcode: '12345',
        name: 'Test Product',
        ingredients: ['water', 'sugar'],
        imageUrl: 'https://supabase.co/storage/v1/object/public/product-images/12345.jpg',
        veganStatus: VeganStatus.VEGAN,
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockFreshProduct,
        error: null,
        isRateLimited: false
      });
      mockCacheService.setProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', photoUploadJob);
      
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          ...mockFreshProduct,
          imageUrl: expect.stringMatching(/^https:\/\/supabase\.co\/storage\/v1\/object\/public\/product-images\/12345\.jpg\?v=\d+$/)
        })
      );
    });

    it('should not modify non-Supabase image URLs', async () => {
      const photoUploadJob = {
        ...mockJob,
        jobType: 'product_photo_upload' as const,
        resultData: { success: true, imageUrl: 'https://example.com/image.jpg' }
      };
      
      const mockFreshProduct = {
        id: '12345',
        barcode: '12345',
        name: 'Test Product',
        ingredients: ['water', 'sugar'],
        imageUrl: 'https://images.openfoodfacts.org/product/12345.jpg',
        veganStatus: VeganStatus.VEGAN,
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockFreshProduct,
        error: null,
        isRateLimited: false
      });
      mockCacheService.setProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_completed', photoUploadJob);
      
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(
        '12345',
        mockFreshProduct // Should be unchanged
      );
    });
  });

  describe('handleJobFailed', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should not invalidate cache for failed ingredient parsing', async () => {
      const failedJob = {
        ...mockJob,
        status: 'failed' as const,
        errorMessage: 'OCR failed'
      };
      
      await mockJobUpdateCallback('job_failed', failedJob);
      
      expect(mockCacheService.invalidateProduct).not.toHaveBeenCalled();
    });

    it('should invalidate cache for failed product creation', async () => {
      const failedJob = {
        ...mockJob,
        jobType: 'product_creation' as const,
        status: 'failed' as const,
        errorMessage: 'Creation failed'
      };
      
      mockCacheService.invalidateProduct.mockResolvedValue();
      
      await mockJobUpdateCallback('job_failed', failedJob);
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        '12345',
        'product creation failed'
      );
    });

    it('should not invalidate cache for failed photo upload', async () => {
      const failedJob = {
        ...mockJob,
        jobType: 'product_photo_upload' as const,
        status: 'failed' as const,
        errorMessage: 'Upload failed'
      };
      
      await mockJobUpdateCallback('job_failed', failedJob);
      
      expect(mockCacheService.invalidateProduct).not.toHaveBeenCalled();
    });
  });

  describe('manual invalidation and refresh', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should allow manual product invalidation', async () => {
      mockCacheService.invalidateProduct.mockResolvedValue();
      
      await cacheInvalidationService.invalidateProduct('12345', 'manual test');
      
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith('12345', 'manual test');
    });

    it('should allow manual cache refresh', async () => {
      const updatedProduct = {
        id: '12345',
        barcode: '12345',
        name: 'Updated Product',
        ingredients: ['new', 'ingredients'],
        veganStatus: 'vegetarian',
      };
      
      mockCacheService.setProduct.mockResolvedValue();
      
      await cacheInvalidationService.refreshProductCacheWithData('12345', updatedProduct, 'manual refresh');
      
      expect(mockCacheService.setProduct).toHaveBeenCalledWith('12345', updatedProduct);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await cacheInvalidationService.initialize();
    });

    it('should handle cache service errors gracefully', async () => {
      mockCacheService.invalidateProduct.mockRejectedValue(new Error('Cache error'));
      
      // Should not throw
      await expect(mockJobUpdateCallback('job_completed', {
        ...mockJob,
        jobType: 'product_creation'
      })).resolves.toBeUndefined();
    });

    it('should handle missing job gracefully', async () => {
      // Should not throw
      await expect(mockJobUpdateCallback('job_completed')).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources and stop listening to job updates', async () => {
      const unsubscribeFn = jest.fn();
      mockBackgroundQueueService.subscribeToJobUpdates.mockReturnValue(unsubscribeFn);
      
      await cacheInvalidationService.initialize();
      cacheInvalidationService.cleanup();
      
      expect(unsubscribeFn).toHaveBeenCalled();
      expect(cacheInvalidationService.getStatus().isInitialized).toBe(false);
      expect(cacheInvalidationService.getStatus().isListeningToJobs).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not initialized', () => {
      const status = cacheInvalidationService.getStatus();
      
      expect(status.isInitialized).toBe(false);
      expect(status.isListeningToJobs).toBe(false);
    });

    it('should return correct status when initialized', async () => {
      await cacheInvalidationService.initialize();
      
      const status = cacheInvalidationService.getStatus();
      
      expect(status.isInitialized).toBe(true);
      expect(status.isListeningToJobs).toBe(true);
    });
  });
});