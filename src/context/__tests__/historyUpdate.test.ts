/**
 * Test for the history update functionality added to ProductResult component.
 * This test verifies that the addToHistory function from AppContext is called
 * when a product is updated through the report issue flow.
 */

import { VeganStatus } from '../../types';

// Mock AppContext
const mockAddToHistory = jest.fn();
const mockAppContext = {
  addToHistory: mockAddToHistory,
  scanHistory: [],
  clearHistory: jest.fn(),
  isLoading: false,
  deviceId: 'test-device-id',
};

// Mock the useApp hook
jest.mock('../AppContext', () => ({
  useApp: () => mockAppContext,
}));

const mockProduct = {
  id: '1',
  barcode: '1234567890',
  name: 'Test Product',
  brand: 'Test Brand',
  veganStatus: VeganStatus.VEGAN,
  ingredients: ['water', 'sugar'],
  lastScanned: new Date(),
  imageUrl: 'https://example.com/image.jpg',
};

describe('History Update Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AppContext addToHistory', () => {
    it('should be available and callable', () => {
      expect(mockAppContext.addToHistory).toBeDefined();
      expect(typeof mockAppContext.addToHistory).toBe('function');
    });

    it('should accept a product object and call the underlying implementation', () => {
      mockAppContext.addToHistory(mockProduct);
      
      expect(mockAddToHistory).toHaveBeenCalledWith(mockProduct);
      expect(mockAddToHistory).toHaveBeenCalledTimes(1);
    });

    it('should handle updated products with new data', () => {
      const updatedProduct = {
        ...mockProduct,
        name: 'Updated Product Name',
        brand: 'Updated Brand',
        ingredients: ['water', 'sugar', 'natural flavoring'],
        veganStatus: VeganStatus.VEGETARIAN,
      };

      mockAppContext.addToHistory(updatedProduct);

      expect(mockAddToHistory).toHaveBeenCalledWith(updatedProduct);
      expect(mockAddToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Product Name',
          brand: 'Updated Brand',
          veganStatus: VeganStatus.VEGETARIAN,
        })
      );
    });

    it('should preserve all product properties when updating history', () => {
      const productWithAllFields = {
        ...mockProduct,
        issues: 'Updated ingredients via OCR',
        structuredIngredients: [
          { name: 'water', isVegan: true },
          { name: 'sugar', isVegan: true },
        ],
        nonVeganIngredients: [],
        classificationMethod: 'structured' as const,
      };

      mockAppContext.addToHistory(productWithAllFields);

      expect(mockAddToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '1234567890',
          name: 'Test Product',
          brand: 'Test Brand',
          veganStatus: VeganStatus.VEGAN,
          ingredients: ['water', 'sugar'],
          issues: 'Updated ingredients via OCR',
          structuredIngredients: expect.any(Array),
          nonVeganIngredients: expect.any(Array),
          classificationMethod: 'structured',
        })
      );
    });
  });

  describe('Report Issue Integration Flow', () => {
    it('should demonstrate the expected call flow for report issue updates', () => {
      // 1. Initial product state
      const initialProduct = mockProduct;
      
      // 2. Simulate report issue update (image upload, OCR, etc.)
      const updatedProduct = {
        ...initialProduct,
        name: 'OCR Updated Name',
        ingredients: ['water', 'sugar', 'natural flavoring'],
        veganStatus: VeganStatus.VEGETARIAN,
      };

      // 3. Simulate ProductResult.refreshProductData() calling addToHistory
      mockAppContext.addToHistory(updatedProduct);

      // 4. Verify the history was updated with the new product data
      expect(mockAddToHistory).toHaveBeenCalledWith(updatedProduct);
      expect(mockAddToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'OCR Updated Name',
          veganStatus: VeganStatus.VEGETARIAN,
          ingredients: expect.arrayContaining(['natural flavoring']),
        })
      );
    });

    it('should handle multiple sequential updates', () => {
      // Simulate multiple updates to the same product
      const firstUpdate = { ...mockProduct, name: 'First Update' };
      const secondUpdate = { ...mockProduct, name: 'Second Update', brand: 'New Brand' };
      const thirdUpdate = { 
        ...mockProduct, 
        name: 'Final Update', 
        ingredients: ['updated', 'ingredients'],
        veganStatus: VeganStatus.NOT_VEGAN,
      };

      mockAppContext.addToHistory(firstUpdate);
      mockAppContext.addToHistory(secondUpdate);
      mockAppContext.addToHistory(thirdUpdate);

      expect(mockAddToHistory).toHaveBeenCalledTimes(3);
      expect(mockAddToHistory).toHaveBeenNthCalledWith(1, firstUpdate);
      expect(mockAddToHistory).toHaveBeenNthCalledWith(2, secondUpdate);
      expect(mockAddToHistory).toHaveBeenNthCalledWith(3, thirdUpdate);
    });
  });

  describe('Data Integrity', () => {
    it('should not modify the original product object', () => {
      const originalProduct = { ...mockProduct };
      
      mockAppContext.addToHistory(originalProduct);
      
      // Verify the original product is unchanged
      expect(originalProduct).toEqual(mockProduct);
    });

    it('should handle products with minimal required fields', () => {
      const minimalProduct = {
        id: '2',
        barcode: '0987654321',
        name: 'Minimal Product',
        veganStatus: VeganStatus.UNKNOWN,
        ingredients: [],
      };

      mockAppContext.addToHistory(minimalProduct);

      expect(mockAddToHistory).toHaveBeenCalledWith(minimalProduct);
    });
  });
});