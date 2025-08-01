import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionCacheService } from '../subscriptionCacheService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('SubscriptionCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCachedSubscriptionData', () => {
    it('should return null when no cached data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await SubscriptionCacheService.getCachedSubscriptionData();

      expect(result).toBeNull();
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('subscription_cache');
    });

    it('should return cached subscription data when available', async () => {
      const cachedData = {
        currentProductId: 'test_product',
        noSubscription: false
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      const result = await SubscriptionCacheService.getCachedSubscriptionData();

      expect(result).toBe('test_product');
    });

    it('should return null for cached "no subscription" state', async () => {
      const noSubData = {
        currentProductId: null,
        noSubscription: true
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(noSubData));

      const result = await SubscriptionCacheService.getCachedSubscriptionData();

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await SubscriptionCacheService.getCachedSubscriptionData();

      expect(result).toBeNull();
    });
  });

  describe('cacheSubscriptionData', () => {
    it('should cache subscription data persistently', async () => {
      await SubscriptionCacheService.cacheSubscriptionData('test_product');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'subscription_cache',
        JSON.stringify({
          currentProductId: 'test_product',
          noSubscription: false
        })
      );
    });

    it('should cache null subscription data with noSubscription flag', async () => {
      await SubscriptionCacheService.cacheSubscriptionData(null);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'subscription_cache',
        JSON.stringify({
          currentProductId: null,
          noSubscription: true
        })
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(SubscriptionCacheService.cacheSubscriptionData('test')).resolves.toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('should remove cached data', async () => {
      await SubscriptionCacheService.clearCache();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('subscription_cache');
    });

    it('should handle removal errors gracefully', async () => {
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Removal error'));

      // Should not throw
      await expect(SubscriptionCacheService.clearCache()).resolves.toBeUndefined();
    });
  });

  describe('hasCachedData', () => {
    it('should return false when no cached data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await SubscriptionCacheService.hasCachedData();

      expect(result).toBe(false);
    });

    it('should return true when cached data exists', async () => {
      const cachedData = {
        currentProductId: 'test_product',
        noSubscription: false
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      const result = await SubscriptionCacheService.hasCachedData();

      expect(result).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await SubscriptionCacheService.hasCachedData();

      expect(result).toBe(false);
    });
  });
});