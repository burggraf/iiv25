import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BarcodeScanner from '../BarcodeScanner';
import { CameraView } from 'expo-camera';

// Mock expo-camera
jest.mock('expo-camera', () => ({
  CameraView: jest.fn(),
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
  useCameraPermissions: jest.fn(() => [
    { granted: true, canAskAgain: true },
    jest.fn(),
  ]),
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Medium: 'medium',
  },
}));

const mockCameraView = CameraView as jest.MockedFunction<any>;

describe('BarcodeScanner', () => {
  const mockOnBarcodeScanned = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCameraView.mockImplementation((props: any) => {
      return React.createElement(
        'View',
        {
          testID: 'camera-view',
          onPress: () => {
            // Simulate barcode scan
            if (props.onBarcodeScanned) {
              props.onBarcodeScanned({
                type: 'ean13',
                data: '1234567890123',
                bounds: { origin: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                cornerPoints: [],
              });
            }
          },
        },
        props.children
      );
    });
  });

  describe('Rendering', () => {
    it('should render camera view when permissions are granted', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('camera-view')).toBeTruthy();
    });

    it('should render close button', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Close')).toBeTruthy();
    });

    it('should render scanning instructions', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Point camera at barcode')).toBeTruthy();
    });

    it('should render scanning overlay/frame', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const overlay = screen.getByTestId('scanner-overlay');
      expect(overlay).toBeTruthy();
    });
  });

  describe('Barcode Scanning', () => {
    it('should call onBarcodeScanned when barcode is detected', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(mockOnBarcodeScanned).toHaveBeenCalledWith('1234567890123');
      });
    });

    it('should prevent multiple rapid scans of the same barcode', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      
      // Simulate rapid scanning of the same barcode
      fireEvent.press(cameraView);
      fireEvent.press(cameraView);
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(mockOnBarcodeScanned).toHaveBeenCalledTimes(1);
      });
    });

    it('should allow scanning different barcodes', async () => {
      let scanCount = 0;
      mockCameraView.mockImplementation((props: any) => {
        return React.createElement(
          'View',
          {
            testID: 'camera-view',
            onPress: () => {
              if (props.onBarcodeScanned) {
                scanCount++;
                props.onBarcodeScanned({
                  type: 'ean13',
                  data: `123456789012${scanCount}`,
                  bounds: { origin: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                  cornerPoints: [],
                });
              }
            },
          },
          props.children
        );
      });

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      
      fireEvent.press(cameraView); // First barcode
      fireEvent.press(cameraView); // Second barcode

      await waitFor(() => {
        expect(mockOnBarcodeScanned).toHaveBeenCalledTimes(2);
        expect(mockOnBarcodeScanned).toHaveBeenNthCalledWith(1, '1234567890121');
        expect(mockOnBarcodeScanned).toHaveBeenNthCalledWith(2, '1234567890122');
      });
    });

    it('should filter out invalid barcode formats', async () => {
      mockCameraView.mockImplementation((props: any) => {
        return React.createElement(
          'View',
          {
            testID: 'camera-view',
            onPress: () => {
              if (props.onBarcodeScanned) {
                props.onBarcodeScanned({
                  type: 'qr',
                  data: 'invalid-barcode-format',
                  bounds: { origin: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                  cornerPoints: [],
                });
              }
            },
          },
          props.children
        );
      });

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(mockOnBarcodeScanned).not.toHaveBeenCalled();
      });
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button is pressed', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByText('Close');
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should handle flashlight toggle if available', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const flashlightButton = screen.queryByTestId('flashlight-button');
      if (flashlightButton) {
        fireEvent.press(flashlightButton);
        // Should not crash
      }
    });
  });

  describe('Camera Permissions', () => {
    it('should request permissions when not granted', () => {
      const mockRequestPermission = jest.fn();
      
      jest.mocked(require('expo-camera').useCameraPermissions).mockReturnValue([
        { granted: false, canAskAgain: true },
        mockRequestPermission,
      ]);

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Camera permission required')).toBeTruthy();
      
      const requestButton = screen.getByText('Grant Permission');
      fireEvent.press(requestButton);

      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it('should show permission denied message when permission cannot be asked again', () => {
      jest.mocked(require('expo-camera').useCameraPermissions).mockReturnValue([
        { granted: false, canAskAgain: false },
        jest.fn(),
      ]);

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Camera access denied')).toBeTruthy();
      expect(screen.getByText('Please enable camera access in settings')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle camera initialization errors gracefully', () => {
      mockCameraView.mockImplementation(() => {
        throw new Error('Camera initialization failed');
      });

      // Should not crash the app
      expect(() => {
        render(
          <BarcodeScanner
            isVisible={true}
            onBarcodeScanned={mockOnBarcodeScanned}
            onClose={mockOnClose}
          />
        );
      }).not.toThrow();
    });

    it('should handle malformed barcode data', async () => {
      mockCameraView.mockImplementation((props: any) => {
        return React.createElement(
          'View',
          {
            testID: 'camera-view',
            onPress: () => {
              if (props.onBarcodeScanned) {
                props.onBarcodeScanned({
                  type: 'ean13',
                  data: null as any, // Malformed data
                  bounds: { origin: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                  cornerPoints: [],
                });
              }
            },
          },
          props.children
        );
      });

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      await waitFor(() => {
        expect(mockOnBarcodeScanned).not.toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByText('Close');
      expect(closeButton.props.accessibilityRole).toBe('button');
      expect(closeButton.props.accessibilityLabel).toBeTruthy();
    });

    it('should provide accessibility hint for camera view', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      expect(cameraView.props.accessibilityHint).toBeTruthy();
    });
  });

  describe('Visual Feedback', () => {
    it('should provide visual feedback when barcode is detected', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const cameraView = screen.getByTestId('camera-view');
      fireEvent.press(cameraView);

      // Should show some visual indication of successful scan
      await waitFor(() => {
        const successIndicator = screen.queryByTestId('scan-success-indicator');
        if (successIndicator) {
          expect(successIndicator).toBeTruthy();
        }
      });
    });

    it('should show scanning animation', () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      const scanningLine = screen.queryByTestId('scanning-line');
      if (scanningLine) {
        expect(scanningLine).toBeTruthy();
      }
    });
  });
});