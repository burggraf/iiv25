import AsyncStorage from '@react-native-async-storage/async-storage';

interface CachedSubscriptionData {
  currentProductId: string | null;
  timestamp: number;
  noSubscription?: boolean; // flag to indicate when we've checked and found no subscription
}

export class SubscriptionCacheService {
  private static readonly CACHE_KEY = 'subscription_cache';
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Get cached subscription data if available and not expired
   */
  static async getCachedSubscriptionData(): Promise<string | null> {
    try {
      const cachedData = await AsyncStorage.getItem(this.CACHE_KEY);
      
      if (!cachedData) {
        console.log('SubscriptionCacheService: No cached data found');
        return null;
      }

      const parsed: CachedSubscriptionData = JSON.parse(cachedData);
      const now = Date.now();
      
      // Check if cache has expired
      if (now - parsed.timestamp > this.CACHE_TTL) {
        console.log('SubscriptionCacheService: Cache expired, removing');
        await this.clearCache();
        return null;
      }

      console.log('SubscriptionCacheService: Using cached subscription data:', parsed.currentProductId);
      return parsed.currentProductId;
    } catch (error) {
      console.error('SubscriptionCacheService: Error reading cache:', error);
      return null;
    }
  }

  /**
   * Cache subscription data with timestamp
   */
  static async cacheSubscriptionData(currentProductId: string | null): Promise<void> {
    try {
      const cacheData: CachedSubscriptionData = {
        currentProductId,
        timestamp: Date.now(),
        noSubscription: currentProductId === null
      };

      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
      console.log('SubscriptionCacheService: Cached subscription data:', currentProductId);
    } catch (error) {
      console.error('SubscriptionCacheService: Error caching data:', error);
    }
  }

  /**
   * Clear cached subscription data
   */
  static async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.CACHE_KEY);
      console.log('SubscriptionCacheService: Cache cleared');
    } catch (error) {
      console.error('SubscriptionCacheService: Error clearing cache:', error);
    }
  }

  /**
   * Check if we have valid cached data (without returning the actual data)
   */
  static async hasCachedData(): Promise<boolean> {
    try {
      const cachedData = await AsyncStorage.getItem(this.CACHE_KEY);
      
      if (!cachedData) {
        return false;
      }

      const parsed: CachedSubscriptionData = JSON.parse(cachedData);
      const now = Date.now();
      
      // Check if cache has expired
      return (now - parsed.timestamp) <= this.CACHE_TTL;
    } catch (error) {
      console.error('SubscriptionCacheService: Error checking cache:', error);
      return false;
    }
  }
}