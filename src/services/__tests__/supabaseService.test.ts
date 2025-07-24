import { SupabaseService } from '../supabaseService';
import { createClient } from '@supabase/supabase-js';
import { VeganStatus, Product } from '../../types';

// Mock Supabase client
jest.mock('@supabase/supabase-js');
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
      signInAnonymously: jest.fn(),
    },
  },
}));

const mockSupabase = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn(),
    signInAnonymously: jest.fn(),
  },
};

describe('SupabaseService', () => {
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('searchProductByBarcode', () => {
    it('should return product when found in database', async () => {
      const mockDbResult = {
        data: [{
          upc: mockBarcode,
          ean13: mockBarcode,
          product_name: 'Test Product',
          brand_name: 'Test Brand',
          vegan_status: 'vegan',
          ingredients: 'water, salt',
          last_scanned: '2024-01-01T00:00:00Z',
          image_url: 'https://example.com/image.jpg',
        }],
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          or: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const result = await SupabaseService.searchProductByBarcode(mockBarcode);

      expect(result).toBeDefined();
      expect(result?.barcode).toBe(mockBarcode);
      expect(result?.name).toBe('Test Product');
      expect(result?.brand).toBe('Test Brand');
      expect(result?.veganStatus).toBe(VeganStatus.VEGAN);
    });

    it('should return null when product not found', async () => {
      const mockDbResult = {
        data: [],
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          or: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const result = await SupabaseService.searchProductByBarcode(mockBarcode);

      expect(result).toBeNull();
    });

    it('should return null when database error occurs', async () => {
      const mockDbResult = {
        data: null,
        error: { message: 'Database error' },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          or: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const result = await SupabaseService.searchProductByBarcode(mockBarcode);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error searching for product in Supabase:',
        { message: 'Database error' }
      );
    });

    it('should handle different vegan status values', async () => {
      const testCases = [
        { db_status: 'vegan', expected: VeganStatus.VEGAN },
        { db_status: 'vegetarian', expected: VeganStatus.VEGETARIAN },
        { db_status: 'not_vegetarian', expected: VeganStatus.NOT_VEGETARIAN },
        { db_status: 'unknown', expected: VeganStatus.UNKNOWN },
        { db_status: null, expected: VeganStatus.UNKNOWN },
      ];

      for (const testCase of testCases) {
        const mockDbResult = {
          data: [{
            upc: mockBarcode,
            ean13: mockBarcode,
            product_name: 'Test Product',
            brand_name: 'Test Brand',
            vegan_status: testCase.db_status,
            ingredients: 'water, salt',
            last_scanned: '2024-01-01T00:00:00Z',
          }],
          error: null,
        };

        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            or: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue(mockDbResult),
            }),
          }),
        });

        const result = await SupabaseService.searchProductByBarcode(mockBarcode);

        expect(result?.veganStatus).toBe(testCase.expected);
      }
    });
  });

  describe('saveProductToDatabase', () => {
    it('should successfully save product to database', async () => {
      const mockDbResult = {
        data: { id: 1 },
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue(mockDbResult),
      });

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const result = await SupabaseService.saveProductToDatabase(mockProduct, 'device-123');

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('products');
    });

    it('should handle database save errors', async () => {
      const mockDbResult = {
        data: null,
        error: { message: 'Save error' },
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue(mockDbResult),
      });

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const result = await SupabaseService.saveProductToDatabase(mockProduct, 'device-123');

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error saving product to Supabase:',
        { message: 'Save error' }
      );
    });

    it('should sign in anonymously if no user exists', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: { user: { id: 'anon-user-123' } },
        error: null,
      });

      const mockDbResult = {
        data: { id: 1 },
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue(mockDbResult),
      });

      const result = await SupabaseService.saveProductToDatabase(mockProduct, 'device-123');

      expect(mockSupabase.auth.signInAnonymously).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('searchProductsByName', () => {
    it('should search products by name and return results', async () => {
      const mockDbResult = {
        data: [
          {
            upc: '123',
            ean13: '123',
            product_name: 'Test Product 1',
            brand_name: 'Brand A',
            vegan_status: 'vegan',
            ingredients: 'water',
            last_scanned: '2024-01-01T00:00:00Z',
          },
          {
            upc: '456',
            ean13: '456',
            product_name: 'Test Product 2',
            brand_name: 'Brand B',
            vegan_status: 'vegetarian',
            ingredients: 'milk',
            last_scanned: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const results = await SupabaseService.searchProductsByName('test');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Test Product 1');
      expect(results[0].veganStatus).toBe(VeganStatus.VEGAN);
      expect(results[1].name).toBe('Test Product 2');
      expect(results[1].veganStatus).toBe(VeganStatus.VEGETARIAN);
    });

    it('should return empty array when no products found', async () => {
      const mockDbResult = {
        data: [],
        error: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const results = await SupabaseService.searchProductsByName('nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      const mockDbResult = {
        data: null,
        error: { message: 'Search error' },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue(mockDbResult),
          }),
        }),
      });

      const results = await SupabaseService.searchProductsByName('test');

      expect(results).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'Error searching products by name in Supabase:',
        { message: 'Search error' }
      );
    });
  });
});