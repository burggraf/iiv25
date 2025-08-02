import { ProductCreationService, CreateProductResponse } from '../productCreationService';
import { supabase } from '../supabaseClient';
import { ProductImageUploadService } from '../productImageUploadService';

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

// Mock ProductImageUploadService
jest.mock('../productImageUploadService', () => ({
  ProductImageUploadService: {
    processProductImage: jest.fn(),
  },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockProductImageUploadService = ProductImageUploadService as jest.Mocked<typeof ProductImageUploadService>;

describe('ProductCreationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock setTimeout to execute immediately in tests
    jest.spyOn(global, 'setTimeout').mockImplementation((callback: Function) => {
      callback();
      return {} as any;
    });
    
    // Ensure ProductImageUploadService.processProductImage returns a proper Promise
    mockProductImageUploadService.processProductImage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createProductFromPhoto', () => {
    const mockImageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVR...';
    const mockUpc = '123456789012';
    const mockImageUri = 'file:///path/to/image.jpg';

    it('should create product successfully', async () => {
      const mockResponse: CreateProductResponse = {
        product: { id: 'product-123' },
        productName: 'Test Product',
        brand: 'Test Brand',
        confidence: 95,
        classification: 'vegan',
        apiCost: {
          inputTokens: 100,
          outputTokens: 50,
          totalCost: '$0.001',
        },
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      const result = await ProductCreationService.createProductFromPhoto(
        mockImageBase64,
        mockUpc,
        mockImageUri
      );

      expect(result).toEqual(mockResponse);
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('create-product-from-photo', {
        body: {
          imageBase64: mockImageBase64,
          upc: mockUpc,
        },
      });
      expect(console.log).toHaveBeenCalledWith(
        '💰 Gemini API Cost (Product Creation):',
        mockResponse.apiCost
      );
      expect(console.log).toHaveBeenCalledWith(
        '📦 Product created/updated: Test Product (Test Brand)'
      );
      expect(console.log).toHaveBeenCalledWith('🎯 Confidence: 95%');
    });

    it('should handle product creation without brand', async () => {
      const mockResponse: CreateProductResponse = {
        productName: 'Test Product',
        confidence: 85,
        classification: 'vegetarian',
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual(mockResponse);
      expect(console.log).toHaveBeenCalledWith('📦 Product created/updated: Test Product');
      expect(console.log).toHaveBeenCalledWith('🎯 Confidence: 85%');
    });

    it('should trigger async image upload when imageUri is provided', async () => {
      const mockResponse: CreateProductResponse = {
        productName: 'Test Product',
        confidence: 90,
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      mockProductImageUploadService.processProductImage.mockResolvedValue(undefined);

      await ProductCreationService.createProductFromPhoto(
        mockImageBase64,
        mockUpc,
        mockImageUri
      );

      expect(console.log).toHaveBeenCalledWith(`📸 Starting async image upload for UPC: ${mockUpc}`);
      expect(mockProductImageUploadService.processProductImage).toHaveBeenCalledWith(
        mockImageUri,
        mockUpc
      );
      expect(console.log).toHaveBeenCalledWith(`✅ Image upload completed for UPC: ${mockUpc}`);
    });

    it('should handle image upload errors gracefully', async () => {
      const mockResponse: CreateProductResponse = {
        productName: 'Test Product',
        confidence: 90,
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      const uploadError = new Error('Upload failed');
      mockProductImageUploadService.processProductImage.mockRejectedValue(uploadError);

      // Let the setTimeout execute its callback in real time for this test
      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: Function, delay?: number) => {
        // Execute immediately but still return promise
        Promise.resolve().then(() => callback());
        return {} as any;
      });

      await ProductCreationService.createProductFromPhoto(
        mockImageBase64,
        mockUpc,
        mockImageUri
      );

      // Wait for Promise chain to complete
      await new Promise(resolve => originalSetTimeout(resolve, 10));

      expect(mockProductImageUploadService.processProductImage).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        `❌ Image upload failed for UPC: ${mockUpc}`,
        uploadError
      );
    });

    it('should not trigger image upload when no imageUri provided', async () => {
      const mockResponse: CreateProductResponse = {
        productName: 'Test Product',
        confidence: 90,
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(mockProductImageUploadService.processProductImage).not.toHaveBeenCalled();
    });

    it('should not trigger image upload when product creation fails', async () => {
      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          error: 'Product creation failed',
          retryable: false,
        },
        error: { message: 'Edge function error' },
      });

      await ProductCreationService.createProductFromPhoto(
        mockImageBase64,
        mockUpc,
        mockImageUri
      );

      expect(mockProductImageUploadService.processProductImage).not.toHaveBeenCalled();
    });

    it('should handle edge function errors with retryable flag', async () => {
      const mockErrorData = {
        retryable: true,
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockErrorData,
        error: { message: 'Service temporarily unavailable' },
      });

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual({
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: 'Service temporarily unavailable',
        retryable: true,
      });
      expect(console.error).toHaveBeenCalledWith(
        'Edge function error:',
        'Service temporarily unavailable',
        'Retryable:',
        true
      );
    });

    it('should handle edge function errors without retryable flag', async () => {
      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {},
        error: { message: 'Invalid image format' },
      });

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual({
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: 'Invalid image format',
        retryable: false,
      });
      expect(console.error).toHaveBeenCalledWith(
        'Edge function error:',
        'Invalid image format',
        'Retryable:',
        false
      );
    });

    it('should handle edge function errors without error message', async () => {
      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {},
        error: {},
      });

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual({
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: 'Unknown error occurred',
        retryable: false,
      });
    });

    it('should handle thrown exceptions', async () => {
      const mockError = new Error('Network error');
      (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(mockError);

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual({
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: 'Network error',
        retryable: true, // Network errors are retryable
      });
      expect(console.error).toHaveBeenCalledWith(
        'Error calling product creation service:',
        mockError
      );
    });

    it('should identify retryable errors correctly', async () => {
      const retryableErrors = [
        'Service temporarily unavailable',
        'Server overloaded',
        '503 Service Unavailable',
        'Network error occurred',
      ];

      for (const errorMessage of retryableErrors) {
        const mockError = new Error(errorMessage);
        (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(mockError);

        const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

        expect(result.retryable).toBe(true);
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should identify non-retryable errors correctly', async () => {
      const nonRetryableErrors = [
        'Invalid image format',
        'Unsupported file type',
        'Image too large',
        'Authorization failed',
      ];

      for (const errorMessage of nonRetryableErrors) {
        const mockError = new Error(errorMessage);
        (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(mockError);

        const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

        expect(result.retryable).toBe(false);
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should handle non-Error exceptions', async () => {
      const mockException = 'String error';
      (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(mockException);

      const result = await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      expect(result).toEqual({
        productName: 'unknown product',
        brand: '',
        confidence: 0,
        error: 'Unknown error occurred',
        retryable: false,
      });
    });

    it('should handle missing API cost information', async () => {
      const mockResponse: CreateProductResponse = {
        productName: 'Test Product',
        confidence: 90,
      };

      (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockResponse,
        error: null,
      });

      await ProductCreationService.createProductFromPhoto(mockImageBase64, mockUpc);

      // Should not log API cost if not present
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('💰 Gemini API Cost')
      );
    });
  });
});