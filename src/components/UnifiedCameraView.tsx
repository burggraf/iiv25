/**
 * UnifiedCameraView - Single camera component with dynamic mode switching
 * 
 * Features:
 * - Single CameraView instance that adapts to different modes
 * - Mode-specific overlays and UI elements
 * - Centralized camera permission handling
 * - Integration with UnifiedCameraService
 * - Error boundary integration
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
import UnifiedCameraService, { CameraMode, CameraState } from '../services/UnifiedCameraService';
import { CameraErrorBoundary } from './CameraErrorBoundary';

export interface UnifiedCameraViewProps {
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
  renderOverlay?: (mode: CameraMode, state: CameraState) => React.ReactNode;
  
  /** Owner identifier for camera ownership */
  owner?: string;
  
  /** Test ID for testing */
  testID?: string;
}

export interface CameraViewRef {
  takePictureAsync: (options?: any) => Promise<{ uri: string } | null>;
  getState: () => CameraState;
  clearLastScannedBarcode: () => void;
}

const UnifiedCameraView = React.forwardRef<CameraViewRef, UnifiedCameraViewProps>(
  (
    {
      mode,
      onBarcodeScanned,
      onPhotoCaptured,
      onCameraReady,
      onError,
      style,
      renderOverlay,
      owner = 'UnifiedCameraView',
      testID = 'unified-camera-view',
    },
    ref
  ) => {
    const cameraRef = useRef<CameraView>(null);
    const cameraService = UnifiedCameraService.getInstance();
    const isMountedRef = useRef(true);
    
    const [cameraState, setCameraState] = useState<CameraState>(cameraService.getState());
    const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');
    const barcodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Set up mount tracking for safe cleanup
    useEffect(() => {
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // Expose methods through ref
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async (options = {}) => {
        if (!isMountedRef.current || !cameraRef.current || !cameraService.isReadyFor('photo')) {
          console.warn('🎥 UnifiedCameraView: Camera not ready for photo capture');
          return null;
        }

        try {
          cameraService.setCapturingState(true);
          const result = await cameraRef.current.takePictureAsync({
            quality: cameraState.config.quality || 0.8,
            base64: false,
            ...options,
          });

          // Check if component is still mounted after async operation
          if (!isMountedRef.current) {
            console.warn('🎥 UnifiedCameraView: Component unmounted during photo capture');
            return null;
          }

          if (result) {
            const uri = (result as any).uri;
            if (uri) {
              onPhotoCaptured?.(uri);
              return { uri };
            }
          }
          
          return null;
        } catch (error) {
          console.error('🎥 UnifiedCameraView: Photo capture failed:', error);
          if (isMountedRef.current) {
            const errorMessage = error instanceof Error ? error.message : 'Photo capture failed';
            cameraService.setError(errorMessage);
            onError?.(errorMessage);
          }
          return null;
        } finally {
          if (isMountedRef.current) {
            cameraService.setCapturingState(false);
          }
        }
      },
      getState: () => cameraState,
      clearLastScannedBarcode: () => {
        console.log('🎥 UnifiedCameraView: Clearing last scanned barcode');
        setLastScannedBarcode('');
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
          barcodeTimeoutRef.current = null;
        }
      },
    }));

    // Request camera permissions
    const requestCameraPermissions = useCallback(async () => {
      try {
        const { status } = await Camera.requestCameraPermissionsAsync();
        const hasPermission = status === 'granted';
        cameraService.setPermissionStatus(hasPermission);
        
        if (!hasPermission) {
          const errorMessage = 'Camera permission not granted';
          cameraService.setError(errorMessage);
          onError?.(errorMessage);
        }
      } catch (error) {
        console.error('🎥 UnifiedCameraView: Permission request failed:', error);
        const errorMessage = 'Failed to request camera permissions';
        cameraService.setError(errorMessage);
        onError?.(errorMessage);
      }
    }, [cameraService, onError]);

    // Handle barcode scanning
    const handleBarcodeScanned = useCallback(
      ({ data }: BarcodeScanningResult) => {
        if (!isMountedRef.current || !cameraService.isReadyFor('barcode') || data === lastScannedBarcode) {
          return;
        }

        console.log('🎥 UnifiedCameraView: Barcode scanned:', data);
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
      [cameraService, lastScannedBarcode, onBarcodeScanned]
    );

    // Set up service event listeners
    useEffect(() => {
      const handleStateUpdate = () => {
        if (!isMountedRef.current) return;
        const newState = cameraService.getState();
        console.log('🎥 UnifiedCameraView: State updated:', newState);
        setCameraState(newState);
      };

      const handleError = (error: string) => {
        if (!isMountedRef.current) return;
        onError?.(error);
      };

      const handleActivated = () => {
        if (!isMountedRef.current) return;
        handleStateUpdate(); // Update full state when activated
        onCameraReady?.();
      };

      // Initial state sync
      handleStateUpdate();

      cameraService.on('modeChanged', handleStateUpdate);
      cameraService.on('activated', handleActivated);
      cameraService.on('deactivated', handleStateUpdate);
      cameraService.on('permissionChanged', handleStateUpdate);
      cameraService.on('capturingStateChanged', handleStateUpdate);
      cameraService.on('configUpdated', handleStateUpdate);
      cameraService.on('error', handleError);

      return () => {
        cameraService.off('modeChanged', handleStateUpdate);
        cameraService.off('activated', handleActivated);
        cameraService.off('deactivated', handleStateUpdate);
        cameraService.off('permissionChanged', handleStateUpdate);
        cameraService.off('capturingStateChanged', handleStateUpdate);
        cameraService.off('configUpdated', handleStateUpdate);
        cameraService.off('error', handleError);
      };
    }, [cameraService]);

    // Initialize camera for the current mode
    useEffect(() => {
      let isMounted = true;

      const initializeCamera = async () => {
        console.log(`🎥 UnifiedCameraView (${owner}): Initializing camera for mode '${mode}'`);
        
        // Check current camera ownership before making changes
        const currentState = cameraService.getState();
        const currentOwner = cameraService.getCurrentOwner();
        console.log(`🎥 UnifiedCameraView (${owner}): Current camera state - mode: ${currentState.mode}, owner: ${currentOwner?.owner || 'none'}`);
        
        if (mode === 'inactive') {
          // Only switch to inactive if we currently own the camera or it's truly unowned
          if (!currentOwner || currentOwner.owner === owner) {
            console.log(`🎥 UnifiedCameraView (${owner}): Switching to inactive mode`);
            await cameraService.switchToMode('inactive', {}, owner);
          } else {
            console.log(`🎥 UnifiedCameraView (${owner}): NOT switching to inactive - camera owned by ${currentOwner.owner}`);
          }
          return;
        }

        // Request permissions if needed
        if (cameraState.hasPermission === null) {
          console.log(`🎥 UnifiedCameraView (${owner}): Requesting camera permissions`);
          await requestCameraPermissions();
        }

        // Switch to the requested mode
        if (isMounted && cameraState.hasPermission !== false) {
          console.log(`🎥 UnifiedCameraView (${owner}): Attempting to switch to mode '${mode}'`);
          const success = await cameraService.switchToMode(mode, {}, owner);
          console.log(`🎥 UnifiedCameraView (${owner}): Mode switch ${success ? 'successful' : 'failed'}`);
        } else {
          console.log(`🎥 UnifiedCameraView (${owner}): Cannot initialize - mounted: ${isMounted}, permission: ${cameraState.hasPermission}`);
        }
      };

      initializeCamera();

      return () => {
        isMounted = false;
        // Clean up barcode timeout
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
          barcodeTimeoutRef.current = null;
        }
      };
    }, [mode, requestCameraPermissions, cameraService, cameraState.hasPermission]);

    // Render permission request UI
    if (cameraState.hasPermission === null) {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-permission-loading`}>
          <Text style={styles.messageText}>Requesting camera permission...</Text>
        </View>
      );
    }

    // Render permission denied UI
    if (cameraState.hasPermission === false) {
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

    // Render inactive state
    if (!cameraState.isActive || mode === 'inactive') {
      return (
        <View style={[styles.messageContainer, style]} testID={`${testID}-inactive`}>
          <Text style={styles.messageText}>Camera inactive</Text>
        </View>
      );
    }

    // Render main camera view
    return (
      <CameraErrorBoundary
        fallbackMessage={`Camera error in ${mode} mode. Please try again.`}
        onCancel={() => cameraService.switchToMode('inactive', {}, owner)}
        onRetry={() => cameraService.switchToMode(mode, {}, owner)}
      >
        <View style={[styles.container, style]} testID={testID}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraState.config.facing}
            onBarcodeScanned={
              cameraState.config.enableBarcode
                ? handleBarcodeScanned
                : undefined
            }
            barcodeScannerSettings={
              cameraState.config.enableBarcode
                ? {
                    barcodeTypes: cameraState.config.barcodeTypes as any,
                  }
                : undefined
            }
          />
          
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
const DefaultOverlay: React.FC<{ mode: CameraMode; state: CameraState }> = ({ mode, state }) => {
  if (mode === 'inactive') return null;

  return (
    <View style={styles.overlay}>
      {/* Mode indicator */}
      <View style={styles.modeIndicator}>
        <Text style={styles.modeText}>
          {mode === 'scanner' && '📷 Scanner Mode'}
          {mode === 'product-photo' && '📸 Product Photo Mode'}
          {mode === 'ingredients-photo' && '🏷️ Ingredients Photo Mode'}
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
});

UnifiedCameraView.displayName = 'UnifiedCameraView';

export default UnifiedCameraView;