import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';
import deviceIdService from '../services/deviceIdService';

export interface HistoryItem {
  barcode: string;
  scannedAt: Date;
  cachedProduct: Product; // For immediate display
}

interface AppContextType {
  scanHistory: Product[];
  historyItems: HistoryItem[];
  addToHistory: (product: Product) => void;
  clearHistory: () => void;
  isLoading: boolean;
  deviceId: string | null;
  updateHistoryProduct: (barcode: string, product: Product) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = '@IsItVegan:scanHistory';

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [scanHistory, setScanHistory] = useState<Product[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Initialize device ID and load history on app start
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize device ID first
      const id = await deviceIdService.getDeviceId();
      setDeviceId(id);
      
      // Then load history
      await loadHistory();
    } catch (error) {
      console.error('Error initializing app:', error);
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const history = JSON.parse(stored);
        
        // Check if this is the old format (array of Products) or new format (array of HistoryItems)
        if (history.length > 0 && 'cachedProduct' in history[0]) {
          // New format - HistoryItem[]
          const historyWithDates = history.map((item: any) => ({
            ...item,
            scannedAt: new Date(item.scannedAt),
            cachedProduct: {
              ...item.cachedProduct,
              lastScanned: new Date(item.cachedProduct.lastScanned)
            }
          }));
          setHistoryItems(historyWithDates);
          // Also set scanHistory for backward compatibility
          setScanHistory(historyWithDates.map(item => item.cachedProduct));
        } else {
          // Old format - Product[] - migrate to new format
          const historyWithDates = history.map((item: any) => ({
            ...item,
            lastScanned: new Date(item.lastScanned)
          }));
          
          // Convert to new format
          const newHistoryItems: HistoryItem[] = historyWithDates.map((product: Product) => ({
            barcode: product.barcode,
            scannedAt: product.lastScanned || new Date(),
            cachedProduct: product
          }));
          
          setHistoryItems(newHistoryItems);
          setScanHistory(historyWithDates);
          
          // Save in new format
          await saveHistoryItems(newHistoryItems);
        }
      }
    } catch (error) {
      console.error('Error loading scan history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveHistory = async (history: Product[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving scan history:', error);
    }
  };

  const saveHistoryItems = async (items: HistoryItem[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error saving history items:', error);
    }
  };

  const addToHistory = (product: Product) => {
    const now = new Date();
    const productWithTimestamp = { ...product, lastScanned: now };
    
    // Update both scanHistory and historyItems
    setScanHistory(prev => {
      const existingIndex = prev.findIndex(item => item.barcode === product.barcode);
      
      let newHistory: Product[];
      if (existingIndex >= 0) {
        // Update existing product and move to top
        newHistory = [
          productWithTimestamp,
          ...prev.filter(item => item.barcode !== product.barcode)
        ];
      } else {
        // Add new product to top
        newHistory = [productWithTimestamp, ...prev];
      }
      
      // Keep only last 500 items
      return newHistory.slice(0, 500);
    });

    setHistoryItems(prev => {
      const existingIndex = prev.findIndex(item => item.barcode === product.barcode);
      
      let newHistoryItems: HistoryItem[];
      if (existingIndex >= 0) {
        // Update existing item and move to top
        newHistoryItems = [
          {
            barcode: product.barcode,
            scannedAt: now,
            cachedProduct: productWithTimestamp
          },
          ...prev.filter(item => item.barcode !== product.barcode)
        ];
      } else {
        // Add new item to top
        newHistoryItems = [
          {
            barcode: product.barcode,
            scannedAt: now,
            cachedProduct: productWithTimestamp
          },
          ...prev
        ];
      }
      
      // Keep only last 500 items
      const limitedHistoryItems = newHistoryItems.slice(0, 500);
      
      // Save to storage
      saveHistoryItems(limitedHistoryItems);
      
      return limitedHistoryItems;
    });
  };

  const updateHistoryProduct = (barcode: string, product: Product) => {
    setScanHistory(prev => 
      prev.map(item => 
        item.barcode === barcode ? { ...product, lastScanned: item.lastScanned } : item
      )
    );

    setHistoryItems(prev => 
      prev.map(item => 
        item.barcode === barcode 
          ? { ...item, cachedProduct: { ...product, lastScanned: item.scannedAt } }
          : item
      )
    );
  };

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setScanHistory([]);
      setHistoryItems([]);
    } catch (error) {
      console.error('Error clearing scan history:', error);
    }
  };

  const value = {
    scanHistory,
    historyItems,
    addToHistory,
    clearHistory,
    isLoading,
    deviceId,
    updateHistoryProduct
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