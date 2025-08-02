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

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

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
    expect(mockAsyncStorage.setItem).toHaveBeenCalled();
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
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@IsItVegan:scanHistory');
  });

  it('should load existing history from AsyncStorage', async () => {
    const existingHistory = [{...mockProduct, lastScanned: new Date().toISOString()}];
    mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingHistory));
    
    const { result } = renderHook(() => useApp(), { wrapper });
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
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
    
    // Add two products
    await act(async () => {
      result.current.addToHistory(product1);
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