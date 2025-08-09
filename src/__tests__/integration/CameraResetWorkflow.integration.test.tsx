/**
 * Integration test for complete camera workflow with enhanced reset functionality
 * 
 * Tests the end-to-end photo workflow scenarios:
 * 1. Scanner → Product Photo → Scanner (with reset)
 * 2. Scanner → Ingredients Photo → Scanner (with reset) 
 * 3. Scanner → Product Photo → Ingredients Photo → Scanner (with reset)
 * 4. Multiple rapid mode transitions
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import UnifiedCameraView, { CameraViewRef } from '../../components/UnifiedCameraView';
import UnifiedCameraService from '../../services/UnifiedCameraService';

// Mock dependencies
jest.mock('../../services/UnifiedCameraService');
jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
  CameraView: 'CameraView',
  AutoFocus: { on: 'on', off: 'off' },
}));

jest.mock('../../components/CameraErrorBoundary', () => ({
  CameraErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock React Native components
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Dimensions: { get: jest.fn(() => ({ width: 375, height: 812 })) },
  StyleSheet: { create: jest.fn((styles) => styles) },
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn().mockReturnValue(1),
    })),
    timing: jest.fn(() => ({ start: jest.fn() })),
    sequence: jest.fn(() => ({ start: jest.fn() })),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
}));

describe('Camera Reset Workflow Integration', () => {
  let mockCameraService: any;
  let serviceEvents: { [key: string]: any[] } = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    serviceEvents = {};

    // Mock camera service
    mockCameraService = {
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

    // Track event registrations
    mockCameraService.on.mockImplementation((event: string, handler: any) => {
      if (!serviceEvents[event]) {
        serviceEvents[event] = [];
      }
      serviceEvents[event].push(handler);
    });

    (UnifiedCameraService.getInstance as jest.Mock).mockReturnValue(mockCameraService);

    // Default mock implementations
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

  describe('Scanner → Product Photo → Scanner Workflow', () => {
    it('should execute complete workflow with camera reset', async () => {
      const updateModeConfigCalls: any[] = [];
      mockCameraService.updateModeConfig.mockImplementation((mode: any, config: any) => {
        updateModeConfigCalls.push({ mode, config, timestamp: Date.now() });
      });

      // Render camera view in scanner mode
      const { rerender } = render(
        <UnifiedCameraView
          mode="scanner"
          owner="WorkflowTest"
          testID="workflow-camera"
        />
      );

      // Simulate mode change to product-photo
      mockCameraService.getState.mockReturnValue({
        ...mockCameraService.getState(),
        mode: 'product-photo',
        config: {
          mode: 'product-photo',
          facing: 'back',
          enableBarcode: false,
          enablePhotoCapture: true,
          quality: 0.8,
          autofocus: 'on',
          enableTouchFocus: true,
        },
      });

      rerender(
        <UnifiedCameraView
          mode="product-photo"
          owner="WorkflowTest"
          testID="workflow-camera"
        />
      );

      // Simulate return to scanner mode - should trigger camera reset
      mockCameraService.getState.mockReturnValue({
        ...mockCameraService.getState(),
        mode: 'scanner',
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

      rerender(
        <UnifiedCameraView
          mode="scanner"
          owner="WorkflowTest"
          testID="workflow-camera"
        />
      );

      // Trigger camera reset event
      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      expect(cameraResetHandlers.length).toBeGreaterThan(0);

      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler({
            fromMode: 'product-photo',
            toMode: 'scanner',
            reason: 'photo_workflow_complete'
          });
        });
      });

      // Verify Stage 1 - immediate reset
      expect(updateModeConfigCalls).toContainEqual({
        mode: 'scanner',
        config: {
          focusDepth: undefined,
          zoom: undefined,
          enableTouchFocus: false
        },
        timestamp: expect.any(Number)
      });

      // Advance to Stage 2 (150ms)
      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // Verify Stage 2 - restore scanner settings
      expect(updateModeConfigCalls).toContainEqual({
        mode: 'scanner',
        config: {
          focusDepth: 0.0,
          zoom: 0.1,
          enableTouchFocus: true
        },
        timestamp: expect.any(Number)
      });

      // Advance to Stage 3 (350ms total)
      await act(async () => {
        jest.advanceTimersByTime(250); // 200ms more + 50ms for autofocus cycle
      });

      // Complete the reset sequence
      expect(updateModeConfigCalls.length).toBe(2);
    });
  });

  describe('Scanner → Ingredients Photo → Scanner Workflow', () => {
    it('should handle ingredients photo workflow with reset', async () => {
      const updateModeConfigCalls: any[] = [];
      mockCameraService.updateModeConfig.mockImplementation((mode: any, config: any) => {
        updateModeConfigCalls.push({ mode, config });
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="IngredientsWorkflow"
          testID="ingredients-camera"
        />
      );

      // Trigger camera reset from ingredients-photo
      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler({
            fromMode: 'ingredients-photo',
            toMode: 'scanner',
            reason: 'photo_workflow_complete'
          });
        });
      });

      // Should trigger same reset sequence regardless of photo mode
      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();

      // Advance through reset stages
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(updateModeConfigCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Multi-Stage Photo Workflow', () => {
    it('should handle Scanner → Product → Ingredients → Scanner workflow', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const resetEvents: any[] = [];

      // Track all reset events
      mockCameraService.updateModeConfig.mockImplementation((mode: any, config: any) => {
        resetEvents.push({ mode, config, stage: 'config_update' });
      });

      const { rerender } = render(
        <UnifiedCameraView
          mode="scanner"
          owner="MultiStageWorkflow"
          testID="multistage-camera"
        />
      );

      // Stage 1: Scanner → Product Photo
      rerender(
        <UnifiedCameraView
          mode="product-photo"
          owner="MultiStageWorkflow"
          testID="multistage-camera"
        />
      );

      // Stage 2: Product Photo → Ingredients Photo  
      rerender(
        <UnifiedCameraView
          mode="ingredients-photo"
          owner="MultiStageWorkflow"
          testID="multistage-camera"
        />
      );

      // Stage 3: Ingredients Photo → Scanner (should trigger reset)
      rerender(
        <UnifiedCameraView
          mode="scanner"
          owner="MultiStageWorkflow"
          testID="multistage-camera"
        />
      );

      // Trigger final reset
      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler({
            fromMode: 'ingredients-photo',
            toMode: 'scanner',
            reason: 'photo_workflow_complete'
          });
        });
      });

      // Verify reset sequence was triggered
      expect(mockCameraService.updateModeConfig).toHaveBeenCalledWith('scanner', {
        focusDepth: undefined,
        zoom: undefined,
        enableTouchFocus: false
      });

      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      expect(mockCameraService.updateModeConfig).toHaveBeenCalledWith('scanner', {
        focusDepth: 0.0,
        zoom: 0.1,
        enableTouchFocus: true
      });

      // Verify logging
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('comprehensive camera reset for scanner mode')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Rapid Mode Transition Handling', () => {
    it('should handle multiple rapid transitions without errors', async () => {
      const { rerender } = render(
        <UnifiedCameraView
          mode="scanner"
          owner="RapidTransition"
          testID="rapid-camera"
        />
      );

      // Simulate rapid mode changes
      const modes = ['product-photo', 'ingredients-photo', 'scanner', 'product-photo', 'scanner'];
      
      for (let i = 0; i < modes.length; i++) {
        rerender(
          <UnifiedCameraView
            mode={modes[i] as any}
            owner="RapidTransition"
            testID="rapid-camera"
          />
        );

        // Trigger reset if returning to scanner
        if (modes[i] === 'scanner' && i > 0) {
          const cameraResetHandlers = serviceEvents['cameraReset'] || [];
          
          await act(async () => {
            cameraResetHandlers.forEach(handler => {
              handler({
                fromMode: modes[i - 1],
                toMode: 'scanner',
                reason: 'photo_workflow_complete'
              });
            });
          });

          // Advance timers rapidly
          await act(async () => {
            jest.advanceTimersByTime(100);
          });
        }
      }

      // Should not throw errors
      expect(() => {
        jest.runAllTimers();
      }).not.toThrow();
    });

    it('should handle overlapping reset sequences gracefully', async () => {
      render(
        <UnifiedCameraView
          mode="scanner"
          owner="OverlapTest"
          testID="overlap-camera"
        />
      );

      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      const resetInfo = {
        fromMode: 'product-photo',
        toMode: 'scanner',
        reason: 'photo_workflow_complete'
      };

      // Trigger multiple overlapping resets
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler(resetInfo);
          handler(resetInfo); // Immediate second call
        });
      });

      // Advance partway through first reset
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Trigger another reset
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler(resetInfo);
        });
      });

      // Complete all timers
      await act(async () => {
        jest.runAllTimers();
      });

      // Should handle gracefully without errors
      expect(mockCameraService.updateModeConfig).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios During Reset', () => {
    it('should continue reset sequence even if service calls fail', async () => {
      // Make updateModeConfig fail for first call
      let callCount = 0;
      mockCameraService.updateModeConfig.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Service temporarily unavailable');
        }
      });

      render(
        <UnifiedCameraView
          mode="scanner"
          owner="ErrorTest"
          testID="error-camera"
        />
      );

      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      
      // Should not throw error
      await act(async () => {
        expect(() => {
          cameraResetHandlers.forEach(handler => {
            handler({
              fromMode: 'product-photo',
              toMode: 'scanner',
              reason: 'photo_workflow_complete'
            });
          });
        }).not.toThrow();
      });

      // Continue with Stage 2
      await act(async () => {
        jest.advanceTimersByTime(150);
      });

      // Should have attempted both calls despite first failure
      expect(callCount).toBe(2);
    });

    it('should handle component unmount during reset gracefully', async () => {
      const { unmount } = render(
        <UnifiedCameraView
          mode="scanner"
          owner="UnmountTest"
          testID="unmount-camera"
        />
      );

      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      
      // Start reset
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler({
            fromMode: 'ingredients-photo',
            toMode: 'scanner',
            reason: 'photo_workflow_complete'
          });
        });
      });

      // Unmount component
      unmount();

      // Advance timers - should not cause errors
      expect(() => {
        jest.runAllTimers();
      }).not.toThrow();
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete reset sequence within expected timeframe', async () => {
      render(
        <UnifiedCameraView
          mode="scanner"
          owner="PerformanceTest"
          testID="performance-camera"
        />
      );

      const cameraResetHandlers = serviceEvents['cameraReset'] || [];
      const startTime = Date.now();
      
      await act(async () => {
        cameraResetHandlers.forEach(handler => {
          handler({
            fromMode: 'product-photo',
            toMode: 'scanner',
            reason: 'photo_workflow_complete'
          });
        });
      });

      // Complete all reset stages
      await act(async () => {
        jest.advanceTimersByTime(500); // Allow full reset sequence
      });

      // Reset should be designed to complete within 500ms
      // (Stage 1: 0ms, Stage 2: 150ms, Stage 3: 350ms + 50ms)
      expect(mockCameraService.updateModeConfig).toHaveBeenCalledTimes(2);
    });
  });
});