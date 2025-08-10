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
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { CameraView, Camera, BarcodeScanningResult, AutoFocus } from 'expo-camera';
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
  logCameraHealth: () => void;
  forceSettingsReset: () => void;
  forceHardwareReset: () => void;
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
    
    // Touch-to-focus state
    const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
    const [autoFocusKey, setAutoFocusKey] = useState<string>('on');
    const focusAnimation = useRef(new Animated.Value(0)).current;
    const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Camera settings reset state
    const [cameraResetKey, setCameraResetKey] = useState<number>(0);
    const [forceSettingsRefresh, setForceSettingsRefresh] = useState<boolean>(false);
    const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resetSequenceRef = useRef<boolean>(false);
    
    // Autofocus performance monitoring
    const barcodePerformanceRef = useRef<{ count: number; lastReset: number }>({ count: 0, lastReset: Date.now() });
    const degradationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Hardware-level reset state
    const [hardwareResetInProgress, setHardwareResetInProgress] = useState<boolean>(false);
    const hardwareResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      logCameraHealth: () => {
        console.log(`🎥 UnifiedCameraView (${owner}): === Camera Health Check ===`);
        console.log(`   Component State:`, {
          mode: cameraState.mode,
          isActive: cameraState.isActive,
          hasPermission: cameraState.hasPermission,
          enableBarcode: cameraState.config.enableBarcode,
          autofocus: cameraState.config.autofocus,
          lastScannedBarcode,
          autoFocusKey,
          focusPoint,
          // Reset-specific diagnostics
          cameraResetKey,
          forceSettingsRefresh,
          resetInProgress: resetSequenceRef.current
        });
        
        console.log(`   Camera Settings:`, {
          facing: cameraState.config.facing,
          focusDepth: cameraState.config.focusDepth,
          zoom: cameraState.config.zoom,
          enableTouchFocus: cameraState.config.enableTouchFocus,
          appliedFocusDepth: forceSettingsRefresh ? 1.0 : (cameraState.config.focusDepth || 0.0),
          appliedZoom: forceSettingsRefresh ? 0.0 : (cameraState.config.zoom || 0.1)
        });
        
        // Log service-level diagnostics
        cameraService.logHealthDiagnostics();
        
        // Check if scanner is properly configured for barcode scanning
        if (cameraState.mode === 'scanner') {
          const isOptimal = cameraState.isActive && 
                           cameraState.config.enableBarcode && 
                           cameraState.config.autofocus === 'on' &&
                           autoFocusKey === 'on' &&
                           !forceSettingsRefresh &&
                           !resetSequenceRef.current;
          console.log(`🎥 UnifiedCameraView (${owner}): Scanner optimization status:`, 
                     isOptimal ? '✅ Optimal' : '⚠️ Suboptimal');
                     
          if (!isOptimal) {
            console.log(`🎥 UnifiedCameraView (${owner}): Suboptimal reasons:`, {
              notActive: !cameraState.isActive,
              barcodeDisabled: !cameraState.config.enableBarcode,
              autofocusOff: cameraState.config.autofocus !== 'on',
              autoFocusKeyOff: autoFocusKey !== 'on',
              settingsRefreshing: forceSettingsRefresh,
              resetInProgress: resetSequenceRef.current
            });
          }
        }
        
        console.log(`🎥 UnifiedCameraView (${owner}): === End Health Check ===`);
      },
      forceSettingsReset: () => {
        console.log(`🎥 UnifiedCameraView (${owner}): Manual camera settings reset requested`);
        if (cameraState.mode === 'scanner' && !resetSequenceRef.current && !hardwareResetInProgress) {
          performCameraSettingsReset();
        } else {
          console.log(`🎥 UnifiedCameraView (${owner}): Reset not available - mode: ${cameraState.mode}, inProgress: ${resetSequenceRef.current}, hardwareReset: ${hardwareResetInProgress}`);
        }
      },
      forceHardwareReset: () => {
        console.log(`🎥 UnifiedCameraView (${owner}): Manual HARDWARE reset requested`);
        if (cameraState.mode === 'scanner' || cameraState.mode === 'inactive') {
          performHardwareReset();
        } else {
          console.log(`🎥 UnifiedCameraView (${owner}): Hardware reset not available - mode: ${cameraState.mode}`);
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
        
        // Update performance metrics
        barcodePerformanceRef.current.count++;
        const timeSinceLastReset = Date.now() - barcodePerformanceRef.current.lastReset;
        
        // Log performance for diagnostics
        if (__DEV__ && barcodePerformanceRef.current.count % 5 === 0) {
          console.log(`🎥 UnifiedCameraView (${owner}): Barcode performance - ${barcodePerformanceRef.current.count} scans in ${timeSinceLastReset}ms`);
        }
        
        // Auto-detect scanner degradation and trigger reset
        if (timeSinceLastReset > 30000 && barcodePerformanceRef.current.count < 3) { // Less than 3 scans in 30 seconds indicates potential degradation
          console.warn(`🎥 UnifiedCameraView (${owner}): Potential scanner degradation detected - auto-triggering reset`);
          if (!resetSequenceRef.current) {
            performCameraSettingsReset();
          }
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
      [cameraService, lastScannedBarcode, onBarcodeScanned, owner]
    );

    // Handle touch-to-focus
    const handleCameraTap = useCallback(
      (event: { nativeEvent: { locationX: number; locationY: number } }) => {
        if (!isMountedRef.current || !cameraState.config.enableTouchFocus) {
          return;
        }

        const { locationX, locationY } = event.nativeEvent;
        console.log('🎥 UnifiedCameraView: Touch-to-focus at:', locationX, locationY);
        
        // Set focus point for visual indicator
        setFocusPoint({ x: locationX, y: locationY });
        
        // Reset autofocus by toggling the key (workaround for Expo Camera)
        setAutoFocusKey(prev => prev === 'on' ? 'off' : 'on');
        setTimeout(() => {
          if (isMountedRef.current) {
            setAutoFocusKey('on');
          }
        }, 100);
        
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
      [cameraState.config.enableTouchFocus, focusAnimation]
    );

    // Comprehensive camera settings reset function with hardware-level reset
    const performCameraSettingsReset = useCallback(() => {
      if (!isMountedRef.current) return;
      
      console.log(`🎥 UnifiedCameraView (${owner}): Starting hardware-level camera reset sequence`);
      
      // Phase 1: Complete camera deactivation to force hardware reset
      console.log(`🎥 UnifiedCameraView (${owner}): Phase 1 - Complete camera deactivation`);
      setForceSettingsRefresh(true);
      setAutoFocusKey('off');
      setCameraResetKey(prev => prev + 1); // Force complete remount
      
      // Tell service to briefly deactivate camera
      cameraService.setCapturingState(true); // Block operations during reset
      
      resetTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        
        // Phase 2: Force multiple prop cycles to ensure hardware acknowledgment
        console.log(`🎥 UnifiedCameraView (${owner}): Phase 2 - Multiple hardware reset cycles`);
        
        // Cycle through different focus depths to force hardware recalibration
        let cycleCount = 0;
        const maxCycles = 3;
        
        const performFocusCycle = () => {
          if (!isMountedRef.current || cycleCount >= maxCycles) {
            // Phase 3: Final restoration after cycles
            console.log(`🎥 UnifiedCameraView (${owner}): Phase 3 - Final restoration after ${cycleCount} cycles`);
            setForceSettingsRefresh(false);
            setAutoFocusKey('on');
            cameraService.setCapturingState(false); // Re-enable operations
            
            resetTimeoutRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              
              // Phase 4: Final verification and cleanup
              console.log(`🎥 UnifiedCameraView (${owner}): Phase 4 - Final verification`);
              resetSequenceRef.current = false;
              
              // Reset performance monitoring
              barcodePerformanceRef.current = { count: 0, lastReset: Date.now() };
              console.log(`🎥 UnifiedCameraView (${owner}): Hardware-level camera reset complete`);
              
              resetTimeoutRef.current = null;
            }, 300);
            return;
          }
          
          // Alternate between different settings to force hardware reset
          const isEvenCycle = cycleCount % 2 === 0;
          console.log(`🎥 UnifiedCameraView (${owner}): Focus cycle ${cycleCount + 1}/${maxCycles}`);
          
          // Force different focus configurations and simulate tap-to-focus
          setAutoFocusKey(isEvenCycle ? 'off' : 'on');
          setCameraResetKey(prev => prev + 1); // Force prop update
          
          // Simulate tap-to-focus to force hardware focus recalibration
          if (isEvenCycle) {
            // Set focus point to center of screen to force focus reset
            const { width, height } = Dimensions.get('window');
            setFocusPoint({ x: width / 2, y: height / 2 });
            
            // Clear focus point after a brief moment
            setTimeout(() => {
              if (isMountedRef.current) {
                setFocusPoint(null);
              }
            }, 100);
          }
          
          cycleCount++;
          resetTimeoutRef.current = setTimeout(performFocusCycle, 200);
        };
        
        performFocusCycle();
        
      }, 300); // Initial deactivation delay
      
    }, [owner, cameraService]);

    // Hardware-level camera reset function (most aggressive)
    const performHardwareReset = useCallback(async () => {
      if (!isMountedRef.current || hardwareResetInProgress) return;
      
      console.log(`🎥 UnifiedCameraView (${owner}): Starting HARDWARE-LEVEL camera reset`);
      setHardwareResetInProgress(true);
      
      try {
        // Phase 1: Complete camera deactivation
        console.log(`🎥 UnifiedCameraView (${owner}): Hardware Phase 1 - Complete camera deactivation`);
        await cameraService.switchToMode('inactive', {}, owner);
        
        // Wait for complete deactivation
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Phase 2: Force component remount with large key increment
        console.log(`🎥 UnifiedCameraView (${owner}): Hardware Phase 2 - Forcing complete component remount`);
        setCameraResetKey(prev => prev + 100); // Very large increment
        setAutoFocusKey('off');
        setForceSettingsRefresh(true);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Phase 3: Reactivate with explicit optimal configuration
        console.log(`🎥 UnifiedCameraView (${owner}): Hardware Phase 3 - Reactivating with explicit optimal config`);
        const success = await cameraService.switchToMode('scanner', {
          // Force all optimal settings explicitly
          autofocus: 'on',
          focusDepth: 0.0,
          zoom: 0.1,
          enableBarcode: true,
          enableTouchFocus: true,
          facing: 'back'
        }, owner);
        
        if (!success) {
          throw new Error('Failed to reactivate camera in scanner mode');
        }
        
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Phase 4: Restore settings and perform aggressive focus cycles
        console.log(`🎥 UnifiedCameraView (${owner}): Hardware Phase 4 - Aggressive focus recalibration`);
        setForceSettingsRefresh(false);
        
        // Perform 5 aggressive focus cycles with varying patterns
        for (let i = 0; i < 5; i++) {
          console.log(`🎥 UnifiedCameraView (${owner}): Hardware focus cycle ${i + 1}/5`);
          
          // Vary the autofocus pattern to force hardware recalibration
          setAutoFocusKey('off');
          await new Promise(resolve => setTimeout(resolve, 250));
          
          setAutoFocusKey('on');
          
          // Simulate tap-to-focus at different positions
          const positions = [
            { x: 200, y: 200 }, // Center-left
            { x: 400, y: 300 }, // Center-right
            { x: 300, y: 200 }, // Center-top
            { x: 300, y: 400 }, // Center-bottom
            { x: 300, y: 300 }  // Center
          ];
          
          if (i < positions.length) {
            setFocusPoint(positions[i]);
            await new Promise(resolve => setTimeout(resolve, 200));
            setFocusPoint(null);
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Final stabilization
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reset all monitoring counters
        barcodePerformanceRef.current = { count: 0, lastReset: Date.now() };
        resetSequenceRef.current = false;
        
        console.log(`🎥 UnifiedCameraView (${owner}): HARDWARE RESET COMPLETE - Camera fully reinitialized`);
        
      } catch (error) {
        console.error(`🎥 UnifiedCameraView (${owner}): Hardware reset FAILED:`, error);
        // Fallback: try regular reset
        console.log(`🎥 UnifiedCameraView (${owner}): Falling back to regular reset`);
        performCameraSettingsReset();
      } finally {
        setHardwareResetInProgress(false);
      }
    }, [owner, cameraService, performCameraSettingsReset]);

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

      const handleCameraReset = (resetInfo: { fromMode: string; toMode: string; reason: string }) => {
        if (!isMountedRef.current) return;
        console.log(`🎥 UnifiedCameraView (${owner}): Camera reset triggered:`, resetInfo);
        
        // Reset camera settings for optimal barcode scanning
        if (resetInfo.toMode === 'scanner') {
          console.log(`🎥 UnifiedCameraView (${owner}): Starting comprehensive camera reset for scanner mode`);
          
          // Prevent multiple concurrent reset sequences
          if (resetSequenceRef.current || hardwareResetInProgress) {
            console.log(`🎥 UnifiedCameraView (${owner}): Reset already in progress, skipping`);
            return;
          }
          
          // Check if this is a persistent issue (frequent resets)
          const timeSinceLastReset = Date.now() - barcodePerformanceRef.current.lastReset;
          const isFrequentReset = timeSinceLastReset < 10000; // Less than 10 seconds since last reset
          
          if (isFrequentReset) {
            console.log(`🎥 UnifiedCameraView (${owner}): Frequent reset detected (${timeSinceLastReset}ms ago) - using HARDWARE reset`);
            performHardwareReset();
          } else {
            console.log(`🎥 UnifiedCameraView (${owner}): First reset attempt - using standard reset`);
            resetSequenceRef.current = true;
            
            // Clear any existing reset timeouts
            if (resetTimeoutRef.current) {
              clearTimeout(resetTimeoutRef.current);
              resetTimeoutRef.current = null;
            }
            
            // Clear any existing focus point
            setFocusPoint(null);
            
            // Start progressive reset sequence
            performCameraSettingsReset();
          }
        }
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
      cameraService.on('cameraReset', handleCameraReset);

      return () => {
        cameraService.off('modeChanged', handleStateUpdate);
        cameraService.off('activated', handleActivated);
        cameraService.off('deactivated', handleStateUpdate);
        cameraService.off('permissionChanged', handleStateUpdate);
        cameraService.off('capturingStateChanged', handleStateUpdate);
        cameraService.off('configUpdated', handleStateUpdate);
        cameraService.off('error', handleError);
        cameraService.off('cameraReset', handleCameraReset);
      };
    }, [cameraService, owner]);

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
        // Clean up timeouts
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
          barcodeTimeoutRef.current = null;
        }
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
          focusTimeoutRef.current = null;
        }
        if (resetTimeoutRef.current) {
          clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = null;
        }
        if (degradationTimeoutRef.current) {
          clearTimeout(degradationTimeoutRef.current);
          degradationTimeoutRef.current = null;
        }
        if (hardwareResetTimeoutRef.current) {
          clearTimeout(hardwareResetTimeoutRef.current);
          hardwareResetTimeoutRef.current = null;
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
          <Pressable
            style={styles.camera}
            onPress={cameraState.config.enableTouchFocus ? handleCameraTap : undefined}
            accessible={false}
          >
            <CameraView
              ref={cameraRef}
              key={`camera-${cameraResetKey}-${forceSettingsRefresh ? 'reset' : 'normal'}`} // Force remount on reset with specific key
              style={styles.camera}
              facing={cameraState.config.facing}
              autofocus={autoFocusKey as 'on' | 'off'}
              focusDepth={forceSettingsRefresh ? 1.0 : (cameraState.config.focusDepth || 0.0)}
              zoom={forceSettingsRefresh ? 0.0 : (cameraState.config.zoom || 0.1)}
              // Additional properties for better camera control
              flash="off" // Ensure flash is off for barcode scanning
              mode={cameraState.mode === 'scanner' ? 'picture' : 'picture'} // Explicit camera mode
              onBarcodeScanned={
                cameraState.config.enableBarcode && !forceSettingsRefresh
                  ? handleBarcodeScanned
                  : undefined
              }
              barcodeScannerSettings={
                cameraState.config.enableBarcode && !forceSettingsRefresh
                  ? {
                      barcodeTypes: cameraState.config.barcodeTypes as any,
                    }
                  : undefined
              }
              // Try to force camera hardware reset by changing these properties
              enableTorch={false}
              autoFocus={autoFocusKey === 'on' ? 'on' : 'off'} // Ensure consistency
            />
          </Pressable>
          
          {/* Focus Point Indicator */}
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

UnifiedCameraView.displayName = 'UnifiedCameraView';

export default UnifiedCameraView;