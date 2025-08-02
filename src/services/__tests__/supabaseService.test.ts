import { SupabaseService, SupabaseProduct, SupabaseIngredient } from '../supabaseService';
import { VeganStatus, ActionType } from '../../types';

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getUser: jest.fn(),
      signInAnonymously: jest.fn(),
    },
  },
}));

jest.mock('../deviceIdService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

const mockSupabase = require('../supabaseClient').supabase;

describe('SupabaseService', () => {
  const mockBarcode = '1234567890123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('mapClassificationToVeganStatus', () => {
    it('should map vegan classification correctly', () => {
      expect(SupabaseService.mapClassificationToVeganStatus('vegan')).toBe(VeganStatus.VEGAN);
      expect(SupabaseService.mapClassificationToVeganStatus('VEGAN')).toBe(VeganStatus.VEGAN);
    });

    it('should map vegetarian classification correctly', () => {
      expect(SupabaseService.mapClassificationToVeganStatus('vegetarian')).toBe(VeganStatus.VEGETARIAN);
      expect(SupabaseService.mapClassificationToVeganStatus('VEGETARIAN')).toBe(VeganStatus.VEGETARIAN);
    });

    it('should map non-vegetarian classification correctly', () => {
      expect(SupabaseService.mapClassificationToVeganStatus('non-vegetarian')).toBe(VeganStatus.NOT_VEGETARIAN);
      expect(SupabaseService.mapClassificationToVeganStatus('NON-VEGETARIAN')).toBe(VeganStatus.NOT_VEGETARIAN);
    });

    it('should map undetermined and unknown classifications to UNKNOWN', () => {
      expect(SupabaseService.mapClassificationToVeganStatus('undetermined')).toBe(VeganStatus.UNKNOWN);
      expect(SupabaseService.mapClassificationToVeganStatus('unknown')).toBe(VeganStatus.UNKNOWN);
      expect(SupabaseService.mapClassificationToVeganStatus('')).toBe(VeganStatus.UNKNOWN);
      expect(SupabaseService.mapClassificationToVeganStatus(null)).toBe(VeganStatus.UNKNOWN);
      expect(SupabaseService.mapClassificationToVeganStatus(undefined)).toBe(VeganStatus.UNKNOWN);
    });
  });

  describe('isValidClassification', () => {
    it('should return true for valid classifications', () => {
      expect(SupabaseService.isValidClassification('vegan')).toBe(true);
      expect(SupabaseService.isValidClassification('vegetarian')).toBe(true);
      expect(SupabaseService.isValidClassification('non-vegetarian')).toBe(true);
      expect(SupabaseService.isValidClassification('VEGAN')).toBe(true);
    });

    it('should return false for invalid classifications', () => {
      expect(SupabaseService.isValidClassification('undetermined')).toBe(false);
      expect(SupabaseService.isValidClassification('unknown')).toBe(false);
      expect(SupabaseService.isValidClassification('')).toBe(false);
      expect(SupabaseService.isValidClassification(null)).toBe(false);
      expect(SupabaseService.isValidClassification(undefined)).toBe(false);
    });
  });

  describe('getProductVeganStatus', () => {
    it('should return correct status for valid classification', () => {
      const product: SupabaseProduct = {
        ean13: '123',
        classification: 'vegan',
      };
      expect(SupabaseService.getProductVeganStatus(product)).toBe(VeganStatus.VEGAN);
    });

    it('should return UNKNOWN for invalid classification', () => {
      const product: SupabaseProduct = {
        ean13: '123',
        classification: 'undetermined',
      };
      expect(SupabaseService.getProductVeganStatus(product)).toBe(VeganStatus.UNKNOWN);
    });

    it('should return UNKNOWN for missing classification', () => {
      const product: SupabaseProduct = {
        ean13: '123',
      };
      expect(SupabaseService.getProductVeganStatus(product)).toBe(VeganStatus.UNKNOWN);
    });
  });

  describe('searchIngredientsByTitle', () => {
    it('should search ingredients successfully', async () => {
      const mockIngredients: SupabaseIngredient[] = [
        { title: 'milk', class: 'vegetarian' },
        { title: 'almond milk', class: 'vegan' },
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockIngredients,
        error: null,
      });

      const results = await SupabaseService.searchIngredientsByTitle('milk');

      expect(results).toEqual(mockIngredients);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_ingredients', {
        search_term: 'milk',
        device_id: 'test-device-id',
      });
    });

    it('should return empty array for empty search term', async () => {
      const results = await SupabaseService.searchIngredientsByTitle('');
      expect(results).toEqual([]);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle authentication errors', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'not logged in' },
      });

      await expect(SupabaseService.searchIngredientsByTitle('milk')).rejects.toThrow('not logged in');
    });

    it('should handle other RPC errors', async () => {
      const mockError = { message: 'RPC error' };
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(SupabaseService.searchIngredientsByTitle('milk')).rejects.toEqual(mockError);
      expect(console.error).toHaveBeenCalledWith('Error searching ingredients:', mockError);
    });

    it('should handle thrown exceptions', async () => {
      const mockError = new Error('Network error');
      mockSupabase.rpc.mockRejectedValue(mockError);

      await expect(SupabaseService.searchIngredientsByTitle('milk')).rejects.toThrow('Network error');
      expect(console.error).toHaveBeenCalledWith('Failed to search ingredients:', mockError);
    });
  });

  describe('getIngredientByTitle', () => {
    it('should get ingredient by exact title', async () => {
      const mockIngredient: SupabaseIngredient = {
        title: 'milk',
        class: 'vegetarian',
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockIngredient,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getIngredientByTitle('milk');

      expect(result).toEqual(mockIngredient);
      expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.eq).toHaveBeenCalledWith('title', 'milk');
      expect(mockQuery.in).toHaveBeenCalledWith('class', [
        'may be non-vegetarian',
        'non-vegetarian',
        'typically non-vegan',
        'typically non-vegetarian',
        'typically vegan',
        'typically vegetarian',
        'vegan',
        'vegetarian'
      ]);
    });

    it('should return null when ingredient not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }, // No rows returned
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getIngredientByTitle('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const mockError = { message: 'Database error', code: 'OTHER' };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(mockError),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(SupabaseService.getIngredientByTitle('milk')).rejects.toEqual(mockError);
      expect(console.error).toHaveBeenCalledWith('Failed to get ingredient:', mockError);
    });
  });

  describe('getProductByBarcode', () => {
    it('should get product by valid barcode', async () => {
      const mockProduct: SupabaseProduct = {
        ean13: '123456789012',
        product_name: 'Test Product',
        classification: 'vegan',
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockProduct,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getProductByBarcode('123456789012');

      expect(result).toEqual(mockProduct);
      expect(mockSupabase.from).toHaveBeenCalledWith('products');
      expect(mockQuery.or).toHaveBeenCalledWith('upc.eq.123456789012,ean13.eq.123456789012');
    });

    it('should return null for invalid barcode', async () => {
      const result = await SupabaseService.getProductByBarcode('invalid-barcode');
      expect(result).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should return null when product not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getProductByBarcode('123456789012');
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const mockError = { message: 'Database error', code: 'OTHER' };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(mockError),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(SupabaseService.getProductByBarcode('123456789012')).rejects.toEqual(mockError);
    });

    it('should validate barcode format', async () => {
      const testCases = [
        '',
        'abc',
        '123',
        '123456789012345678', // too long
        '1234567', // too short
      ];

      for (const barcode of testCases) {
        const result = await SupabaseService.getProductByBarcode(barcode);
        expect(result).toBeNull();
      }
    });
  });

  describe('searchProductByBarcode', () => {
    it('should search product by barcode successfully', async () => {
      const mockProduct: SupabaseProduct = {
        ean13: '123456789012',
        product_name: 'Test Product',
        classification: 'vegan',
      };

      mockSupabase.rpc.mockResolvedValue({
        data: [mockProduct],
        error: null,
      });

      const result = await SupabaseService.searchProductByBarcode('123456789012');

      expect(result.product).toEqual(mockProduct);
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('lookup_product', {
        barcode: '123456789012',
        device_id: 'test-device-id',
      });
    });

    it('should normalize EAN13 to UPC format', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await SupabaseService.searchProductByBarcode('0123456789012'); // EAN13 with leading zero

      expect(mockSupabase.rpc).toHaveBeenCalledWith('lookup_product', {
        barcode: '123456789012', // Should remove leading zero
        device_id: 'test-device-id',
      });
    });

    it('should handle rate limiting', async () => {
      const rateLimitResponse = [{
        ean13: '__RATE_LIMIT_EXCEEDED__',
        upc: 'free',
        brand: '3',
      }];

      mockSupabase.rpc.mockResolvedValue({
        data: rateLimitResponse,
        error: null,
      });

      const result = await SupabaseService.searchProductByBarcode('123456789012');

      expect(result.product).toBeNull();
      expect(result.isRateLimited).toBe(true);
      expect(result.rateLimitInfo).toEqual({
        subscriptionLevel: 'free',
        rateLimit: 3,
      });
    });

    it('should handle invalid barcode', async () => {
      const result = await SupabaseService.searchProductByBarcode('invalid');
      
      expect(result.product).toBeNull();
      expect(result.isRateLimited).toBe(false);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle authentication errors', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'not logged in' },
      });

      await expect(SupabaseService.searchProductByBarcode('123456789012')).rejects.toThrow('not logged in');
    });

    it('should handle other database errors', async () => {
      const mockError = { message: 'Database error' };
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(SupabaseService.searchProductByBarcode('123456789012')).rejects.toEqual(mockError);
    });
  });

  describe('getProductsByBarcodes', () => {
    it('should get multiple products by barcodes', async () => {
      const mockProducts: SupabaseProduct[] = [
        { ean13: '123456789012', product_name: 'Product 1' },
        { ean13: '123456789013', product_name: 'Product 2' },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockProducts,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getProductsByBarcodes(['123456789012', '123456789013']);

      expect(result).toEqual(mockProducts);
      expect(mockQuery.or).toHaveBeenCalledWith('upc.eq.123456789012,ean13.eq.123456789012,upc.eq.123456789013,ean13.eq.123456789013');
    });

    it('should return empty array for empty input', async () => {
      const result = await SupabaseService.getProductsByBarcodes([]);
      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should filter out invalid barcodes', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await SupabaseService.getProductsByBarcodes(['123456789012', 'invalid', '123456789013']);

      expect(mockQuery.or).toHaveBeenCalledWith('upc.eq.123456789012,ean13.eq.123456789012,upc.eq.123456789013,ean13.eq.123456789013');
    });

    it('should return empty array when no valid barcodes', async () => {
      const result = await SupabaseService.getProductsByBarcodes(['invalid1', 'invalid2']);
      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('searchProductsByName', () => {
    it('should search products by name', async () => {
      const mockProducts: SupabaseProduct[] = [
        { ean13: '123456789012', product_name: 'Almond Milk' },
        { ean13: '123456789013', product_name: 'Oat Milk' },
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockProducts,
        error: null,
      });

      const result = await SupabaseService.searchProductsByName('milk');

      expect(result).toEqual(mockProducts);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_products', {
        search_term: 'milk',
        device_id: 'test-device-id',
        page_offset: 0,
      });
    });

    it('should handle pagination', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await SupabaseService.searchProductsByName('milk', 10);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_products', {
        search_term: 'milk',
        device_id: 'test-device-id',
        page_offset: 10,
      });
    });

    it('should handle rate limiting', async () => {
      const rateLimitResponse = [{
        ean13: '__RATE_LIMIT_EXCEEDED__',
        upc: 'premium',
        brand: '10',
      }];

      mockSupabase.rpc.mockResolvedValue({
        data: rateLimitResponse,
        error: null,
      });

      const errorPromise = SupabaseService.searchProductsByName('milk');

      await expect(errorPromise).rejects.toThrow('Rate limit exceeded');
      
      try {
        await errorPromise;
      } catch (error: any) {
        expect(error.isRateLimit).toBe(true);
        expect(error.subscriptionLevel).toBe('premium');
        expect(error.rateLimit).toBe('10');
      }
    });

    it('should handle database errors', async () => {
      const mockError = { message: 'Database error' };
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(SupabaseService.searchProductsByName('milk')).rejects.toEqual(mockError);
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.testConnection();

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
    });

    it('should return false for failed connection', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection failed' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.testConnection();

      expect(result).toBe(false);
    });

    it('should handle thrown exceptions', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('logAction', () => {
    it('should log action successfully', async () => {
      const mockActionLog = {
        id: '123',
        type: ActionType.SCAN,
        input: '123456789012',
        userid: 'user123',
        deviceid: 'device123',
        result: 'found',
        metadata: { test: 'data' },
        created_at: new Date().toISOString(),
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockActionLog,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.logAction(
        ActionType.SCAN,
        '123456789012',
        'user123',
        'device123',
        'found',
        { test: 'data' }
      );

      expect(result).toEqual(mockActionLog);
      expect(mockSupabase.from).toHaveBeenCalledWith('actionlog');
      expect(mockQuery.insert).toHaveBeenCalledWith({
        type: ActionType.SCAN,
        input: '123456789012',
        userid: 'user123',
        deviceid: 'device123',
        result: 'found',
        metadata: { test: 'data' },
      });
    });

    it('should handle logging errors', async () => {
      const mockError = { message: 'Insert failed' };
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(SupabaseService.logAction(ActionType.SCAN, '123456789012', 'user123')).rejects.toEqual(mockError);
    });
  });

  describe('getUserActionLogs', () => {
    it('should get user action logs', async () => {
      const mockLogs = [
        { id: '1', type: 'barcode_scan', userid: 'user123' },
        { id: '2', type: 'product_search', userid: 'user123' },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockLogs,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getUserActionLogs('user123');

      expect(result).toEqual(mockLogs);
      expect(mockQuery.eq).toHaveBeenCalledWith('userid', 'user123');
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });

    it('should handle custom limit', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await SupabaseService.getUserActionLogs('user123', 10);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('getUserActionLogsByType', () => {
    it('should get user action logs by type', async () => {
      const mockLogs = [
        { id: '1', type: ActionType.SCAN, userid: 'user123' },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockLogs,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await SupabaseService.getUserActionLogsByType('user123', ActionType.SCAN);

      expect(result).toEqual(mockLogs);
      expect(mockQuery.eq).toHaveBeenCalledWith('userid', 'user123');
      expect(mockQuery.eq).toHaveBeenCalledWith('type', ActionType.SCAN);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle network failures gracefully', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network timeout'));

      await expect(SupabaseService.searchIngredientsByTitle('test')).rejects.toThrow('Network timeout');
    });

    it('should trim whitespace from search terms', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await SupabaseService.searchIngredientsByTitle('  milk  ');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_ingredients', {
        search_term: 'milk',
        device_id: 'test-device-id',
      });
    });

    it('should handle classification case sensitivity consistently', () => {
      const testCases = [
        { input: 'Vegan', expected: VeganStatus.VEGAN },
        { input: 'VEGETARIAN', expected: VeganStatus.VEGETARIAN },
        { input: 'Non-Vegetarian', expected: VeganStatus.NOT_VEGETARIAN },
        { input: 'UNDETERMINED', expected: VeganStatus.UNKNOWN },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(SupabaseService.mapClassificationToVeganStatus(input)).toBe(expected);
      });
    });
  });
});