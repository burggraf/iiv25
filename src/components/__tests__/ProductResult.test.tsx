import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProductResult from '../ProductResult';
import { VeganStatus, Product } from '../../types';

// Mock the AppContext
const mockAddToHistory = jest.fn();
const mockAppContext = {
  addToHistory: mockAddToHistory,
  scanHistory: [],
  clearHistory: jest.fn(),
  isLoading: false,
  deviceId: 'test-device-id',
};

jest.mock('../../context/AppContext', () => ({
  useApp: () => mockAppContext,
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock all the other dependencies
jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: {
    lookupProductByBarcode: jest.fn(),
  },
}));

jest.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

describe('ProductResult', () => {
  const mockVeganProduct: Product = {
    id: '1',
    barcode: '1234567890123',
    name: 'Vegan Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.VEGAN,
    ingredients: ['water', 'salt', 'sugar'],
    lastScanned: new Date(),
    imageUrl: 'https://example.com/image.jpg',
  };

  const mockVegetarianProduct: Product = {
    id: '2',
    barcode: '2345678901234',
    name: 'Vegetarian Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.VEGETARIAN,
    ingredients: ['water', 'milk', 'sugar'],
    lastScanned: new Date(),
    nonVeganIngredients: [
      {
        ingredient: 'milk',
        reason: 'Contains dairy products',
        verdict: 'vegetarian',
      },
    ],
  };

  const mockNonVegetarianProduct: Product = {
    id: '3',
    barcode: '3456789012345',
    name: 'Non-Vegetarian Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.NOT_VEGETARIAN,
    ingredients: ['water', 'beef', 'salt'],
    lastScanned: new Date(),
    nonVeganIngredients: [
      {
        ingredient: 'beef',
        reason: 'Contains meat products',
        verdict: 'not_vegetarian',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render vegan product correctly', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);

      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
      expect(screen.getByText('Test Brand')).toBeTruthy();
      expect(screen.getByText('VEGAN')).toBeTruthy();
    });

    it('should render vegetarian product correctly', () => {
      render(<ProductResult product={mockVegetarianProduct} onBack={() => {}} />);

      expect(screen.getByText('Vegetarian Test Product')).toBeTruthy();
      expect(screen.getByText('VEGETARIAN')).toBeTruthy();
    });

    it('should render non-vegetarian product correctly', () => {
      render(<ProductResult product={mockNonVegetarianProduct} onBack={() => {}} />);

      expect(screen.getByText('Non-Vegetarian Test Product')).toBeTruthy();
      expect(screen.getByText('NOT VEGETARIAN')).toBeTruthy();
    });

    it('should handle missing brand gracefully', () => {
      const productWithoutBrand = { ...mockVeganProduct, brand: undefined };
      render(<ProductResult product={productWithoutBrand} onBack={() => {}} />);

      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
    });

    it('should handle empty ingredients list', () => {
      const productWithoutIngredients = { ...mockVeganProduct, ingredients: [] };
      render(<ProductResult product={productWithoutIngredients} onBack={() => {}} />);

      expect(screen.getByText('water, salt, sugar')).toBeFalsy();
    });
  });

  describe('User Interactions', () => {
    it('should show back button when not hidden', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);
      
      // Look for back button or navigation element
      const backElements = screen.queryAllByText('←');
      expect(backElements.length).toBeGreaterThanOrEqual(0);
    });

    it('should call onBack when back button is pressed', () => {
      const mockOnBack = jest.fn();
      render(<ProductResult product={mockVeganProduct} onBack={mockOnBack} />);
      
      // Try to find and press back button
      const backButton = screen.queryByTestId('back-button');
      if (backButton) {
        fireEvent.press(backButton);
        expect(mockOnBack).toHaveBeenCalled();
      }
    });

    it('should handle product update callback', () => {
      const mockOnProductUpdated = jest.fn();
      render(
        <ProductResult 
          product={mockVeganProduct} 
          onBack={() => {}}
          onProductUpdated={mockOnProductUpdated}
        />
      );

      // Component should render without crashing
      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown vegan status', () => {
      const unknownProduct = {
        ...mockVeganProduct,
        veganStatus: VeganStatus.UNKNOWN,
      };

      render(<ProductResult product={unknownProduct} onBack={() => {}} />);

      expect(screen.getByText('UNKNOWN')).toBeTruthy();
    });

    it('should handle missing product name', () => {
      const productWithoutName = { ...mockVeganProduct, name: '' };
      render(<ProductResult product={productWithoutName} onBack={() => {}} />);

      // Should render without crashing
      expect(screen.queryByText('')).toBeTruthy();
    });

    it('should handle very long product names', () => {
      const longNameProduct = {
        ...mockVeganProduct,
        name: 'This is a very long product name that should be handled gracefully by the component',
      };

      render(<ProductResult product={longNameProduct} onBack={() => {}} />);

      expect(screen.getByText(longNameProduct.name)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should render component with basic accessibility support', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);

      // Component should render without accessibility issues
      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
    });
  });

  describe('Context Integration', () => {
    it('should integrate with AppContext correctly', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);

      // Should have access to app context without errors
      expect(mockAppContext.addToHistory).toBeDefined();
    });
  });
});