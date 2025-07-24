import { SupabaseService, SupabaseProduct, SupabaseIngredient } from '../supabaseService';
import { VeganStatus } from '../../types';

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