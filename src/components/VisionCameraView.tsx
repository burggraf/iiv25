/**
 * VisionCameraView - Modern camera component using React Native Vision Camera
 * 
 * Features:
 * - Native hardware-level camera control (no workarounds needed!)
 * - Direct tap-to-focus API (eliminates autofocus key toggling)
 * - Better barcode scanning with MLKit integration
 * - Maintains compatibility with UnifiedCameraView interface
 * - Simplified, more reliable implementation
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { 
  Camera, 
  useCameraDevice, 
  useCameraPermission,
  useCameraFormat,
  CameraDevice,
  CodeScannerFrame,
  Code
} from 'react-native-vision-camera';
import VisionCameraService, { CameraMode, VisionCameraState } from '../services/VisionCameraService';
import { CameraErrorBoundary } from './CameraErrorBoundary';

export interface VisionCameraViewProps {
  /** Current camera mode */
  mode: CameraMode;
  
  /** Barcode scanning callback */
  onBarcodeScanned?: (data: string) => void;
  
  /** Photo capture result callback */
  onPhotoCaptured?: (uri: string) => void;
  
  /** Camera ready callback */
  onCameraReady?: () => void;
  
  /** Error callback */
  onError?: (error: string) => void;
  
  /** Style overrides */
  style?: any;
  
  /** Custom overlay component */
  renderOverlay?: (mode: CameraMode, state: VisionCameraState) => React.ReactNode;
  
  /** Owner identifier for camera ownership */
  owner?: string;
  
  /** Test ID for testing */
  testID?: string;
}

export interface VisionCameraViewRef {
  takePictureAsync: (options?: any) => Promise<{ uri: string } | null>;
  getState: () => VisionCameraState;
  clearLastScannedBarcode: () => void;
  logCameraHealth: () => void;
  focusAtPoint: (x: number, y: number) => Promise<boolean>;
}

