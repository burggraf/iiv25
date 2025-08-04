import AsyncStorage from '@react-native-async-storage/async-storage';
import { historyService } from '../HistoryService';
import { cacheService } from '../CacheService';
import { Product, VeganStatus } from '../../types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock CacheService
jest.mock('../CacheService', () => ({
  cacheService: {
    setProduct: jest.fn(),
    getProduct: jest.fn(),
    invalidateProduct: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('HistoryService', () => {
  const mockProduct: Product = {
    id: '12345',
    barcode: '12345',
    name: 'Test Product',
    brand: 'Test Brand',
    ingredients: ['water', 'sugar'],
    veganStatus: VeganStatus.VEGAN,
    imageUrl: 'https://example.com/image.jpg',
    lastScanned: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset history service state
    (historyService as any).historyItems = [];
    (historyService as any).isInitialized = false;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize and load history from storage', async () => {
      const mockHistoryData = [
        {
          barcode: '12345',
          scannedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
          cachedProduct: {
            ...mockProduct,
            lastScanned: new Date('2024-01-01T00:00:00Z').toISOString(),
          }
        }
      ];
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockHistoryData));
      
      await historyService.initialize();
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].barcode).toBe('12345');
    });

    it('should migrate old format history to new format', async () => {
      const oldFormatHistory = [mockProduct];
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(oldFormatHistory));
      mockAsyncStorage.setItem.mockResolvedValue();
      
      await historyService.initialize();
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].cachedProduct).toEqual(expect.objectContaining({
        barcode: mockProduct.barcode,
        name: mockProduct.name,
      }));
      
      // Should have migrated to cache service
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(mockProduct.barcode, mockProduct);
    });

    it('should handle empty storage gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      await historyService.initialize();
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('addToHistory', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
    });

    it('should add new product to history', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      
      await historyService.addToHistory(mockProduct);
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].barcode).toBe(mockProduct.barcode);
      expect(mockCacheService.setProduct).toHaveBeenCalledWith(mockProduct.barcode, expect.any(Object));
    });

    it('should update existing product and move to top', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      
      // Add first product
      await historyService.addToHistory(mockProduct);
      
      // Add second product
      const secondProduct = { ...mockProduct, barcode: '67890', id: '67890', name: 'Second Product' };
      await historyService.addToHistory(secondProduct);
      
      // Add first product again
      const updatedFirstProduct = { ...mockProduct, name: 'Updated Product' };
      await historyService.addToHistory(updatedFirstProduct);
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].barcode).toBe(mockProduct.barcode); // Should be at top
      expect(history[0].cachedProduct.name).toBe('Updated Product');
    });

    it('should limit history to maximum items', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      
      // Mock a smaller max size for testing
      (historyService as any).MAX_HISTORY_ITEMS = 2;
      
      // Add 3 products
      for (let i = 1; i <= 3; i++) {
        await historyService.addToHistory({
          ...mockProduct,
          barcode: `${i}`,
          id: `${i}`,
          name: `Product ${i}`,
        });
      }
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(2); // Should be limited to 2
      expect(history[0].barcode).toBe('3'); // Most recent should be first
      expect(history[1].barcode).toBe('2');
    });
  });

  describe('getHistoryProduct', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      await historyService.addToHistory(mockProduct);
    });

    it('should return product from history', async () => {
      const product = historyService.getHistoryProduct('12345');
      
      expect(product).toEqual(expect.objectContaining({
        barcode: mockProduct.barcode,
        name: mockProduct.name,
      }));
    });

    it('should return null for non-existent product', async () => {
      const product = historyService.getHistoryProduct('nonexistent');
      
      expect(product).toBeNull();
    });
  });

  describe('updateHistoryProduct', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      await historyService.addToHistory(mockProduct);
    });

    it('should update existing product in history', async () => {
      const updatedProduct = { ...mockProduct, name: 'Updated Product' };
      
      await historyService.updateHistoryProduct('12345', updatedProduct);
      
      const product = historyService.getHistoryProduct('12345');
      expect(product?.name).toBe('Updated Product');
    });

    it('should add product to history if not exists', async () => {
      const newProduct = { ...mockProduct, barcode: '67890', id: '67890', name: 'New Product' };
      
      await historyService.updateHistoryProduct('67890', newProduct);
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].barcode).toBe('67890'); // Should be at top
    });
  });

  describe('clearHistory', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      await historyService.addToHistory(mockProduct);
    });

    it('should clear all history items', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();
      
      await historyService.clearHistory();
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(0);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('refreshHistoryFromCache', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      await historyService.addToHistory(mockProduct);
    });

    it('should refresh history with updated cache data', async () => {
      const updatedProduct = { ...mockProduct, name: 'Updated from Cache' };
      mockCacheService.getProduct.mockResolvedValue(updatedProduct);
      
      await historyService.refreshHistoryFromCache();
      
      const product = historyService.getHistoryProduct('12345');
      expect(product?.name).toBe('Updated from Cache');
    });

    it('should handle missing cache data gracefully', async () => {
      mockCacheService.getProduct.mockResolvedValue(null);
      
      await historyService.refreshHistoryFromCache();
      
      // Should not crash and should preserve existing data
      const history = historyService.getHistory();
      expect(history).toHaveLength(1);
    });
  });

  describe('getHistoryStats', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
    });

    it('should return correct statistics', async () => {
      await historyService.addToHistory(mockProduct);
      await historyService.addToHistory({ ...mockProduct, barcode: '67890', id: '67890' });
      
      const stats = historyService.getHistoryStats();
      
      expect(stats.totalItems).toBe(2);
      expect(stats.uniqueProducts).toBe(2);
      expect(stats.oldestScan).toBeDefined();
      expect(stats.newestScan).toBeDefined();
    });

    it('should handle empty history', async () => {
      const stats = historyService.getHistoryStats();
      
      expect(stats.totalItems).toBe(0);
      expect(stats.uniqueProducts).toBe(0);
      expect(stats.oldestScan).toBeUndefined();
      expect(stats.newestScan).toBeUndefined();
    });
  });

  describe('cache event listeners', () => {
    beforeEach(async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      await historyService.addToHistory(mockProduct);
    });

    it('should handle cache invalidation events', async () => {
      await historyService.onCacheInvalidated('12345', 'test reason');
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(0); // Should be removed from history
    });

    it('should handle cache cleared events', async () => {
      await historyService.onCacheCleared();
      
      const history = historyService.getHistory();
      expect(history).toHaveLength(0); // Should be cleared
    });
  });

  describe('event listeners', () => {
    it('should notify listeners of history updates', async () => {
      const listener = {
        onHistoryUpdated: jest.fn(),
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      
      historyService.addListener(listener);
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      
      await historyService.addToHistory(mockProduct);
      
      expect(listener.onHistoryUpdated).toHaveBeenCalled();
    });

    it('should be able to remove listeners', async () => {
      const listener = {
        onHistoryUpdated: jest.fn(),
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(null);
      await historyService.initialize();
      
      historyService.addListener(listener);
      historyService.removeListener(listener);
      
      mockAsyncStorage.setItem.mockResolvedValue();
      mockCacheService.setProduct.mockResolvedValue();
      
      await historyService.addToHistory(mockProduct);
      
      expect(listener.onHistoryUpdated).not.toHaveBeenCalled();
    });
  });
});