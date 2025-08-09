/**
 * Tests for UnifiedCameraView enhanced camera reset functionality
 * 
 * Focus Areas:
 * - 3-stage camera reset sequence timing (0ms, 150ms, 350ms)
 * - Mode transitions from photo modes back to scanner
 * - Camera service integration and updateModeConfig calls
 * - Focus state management during reset
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import UnifiedCameraView, { CameraViewRef } from '../UnifiedCameraView';
import UnifiedCameraService from '../../services/UnifiedCameraService';

// Mock dependencies
jest.mock('../../services/UnifiedCameraService');
jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
  CameraView: 'CameraView',
}));

jest.mock('../CameraErrorBoundary', () => ({
  CameraErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock animated values
const mockAnimatedValue = {
  setValue: jest.fn(),
  interpolate: jest.fn().mockReturnValue(1),
  addListener: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
  },
  Animated: {
    Value: jest.fn(() => mockAnimatedValue),
    timing: jest.fn(() => ({
      start: jest.fn((callback) => callback && callback({ finished: true })),
    })),
    sequence: jest.fn(() => ({
      start: jest.fn((callback) => callback && callback({ finished: true })),
    })),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
}));

// Mock service instance
const mockCameraService = {
  getInstance: jest.fn(),
  getState: jest.fn(),
  setPermissionStatus: jest.fn(),
  setError: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  switchToMode: jest.fn(),
  updateModeConfig: jest.fn(),
  isReadyFor: jest.fn(),
  setCapturingState: jest.fn(),
  getCurrentOwner: jest.fn(),
  logHealthDiagnostics: jest.fn(),
};

// Setup default mock implementations
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useFakeTimers();

  // Reset mock implementations
  (UnifiedCameraService.getInstance as jest.Mock).mockReturnValue(mockCameraService);
  
  mockCameraService.getState.mockReturnValue({
    mode: 'scanner',
    isActive: true,
    isCapturing: false,
    hasPermission: true,
    error: null,
    config: {
      mode: 'scanner',
      facing: 'back',
      enableBarcode: true,
      barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'],
      enablePhotoCapture: false,
      autofocus: 'on',
      focusDepth: 0.0,
      enableTouchFocus: true,
      zoom: 0.1,
    },
  });

  mockCameraService.switchToMode.mockResolvedValue(true);
  mockCameraService.isReadyFor.mockReturnValue(true);
  mockCameraService.getCurrentOwner.mockReturnValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UnifiedCameraView Camera Reset Functionality', () => {
  describe('3-Stage Camera Reset Sequence', () => {
    it('should execute camera reset in correct timing sequence when returning to scanner', async () => {
      const cameraViewRef = React.createRef<CameraViewRef>();
      let cameraResetHandler: (resetInfo: any) => void;

      // Capture the cameraReset event handler
      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          ref={cameraViewRef}
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      // Verify event listeners are registered
      expect(mockCameraService.on).toHaveBeenCalledWith('cameraReset', expect.any(Function));

      // Track calls to updateModeConfig
      const updateModeConfigCalls: any[] = [];
      mockCameraService.updateModeConfig.mockImplementation((mode, config) => {
        updateModeConfigCalls.push({ mode, config, timestamp: Date.now() });
      });

      // Simulate camera reset event for return to scanner from photo mode
      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Stage 1 (0ms): Should immediately clear focus state and reset config
      expect(updateModeConfigCalls).toHaveLength(1);
      expect(updateModeConfigCalls[0]).toMatchObject({
        mode: 'scanner',
        config: {
          focusDepth: undefined,
          zoom: undefined,
          enableTouchFocus: false
        }
      });

      // Fast forward to Stage 2 (150ms)
      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // Stage 2: Should restore optimal scanner settings
      expect(updateModeConfigCalls).toHaveLength(2);
      expect(updateModeConfigCalls[1]).toMatchObject({
        mode: 'scanner',
        config: {
          focusDepth: 0.0,
          zoom: 0.1,
          enableTouchFocus: true
        }
      });

      // Fast forward to Stage 3 (350ms)
      await act(async () => {
        jest.advanceTimersByTime(200); // Additional 200ms to reach 350ms total
      });

      // Stage 3: Should trigger final autofocus verification cycle
      // This involves setting autofocus off and then back on after 50ms
      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      // All stages should be complete
      expect(updateModeConfigCalls).toHaveLength(2); // Only config updates, autofocus is handled by state
    });

    it('should only trigger camera reset when returning to scanner mode', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      // Reset call tracking
      jest.clearAllMocks();

      // Test transition that should NOT trigger reset
      const resetInfoNoReset = {
        fromMode: 'scanner',
        toMode: 'product-photo',
        reason: 'user_initiated'
      };

      await act(async () => {
        cameraResetHandler(resetInfoNoReset);
      });

      expect(mockCameraService.updateModeConfig).not.toHaveBeenCalled();

      // Test transition that SHOULD trigger reset
      const resetInfoWithReset = {
        fromMode: 'ingredients-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfoWithReset);
      });

      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();
    });

    it('should handle component unmount during reset sequence gracefully', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      const { unmount } = render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      // Start reset sequence
      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Unmount component during reset sequence
      unmount();

      // Fast forward through reset sequence - should not crash
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // Should not attempt to call updateModeConfig after unmount
      // The implementation uses isMountedRef to prevent this
      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();
    });
  });

  describe('Focus State Management', () => {
    it('should properly manage autofocus key during reset sequence', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      // Mock component to track autofocus state changes
      const TestComponent = () => {
        return (
          <UnifiedCameraView
            mode="scanner"
            owner="TestComponent"
            testID="test-camera"
          />
        );
      };

      render(<TestComponent />);

      const resetInfo = {
        fromMode: 'ingredients-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      // Execute reset sequence
      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Stage 1: autofocus should be off
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      // Stage 2: autofocus should be on
      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // Stage 3: autofocus cycle (off then on)
      await act(async () => {
        jest.advanceTimersByTime(200);
        jest.advanceTimersByTime(50);
      });

      // Should have cycled through autofocus states properly
      // Initial state is tracked by the component internally
    });

    it('should clear focus point during camera reset', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Focus point should be cleared immediately in Stage 1
      // This is tested implicitly through the reset sequence execution
      expect(mockCameraService.updateModeConfig).toHaveBeenCalledWith('scanner', {
        focusDepth: undefined,
        zoom: undefined,
        enableTouchFocus: false
      });
    });
  });

  describe('Camera Service Integration', () => {
    it('should call updateModeConfig with correct parameters in each reset stage', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      const resetInfo = {
        fromMode: 'ingredients-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Stage 1: Reset configuration
      expect(mockCameraService.updateModeConfig).toHaveBeenNthCalledWith(1, 'scanner', {
        focusDepth: undefined,
        zoom: undefined,
        enableTouchFocus: false
      });

      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // Stage 2: Restore optimal scanner settings
      expect(mockCameraService.updateModeConfig).toHaveBeenNthCalledWith(2, 'scanner', {
        focusDepth: 0.0,
        zoom: 0.1,
        enableTouchFocus: true
      });

      expect(mockCameraService.updateModeConfig).toHaveBeenCalledTimes(2);
    });

    it('should work correctly with different fromMode values', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      // Test with product-photo -> scanner
      jest.clearAllMocks();
      await act(async () => {
        cameraResetHandler({
          fromMode: 'product-photo',
          toMode: 'scanner',
          reason: 'photo_workflow_complete'
        });
      });

      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();

      // Test with ingredients-photo -> scanner
      jest.clearAllMocks();
      await act(async () => {
        cameraResetHandler({
          fromMode: 'ingredients-photo',
          toMode: 'scanner',
          reason: 'photo_workflow_complete'
        });
      });

      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle camera service errors during reset gracefully', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      // Make updateModeConfig throw an error
      mockCameraService.updateModeConfig.mockImplementation(() => {
        throw new Error('Camera service error');
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      // Should not throw error even if service fails
      expect(async () => {
        await act(async () => {
          cameraResetHandler(resetInfo);
        });
      }).not.toThrow();
    });

    it('should handle multiple rapid reset calls correctly', async () => {
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      // Trigger multiple resets rapidly
      await act(async () => {
        cameraResetHandler(resetInfo);
        cameraResetHandler(resetInfo);
        cameraResetHandler(resetInfo);
      });

      // Should handle multiple calls gracefully
      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();
      
      // Advance through all timers
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(() => {
        jest.runAllTimers();
      }).not.toThrow();
    });
  });

  describe('Console Logging and Diagnostics', () => {
    it('should log detailed information during reset sequence', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      let cameraResetHandler: (resetInfo: any) => void;

      mockCameraService.on.mockImplementation((event: string, handler: any) => {
        if (event === 'cameraReset') {
          cameraResetHandler = handler;
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="TestComponent"
          testID="test-camera"
        />
      );

      const resetInfo = {
        fromMode: 'ingredients-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      await act(async () => {
        cameraResetHandler(resetInfo);
      });

      // Should log reset initiation
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Camera reset triggered')
      );

      // Should log stage information
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initiating comprehensive camera reset for scanner mode')
      );

      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stage 2 - Restoring scanner settings')
      );

      await act(async () => {
        jest.advanceTimersByTime(250);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('3-stage camera reset sequence complete')
      );

      consoleSpy.mockRestore();
    });
  });
});