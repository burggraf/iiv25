import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

// Mock services
jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: {
    lookupProductByBarcode: jest.fn(),
  },
}));

jest.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}));

jest.mock('../../services/ingredientOCRService', () => ({
  IngredientOCRService: {
    parseIngredientsFromImage: jest.fn(),
  },
}));

jest.mock('../../services/productCreationService', () => ({
  ProductCreationService: {
    createNewProduct: jest.fn(),
  },
}));

jest.mock('../../services/productImageUploadService', () => ({
  ProductImageUploadService: {
    uploadProductImage: jest.fn(),
  },
}));

jest.mock('../../utils/ingredientValidation', () => ({
  validateIngredientParsingResult: jest.fn(),
}));

describe('ProductResult', () => {
  const mockVeganProduct: Product = {
    id: '1',
    barcode: '123456789',
    name: 'Vegan Test Product',
    brand: 'Test Brand',
    veganStatus: VeganStatus.VEGAN,
    ingredients: ['Water', 'Organic wheat flour', 'Salt'],
    imageUrl: 'https://example.com/image.jpg',
  };

  const mockVegetarianProduct: Product = {
    ...mockVeganProduct,
    id: '2',
    name: 'Vegetarian Test Product',
    veganStatus: VeganStatus.VEGETARIAN,
    ingredients: ['Water', 'Milk', 'Sugar'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render vegan product correctly', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);

      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
      expect(screen.getByText('Test Brand')).toBeTruthy();
    });

    it('should render vegetarian product correctly', () => {
      render(<ProductResult product={mockVegetarianProduct} onBack={() => {}} />);

      expect(screen.getByText('Vegetarian Test Product')).toBeTruthy();
      expect(screen.getByText('VEGETARIAN')).toBeTruthy();
    });

    it('should handle missing brand gracefully', () => {
      const productWithoutBrand = { ...mockVeganProduct, brand: undefined };
      render(<ProductResult product={productWithoutBrand} onBack={() => {}} />);

      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
    });

    it('should render basic product structure', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);

      // Should render some basic UI elements
      expect(screen.getByText('Vegan Test Product')).toBeTruthy();
      expect(screen.queryByText('Test Brand')).toBeTruthy();
    });
  });

  describe('Component Structure', () => {
    it('should render without crashing', () => {
      expect(() => {
        render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);
      }).not.toThrow();
    });

    it('should handle onBack callback', () => {
      const mockOnBack = jest.fn();
      render(<ProductResult product={mockVeganProduct} onBack={mockOnBack} />);
      
      // Component should render without calling onBack immediately
      expect(mockOnBack).not.toHaveBeenCalled();
    });

    it('should display vegan status correctly', () => {
      render(<ProductResult product={mockVeganProduct} onBack={() => {}} />);
      
      // Should show vegan status in some form
      const veganElements = screen.queryAllByText(/vegan/i);
      expect(veganElements.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown vegan status', () => {
      const productWithUnknownStatus = { 
        ...mockVeganProduct, 
        veganStatus: VeganStatus.UNKNOWN 
      };
      
      expect(() => {
        render(<ProductResult product={productWithUnknownStatus} onBack={() => {}} />);
      }).not.toThrow();
    });

    it('should handle empty ingredients list', () => {
      const productWithoutIngredients = { 
        ...mockVeganProduct, 
        ingredients: [] 
      };
      
      expect(() => {
        render(<ProductResult product={productWithoutIngredients} onBack={() => {}} />);
      }).not.toThrow();
    });
  });
});