import { ProductLookupService } from '../productLookupService';
import { SupabaseService } from '../supabaseService';
import { OpenFoodFactsService } from '../openFoodFactsApi';
import { VeganStatus, Product } from '../../types';

// Mock dependencies
jest.mock('../supabaseService');
jest.mock('../openFoodFactsApi');
jest.mock('../deviceIdService', () => ({
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
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
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(mockProduct);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).not.toHaveBeenCalled();
    });

    it('should fallback to Open Food Facts when not found in Supabase', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);
      mockSupabaseService.saveProductToDatabase.mockResolvedValue(true);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockOpenFoodFactsService.getProductByBarcode).toHaveBeenCalledWith(mockBarcode);
      expect(mockSupabaseService.saveProductToDatabase).toHaveBeenCalledWith(mockProduct, 'test-device-id');
    });

    it('should return null when product not found in either source', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
    });

    it('should handle Supabase errors gracefully', async () => {
      mockSupabaseService.searchProductByBarcode.mockRejectedValue(new Error('Database error'));
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);
      mockSupabaseService.saveProductToDatabase.mockResolvedValue(true);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error searching Supabase for barcode 1234567890123:',
        expect.any(Error)
      );
    });

    it('should handle Open Food Facts errors gracefully', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(new Error('API error'));

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Failed to fetch product information');
      expect(result.isRateLimited).toBe(false);
    });

    it('should detect rate limiting from Open Food Facts', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = { status: 429 };
      mockOpenFoodFactsService.getProductByBarcode.mockRejectedValue(rateLimitError);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Rate limited - please try again later');
      expect(result.isRateLimited).toBe(true);
    });

    it('should handle invalid barcode format', async () => {
      const invalidBarcode = 'invalid';

      const result = await ProductLookupService.lookupProductByBarcode(invalidBarcode);

      expect(result.product).toBeNull();
      expect(result.error).toBe('Invalid barcode format');
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabaseService.searchProductByBarcode).not.toHaveBeenCalled();
      expect(mockOpenFoodFactsService.getProductByBarcode).not.toHaveBeenCalled();
    });

    it('should handle empty barcode', async () => {
      const result = await ProductLookupService.lookupProductByBarcode('');

      expect(result.product).toBeNull();
      expect(result.error).toBe('Invalid barcode format');
      expect(result.isRateLimited).toBe(false);
    });

    it('should save new product to Supabase when found in Open Food Facts', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);
      mockSupabaseService.saveProductToDatabase.mockResolvedValue(true);

      await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(mockSupabaseService.saveProductToDatabase).toHaveBeenCalledWith(mockProduct, 'test-device-id');
    });

    it('should continue even if saving to Supabase fails', async () => {
      mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
      mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(mockProduct);
      mockSupabaseService.saveProductToDatabase.mockResolvedValue(false);

      const result = await ProductLookupService.lookupProductByBarcode(mockBarcode);

      expect(result.product).toEqual(mockProduct);
      expect(result.error).toBeNull();
      expect(result.isRateLimited).toBe(false);
    });
  });

  describe('searchProductsByName', () => {
    const mockSearchResults = [
      { ...mockProduct, id: '1', name: 'Product 1' },
      { ...mockProduct, id: '2', name: 'Product 2' },
    ];

    it('should return search results from Supabase', async () => {
      mockSupabaseService.searchProductsByName.mockResolvedValue(mockSearchResults);

      const results = await ProductLookupService.searchProductsByName('test');

      expect(results).toEqual(mockSearchResults);
      expect(mockSupabaseService.searchProductsByName).toHaveBeenCalledWith('test');
    });

    it('should return empty array when no results found', async () => {
      mockSupabaseService.searchProductsByName.mockResolvedValue([]);

      const results = await ProductLookupService.searchProductsByName('nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      mockSupabaseService.searchProductsByName.mockRejectedValue(new Error('Search error'));

      const results = await ProductLookupService.searchProductsByName('test');

      expect(results).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'Error searching products by name:',
        expect.any(Error)
      );
    });

    it('should handle empty search query', async () => {
      const results = await ProductLookupService.searchProductsByName('');

      expect(results).toEqual([]);
      expect(mockSupabaseService.searchProductsByName).not.toHaveBeenCalled();
    });

    it('should trim whitespace from search query', async () => {
      mockSupabaseService.searchProductsByName.mockResolvedValue(mockSearchResults);

      await ProductLookupService.searchProductsByName('  test  ');

      expect(mockSupabaseService.searchProductsByName).toHaveBeenCalledWith('test');
    });
  });

  describe('Barcode validation', () => {
    const validBarcodes = [
      '1234567890123', // 13 digits
      '123456789012',  // 12 digits
      '12345678901',   // 11 digits
      '1234567890',    // 10 digits
      '123456789',     // 9 digits
      '12345678',      // 8 digits
    ];

    const invalidBarcodes = [
      '1234567',       // 7 digits (too short)
      '12345678901234', // 14 digits (too long)
      'abc123456789',  // Contains letters
      '123-456-789',   // Contains hyphens
      '123 456 789',   // Contains spaces
    ];

    validBarcodes.forEach(barcode => {
      it(`should accept valid barcode: ${barcode}`, async () => {
        mockSupabaseService.searchProductByBarcode.mockResolvedValue(null);
        mockOpenFoodFactsService.getProductByBarcode.mockResolvedValue(null);

        const result = await ProductLookupService.lookupProductByBarcode(barcode);

        expect(mockSupabaseService.searchProductByBarcode).toHaveBeenCalledWith(barcode);
      });
    });

    invalidBarcodes.forEach(barcode => {
      it(`should reject invalid barcode: ${barcode}`, async () => {
        const result = await ProductLookupService.lookupProductByBarcode(barcode);

        expect(result.error).toBe('Invalid barcode format');
        expect(mockSupabaseService.searchProductByBarcode).not.toHaveBeenCalled();
      });
    });
  });
});