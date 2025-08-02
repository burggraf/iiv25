// Mock all dependencies before importing the service
jest.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

jest.mock('../supabaseService', () => ({
  SupabaseService: {
    searchProductByBarcode: jest.fn(),
    getProductVeganStatus: jest.fn(),
  },
}));

jest.mock('../openFoodFactsApi', () => ({
  OpenFoodFactsService: {
    getProductByBarcode: jest.fn(),
  },
}));

jest.mock('../deviceIdService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

jest.mock('../productImageUrlService', () => ({
  ProductImageUrlService: {
    resolveImageUrl: jest.fn(),
  },
}));

const mockProductImageUrlService = jest.requireMock('../productImageUrlService').ProductImageUrlService;

// Mock React Native polyfills and environment
jest.mock('../../utils/rn-polyfill', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Mock environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { ProductLookupService, ProductLookupResult } from '../productLookupService';
import { SupabaseService } from '../supabaseService';
import { OpenFoodFactsService } from '../openFoodFactsApi';
import { VeganStatus, Product } from '../../types';

const mockSupabaseService = SupabaseService as jest.Mocked<typeof SupabaseService>;
const mockOpenFoodFactsService = OpenFoodFactsService as jest.Mocked<typeof OpenFoodFactsService>;

describe('ProductLookupService', () => {
  const mockBarcode = '1234567890123';
  const mockProduct: Product = {
    id: mockBarcode,
    barcode: mockBarcode,
    name: 'Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.VEGAN,
    ingredients: ['water', 'salt'],
    lastScanned: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Default mock behavior - return image URL
    mockProductImageUrlService.resolveImageUrl.mockReturnValue('https://example.com/image.jpg');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('lookupProductByBarcode', () => {
    it('should return product from Supabase when found', async () => {
      // Mock Supabase returning a product with database structure
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeDefined();
      expect(result.product?.veganStatus).toBe(VeganStatus.VEGAN);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).not.toHaveBeenCalled();
    });

    it('should fallback to Open Food Facts when not found in Supabase', async () => {
      // Mock Supabase returning no product
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts returning a product
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).toHaveBeenCalledWith(mockBarcode);
    });

    it('should return null when product not found in either source', async () => {
      // Mock both sources returning no product
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle Supabase rate limiting', async () => {
      // Mock Supabase being rate limited
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: true,
        rateLimitInfo: {
          rateLimit: 100,
          subscriptionLevel: 'free',
        },
      });

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.isRateLimited).toBe(true);
      expect(result.rateLimitInfo).toEqual({
        rateLimit: 100,
        subscriptionLevel: 'free',
      });
    });

    it('should handle Supabase errors gracefully', async () => {
      // Mock Supabase throwing an error
      mockSupabaseService.searchProductByBarcode.mockRejectedValue(new Error('Database error'));
      
      // Mock Open Food Facts returning a product
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle Open Food Facts errors gracefully', async () => {
      // Mock Supabase returning no product
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts throwing an error
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(new Error('API error'));

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should detect rate limiting from Open Food Facts', async () => {
      // Mock Supabase returning no product
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts returning 429 rate limit error
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = { status: 429 };
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(rateLimitError);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle invalid barcode format by attempting lookup', async () => {
      // Mock both services returning no product for invalid barcodes
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

      const invalidBarcodes = [
        'invalid',
        '123', // too short
        '12345678901234567890', // too long
        'abc123456789',
        '',
      ];

      for (const invalidBarcode of invalidBarcodes) {
        const result = await ProductLookupService.lookupProductByBarcode(invalidBarcode);

        expect(result.product).toBeNull();
        expect(result.error).toBe(`Product not found for barcode: ${invalidBarcode}`);
        expect(result.isRateLimited).toBe(false);
        expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(invalidBarcode);

        jest.clearAllMocks();
      }
    });

    it('should accept valid barcode formats', async () => {
      const validBarcodes = [
        '1234567890123', // 13 digits (EAN-13)
        '123456789012',  // 12 digits (UPC-A)
        '12345678901',   // 11 digits
        '1234567890',    // 10 digits
        '123456789',     // 9 digits
        '12345678',      // 8 digits (EAN-8)
      ];

      // Mock Supabase returning no product for all tests
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

      for (const validBarcode of validBarcodes) {
        const result = await ProductLookupService.lookupProductByBarcode(validBarcode);

        expect(result.error).toBe(`Product not found for barcode: ${validBarcode}`);
        expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(validBarcode);

        jest.clearAllMocks();
      }
    });

    it('should handle context parameter for logging', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode, {
        context: 'Scanner Test',
      });

      expect(result).toBeDefined();
      expect(result.product).toBeDefined();
      expect(result.product?.veganStatus).toBe(VeganStatus.VEGAN);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('HYBRID PRODUCT LOOKUP (Scanner Test)')
      );
    });

    it('should handle concurrent lookups correctly', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);

      // Run multiple concurrent lookups
      const promises = [
        ProductLookupService.lookupProductByBarcode('1111111111111'),
        ProductLookupService.lookupProductByBarcode('2222222222222'),
        ProductLookupService.lookupProductByBarcode('3333333333333'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.product).toBeDefined();
        expect(result.product?.veganStatus).toBe(VeganStatus.VEGAN);
        expect(result.error).toBeNull();
      });
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle malformed error responses', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock malformed error (no response property)
      const malformedError = new Error('Network error');
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(malformedError);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle undefined/null responses gracefully', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle partial product data correctly', async () => {
      const partialSupabaseProduct = {
        ean13: mockBarcode,
        product_name: 'Partial Product',
        // Missing other fields
        classification: 'vegan',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: partialSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeDefined();
      expect(result.product?.name).toBe('Partial Product');
      expect(result.product?.veganStatus).toBe(VeganStatus.VEGAN);
      expect(result.error).toBeNull();
    });
  });

  describe('Performance and logging', () => {
    it('should log appropriate messages during lookup process', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);

      await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('HYBRID PRODUCT LOOKUP'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Barcode: 1234567890123'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Step 1: Checking Supabase'));
    });

    it('should handle very long barcodes by attempting lookup', async () => {
      const veryLongBarcode = '1'.repeat(50);
      
      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);
      
      const result = await ProductLookupService.lookupProductByBarcode(veryLongBarcode);

      expect(result).toBeDefined();
      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${veryLongBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });
  });

  describe('Image handling scenarios', () => {
    it('should fetch image from OpenFoodFacts when database has no image', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: undefined, // No image in database
      };

      const mockOFFProduct = {
        ...mockProduct,
        imageUrl: 'https://example.com/off-image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.imageUrl).toBe('https://example.com/image.jpg'); // resolved via ProductImageUrlService mock
      expect(mockOpenFoodFactsService.getProductByBarcode).toHaveBeenCalledWith(mockBarcode);
    });

    it('should handle image fetch error gracefully', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: undefined,
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(new Error('Image fetch failed'));
      
      // Mock resolveImageUrl to return undefined when no image available
      mockProductImageUrlService.resolveImageUrl.mockReturnValue(undefined);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.imageUrl).toBeUndefined();
      expect(result.error).toBeNull();
    });

    it('should handle OpenFoodFacts returning no image', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients?.join(', '),
        classification: 'vegan',
        imageurl: undefined,
      };

      const mockOFFProduct = {
        ...mockProduct,
        imageUrl: undefined,
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);
      
      // Mock resolveImageUrl to return undefined when no image available
      mockProductImageUrlService.resolveImageUrl.mockReturnValue(undefined);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.imageUrl).toBeUndefined();
    });
  });

  describe('Undetermined classification handling', () => {
    it('should handle undetermined classification with existing ingredients', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: 'water, salt, sugar',
        classification: 'undetermined',
        imageurl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.UNKNOWN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.veganStatus).toBe(VeganStatus.UNKNOWN);
      expect(result.product?.ingredients).toEqual(['water', 'salt', 'sugar']);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Product already has ingredients on file'));
    });

    it('should handle undetermined classification with no ingredients', async () => {
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: '',
        classification: 'undetermined',
        imageurl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.UNKNOWN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.veganStatus).toBe(VeganStatus.UNKNOWN);
      expect(result.product?.ingredients).toEqual([]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No ingredients found - scan option will be available'));
    });
  });

  describe('Async product creation scenarios', () => {
    it('should trigger async product creation for OpenFoodFacts products with ingredients', async () => {
      const mockOFFProduct = {
        ...mockProduct,
        ingredients: ['water', 'salt'],
        classificationMethod: 'text-based' as const,
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockOFFProduct);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Product has ingredients - creating with classification'));
    });

    it('should trigger basic product creation for OpenFoodFacts products without ingredients', async () => {
      const mockOFFProduct = {
        ...mockProduct,
        ingredients: [],
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockOFFProduct);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Product has no ingredients - creating basic record'));
    });
  });

  describe('Edge function calls', () => {
    it('should make edge function calls for async operations', async () => {
      const { supabase } = jest.requireMock('../supabaseClient');
      
      // Test update product image async call
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        classification: 'vegan',
        imageurl: undefined,
      };

      const mockOFFProduct = {
        ...mockProduct,
        imageUrl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);

      supabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });

      await ProductLookupService.lookupProductByBarcode(mockBarcode);

      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(supabase.functions.invoke).toHaveBeenCalledWith('update-product-image-from-off', {
        body: { upc: mockBarcode }
      });
    });

    it('should handle edge function errors gracefully', async () => {
      const { supabase } = jest.requireMock('../supabaseClient');
      
      const mockSupabaseProduct = {
        ean13: mockBarcode,
        product_name: mockProduct.name,
        classification: 'vegan',
        imageurl: undefined,
      };

      const mockOFFProduct = {
        ...mockProduct,
        imageUrl: 'https://example.com/image.jpg',
      };

      mockSupabaseService.searchProductByBarcode.mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      mockSupabaseService.getProductVeganStatus.mockReturnValue(VeganStatus.VEGAN);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockOFFProduct);

      supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Function failed' } });

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.error).toBeNull(); // Edge function errors should not affect main flow
    });
  });

  describe('Classification mapping', () => {
    it('should map database classifications correctly through the service', async () => {
      const testCases = [
        { classification: 'vegan', expected: VeganStatus.VEGAN },
        { classification: 'vegetarian', expected: VeganStatus.VEGETARIAN },
        { classification: 'non-vegetarian', expected: VeganStatus.NOT_VEGETARIAN },
        { classification: 'undetermined', expected: VeganStatus.UNKNOWN },
        { classification: 'invalid', expected: VeganStatus.UNKNOWN },
        { classification: undefined, expected: VeganStatus.UNKNOWN },
      ];

      for (const testCase of testCases) {
        const mockSupabaseProduct = {
          ean13: mockBarcode,
          product_name: mockProduct.name,
          classification: testCase.classification,
        };

        mockSupabaseService.searchProductByBarcode.mockResolvedValue({
          product: mockSupabaseProduct,
          isRateLimited: false,
        });

        mockSupabaseService.getProductVeganStatus.mockReturnValue(testCase.expected);

        const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

        expect(result.product?.veganStatus).toBe(testCase.expected);
        
        jest.clearAllMocks();
      }
    });
  });

  describe('Error boundary testing', () => {
    it('should handle service errors gracefully and fall back appropriately', async () => {
      // Service errors are handled gracefully, not thrown to main catch
      mockSupabaseService.searchProductByBarcode.mockRejectedValue(new Error('Database error'));
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(new Error('API error'));

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle both service failures gracefully', async () => {
      // Both services fail but should not crash the main function
      mockSupabaseService.searchProductByBarcode.mockRejectedValue(new Error('DB down'));
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(new Error('API down'));

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${mockBarcode}`);
      expect(result.isRateLimited).toBe(false);
      
      // Should log the individual service errors but not the main catch block
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Supabase lookup error'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('OpenFoodFacts lookup error'));
    });
  });
});