const VisionCameraView = React.forwardRef<VisionCameraViewRef, VisionCameraViewProps>(
  (
    {
      mode,
      onBarcodeScanned,
      onPhotoCaptured,
      onCameraReady,
      onError,
      style,
      renderOverlay,
      owner = 'VisionCameraView',
      testID = 'vision-camera-view',
    },
    ref
  ) => {
    const cameraRef = useRef<Camera>(null);
    const cameraService = VisionCameraService.getInstance();
    const isMountedRef = useRef(true);
    

    // Vision Camera hooks - try ultra-wide-angle for better close-up focus
    const device = useCameraDevice('back', {
      physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera']
    });
    
    // Use a simple, reliable format that should support autofocus
    const format = useCameraFormat(device, [
      { videoResolution: { width: 1920, height: 1080 } },
      { fps: 30 }
    ]);
    
    const { hasPermission, requestPermission } = useCameraPermission();
    
    
    
    // State management
    const [cameraState, setCameraState] = useState<VisionCameraState>(cameraService.getState());
    const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');
    const barcodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Native tap-to-focus state (simplified!)
    const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
    const focusAnimation = useRef(new Animated.Value(0)).current;
    const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Continuous autofocus system - Vision Camera requires manual focus calls
    const continuousAutofocusRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastFocusTimeRef = useRef<number>(0);

    // Vision Camera's built-in barcode scanner configuration
    const barcodeScanner = {
      codeTypes: ['upc-a', 'upc-e', 'ean-13', 'ean-8'] as const,
      onCodeScanned: (codes: Code[], frame: CodeScannerFrame) => {
        if (!isMountedRef.current || !cameraService.isReadyFor('barcode') || codes.length === 0) {
          return;
        }

        const barcode = codes[0];
        const data = barcode.value;
        
        if (data === lastScannedBarcode) {
          return;
        }
        setLastScannedBarcode(data);
        onBarcodeScanned?.(data);

        // Clear the barcode after 2 seconds to allow re-scanning
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
        }
        
        barcodeTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setLastScannedBarcode('');
          }
          barcodeTimeoutRef.current = null;
        }, 2000);
      },
    };

    // Set up mount tracking for safe cleanup
    useEffect(() => {
      return () => {
        isMountedRef.current = false;
        // Clean up continuous autofocus
        if (continuousAutofocusRef.current) {
          clearInterval(continuousAutofocusRef.current);
          continuousAutofocusRef.current = null;
        }
      };
    }, []);

    // Pass camera ref and device to service
    useEffect(() => {
      cameraService.setCameraRef(cameraRef);
      cameraService.setCameraDevice(device);
    }, [device]);

    // Update permission status in service
    useEffect(() => {
      cameraService.setPermissionStatus(hasPermission);
    }, [hasPermission]);

    // Expose methods through ref
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async (options = {}) => {
        const result = await cameraService.takePhoto();
        return result ? { uri: result.uri } : null;
      },
      getState: () => cameraState,
      clearLastScannedBarcode: () => {
        setLastScannedBarcode('');
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
          barcodeTimeoutRef.current = null;
        }
      },
      logCameraHealth: () => {
        cameraService.logHealthDiagnostics();
      },
      focusAtPoint: async (x: number, y: number) => {
        return await cameraService.focusAtPoint(x, y);
      },
    }));

    // Native tap-to-focus handler (no complex workarounds needed!)
    const handleCameraTap = useCallback(
      async (event: { nativeEvent: { locationX: number; locationY: number } }) => {
        if (!isMountedRef.current || !cameraState.config.enableTouchFocus) {
          return;
        }

        const { locationX, locationY } = event.nativeEvent;
        
        // Set focus point for visual indicator
        setFocusPoint({ x: locationX, y: locationY });
        
        // Use native Vision Camera focus API (so much simpler!)
        const success = await cameraService.focusAtPoint(locationX, locationY);
        
        if (success) {
          // Record manual focus time to prevent continuous autofocus interference
          lastFocusTimeRef.current = Date.now();
          
          // Animate focus indicator
          focusAnimation.setValue(0);
          Animated.sequence([
            Animated.timing(focusAnimation, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(focusAnimation, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            })
          ]).start();
        }
        
        // Clear focus point after animation
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
        }
        
        focusTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setFocusPoint(null);
          }
        }, 1000);
      },
      [cameraState.config.enableTouchFocus, focusAnimation, cameraService]
    );

    // Set up service event listeners
    useEffect(() => {
      const handleStateUpdate = () => {
        if (!isMountedRef.current) return;
        const newState = cameraService.getState();
        setCameraState(newState);
      };

      const handleError = (error: string) => {
        if (!isMountedRef.current) return;
        onError?.(error);
      };

      const handleActivated = () => {
        if (!isMountedRef.current) return;
        handleStateUpdate();
        onCameraReady?.();
      };

      const handlePhotoCaptured = (photoData: any) => {
        if (!isMountedRef.current) return;
        onPhotoCaptured?.(photoData.uri);
      };

      const handleFocusChanged = (focusData: any) => {
        if (!isMountedRef.current) return;
        // Focus event handled
      };

      // Initial state sync
      handleStateUpdate();

      // Register event listeners
      cameraService.on('modeChanged', handleStateUpdate);
      cameraService.on('activated', handleActivated);
      cameraService.on('deactivated', handleStateUpdate);
      cameraService.on('permissionChanged', handleStateUpdate);
      cameraService.on('capturingStateChanged', handleStateUpdate);
      cameraService.on('configUpdated', handleStateUpdate);
      cameraService.on('error', handleError);
      cameraService.on('photoCaptured', handlePhotoCaptured);
      cameraService.on('focusChanged', handleFocusChanged);

      return () => {
        cameraService.off('modeChanged', handleStateUpdate);
        cameraService.off('activated', handleActivated);
        cameraService.off('deactivated', handleStateUpdate);
        cameraService.off('permissionChanged', handleStateUpdate);
        cameraService.off('capturingStateChanged', handleStateUpdate);
        cameraService.off('configUpdated', handleStateUpdate);
        cameraService.off('error', handleError);
        cameraService.off('photoCaptured', handlePhotoCaptured);
        cameraService.off('focusChanged', handleFocusChanged);
      };
    }, [cameraService, owner, onError, onCameraReady, onPhotoCaptured]);

    // Continuous autofocus system - Vision Camera needs manual focus calls
    useEffect(() => {
      if (!isMountedRef.current || !cameraState.isActive || mode === 'inactive') {
        // Stop continuous autofocus when camera is inactive
        if (continuousAutofocusRef.current) {
          clearInterval(continuousAutofocusRef.current);
          continuousAutofocusRef.current = null;
        }
        return;
      }

      // Continuous autofocus disabled - using tap-to-focus only
      return () => {
        if (continuousAutofocusRef.current) {
          clearInterval(continuousAutofocusRef.current);
          continuousAutofocusRef.current = null;
        }
      };
    }, [mode, cameraState.isActive, cameraState.config.enableTouchFocus, cameraService]);

    // Initialize camera for the current mode
    useEffect(() => {
      let isMounted = true;

      const initializeCamera = async () => {
        const currentState = cameraService.getState();
        const currentOwner = cameraService.getCurrentOwner();
        
        if (mode === 'inactive') {
          if (!currentOwner || currentOwner.owner === owner) {
            await cameraService.switchToMode('inactive', {}, owner);
          }
          return;
        }

        // Request permissions if needed
        if (hasPermission === null) {
          try {
            await requestPermission();
          } catch (error) {
            console.error('VisionCamera: Permission request failed:', error);
          }
        }
        
        // Also try imperative API as fallback
        try {
          const { Camera } = require('react-native-vision-camera');
          const imperativeStatus = Camera.getCameraPermissionStatus();
          
          if (imperativeStatus === 'not-determined') {
            await Camera.requestCameraPermission();
          }
        } catch (error) {
          console.error('VisionCamera: Imperative permission check failed:', error);
        }

        // Switch to the requested mode
        if (isMounted && hasPermission !== false) {
          await cameraService.switchToMode(mode, {}, owner);
        }
      };

      initializeCamera();

      return () => {
        isMounted = false;
        // Clean up timeouts
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
          barcodeTimeoutRef.current = null;
        }
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
          focusTimeoutRef.current = null;
        }
      };
    }, [mode, hasPermission, requestPermission, cameraService, owner]);

    // Render permission request UI
    if (hasPermission === null) {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-permission-loading`}>
          <Text style={styles.messageText}>Requesting camera permission...</Text>
        </View>
      );
    }

    // Render permission denied UI
    if (hasPermission === false) {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-permission-denied`}>
          <Text style={styles.messageTitle}>No access to camera</Text>
          <Text style={styles.messageSubtext}>
            Please enable camera permissions in your device settings to use camera features.
          </Text>
        </View>
      );
    }

    // Render error state
    if (cameraState.error) {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-error`}>
          <Text style={styles.messageTitle}>Camera Error</Text>
          <Text style={styles.messageSubtext}>{cameraState.error}</Text>
        </View>
      );
    }

    // Render no device state
    if (!device) {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-no-device`}>
          <Text style={styles.messageTitle}>No Camera Found</Text>
          <Text style={styles.messageSubtext}>No camera device available on this device.</Text>
        </View>
      );
    }

    // Render inactive state
    if (!cameraState.isActive || mode === 'inactive') {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-inactive`}>
          <Text style={styles.messageText}>Camera inactive</Text>
        </View>
      );
    }

    // Render main camera view with Vision Camera
    return (
      <CameraErrorBoundary>
        <View style={[styles.container, style]} testID={testID}>
          <Pressable
            style={styles.camera}
            onPress={cameraState.config.enableTouchFocus ? handleCameraTap : undefined}
            accessible={false}
          >
            <Camera
              ref={cameraRef}
              style={styles.camera}
              device={device}
              format={format}
              isActive={cameraState.isActive && mode !== 'inactive'}
              photo={cameraState.config.enablePhotoCapture}
              codeScanner={cameraState.config.enableBarcode ? barcodeScanner : undefined}
              zoom={device?.neutralZoom || 1.0}
              fps={30}
              onInitialized={() => {
                // Try initial focus after initialization
                setTimeout(async () => {
                  if (cameraRef.current && cameraState.isActive) {
                    try {
                      await cameraRef.current.focus({ x: 200, y: 400 });
                    } catch (error) {
                      console.error('VisionCamera: Initial focus failed:', error);
                    }
                  }
                }, 100);
              }}
              onError={(error) => {
                console.error('VisionCamera Error:', error);
              }}
            />
          </Pressable>
          
          {/* Focus Point Indicator (same as UnifiedCameraView) */}
          {focusPoint && cameraState.config.enableTouchFocus && (
            <Animated.View
              style={[
                styles.focusIndicator,
                {
                  left: focusPoint.x - 30,
                  top: focusPoint.y - 30,
                  opacity: focusAnimation,
                  transform: [
                    {
                      scale: focusAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1.5, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.focusSquare} />
            </Animated.View>
          )}
          
          {/* Render custom overlay or default mode-specific overlay */}
          {renderOverlay ? (
            renderOverlay(mode, cameraState)
          ) : (
            <DefaultOverlay mode={mode} state={cameraState} />
          )}
        </View>
      </CameraErrorBoundary>
    );
  }
);

// Default overlay component for different modes
const DefaultOverlay: React.FC<{ mode: CameraMode; state: VisionCameraState }> = ({ mode, state }) => {
  if (mode === 'inactive') return null;

  return (
    <View style={styles.overlay}>
      {/* Mode indicator */}
      <View style={styles.modeIndicator}>
        <Text style={styles.modeText}>
          {mode === 'scanner' && '📷 Vision Scanner Mode'}
          {mode === 'product-photo' && '📸 Vision Photo Mode'}
          {mode === 'ingredients-photo' && '🏷️ Vision Ingredients Mode'}
        </Text>
        {state.isCapturing && <Text style={styles.capturingText}>📸 Capturing...</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    padding: 20,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  messageText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
  },
  messageSubtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 20,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  modeIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    marginTop: 50,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  capturingText: {
    color: 'yellow',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  focusIndicator: {
    position: 'absolute',
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  focusSquare: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
});

VisionCameraView.displayName = 'VisionCameraView';

export default VisionCameraView;