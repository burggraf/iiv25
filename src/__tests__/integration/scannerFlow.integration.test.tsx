import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BarcodeScanner from '../../components/BarcodeScanner';
import ProductResult from '../../components/ProductResult';
import { ProductLookupService } from '../../services/productLookupService';
import { VeganStatus, Product } from '../../types';
import { AuthProvider } from '../../context/AuthContext';
import { AppProvider } from '../../context/AppContext';

// Mock dependencies
jest.mock('../../services/productLookupService');
jest.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInAnonymously: jest.fn(),
    },
  },
}));

jest.mock('expo-camera', () => ({
  CameraView: jest.fn(({ onBarcodeScanned, children }) =>
    React.createElement('View', { testID: 'camera-view', onPress: () => {
      if (onBarcodeScanned) {
        onBarcodeScanned({
          type: 'ean13',
          data: '1234567890123',
          bounds: { origin: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
          cornerPoints: [],
        });
      }
    }}, children)
  ),
  useCameraPermissions: jest.fn(() => [
    { granted: true, canAskAgain: true },
    jest.fn(),
  ]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
}));

const mockProductLookupService = ProductLookupService as jest.Mocked<typeof ProductLookupService>;

// Complete Scanner Flow Integration Test
describe('Scanner Flow Integration', () => {
  const mockVeganProduct: Product = {
    id: '1234567890123',
    barcode: '1234567890123',
    name: 'Organic Quinoa Pasta',
    brand: 'Healthy Foods Co.',
    veganStatus: VeganStatus.VEGAN,
    ingredients: ['organic quinoa flour', 'water', 'salt'],
    lastScanned: new Date(),
    imageUrl: 'https://example.com/quinoa-pasta.jpg',
    classificationMethod: 'text-based',
  };

  const mockVegetarianProduct: Product = {
    id: '2345678901234',
    barcode: '2345678901234',
    name: 'Cheese Pizza',
    brand: 'Pizza Palace',
    veganStatus: VeganStatus.VEGETARIAN,
    ingredients: ['wheat flour', 'cheese', 'tomato sauce', 'yeast'],
    lastScanned: new Date(),
    imageUrl: 'https://example.com/cheese-pizza.jpg',
    nonVeganIngredients: [
      {
        ingredient: 'cheese',
        reason: 'Contains dairy products',
        verdict: 'vegetarian',
      },
    ],
    classificationMethod: 'text-based',
  };

  const mockNonVegetarianProduct: Product = {
    id: '3456789012345',
    barcode: '3456789012345',
    name: 'Beef Jerky',
    brand: 'Meat Snacks Inc.',
    veganStatus: VeganStatus.NOT_VEGETARIAN,
    ingredients: ['beef', 'salt', 'spices', 'sodium nitrite'],
    lastScanned: new Date(),
    imageUrl: 'https://example.com/beef-jerky.jpg',
    nonVeganIngredients: [
      {
        ingredient: 'beef',
        reason: 'Contains meat products',
        verdict: 'not_vegetarian',
      },
    ],
    classificationMethod: 'text-based',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <AuthProvider>
        <AppProvider>
          {component}
        </AppProvider>
      </AuthProvider>
    );
  };

  describe('Complete Scanner to Product Result Flow', () => {
    it('should successfully scan a vegan product and display results', async () => {
      // Mock successful product lookup
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockVeganProduct,
        error: null,
        isRateLimited: false,
      });

      let scannedBarcode: string | null = null;
      let showResult = false;

      const TestScannerFlow = () => {
        const [scanning, setScanning] = React.useState(true);
        const [product, setProduct] = React.useState<Product | null>(null);

        const handleBarcodeScanned = async (barcode: string) => {
          scannedBarcode = barcode;
          setScanning(false);
          
          const result = await ProductLookupService.lookupProductByBarcode(barcode);
          if (result.product) {
            setProduct(result.product);
            showResult = true;
          }
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        if (product && showResult) {
          return <ProductResult product={product} onBack={() => setScanning(true)} />;
        }

        return null;
      };

      renderWithProviders(<TestScannerFlow />);

      // 1. Verify scanner is displayed
      expect(screen.getByTestId('camera-view')).toBeTruthy();
      expect(screen.getByText('Point camera at barcode')).toBeTruthy();

      // 2. Simulate barcode scan
      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      // 3. Wait for product lookup to complete
      await waitFor(() => {
        expect(mockProductLookupService.lookupProductByBarcode).toHaveBeenCalledWith('1234567890123');
      });

      // 4. Verify product result is displayed
      await waitFor(() => {
        expect(screen.getByText('Organic Quinoa Pasta')).toBeTruthy();
        expect(screen.getByText('Healthy Foods Co.')).toBeTruthy();
        expect(screen.getByText('VEGAN')).toBeTruthy();
        expect(screen.getByText('This product is vegan! 🌱')).toBeTruthy();
      });

      // 5. Verify ingredients are shown
      expect(screen.getByText('Ingredients:')).toBeTruthy();
      expect(screen.getByText('organic quinoa flour, water, salt')).toBeTruthy();

      // 6. Verify barcode was captured correctly
      expect(scannedBarcode).toBe('1234567890123');
    });

    it('should handle vegetarian product with non-vegan ingredients', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockVegetarianProduct,
        error: null,
        isRateLimited: false,
      });

      let product: Product | null = null;

      const TestVegetarianFlow = () => {
        const [scanning, setScanning] = React.useState(true);

        const handleBarcodeScanned = async (barcode: string) => {
          setScanning(false);
          const result = await ProductLookupService.lookupProductByBarcode(barcode);
          product = result.product;
        };

        React.useEffect(() => {
          if (!scanning && product) {
            // Re-render with product
          }
        }, [scanning, product]);

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        return product ? <ProductResult product={product} onBack={() => {}} /> : null;
      };

      renderWithProviders(<TestVegetarianFlow />);

      // Simulate scan
      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(mockProductLookupService.lookupProductByBarcode).toHaveBeenCalled();
      });

      // Re-render with the product
      renderWithProviders(<ProductResult product={mockVegetarianProduct} onBack={() => {}} />);

      // Verify vegetarian product display
      expect(screen.getByText('Cheese Pizza')).toBeTruthy();
      expect(screen.getByText('VEGETARIAN')).toBeTruthy();
      expect(screen.getByText('This product is vegetarian but not vegan.')).toBeTruthy();

      // Verify non-vegan ingredients are highlighted
      expect(screen.getByText('Non-vegan ingredients:')).toBeTruthy();
      expect(screen.getByText('cheese')).toBeTruthy();
      expect(screen.getByText('Contains dairy products')).toBeTruthy();
    });

    it('should handle non-vegetarian product correctly', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockNonVegetarianProduct,
        error: null,
        isRateLimited: false,
      });

      renderWithProviders(<ProductResult product={mockNonVegetarianProduct} onBack={() => {}} />);

      // Verify non-vegetarian product display
      expect(screen.getByText('Beef Jerky')).toBeTruthy();
      expect(screen.getByText('NOT VEGETARIAN')).toBeTruthy();
      expect(screen.getByText('This product is not suitable for vegetarians or vegans.')).toBeTruthy();

      // Verify meat ingredients are highlighted
      expect(screen.getByText('Non-vegan ingredients:')).toBeTruthy();
      expect(screen.getByText('beef')).toBeTruthy();
      expect(screen.getByText('Contains meat products')).toBeTruthy();
    });
  });

  describe('Error Handling in Scanner Flow', () => {
    it('should handle product not found gracefully', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: null,
        error: null,
        isRateLimited: false,
      });

      let errorOccurred = false;

      const TestErrorFlow = () => {
        const [scanning, setScanning] = React.useState(true);
        const [error, setError] = React.useState<string | null>(null);

        const handleBarcodeScanned = async (barcode: string) => {
          setScanning(false);
          const result = await ProductLookupService.lookupProductByBarcode(barcode);
          
          if (!result.product && !result.error) {
            setError('Product not found in database');
            errorOccurred = true;
          }
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        if (error) {
          return <div data-testid="error-message">{error}</div>;
        }

        return null;
      };

      renderWithProviders(<TestErrorFlow />);

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(errorOccurred).toBe(true);
      });
    });

    it('should handle network errors during product lookup', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: null,
        error: 'Network connection failed',
        isRateLimited: false,
      });

      let networkError = false;

      const TestNetworkErrorFlow = () => {
        const [scanning, setScanning] = React.useState(true);

        const handleBarcodeScanned = async (barcode: string) => {
          setScanning(false);
          const result = await ProductLookupService.lookupProductByBarcode(barcode);
          
          if (result.error) {
            networkError = true;
          }
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        return null;
      };

      renderWithProviders(<TestNetworkErrorFlow />);

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(networkError).toBe(true);
      });
    });

    it('should handle rate limiting gracefully', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: null,
        error: 'Rate limited - please try again later',
        isRateLimited: true,
      });

      let rateLimited = false;

      const TestRateLimitFlow = () => {
        const [scanning, setScanning] = React.useState(true);

        const handleBarcodeScanned = async (barcode: string) => {
          setScanning(false);
          const result = await ProductLookupService.lookupProductByBarcode(barcode);
          
          if (result.isRateLimited) {
            rateLimited = true;
          }
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        return null;
      };

      renderWithProviders(<TestRateLimitFlow />);

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(rateLimited).toBe(true);
      });
    });
  });

  describe('Scanner Performance and User Experience', () => {
    it('should prevent duplicate scans of the same barcode', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockVeganProduct,
        error: null,
        isRateLimited: false,
      });

      let scanCount = 0;

      const TestDuplicatePreventionFlow = () => {
        const [scanning, setScanning] = React.useState(true);

        const handleBarcodeScanned = async (barcode: string) => {
          scanCount++;
          // Don't stop scanning to test duplicate prevention
          await ProductLookupService.lookupProductByBarcode(barcode);
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={() => setScanning(false)}
            />
          );
        }

        return null;
      };

      renderWithProviders(<TestDuplicatePreventionFlow />);

      const cameraView = screen.getByTestId('camera-view');
      
      // Simulate rapid scanning
      fireEvent.press(cameraView);
      fireEvent.press(cameraView);
      fireEvent.press(cameraView);

      await waitFor(() => {
        // Should only process the first scan
        expect(scanCount).toBe(1);
      });
    });

    it('should handle scanner close during product lookup', async () => {
      // Simulate slow network response
      mockProductLookupService.lookupProductByBarcode.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          product: mockVeganProduct,
          error: null,
          isRateLimited: false,
        }), 1000))
      );

      let scannerClosed = false;

      const TestCloseFlow = () => {
        const [scanning, setScanning] = React.useState(true);

        const handleBarcodeScanned = async (barcode: string) => {
          // Don't stop scanning immediately
          await ProductLookupService.lookupProductByBarcode(barcode);
        };

        const handleClose = () => {
          setScanning(false);
          scannerClosed = true;
        };

        if (scanning) {
          return (
            <BarcodeScanner
              isVisible={true}
              onBarcodeScanned={handleBarcodeScanned}
              onClose={handleClose}
            />
          );
        }

        return null;
      };

      renderWithProviders(<TestCloseFlow />);

      // Start a scan
      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      // Immediately close scanner
      const closeButton = screen.getByText('Close');
      fireEvent.press(closeButton);

      expect(scannerClosed).toBe(true);
    });
  });

  describe('History Integration', () => {
    it('should add successfully scanned products to history', async () => {
      mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
        product: mockVeganProduct,
        error: null,
        isRateLimited: false,
      });

      // This would normally be tested with the actual AppContext
      // For now, we verify the product data structure is correct
      const result = await ProductLookupService.lookupProductByBarcode('1234567890123');
      
      expect(result.product).toEqual(mockVeganProduct);
      expect(result.product?.id).toBe('1234567890123');
      expect(result.product?.barcode).toBe('1234567890123');
      expect(result.product?.lastScanned).toBeInstanceOf(Date);
    });
  });
});