import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';
import { cacheService, CacheEventListener } from './CacheService';

export interface HistoryItem {
  barcode: string;
  scannedAt: Date;
  cachedProduct: Product; // For immediate display
  isNew?: boolean; // Flag for items that are new and should show a badge
  lastViewedAt?: Date; // Timestamp when this item was last marked as viewed
}

export interface HistoryEventListener {
  onHistoryUpdated?: (items: HistoryItem[]) => void;
  onProductUpdated?: (barcode: string, product: Product) => void;
}

class HistoryService implements CacheEventListener {
  private static instance: HistoryService;
  
  // Configuration
  private readonly STORAGE_KEY = '@IsItVegan:scanHistory';
  private readonly MAX_HISTORY_ITEMS = 500;
  
  // Current history state
  private historyItems: HistoryItem[] = [];
  private isInitialized = false;
  
  // Event listeners
  private listeners: HistoryEventListener[] = [];
  
  private constructor() {
    // Listen to cache events for automatic updates
    cacheService.addListener(this);
  }
  
  public static getInstance(): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService();
    }
    return HistoryService.instance;
  }
  
  /**
   * Initialize the history service (load from storage)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.loadHistory();
      this.isInitialized = true;
      console.log(`📚 HistoryService initialized with ${this.historyItems.length} items`);
    } catch (error) {
      console.error('Failed to initialize HistoryService:', error);
      this.isInitialized = true; // Set as initialized even on error to prevent retry loops
    }
  }
  
  /**
   * Add or update a product in history
   */
  public async addToHistory(product: Product, isNew: boolean = false, fromBackgroundJob: boolean = false): Promise<void> {
    await this.ensureInitialized();
    
    const now = new Date();
    const productWithTimestamp = { ...product, lastScanned: now };
    
    // Find existing entry
    const existingIndex = this.historyItems.findIndex(item => item.barcode === product.barcode);
    
    // Only check recent viewing for background job updates to avoid UI conflicts
    // EXCEPTION: Always allow photo upload jobs to set isNew flag since user explicitly took action
    let finalIsNew = isNew;
    if (fromBackgroundJob && isNew && existingIndex >= 0) {
      // For photo uploads, always set isNew=true regardless of recent viewing
      // This ensures badges appear when user takes photos
      const wasRecentlyViewed = this.wasRecentlyViewed(product.barcode);
      if (wasRecentlyViewed) {
        // For now, disable the recent viewing check to fix badge issue
        // TODO: Consider more sophisticated logic based on job type
        console.log(`📚 Product ${product.barcode} was recently viewed but allowing isNew flag for background job`);
      }
    }
    
    let newHistoryItems: HistoryItem[];
    let shouldUpdateCache = false;
    
    if (existingIndex >= 0) {
      // Update existing item and move to top, preserve lastViewedAt
      const existingItem = this.historyItems[existingIndex];
      const updatedItem: HistoryItem = {
        barcode: product.barcode,
        scannedAt: now,
        cachedProduct: productWithTimestamp,
        isNew: finalIsNew,
        lastViewedAt: existingItem.lastViewedAt // Preserve when it was last viewed
      };
      
      newHistoryItems = [
        updatedItem,
        ...this.historyItems.filter(item => item.barcode !== product.barcode)
      ];
      
      // Only update cache if product data actually changed (not just timestamp)
      const existingProduct = this.historyItems[existingIndex].cachedProduct;
      const productChanged = existingProduct.imageUrl !== product.imageUrl || 
                           existingProduct.name !== product.name ||
                           existingProduct.brand !== product.brand ||
                           existingProduct.veganStatus !== product.veganStatus ||
                           JSON.stringify(existingProduct.ingredients) !== JSON.stringify(product.ingredients);
      shouldUpdateCache = productChanged;
    } else {
      // Add new item to top
      newHistoryItems = [
        {
          barcode: product.barcode,
          scannedAt: now,
          cachedProduct: productWithTimestamp,
          isNew: finalIsNew
        },
        ...this.historyItems
      ];
      
      // Always update cache for new products
      shouldUpdateCache = true;
    }
    
    // Limit to max items
    this.historyItems = newHistoryItems.slice(0, this.MAX_HISTORY_ITEMS);
    
    // Only update cache if needed to prevent loops
    if (shouldUpdateCache) {
      await cacheService.setProduct(product.barcode, productWithTimestamp);
    }
    
    // Persist to storage
    await this.persistHistory();
    
    // Notify listeners
    this.notifyListeners('onHistoryUpdated', this.historyItems);
    
    console.log(`📚 Added ${product.barcode} to history (isNew: ${finalIsNew}, total items: ${this.historyItems.length})`);
  }
  
  /**
   * Get history items (returns cached version immediately)
   */
  public getHistory(): HistoryItem[] {
    return [...this.historyItems]; // Return copy to prevent external mutation
  }
  
  /**
   * Get a specific product from history by barcode
   */
  public getHistoryProduct(barcode: string): Product | null {
    const historyItem = this.historyItems.find(item => item.barcode === barcode);
    return historyItem ? historyItem.cachedProduct : null;
  }

  /**
   * Mark a history item as viewed (clear the isNew flag)
   */
  public async markAsViewed(barcode: string): Promise<void> {
    await this.ensureInitialized();
    
    const itemIndex = this.historyItems.findIndex(item => item.barcode === barcode);
    if (itemIndex !== -1) {
      const wasNew = this.historyItems[itemIndex].isNew;
      this.historyItems[itemIndex].isNew = false;
      this.historyItems[itemIndex].lastViewedAt = new Date();
      
      // Persist changes
      await this.persistHistory();
      
      // Notify listeners
      this.notifyListeners('onHistoryUpdated', this.historyItems);
      
      console.log(`📚 Marked ${barcode} as viewed (was new: ${wasNew}, cleared isNew flag, set lastViewedAt)`);
    }
  }

  /**
   * Force-set the isNew flag for a specific product (used by background job completion)
   */
  public async markAsNew(barcode: string): Promise<void> {
    await this.ensureInitialized();
    
    const itemIndex = this.historyItems.findIndex(item => item.barcode === barcode);
    if (itemIndex !== -1) {
      console.log(`📚 Force-marking ${barcode} as new (was: ${this.historyItems[itemIndex].isNew})`);
      this.historyItems[itemIndex].isNew = true;
      
      // Persist changes
      await this.persistHistory();
      
      // Notify listeners
      this.notifyListeners('onHistoryUpdated', this.historyItems);
      
      console.log(`✅ Successfully marked ${barcode} as new in history`);
    } else {
      console.log(`⚠️ Cannot mark ${barcode} as new - not found in history`);
    }
  }

  /**
   * Get count of new items in history
   */
  public getNewItemsCount(): number {
    return this.historyItems.filter(item => item.isNew === true).length;
  }

  /**
   * Check if a product was recently viewed (within last 3 seconds)
   * This helps prevent isNew flag conflicts when user is actively viewing a product
   * Reduced from 10 to 3 seconds to allow badges when user takes photo and waits
   */
  public wasRecentlyViewed(barcode: string): boolean {
    const item = this.historyItems.find(item => item.barcode === barcode);
    if (!item || !item.lastViewedAt) {
      return false;
    }
    
    const threeSecondsAgo = Date.now() - (3 * 1000); // 3 seconds (reduced from 10)
    const wasRecentlyViewed = item.lastViewedAt.getTime() > threeSecondsAgo;
    
    if (wasRecentlyViewed) {
      console.log(`📚 Product ${barcode} was recently viewed at ${item.lastViewedAt.toISOString()}`);
    }
    
    return wasRecentlyViewed;
  }

  
  /**
   * Update a specific product in history (called when cache is updated)
   */
  public async updateHistoryProduct(barcode: string, updatedProduct: Product): Promise<void> {
    await this.ensureInitialized();
    
    const itemIndex = this.historyItems.findIndex(item => item.barcode === barcode);
    if (itemIndex === -1) {
      // Product not in history, don't add it - cache updates shouldn't create new history entries
      console.log(`📚 Product ${barcode} not in history, ignoring cache update`);
      return;
    }
    
    // Update existing item in history only (don't update cache to avoid loop)
    const existingItem = this.historyItems[itemIndex];
    this.historyItems[itemIndex] = {
      ...existingItem,
      cachedProduct: {
        ...updatedProduct,
        lastScanned: existingItem.scannedAt // Preserve original scan time
      }
    };
    
    // Persist changes
    await this.persistHistory();
    
    // Notify listeners
    this.notifyListeners('onHistoryUpdated', this.historyItems);
    this.notifyListeners('onProductUpdated', barcode, updatedProduct);
    
    console.log(`📚 Updated product ${barcode} in history`);
  }
  
  /**
   * Clear all history
   */
  public async clearHistory(): Promise<void> {
    this.historyItems = [];
    
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear history from storage:', error);
    }
    
    // Notify listeners
    this.notifyListeners('onHistoryUpdated', this.historyItems);
    
    console.log('📚 Cleared all history');
  }
  
  /**
   * Get history statistics
   */
  public getHistoryStats(): {
    totalItems: number;
    oldestScan?: Date;
    newestScan?: Date;
    uniqueProducts: number;
  } {
    const timestamps = this.historyItems.map(item => item.scannedAt).sort();
    const uniqueBarcodes = new Set(this.historyItems.map(item => item.barcode));
    
    return {
      totalItems: this.historyItems.length,
      oldestScan: timestamps[0],
      newestScan: timestamps[timestamps.length - 1],
      uniqueProducts: uniqueBarcodes.size
    };
  }
  
  /**
   * Refresh history from cache (useful after bulk cache updates)
   */
  public async refreshHistoryFromCache(): Promise<void> {
    await this.ensureInitialized();
    
    let hasChanges = false;
    
    // Update each history item with latest cached data
    for (let i = 0; i < this.historyItems.length; i++) {
      const item = this.historyItems[i];
      const cachedProduct = await cacheService.getProduct(item.barcode);
      
      if (cachedProduct) {
        // Compare if products are different (basic check)
        const currentProduct = item.cachedProduct;
        const isDifferent = 
          cachedProduct.name !== currentProduct.name ||
          cachedProduct.brand !== currentProduct.brand ||
          cachedProduct.veganStatus !== currentProduct.veganStatus ||
          JSON.stringify(cachedProduct.ingredients) !== JSON.stringify(currentProduct.ingredients);
        
        if (isDifferent) {
          this.historyItems[i] = {
            ...item,
            cachedProduct: {
              ...cachedProduct,
              lastScanned: item.scannedAt // Preserve original scan time
            }
          };
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      await this.persistHistory();
      this.notifyListeners('onHistoryUpdated', this.historyItems);
      console.log('📚 Refreshed history from cache');
    }
  }
  
  /**
   * Add event listener
   */
  public addListener(listener: HistoryEventListener): void {
    this.listeners.push(listener);
  }
  
  /**
   * Remove event listener
   */
  public removeListener(listener: HistoryEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  // CacheEventListener implementation
  
  public onCacheUpdated = async (barcode: string, product: Product): Promise<void> => {
    // Update history item if it exists
    await this.updateHistoryProduct(barcode, product);
  };
  
  public onCacheInvalidated = async (barcode: string, reason: string): Promise<void> => {
    // Remove from history when cache is invalidated
    const itemIndex = this.historyItems.findIndex(item => item.barcode === barcode);
    if (itemIndex !== -1) {
      this.historyItems.splice(itemIndex, 1);
      await this.persistHistory();
      this.notifyListeners('onHistoryUpdated', this.historyItems);
      console.log(`📚 Removed ${barcode} from history due to cache invalidation: ${reason}`);
    }
  };
  
  public onCacheCleared = async (): Promise<void> => {
    // Clear history when entire cache is cleared
    await this.clearHistory();
  };
  
  // Private methods
  
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
  
  private async loadHistory(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        this.historyItems = [];
        return;
      }
      
      const history = JSON.parse(stored);
      
      // Check format and convert if needed
      if (history.length > 0 && 'cachedProduct' in history[0]) {
        // New format - HistoryItem[]
        this.historyItems = history.map((item: any) => ({
          ...item,
          scannedAt: new Date(item.scannedAt),
          cachedProduct: {
            ...item.cachedProduct,
            lastScanned: new Date(item.cachedProduct.lastScanned)
          },
          isNew: item.isNew || false // Default to false for existing items
        }));
      } else {
        // Old format - Product[] - migrate to new format
        const products = history.map((item: any) => ({
          ...item,
          lastScanned: new Date(item.lastScanned)
        }));
        
        // Convert to new format
        this.historyItems = products.map((product: Product) => ({
          barcode: product.barcode,
          scannedAt: product.lastScanned || new Date(),
          cachedProduct: product,
          isNew: false // Migrated items are not new
        }));
        
        // Migrate data to cache service
        for (const product of products) {
          await cacheService.setProduct(product.barcode, product);
        }
        
        // Save in new format
        await this.persistHistory();
        console.log('📚 Migrated old history format to new format');
      }
      
      console.log(`📚 Loaded ${this.historyItems.length} history items`);
    } catch (error) {
      console.error('Failed to load history:', error);
      this.historyItems = [];
    }
  }
  
  private async persistHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.historyItems));
    } catch (error) {
      console.error('Failed to persist history:', error);
    }
  }
  
  private notifyListeners(event: keyof HistoryEventListener, ...args: any[]): void {
    for (const listener of this.listeners) {
      const handler = listener[event];
      if (handler) {
        try {
          (handler as any)(...args);
        } catch (error) {
          console.error('Error in history event listener:', error);
        }
      }
    }
  }
}

// Export singleton instance
export const historyService = HistoryService.getInstance();
export default historyService;