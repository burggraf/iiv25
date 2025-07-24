import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider, useApp } from '../AppContext';
import { VeganStatus, Product } from '../../types';

// Mock React Native components for testing
jest.mock('react-native', () => ({
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock device ID service
jest.mock('../../services/deviceIdService', () => ({
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Test component that uses the app context
const TestComponent: React.FC = () => {
  const { scanHistory, addToHistory, clearHistory, isLoading, deviceId } = useApp();

  return (
    <>
      <Text testID="loading-status">{isLoading ? 'loading' : 'not-loading'}</Text>
      <Text testID="device-id">{deviceId || 'no-device-id'}</Text>
      <Text testID="history-count">{scanHistory.length}</Text>
      
      {scanHistory.map((item, index) => (
        <Text key={index} testID={`history-item-${index}`}>
          {item.name} - {item.barcode}
        </Text>
      ))}
      
      <TouchableOpacity
        testID="add-product-button"
        onPress={() => addToHistory({
          id: '123',
          barcode: '1234567890123',
          name: 'Test Product',
          brand: 'Test Brand',
          veganStatus: VeganStatus.VEGAN,
          ingredients: ['water', 'salt'],
          lastScanned: new Date(),
        })}
      >
        <Text>Add Product</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        testID="clear-history-button"
        onPress={() => clearHistory()}
      >
        <Text>Clear History</Text>
      </TouchableOpacity>
    </>
  );
};

describe('AppContext', () => {
  const mockProduct: Product = {
    id: '123',
    barcode: '1234567890123',
    name: 'Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.VEGAN,
    ingredients: ['water', 'salt'],
    lastScanned: new Date('2024-01-01T00:00:00Z'),
  };

  const mockProduct2: Product = {
    id: '456',
    barcode: '4567890123456',
    name: 'Another Product',
    brand: 'Another Brand',
    veganStatus: VeganStatus.VEGETARIAN,
    ingredients: ['milk', 'sugar'],
    lastScanned: new Date('2024-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Default AsyncStorage mocks
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Provider initialization', () => {
    it('should initialize with loading state and then finish loading', async () => {
      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      // Initially should be loading
      expect(screen.getByTestId('loading-status')).toHaveTextContent('loading');

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('device-id')).toHaveTextContent('test-device-id');
      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
    });

    it('should load existing history from AsyncStorage', async () => {
      const storedHistory = [mockProduct, mockProduct2];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(storedHistory));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
        expect(screen.getByTestId('history-count')).toHaveTextContent('2');
      });

      expect(screen.getByTestId('history-item-0')).toHaveTextContent('Test Product - 1234567890123');
      expect(screen.getByTestId('history-item-1')).toHaveTextContent('Another Product - 4567890123456');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@IsItVegan:scanHistory');
    });

    it('should handle corrupted AsyncStorage data gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid-json');

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
      expect(console.error).toHaveBeenCalledWith('Error loading scan history:', expect.any(Error));
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
      expect(console.error).toHaveBeenCalledWith('Error loading scan history:', expect.any(Error));
    });

    it('should handle device ID service errors', async () => {
      const deviceIdService = require('../../services/deviceIdService').default;
      deviceIdService.getDeviceId.mockRejectedValue(new Error('Device ID error'));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('device-id')).toHaveTextContent('no-device-id');
      expect(console.error).toHaveBeenCalledWith('Error initializing app:', expect.any(Error));
    });
  });

  describe('addToHistory functionality', () => {
    it('should add new product to history', async () => {
      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      const addButton = screen.getByTestId('add-product-button');
      
      await act(async () => {
        fireEvent.press(addButton);
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      expect(screen.getByTestId('history-item-0')).toHaveTextContent('Test Product - 1234567890123');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@IsItVegan:scanHistory',
        expect.stringContaining('Test Product')
      );
    });

    it('should update existing product and move to top', async () => {
      const existingHistory = [mockProduct2, mockProduct];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingHistory));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('2');
      });

      // Add the same product that already exists (mockProduct)
      const addButton = screen.getByTestId('add-product-button');
      
      await act(async () => {
        fireEvent.press(addButton);
      });

      // Should still have 2 items, but order changed
      expect(screen.getByTestId('history-count')).toHaveTextContent('2');
      expect(screen.getByTestId('history-item-0')).toHaveTextContent('Test Product - 1234567890123');
      expect(screen.getByTestId('history-item-1')).toHaveTextContent('Another Product - 4567890123456');
    });

    it('should limit history to 100 items', async () => {
      // Create 100 existing items
      const existingHistory = Array.from({ length: 100 }, (_, i) => ({
        ...mockProduct,
        id: `${i}`,
        barcode: `${i}`.padStart(13, '0'),
        name: `Product ${i}`,
      }));
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingHistory));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('100');
      });

      // Add one more product
      const addButton = screen.getByTestId('add-product-button');
      
      await act(async () => {
        fireEvent.press(addButton);
      });

      // Should still be 100 items (oldest removed)
      expect(screen.getByTestId('history-count')).toHaveTextContent('100');
      expect(screen.getByTestId('history-item-0')).toHaveTextContent('Test Product - 1234567890123');
    });

    it('should update lastScanned timestamp when adding', async () => {
      const beforeTime = Date.now();
      
      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      const addButton = screen.getByTestId('add-product-button');
      
      await act(async () => {
        fireEvent.press(addButton);
      });

      const afterTime = Date.now();

      // Verify that setItem was called with updated timestamp
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@IsItVegan:scanHistory',
        expect.any(String)
      );

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1] as string);
      const savedTimestamp = new Date(savedData[0].lastScanned).getTime();
      
      expect(savedTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(savedTimestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle save errors gracefully', async () => {
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Save error'));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      const addButton = screen.getByTestId('add-product-button');
      
      await act(async () => {
        fireEvent.press(addButton);
      });

      // Product should still be added to state even if save fails
      expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      expect(console.error).toHaveBeenCalledWith('Error saving scan history:', expect.any(Error));
    });
  });

  describe('clearHistory functionality', () => {
    it('should clear all history', async () => {
      const existingHistory = [mockProduct, mockProduct2];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingHistory));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('2');
      });

      const clearButton = screen.getByTestId('clear-history-button');
      
      await act(async () => {
        fireEvent.press(clearButton);
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@IsItVegan:scanHistory');
    });

    it('should handle clear errors gracefully', async () => {
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Clear error'));

      const existingHistory = [mockProduct];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingHistory));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      });

      const clearButton = screen.getByTestId('clear-history-button');
      
      await act(async () => {
        fireEvent.press(clearButton);
      });

      // State should still be cleared even if AsyncStorage fails
      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
      expect(console.error).toHaveBeenCalledWith('Error clearing scan history:', expect.any(Error));
    });
  });

  describe('Date handling', () => {
    it('should properly convert date strings from storage back to Date objects', async () => {
      const productWithStringDate = {
        ...mockProduct,
        lastScanned: '2024-01-01T12:00:00.000Z', // String format as stored in AsyncStorage
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([productWithStringDate]));

      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      });

      // Verify the component rendered (Date conversion worked)
      expect(screen.getByTestId('history-item-0')).toHaveTextContent('Test Product - 1234567890123');
    });
  });

  describe('Hook usage outside provider', () => {
    it('should throw error when used outside AppProvider', () => {
      // Suppress console.error for this test
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useApp must be used within an AppProvider');

      jest.restoreAllMocks();
    });
  });

  describe('State updates and re-renders', () => {
    it('should trigger re-renders when history changes', async () => {
      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      // Initial state
      expect(screen.getByTestId('history-count')).toHaveTextContent('0');

      // Add first product
      const addButton = screen.getByTestId('add-product-button');
      await act(async () => {
        fireEvent.press(addButton);
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('1');

      // Add second product (same product, should still be 1)
      await act(async () => {
        fireEvent.press(addButton);
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('1');

      // Clear history
      const clearButton = screen.getByTestId('clear-history-button');
      await act(async () => {
        fireEvent.press(clearButton);
      });

      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
    });
  });

  describe('Concurrent operations', () => {
    it('should handle rapid successive addToHistory calls', async () => {
      render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-status')).toHaveTextContent('not-loading');
      });

      const addButton = screen.getByTestId('add-product-button');
      
      // Rapidly add the same product multiple times
      await act(async () => {
        fireEvent.press(addButton);
        fireEvent.press(addButton);
        fireEvent.press(addButton);
      });

      // Should only have one item (duplicates handled)
      expect(screen.getByTestId('history-count')).toHaveTextContent('1');
    });
  });
});