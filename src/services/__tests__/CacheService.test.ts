import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheService } from '../CacheService';
import { Product, VeganStatus } from '../../types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('CacheService', () => {
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
    // Clear the singleton instance for each test
    (cacheService as any).memoryCache.clear();
    (cacheService as any).accessOrder = [];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setProduct and getProduct', () => {
    it('should store and retrieve a product from memory cache', async () => {
      await cacheService.setProduct('12345', mockProduct);
      const retrievedProduct = await cacheService.getProduct('12345');
      
      expect(retrievedProduct).toEqual(mockProduct);
    });

    it('should store product in both memory and persistent storage', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();

      await cacheService.setProduct('12345', mockProduct);

      // Should have called setItem for persistent storage
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should return null for non-existent product', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const retrievedProduct = await cacheService.getProduct('nonexistent');
      
      expect(retrievedProduct).toBeNull();
    });
  });

  describe('hasProduct', () => {
    it('should return true for product in memory cache', async () => {
      await cacheService.setProduct('12345', mockProduct);
      const hasProduct = await cacheService.hasProduct('12345');
      
      expect(hasProduct).toBe(true);
    });

    it('should return false for non-existent product', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const hasProduct = await cacheService.hasProduct('nonexistent');
      
      expect(hasProduct).toBe(false);
    });
  });

  describe('invalidateProduct', () => {
    it('should remove product from memory cache', async () => {
      await cacheService.setProduct('12345', mockProduct);
      await cacheService.invalidateProduct('12345', 'test invalidation');
      
      const retrievedProduct = await cacheService.getProduct('12345');
      expect(retrievedProduct).toBeNull();
    });

    it('should notify listeners when product is invalidated', async () => {
      const listener = {
        onCacheInvalidated: jest.fn(),
      };
      
      cacheService.addListener(listener);
      await cacheService.setProduct('12345', mockProduct);
      await cacheService.invalidateProduct('12345', 'test invalidation');
      
      expect(listener.onCacheInvalidated).toHaveBeenCalledWith('12345', 'test invalidation');
    });
  });

  describe('clearCache', () => {
    it('should clear all products from memory cache', async () => {
      await cacheService.setProduct('12345', mockProduct);
      await cacheService.setProduct('67890', { ...mockProduct, barcode: '67890' });
      
      await cacheService.clearCache();
      
      const product1 = await cacheService.getProduct('12345');
      const product2 = await cacheService.getProduct('67890');
      
      expect(product1).toBeNull();
      expect(product2).toBeNull();
    });

    it('should notify listeners when cache is cleared', async () => {
      const listener = {
        onCacheCleared: jest.fn(),
      };
      
      cacheService.addListener(listener);
      await cacheService.clearCache();
      
      expect(listener.onCacheCleared).toHaveBeenCalled();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when cache is full', async () => {
      // Set cache size to a small number for testing
      const CACHE_SIZE = 3;
      (cacheService as any).MEMORY_CACHE_SIZE = CACHE_SIZE;

      // Fill cache to capacity
      for (let i = 1; i <= CACHE_SIZE; i++) {
        await cacheService.setProduct(`${i}`, { 
          ...mockProduct, 
          barcode: `${i}`, 
          id: `${i}` 
        });
      }

      // Add one more item, should evict the first one
      await cacheService.setProduct('4', { 
        ...mockProduct, 
        barcode: '4', 
        id: '4' 
      });

      // First product should be evicted
      const evictedProduct = await cacheService.getProduct('1');
      expect(evictedProduct).toBeNull();

      // Last product should still be there
      const lastProduct = await cacheService.getProduct('4');
      expect(lastProduct).not.toBeNull();
    });
  });

  describe('persistent storage fallback', () => {
    it('should retrieve from persistent storage if not in memory', async () => {
      const storedData = {
        '12345': {
          product: {
            ...mockProduct,
            lastScanned: mockProduct.lastScanned?.toISOString(),
          },
          timestamp: new Date().toISOString(),
          accessCount: 1,
          lastAccessed: new Date().toISOString(),
        }
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(storedData));
      
      const retrievedProduct = await cacheService.getProduct('12345');
      
      expect(retrievedProduct).toEqual(expect.objectContaining({
        id: mockProduct.id,
        barcode: mockProduct.barcode,
        name: mockProduct.name,
        brand: mockProduct.brand,
        ingredients: mockProduct.ingredients,
        veganStatus: mockProduct.veganStatus,
        imageUrl: mockProduct.imageUrl,
        lastScanned: mockProduct.lastScanned?.toISOString(),
      }));
    });

    it('should handle corrupted persistent storage gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');
      
      const retrievedProduct = await cacheService.getProduct('12345');
      
      expect(retrievedProduct).toBeNull();
    });
  });

  describe('cache statistics', () => {
    it('should return correct cache statistics', async () => {
      await cacheService.setProduct('12345', mockProduct);
      await cacheService.setProduct('67890', { ...mockProduct, barcode: '67890' });
      
      const stats = cacheService.getCacheStats();
      
      expect(stats.memorySize).toBe(2);
      expect(stats.totalAccessCount).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
    });
  });

  describe('event listeners', () => {
    it('should notify listeners when product is updated', async () => {
      const listener = {
        onCacheUpdated: jest.fn(),
      };
      
      cacheService.addListener(listener);
      await cacheService.setProduct('12345', mockProduct);
      
      expect(listener.onCacheUpdated).toHaveBeenCalledWith('12345', mockProduct);
    });

    it('should be able to remove listeners', async () => {
      const listener = {
        onCacheUpdated: jest.fn(),
      };
      
      cacheService.addListener(listener);
      cacheService.removeListener(listener);
      await cacheService.setProduct('12345', mockProduct);
      
      expect(listener.onCacheUpdated).not.toHaveBeenCalled();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should not return expired products', async () => {
      // Mock old timestamp
      const expiredData = {
        '12345': {
          product: mockProduct,
          timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
          accessCount: 1,
          lastAccessed: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        }
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(expiredData));
      
      const retrievedProduct = await cacheService.getProduct('12345');
      
      expect(retrievedProduct).toBeNull();
    });
  });
});