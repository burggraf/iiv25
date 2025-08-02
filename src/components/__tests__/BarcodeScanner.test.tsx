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
    
    // Reset camera permissions to granted for most tests
    const mockCamera = require('expo-camera').Camera;
    mockCamera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    
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
    it('should render camera view when permissions are granted', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      // Wait for permissions to be resolved
      await waitFor(() => {
        expect(screen.getByTestId('camera-view')).toBeTruthy();
      });
    });

    it('should render close button', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('← Back')).toBeTruthy();
      });
    });

    it('should render scanning instructions', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('📷 Point your camera\nat a food product barcode')).toBeTruthy();
      });
    });

    it('should not render when not visible', () => {
      render(
        <BarcodeScanner
          isVisible={false}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      // Component should return null when not visible, so no elements should be found
      expect(screen.queryByTestId('camera-view')).toBeNull();
      expect(screen.queryByText('← Back')).toBeNull();
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

      await waitFor(() => {
        const cameraView = screen.getByTestId('camera-view');
        fireEvent.press(cameraView);
      });

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

      await waitFor(() => {
        const cameraView = screen.getByTestId('camera-view');
        
        // Simulate rapid scanning of the same barcode
        fireEvent.press(cameraView);
        fireEvent.press(cameraView);
        fireEvent.press(cameraView);
      });

      await waitFor(() => {
        expect(mockOnBarcodeScanned).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle different barcode types', async () => {
      mockCameraView.mockImplementation((props: any) => {
        return React.createElement(
          'View',
          {
            testID: 'camera-view',
            onPress: () => {
              if (props.onBarcodeScanned) {
                props.onBarcodeScanned({
                  type: 'qr',
                  data: 'qr-code-data',
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

      await waitFor(() => {
        const cameraView = screen.getByTestId('camera-view');
        fireEvent.press(cameraView);
      });

      await waitFor(() => {
        expect(mockOnBarcodeScanned).toHaveBeenCalledWith('qr-code-data');
      });
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button is pressed', async () => {
      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const closeButton = screen.getByText('← Back');
        fireEvent.press(closeButton);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Camera Permissions', () => {
    beforeEach(() => {
      // Reset the camera permission mock before each test
      const mockCamera = require('expo-camera').Camera;
      mockCamera.requestCameraPermissionsAsync.mockReset();
    });

    it('should show loading message while requesting permissions', () => {
      // Mock the Camera.requestCameraPermissionsAsync to simulate loading
      const mockCamera = require('expo-camera').Camera;
      mockCamera.requestCameraPermissionsAsync.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ status: 'granted' }), 100))
      );

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Requesting camera permission...')).toBeTruthy();
    });

    it('should show permission denied message when permission not granted', async () => {
      // Mock the Camera permission to be denied
      const mockCamera = require('expo-camera').Camera;
      mockCamera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });

      render(
        <BarcodeScanner
          isVisible={true}
          onBarcodeScanned={mockOnBarcodeScanned}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No access to camera')).toBeTruthy();
        expect(screen.getByText('Please enable camera permissions in your device settings to scan barcodes.')).toBeTruthy();
      });
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
  });
});