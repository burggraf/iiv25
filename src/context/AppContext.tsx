import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';
import deviceIdService from '../services/deviceIdService';

interface AppContextType {
  scanHistory: Product[];
  addToHistory: (product: Product) => void;
  clearHistory: () => void;
  isLoading: boolean;
  deviceId: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = '@IsItVegan:scanHistory';

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [scanHistory, setScanHistory] = useState<Product[]>([]);
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
        // Convert date strings back to Date objects
        const historyWithDates = history.map((item: any) => ({
          ...item,
          lastScanned: new Date(item.lastScanned)
        }));
        setScanHistory(historyWithDates);
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

  const addToHistory = (product: Product) => {
    setScanHistory(prev => {
      // Check if product already exists in history
      const existingIndex = prev.findIndex(item => item.barcode === product.barcode);
      
      let newHistory: Product[];
      if (existingIndex >= 0) {
        // Update existing product and move to top
        newHistory = [
          { ...product, lastScanned: new Date() },
          ...prev.filter(item => item.barcode !== product.barcode)
        ];
      } else {
        // Add new product to top
        newHistory = [{ ...product, lastScanned: new Date() }, ...prev];
      }
      
      // Keep only last 100 items
      const limitedHistory = newHistory.slice(0, 100);
      
      // Save to storage
      saveHistory(limitedHistory);
      
      return limitedHistory;
    });
  };

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setScanHistory([]);
    } catch (error) {
      console.error('Error clearing scan history:', error);
    }
  };

  const value = {
    scanHistory,
    addToHistory,
    clearHistory,
    isLoading,
    deviceId
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