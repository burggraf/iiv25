import { ProductLookupService, ProductLookupResult } from '../productLookupService';
import { SupabaseService } from '../supabaseService';
import { OpenFoodFactsService } from '../openFoodFactsApi';
import { VeganStatus, Product } from '../../types';

// Mock dependencies
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
    resolveImageUrl: jest.fn().mockReturnValue('https://example.com/image.jpg'),
  },
}));

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

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

      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: mockSupabaseProduct,
        isRateLimited: false,
      });

      (mockSupabaseService.getProductVeganStatus as jest.Mock).mockReturnValue(VeganStatus.VEGAN);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeDefined();
      expect(result.product?.veganStatus).toBe(VeganStatus.VEGAN);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).not.toHaveBeenCalled();
    });

    it('should fallback to Open Food Facts when not found in Supabase', async () => {
      // Mock Supabase returning no product
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts returning a product
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(mockProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).toHaveBeenCalledWith(mockBarcode);
    });

    it('should return null when product not found in either source', async () => {
      // Mock both sources returning no product
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(null);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle Supabase rate limiting', async () => {
      // Mock Supabase being rate limited
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: true,
        rateLimitInfo: {
          rateLimit: 100,
          subscriptionLevel: 'free',
        },
      });

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

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
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      // Mock Open Food Facts returning a product
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(mockProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error searching Supabase for barcode'),
        expect.any(Error)
      );
    });

    it('should handle Open Food Facts errors gracefully', async () => {
      // Mock Supabase returning no product
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts throwing an error
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Failed to fetch product information');
      expect(result.isRateLimited).toBe(false);
    });

    it('should detect rate limiting from Open Food Facts', async () => {
      // Mock Supabase returning no product
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock Open Food Facts returning 429 rate limit error
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = { status: 429 };
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockRejectedValue(rateLimitError);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Rate limited - please try again later');
      expect(result.isRateLimited).toBe(true);
    });

    it('should handle invalid barcode format by attempting lookup', async () => {
      // Mock both services returning no product for invalid barcodes
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(null);

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
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(null);

      for (const validBarcode of validBarcodes) {
        const result = await ProductLookupService.lookupProductByBarcode(validBarcode);

        expect(result.error).toBe(`Product not found for barcode: ${validBarcode}`);
        expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(validBarcode);

        jest.clearAllMocks();
      }
    });

    it('should handle context parameter for logging', async () => {
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: mockProduct,
        isRateLimited: false,
      });

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode, {
        context: 'Scanner Test',
      });

      expect(result.product).toEqual(mockProduct);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('HYBRID PRODUCT LOOKUP (Scanner Test)')
      );
    });

    it('should handle concurrent lookups correctly', async () => {
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: mockProduct,
        isRateLimited: false,
      });

      // Run multiple concurrent lookups
      const promises = [
        ProductLookupService.lookupProductByBarcode('1111111111111'),
        ProductLookupService.lookupProductByBarcode('2222222222222'),
        ProductLookupService.lookupProductByBarcode('3333333333333'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.product).toEqual(mockProduct);
        expect(result.error).toBeNull();
      });
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle malformed error responses', async () => {
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });

      // Mock malformed error (no response property)
      const malformedError = new Error('Network error');
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockRejectedValue(malformedError);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Failed to fetch product information');
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle undefined/null responses gracefully', async () => {
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue(undefined);
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(null);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle partial product data correctly', async () => {
      const partialProduct: Partial<Product> = {
        id: mockBarcode,
        barcode: mockBarcode,
        name: 'Partial Product',
        // Missing other required fields
      };

      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: partialProduct as Product,
        isRateLimited: false,
      });

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(partialProduct);
      expect(result.error).toBeNull();
    });
  });

  describe('Performance and logging', () => {
    it('should log appropriate messages during lookup process', async () => {
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(mockProduct);

      await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('HYBRID PRODUCT LOOKUP'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Barcode: 1234567890123'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Step 1: Checking Supabase'));
    });

    it('should handle very long barcodes by attempting lookup', async () => {
      const veryLongBarcode = '1'.repeat(50);
      
      (mockSupabaseService.searchProductByBarcode as jest.Mock).mockResolvedValue({
        product: null,
        isRateLimited: false,
      });
      (mockOpenFoodFactsService.getProductByBarcode as jest.Mock).mockResolvedValue(null);
      
      const result = await ProductLookupService.lookupProductByBarcode(veryLongBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe(`Product not found for barcode: ${veryLongBarcode}`);
      expect(result.isRateLimited).toBe(false);
    });
  });
});