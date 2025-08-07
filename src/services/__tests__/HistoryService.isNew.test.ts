import { VeganStatus, Product } from '../../types';

import { historyService } from '../HistoryService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock cacheService
jest.mock('../CacheService', () => ({
  cacheService: {
    setProduct: jest.fn(),
    getProduct: jest.fn(),
    addListener: jest.fn(),
  },
}));

describe('HistoryService isNew functionality', () => {
  const mockProduct: Product = {
    id: '123456789012',
    barcode: '123456789012',
    name: 'Test Product',
    brand: 'Test Brand',
    ingredients: ['Water', 'Sugar'],
    veganStatus: VeganStatus.VEGAN,
    lastScanned: new Date(),
    classificationMethod: 'product-level',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
    
    // Clear history service state
    await historyService.clearHistory();
  });

  it('should add product with isNew flag set to true', async () => {
    await historyService.initialize();
    
    // Add product with isNew=true
    await historyService.addToHistory(mockProduct, true);
    
    // Get history items
    const history = historyService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].isNew).toBe(true);
    expect(history[0].barcode).toBe(mockProduct.barcode);
  });

  it('should add product with isNew flag set to false by default', async () => {
    await historyService.initialize();
    
    // Add product without isNew flag (defaults to false)
    await historyService.addToHistory(mockProduct);
    
    // Get history items
    const history = historyService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].isNew).toBe(false);
    expect(history[0].barcode).toBe(mockProduct.barcode);
  });

  it('should correctly count new items', async () => {
    await historyService.initialize();
    
    // Add products with different isNew flags
    await historyService.addToHistory({ ...mockProduct, barcode: '111' }, true);
    await historyService.addToHistory({ ...mockProduct, barcode: '222' }, false);
    await historyService.addToHistory({ ...mockProduct, barcode: '333' }, true);
    await historyService.addToHistory({ ...mockProduct, barcode: '444' }); // defaults to false
    
    // Check new items count
    const newItemsCount = historyService.getNewItemsCount();
    expect(newItemsCount).toBe(2); // Only 111 and 333 should be new
  });

  it('should mark item as viewed (clear isNew flag)', async () => {
    await historyService.initialize();
    
    // Add product with isNew=true
    await historyService.addToHistory(mockProduct, true);
    
    // Verify it's marked as new
    expect(historyService.getNewItemsCount()).toBe(1);
    
    // Mark as viewed
    await historyService.markAsViewed(mockProduct.barcode);
    
    // Verify isNew flag is cleared
    expect(historyService.getNewItemsCount()).toBe(0);
    const history = historyService.getHistory();
    expect(history[0].isNew).toBe(false);
  });

  it('should handle marking non-existent item as viewed', async () => {
    await historyService.initialize();
    
    // Try to mark non-existent item as viewed
    await historyService.markAsViewed('non-existent-barcode');
    
    // Should not throw error and count should remain 0
    expect(historyService.getNewItemsCount()).toBe(0);
  });

  it('should preserve existing isNew state when updating existing item without new flag', async () => {
    await historyService.initialize();
    
    // Add product with isNew=true
    await historyService.addToHistory(mockProduct, true);
    expect(historyService.getNewItemsCount()).toBe(1);
    
    // Update same product without specifying isNew flag
    const updatedProduct = { ...mockProduct, name: 'Updated Product Name' };
    await historyService.addToHistory(updatedProduct, false);
    
    // isNew should be set to false as specified
    expect(historyService.getNewItemsCount()).toBe(0);
    const history = historyService.getHistory();
    expect(history[0].isNew).toBe(false);
    expect(history[0].cachedProduct.name).toBe('Updated Product Name');
  });

  it('should update isNew flag when explicitly set during update', async () => {
    await historyService.initialize();
    
    // Add product with isNew=false
    await historyService.addToHistory(mockProduct, false);
    expect(historyService.getNewItemsCount()).toBe(0);
    
    // Update same product with isNew=true
    const updatedProduct = { ...mockProduct, name: 'Updated Product Name' };
    await historyService.addToHistory(updatedProduct, true);
    
    // isNew should now be true
    expect(historyService.getNewItemsCount()).toBe(1);
    const history = historyService.getHistory();
    expect(history[0].isNew).toBe(true);
    expect(history[0].cachedProduct.name).toBe('Updated Product Name');
  });
});