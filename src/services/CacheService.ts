import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';

export interface CacheEntry {
  product: Product;
  timestamp: Date;
  accessCount: number;
  lastAccessed: Date;
}

export interface CacheEventListener {
  onCacheUpdated?: (barcode: string, product: Product) => void;
  onCacheInvalidated?: (barcode: string, reason: string) => void;
  onCacheCleared?: () => void;
}

class CacheService {
  private static instance: CacheService;
  
  // Memory cache - for fastest access
  private memoryCache = new Map<string, CacheEntry>();
  
  // Configuration
  private readonly MEMORY_CACHE_SIZE = 50; // Increased from 20 for better performance
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly STORAGE_KEY = '@IsItVegan:unifiedCache';
  
  // Event listeners
  private listeners: CacheEventListener[] = [];
  
  // LRU tracking
  private accessOrder: string[] = [];
  
  private constructor() {
    this.initializeCache();
  }
  
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }
  
  private async initializeCache(): Promise<void> {
    try {
      await this.loadFromPersistentStorage();
      this.cleanupExpiredEntries();
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }
  
  /**
   * Get a product from cache (checks memory first, then persistent storage)
   */
  public async getProduct(barcode: string): Promise<Product | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(barcode);
    if (memoryEntry) {
      // Update access tracking
      this.updateAccessTracking(barcode, memoryEntry);
      console.log(`💾 Cache HIT (memory) for ${barcode}`);
      return memoryEntry.product;
    }
    
    // Check persistent storage
    const persistentProduct = await this.getFromPersistentStorage(barcode);
    if (persistentProduct) {
      // Add to memory cache for faster future access
      this.setInMemoryCache(barcode, persistentProduct);
      console.log(`💾 Cache HIT (storage) for ${barcode}`);
      return persistentProduct;
    }
    
    console.log(`❌ Cache MISS for ${barcode}`);
    return null;
  }
  
  /**
   * Set a product in cache (both memory and persistent storage)
   */
  public async setProduct(barcode: string, product: Product): Promise<void> {
    console.log(`💾 [CacheService] *** SETTING PRODUCT IN CACHE ***`);
    console.log(`💾 [CacheService] Barcode: ${barcode}`);
    console.log(`💾 [CacheService] Product name: ${product.name}`);
    console.log(`💾 [CacheService] Product image URL: ${product.imageUrl}`);
    console.log(`💾 [CacheService] Timestamp: ${new Date().toISOString()}`);
    
    // Set in memory cache
    console.log(`💾 [CacheService] Step 1: Setting in memory cache...`);
    this.setInMemoryCache(barcode, product);
    console.log(`💾 [CacheService] Memory cache updated, size: ${this.memoryCache.size}`);
    
    // Set in persistent storage
    console.log(`💾 [CacheService] Step 2: Setting in persistent storage...`);
    await this.setInPersistentStorage(barcode, product);
    console.log(`💾 [CacheService] Persistent storage updated`);
    
    // Notify listeners
    console.log(`💾 [CacheService] Step 3: Notifying ${this.listeners.length} listeners...`);
    this.notifyListeners('onCacheUpdated', barcode, product);
    
    console.log(`✅ [CacheService] *** PRODUCT CACHED SUCCESSFULLY ***`);
    console.log(`✅ [CacheService] Final state - Memory items: ${this.memoryCache.size}, Listeners notified: ${this.listeners.length}`);
  }
  
  /**
   * Check if a product exists in cache (memory or persistent)
   */
  public async hasProduct(barcode: string): Promise<boolean> {
    if (this.memoryCache.has(barcode)) {
      return true;
    }
    
    const persistentProduct = await this.getFromPersistentStorage(barcode);
    return persistentProduct !== null;
  }
  
  /**
   * Invalidate a specific product from cache
   */
  public async invalidateProduct(barcode: string, reason = 'manual invalidation'): Promise<void> {
    // Remove from memory cache
    this.memoryCache.delete(barcode);
    this.accessOrder = this.accessOrder.filter(b => b !== barcode);
    
    // Remove from persistent storage
    await this.removeFromPersistentStorage(barcode);
    
    // Notify listeners
    this.notifyListeners('onCacheInvalidated', barcode, reason);
    
    console.log(`🗑️ Invalidated cache for ${barcode} - ${reason}`);
  }
  
  /**
   * Clear entire cache
   */
  public async clearCache(): Promise<void> {
    this.memoryCache.clear();
    this.accessOrder = [];
    
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear persistent cache:', error);
    }
    
    // Notify listeners
    this.notifyListeners('onCacheCleared');
    
    console.log('🗑️ Cleared entire cache');
  }
  
  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    memorySize: number;
    totalAccessCount: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.memoryCache.values());
    const totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    
    const timestamps = entries.map(entry => entry.timestamp).sort();
    
    return {
      memorySize: this.memoryCache.size,
      totalAccessCount,
      oldestEntry: timestamps[0],
      newestEntry: timestamps[timestamps.length - 1]
    };
  }
  
  /**
   * Add event listener for cache events
   */
  public addListener(listener: CacheEventListener): void {
    this.listeners.push(listener);
    console.log(`📡 [CacheService] Added cache listener. Total listeners: ${this.listeners.length}`);
  }
  
  /**
   * Remove event listener
   */
  public removeListener(listener: CacheEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  // Private methods
  
  private setInMemoryCache(barcode: string, product: Product): void {
    const now = new Date();
    const entry: CacheEntry = {
      product,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now
    };
    
    // If cache is full, remove LRU item
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE && !this.memoryCache.has(barcode)) {
      this.evictLRU();
    }
    
    this.memoryCache.set(barcode, entry);
    this.updateAccessOrder(barcode);
  }
  
  private updateAccessTracking(barcode: string, entry: CacheEntry): void {
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.updateAccessOrder(barcode);
  }
  
  private updateAccessOrder(barcode: string): void {
    // Remove if exists and add to end (most recently used)
    this.accessOrder = this.accessOrder.filter(b => b !== barcode);
    this.accessOrder.push(barcode);
  }
  
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruBarcode = this.accessOrder.shift();
    if (lruBarcode) {
      this.memoryCache.delete(lruBarcode);
      console.log(`🗑️ Evicted LRU item ${lruBarcode} from memory cache`);
    }
  }
  
  private async loadFromPersistentStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;
      
      const data = JSON.parse(stored);
      
      // Load up to MEMORY_CACHE_SIZE most recent items into memory
      const sortedEntries = Object.entries(data)
        .map(([barcode, entry]: [string, any]) => ({
          barcode,
          entry: {
            ...entry,
            timestamp: new Date(entry.timestamp),
            lastAccessed: new Date(entry.lastAccessed)
          }
        }))
        .sort((a, b) => b.entry.lastAccessed.getTime() - a.entry.lastAccessed.getTime())
        .slice(0, this.MEMORY_CACHE_SIZE);
      
      for (const { barcode, entry } of sortedEntries) {
        if (!this.isExpired(entry.timestamp)) {
          this.memoryCache.set(barcode, entry);
          this.accessOrder.push(barcode);
        }
      }
      
      console.log(`💾 Loaded ${this.memoryCache.size} items into memory cache from storage`);
    } catch (error) {
      console.error('Failed to load from persistent storage:', error);
    }
  }
  
  private async getFromPersistentStorage(barcode: string): Promise<Product | null> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      const entry = data[barcode];
      
      if (!entry) return null;
      
      // Check if expired
      if (this.isExpired(new Date(entry.timestamp))) {
        // Remove expired entry
        await this.removeFromPersistentStorage(barcode);
        return null;
      }
      
      return entry.product;
    } catch (error) {
      console.error('Failed to get from persistent storage:', error);
      return null;
    }
  }
  
  private async setInPersistentStorage(barcode: string, product: Product): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      const data = stored ? JSON.parse(stored) : {};
      
      const now = new Date();
      data[barcode] = {
        product,
        timestamp: now,
        accessCount: 1,
        lastAccessed: now
      };
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to set in persistent storage:', error);
    }
  }
  
  private async removeFromPersistentStorage(barcode: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;
      
      const data = JSON.parse(stored);
      delete data[barcode];
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to remove from persistent storage:', error);
    }
  }
  
  private cleanupExpiredEntries(): void {
    // Clean up expired memory cache entries
    for (const [barcode, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry.timestamp)) {
        this.memoryCache.delete(barcode);
        this.accessOrder = this.accessOrder.filter(b => b !== barcode);
        console.log(`🗑️ Removed expired entry ${barcode} from memory cache`);
      }
    }
    
    // Clean up persistent storage (async, don't await)
    this.cleanupPersistentStorage();
  }
  
  private async cleanupPersistentStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;
      
      const data = JSON.parse(stored);
      let hasChanges = false;
      
      for (const [barcode, entry] of Object.entries(data)) {
        if (this.isExpired(new Date((entry as any).timestamp))) {
          delete data[barcode];
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        console.log('🧹 Cleaned up expired entries from persistent storage');
      }
    } catch (error) {
      console.error('Failed to cleanup persistent storage:', error);
    }
  }
  
  private isExpired(timestamp: Date): boolean {
    return Date.now() - timestamp.getTime() > this.CACHE_TTL_MS;
  }
  
  private notifyListeners(event: keyof CacheEventListener, ...args: any[]): void {
    console.log(`📡 [CacheService] *** NOTIFYING CACHE LISTENERS ***`);
    console.log(`📡 [CacheService] Event: ${String(event)}`);
    console.log(`📡 [CacheService] Total listeners: ${this.listeners.length}`);
    console.log(`📡 [CacheService] Args:`, args);
    console.log(`📡 [CacheService] Timestamp: ${new Date().toISOString()}`);
    
    if (this.listeners.length === 0) {
      console.warn(`⚠️ [CacheService] No listeners registered for cache events!`);
      return;
    }
    
    let listenersNotified = 0;
    
    for (let i = 0; i < this.listeners.length; i++) {
      const listener = this.listeners[i];
      const handler = listener[event];
      
      console.log(`📡 [CacheService] Listener ${i + 1}/${this.listeners.length}:`, {
        hasHandler: !!handler,
        event: String(event),
        listenerKeys: Object.keys(listener)
      });
      
      if (handler) {
        try {
          console.log(`📡 [CacheService] Calling listener ${i + 1} for event: ${String(event)}`);
          (handler as any)(...args);
          listenersNotified++;
          console.log(`✅ [CacheService] Listener ${i + 1} successfully notified`);
        } catch (error) {
          console.error(`❌ [CacheService] Error in cache event listener ${i + 1}:`, error);
          console.error(`❌ [CacheService] Error stack:`, (error instanceof Error) ? error.stack : 'No stack trace available');
        }
      } else {
        console.log(`⚠️ [CacheService] Listener ${i + 1} has no handler for event: ${String(event)}`);
      }
    }
    
    console.log(`📡 [CacheService] *** LISTENER NOTIFICATION COMPLETE ***`);
    console.log(`📡 [CacheService] Successfully notified: ${listenersNotified}/${this.listeners.length} listeners`);
    
    if (event === 'onCacheUpdated' && args.length >= 2) {
      const [barcode, product] = args;
      console.log(`📡 [CacheService] Cache update summary:`, {
        barcode,
        productName: product?.product_name,
        imageUrl: product?.imageUrl,
        listenersNotified
      });
    }
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();
export default cacheService;