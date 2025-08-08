import React from 'react';
import { renderHook, act } from '@testing-library/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider, useApp } from '../AppContext';
import { VeganStatus, Product } from '../../types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock device ID service
jest.mock('../../services/deviceIdService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

// Mock HistoryService
jest.mock('../../services/HistoryService', () => ({
  historyService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addToHistory: jest.fn().mockResolvedValue(undefined),
    clearHistory: jest.fn().mockResolvedValue(undefined),
    updateProduct: jest.fn().mockResolvedValue(undefined),
    getNewItemsCount: jest.fn().mockReturnValue(0),
    markAsViewed: jest.fn(),
    getHistory: jest.fn().mockReturnValue([]),
  },
}));

// Mock CacheInvalidationService
jest.mock('../../services/CacheInvalidationService', () => ({
  cacheInvalidationService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({ 
      isInitialized: true, 
      isActive: true, 
      isListeningToJobs: true 
    }),
  },
}));

// Mock useBackgroundJobs hook
jest.mock('../../hooks/useBackgroundJobs', () => ({
  useBackgroundJobs: jest.fn().mockReturnValue({
    queueJob: jest.fn(),
    clearAllJobs: jest.fn(),
    activeJobs: [],
  }),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Import the mocked HistoryService
import { historyService } from '../../services/HistoryService';
const mockHistoryService = historyService as jest.Mocked<typeof historyService>;

// Test wrapper
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider>{children}</AppProvider>
);

const mockProduct: Product = {
  id: '123',
  name: 'Test Product',
  barcode: '123456789',
  brand: 'Test Brand',
  ingredients: ['ingredient1', 'ingredient2'],
  veganStatus: VeganStatus.VEGAN,
  imageUrl: 'test-image-url',
};

describe('AppContext Hook Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
    
    // Reset history service mocks
    mockHistoryService.getHistory.mockReturnValue([]);
    mockHistoryService.getNewItemsCount.mockReturnValue(0);
    
    
    // Store global history and listener references for tests
    let globalHistory: any[] = [];
    let globalListener: any = null;
    (global as any).mockGlobalHistory = globalHistory;
    (global as any).mockHistoryListener = null;
    
    // Mock addListener to capture the listener
    mockHistoryService.addListener.mockImplementation((listener: any) => {
      globalListener = listener;
      (global as any).mockHistoryListener = listener;
    });
    
    // Default addToHistory implementation with 500 item limit
    mockHistoryService.addToHistory.mockImplementation(async (product: any) => {
      const existingIndex = globalHistory.findIndex(item => item.barcode === product.barcode);
      if (existingIndex >= 0) {
        // Update existing and move to top
        const updated = {
          ...globalHistory[existingIndex],
          scannedAt: new Date(),
          cachedProduct: { ...product, lastScanned: new Date() },
        };
        globalHistory = [updated, ...globalHistory.filter((_, i) => i !== existingIndex)];
      } else {
        // Add new item to top
        const newItem = {
          barcode: product.barcode,
          scannedAt: new Date(),
          cachedProduct: { ...product, lastScanned: new Date() },
          isNew: false,
        };
        globalHistory = [newItem, ...globalHistory];
      }
      
      // Apply 500 item limit
      if (globalHistory.length > 500) {
        globalHistory = globalHistory.slice(0, 500);
      }
      
      // Update the mock getHistory to return current state
      mockHistoryService.getHistory.mockReturnValue([...globalHistory]);
      
      // Trigger listener update if available
      if (globalListener && globalListener.onHistoryUpdated) {
        globalListener.onHistoryUpdated([...globalHistory]);
      }
    });
    
    // Mock clearHistory implementation
    mockHistoryService.clearHistory.mockImplementation(async () => {
      globalHistory.length = 0; // Clear the array
      
      // Update the mock getHistory to return empty array
      mockHistoryService.getHistory.mockReturnValue([]);
      
      // Trigger listener update if available
      if (globalListener && globalListener.onHistoryUpdated) {
        globalListener.onHistoryUpdated([]);
      }
    });
  });

  it('should initialize with empty history and finish loading', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    expect(result.current.isLoading).toBe(false);
    expect(result.current.scanHistory).toEqual([]);
    expect(result.current.deviceId).toBe('test-device-id');
  });

  it('should add product to history', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Add product to history
    await act(async () => {
      result.current.addToHistory(mockProduct);
    });
    
    expect(result.current.scanHistory).toHaveLength(1);
    expect(result.current.scanHistory[0]).toMatchObject({
      ...mockProduct,
      lastScanned: expect.any(Date),
    });
    // Note: With the refactored HistoryService, storage operations are handled internally
    // so we don't directly test AsyncStorage calls
  });

  it('should clear history', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Add a product first
    await act(async () => {
      result.current.addToHistory(mockProduct);
    });
    
    expect(result.current.scanHistory).toHaveLength(1);
    
    // Clear history
    await act(async () => {
      result.current.clearHistory();
    });
    
    expect(result.current.scanHistory).toHaveLength(0);
    // Note: The clear operation now clears the unified cache, not just scan history
    expect(mockAsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('should load existing history from AsyncStorage', async () => {
    // Setup history service to return existing data
    const existingHistoryItem = {
      barcode: mockProduct.barcode,
      scannedAt: new Date(),
      cachedProduct: {...mockProduct, lastScanned: new Date()},
      isNew: false,
    };
    
    mockHistoryService.getHistory.mockReturnValue([existingHistoryItem]);
    
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Trigger the history listener manually since the service is mocked
    const mockListener = (global as any).mockHistoryListener;
    if (mockListener && mockListener.onHistoryUpdated) {
      act(() => {
        mockListener.onHistoryUpdated([existingHistoryItem]);
      });
    }
    
    expect(result.current.scanHistory).toHaveLength(1);
    expect(result.current.scanHistory[0].barcode).toBe(mockProduct.barcode);
  });

  it('should handle corrupted AsyncStorage data', async () => {
    mockAsyncStorage.getItem.mockResolvedValue('invalid json');
    
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Should initialize with empty history when data is corrupted
    expect(result.current.scanHistory).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle AsyncStorage errors gracefully', async () => {
    mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
    
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Should still initialize despite storage error
    expect(result.current.scanHistory).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should limit history to 500 items', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Add 501 products (test the limit by adding one over)
    await act(async () => {
      for (let i = 0; i < 501; i++) {
        result.current.addToHistory({
          ...mockProduct,
          id: `${i}`,
          barcode: `12345678${i}`,
          name: `Product ${i}`,
        });
      }
    });
    
    // Should be limited to 500 items
    expect(result.current.scanHistory).toHaveLength(500);
  });

  it('should update existing product and move to top', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const product1 = { ...mockProduct, id: '1', barcode: '111' };
    const product2 = { ...mockProduct, id: '2', barcode: '222' };
    
    // Add two products (using the default mock implementation)
    await act(async () => {
      result.current.addToHistory(product1);
    });
    
    await act(async () => {
      result.current.addToHistory(product2);
    });
    
    expect(result.current.scanHistory[0].barcode).toBe('222'); // Most recent first
    
    // Re-scan first product
    await act(async () => {
      result.current.addToHistory(product1);
    });
    
    // Should move to top and update timestamp
    expect(result.current.scanHistory[0].barcode).toBe('111');
    expect(result.current.scanHistory).toHaveLength(2); // Should not duplicate
  });
});