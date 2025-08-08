import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Product } from '../types';
import deviceIdService from '../services/deviceIdService';
import { historyService, HistoryItem, HistoryEventListener } from '../services/HistoryService';
import { optimizedCacheInvalidationService } from '../services/CacheInvalidationService.optimized';
import { useBackgroundJobs } from '../hooks/useBackgroundJobs';
import { cacheService } from '../services/CacheService';

// HistoryItem is now exported from HistoryService

interface AppContextType {
  scanHistory: Product[];
  historyItems: HistoryItem[];
  addToHistory: (product: Product) => void;
  clearHistory: () => void;
  isLoading: boolean;
  deviceId: string | null;
  updateHistoryProduct: (barcode: string, product: Product) => void;
  newItemsCount: number;
  markAsViewed: (barcode: string) => void;
  // Background jobs (centralized to prevent memory leaks)
  queueJob: (params: any) => Promise<any>;
  clearAllJobs: () => Promise<void>;
  activeJobs: any[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Storage key is now managed by HistoryService

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [scanHistory, setScanHistory] = useState<Product[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [newItemsCount, setNewItemsCount] = useState<number>(0);

  // Centralized background job processing to prevent memory leaks from multiple subscriptions
  // This is critical - without this, job completion won't be processed when components unmount
  const backgroundJobsHook = useBackgroundJobs();

  // Initialize device ID and load history on app start
  useEffect(() => {
    initializeApp();
  }, []);

  // History event listener
  useEffect(() => {
    const listener: HistoryEventListener = {
      onHistoryUpdated: (items: HistoryItem[]) => {
        setHistoryItems(items);
        setScanHistory(items.map(item => item.cachedProduct));
        // Update new items count
        const newCount = historyService.getNewItemsCount();
        setNewItemsCount(newCount);
        console.log(`📚 History updated - ${items.length} total, ${newCount} new items`);
      },
      onProductUpdated: (barcode: string, product: Product) => {
        // History will be updated automatically through onHistoryUpdated
        console.log(`📚 Product updated in history: ${barcode}`);
      }
    };

    historyService.addListener(listener);

    return () => {
      historyService.removeListener(listener);
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 [AppContext] *** INITIALIZING APP SERVICES ***');
      console.log('🚀 [AppContext] Initialization timestamp:', new Date().toISOString());
      
      // Initialize device ID first
      console.log('🚀 [AppContext] Step 1: Initializing device ID service...');
      const id = await deviceIdService.getDeviceId();
      setDeviceId(id);
      console.log('🚀 [AppContext] Device ID initialized:', id);
      
      // Initialize history service
      console.log('🚀 [AppContext] Step 2: Initializing history service...');
      await historyService.initialize();
      console.log('🚀 [AppContext] History service initialized');
      
      // Initialize optimized cache invalidation service
      console.log('🚀 [AppContext] Step 3: Initializing optimized cache invalidation service...');
      console.log('🚀 [AppContext] This service should subscribe to background job events');
      await optimizedCacheInvalidationService.initialize();
      console.log('🚀 [AppContext] Optimized cache invalidation service initialized');
      
      // Verify the service status
      const cacheServiceStatus = optimizedCacheInvalidationService.getStats();
      console.log('🚀 [AppContext] Optimized cache invalidation service status:', cacheServiceStatus);
      
      if (!cacheServiceStatus.isInitialized) {
        console.error('❌ [AppContext] Optimized cache invalidation service failed to initialize!');
      }
      
      // Load initial history from service
      console.log('🚀 [AppContext] Step 4: Loading initial history...');
      const initialHistory = historyService.getHistory();
      setHistoryItems(initialHistory);
      setScanHistory(initialHistory.map(item => item.cachedProduct));
      const initialNewCount = historyService.getNewItemsCount();
      setNewItemsCount(initialNewCount);
      console.log('🚀 [AppContext] Initial history loaded:', initialHistory.length, 'items,', initialNewCount, 'new');
      
      console.log('✅ [AppContext] *** APP INITIALIZATION COMPLETE ***');
      console.log('✅ [AppContext] All services initialized and ready for photo upload events');
      
    } catch (error) {
      console.error('❌ [AppContext] Error initializing app:', error);
      console.error('❌ [AppContext] Error stack:', (error as Error).stack);
    } finally {
      setIsLoading(false);
    }
  };

  // History loading is now handled by HistoryService

  // History saving is now handled by HistoryService

  const addToHistory = useCallback(async (product: Product) => {
    // Delegate to HistoryService - it will handle cache and state updates
    await historyService.addToHistory(product);
  }, []);

  const updateHistoryProduct = useCallback(async (barcode: string, product: Product) => {
    // Delegate to HistoryService - it will handle cache and state updates
    await historyService.updateHistoryProduct(barcode, product);
  }, []);

  const clearHistory = useCallback(async () => {
    // Clear both history and cache to ensure no phantom data
    await historyService.clearHistory();
    await cacheService.clearCache();
  }, []);

  const markAsViewed = useCallback(async (barcode: string) => {
    // Delegate to HistoryService to clear isNew flag
    await historyService.markAsViewed(barcode);
  }, []);

  // Cleanup services on unmount
  useEffect(() => {
    return () => {
      optimizedCacheInvalidationService.cleanup();
    };
  }, []);

  const value = {
    scanHistory,
    historyItems,
    addToHistory,
    clearHistory,
    isLoading,
    deviceId,
    updateHistoryProduct,
    newItemsCount,
    markAsViewed,
    // Background jobs (centralized to prevent memory leaks)
    queueJob: backgroundJobsHook.queueJob,
    clearAllJobs: backgroundJobsHook.clearAllJobs,
    activeJobs: backgroundJobsHook.activeJobs,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}