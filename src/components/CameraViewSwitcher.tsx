/**
 * CameraViewSwitcher - Fallback mechanism for gradual rollout
 * 
 * This component provides a seamless way to switch between UnifiedCameraView (Expo Camera)
 * and VisionCameraView (React Native Vision Camera) based on configuration.
 * 
 * Features:
 * - Environment-based switching (dev vs production)
 * - Feature flag support for A/B testing
 * - Identical interface for both camera implementations
 * - Safe fallback to stable implementation if new one fails
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import UnifiedCameraView, { UnifiedCameraViewProps, CameraViewRef } from './UnifiedCameraView';
import VisionCameraView, { VisionCameraViewRef } from './VisionCameraView';
import { CameraErrorBoundary } from './CameraErrorBoundary';

// Configuration for camera implementation switching
interface CameraSwitcherConfig {
  useVisionCamera: boolean;
  fallbackOnError: boolean;
  platform?: 'ios' | 'android' | 'all';
  environment?: 'development' | 'production' | 'all';
}

// Default configuration - conservative rollout
const DEFAULT_CONFIG: CameraSwitcherConfig = {
  useVisionCamera: false, // Start with false for safe rollout
  fallbackOnError: true,
  platform: 'all',
  environment: 'development', // Only in development initially
};

// Props interface that works with both camera views
export interface CameraViewSwitcherProps extends Omit<UnifiedCameraViewProps, 'owner'> {
  /** Owner identifier for camera ownership */
  owner?: string;
  
  /** Override config for this instance */
  config?: Partial<CameraSwitcherConfig>;
  
  /** Force specific implementation (for testing) */
  forceImplementation?: 'unified' | 'vision';
}

export interface CameraViewSwitcherRef extends CameraViewRef {
  getCurrentImplementation: () => 'unified' | 'vision';
  switchToVisionCamera: () => void;
  switchToUnifiedCamera: () => void;
}

const CameraViewSwitcher = React.forwardRef<CameraViewSwitcherRef, CameraViewSwitcherProps>(
  (
    {
      config: userConfig,
      forceImplementation,
      owner = 'CameraViewSwitcher',
      ...props
    },
    ref
  ) => {
    const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);
    const [currentImplementation, setCurrentImplementation] = useState<'unified' | 'vision'>('unified');
    const [hasVisionCameraError, setHasVisionCameraError] = useState(false);
    
    const unifiedCameraRef = React.useRef<CameraViewRef>(null);
    const visionCameraRef = React.useRef<VisionCameraViewRef>(null);

    // Determine which implementation to use
    useEffect(() => {
      const shouldUseVisionCamera = () => {
        console.log(`🎥 CameraSwitcher (${owner}): shouldUseVisionCamera decision process starting...`);
        
        // Force implementation if specified (for testing)
        if (forceImplementation) {
          console.log(`🎥 CameraSwitcher (${owner}): Force implementation: ${forceImplementation}`);
          return forceImplementation === 'vision';
        }

        // Check if Vision Camera errored and fallback is enabled
        if (hasVisionCameraError && finalConfig.fallbackOnError) {
          console.log(`🎥 CameraSwitcher (${owner}): Using fallback due to Vision Camera error`);
          return false;
        }

        // Check basic config
        if (!finalConfig.useVisionCamera) {
          console.log(`🎥 CameraSwitcher (${owner}): Vision Camera disabled in config: ${finalConfig.useVisionCamera}`);
          return false;
        }

        // Check platform compatibility
        if (finalConfig.platform !== 'all') {
          const currentPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
          if (finalConfig.platform !== currentPlatform) {
            console.log(`🎥 CameraSwitcher: Vision Camera disabled for platform ${currentPlatform}`);
            return false;
          }
        }

        // Check environment
        if (finalConfig.environment !== 'all') {
          const isDev = __DEV__;
          const isTargetEnv = (finalConfig.environment === 'development' && isDev) || 
                             (finalConfig.environment === 'production' && !isDev);
          if (!isTargetEnv) {
            console.log(`🎥 CameraSwitcher: Vision Camera disabled for environment ${__DEV__ ? 'development' : 'production'}`);
            return false;
          }
        }

        return true;
      };

      const useVision = shouldUseVisionCamera();
      const newImplementation = useVision ? 'vision' : 'unified';
      
      console.log(`🎥 CameraSwitcher (${owner}): Decision - useVision: ${useVision}, current: ${currentImplementation}, new: ${newImplementation}`);
      console.log(`🎥 CameraSwitcher (${owner}): Environment check - __DEV__: ${__DEV__}, config.environment: ${finalConfig.environment}`);
      
      if (newImplementation !== currentImplementation) {
        console.log(`🎥 CameraSwitcher (${owner}): Switching to ${newImplementation} camera implementation`);
        setCurrentImplementation(newImplementation);
      } else {
        console.log(`🎥 CameraSwitcher (${owner}): Staying with ${currentImplementation} camera implementation`);
      }
    }, [finalConfig, forceImplementation, hasVisionCameraError, currentImplementation, owner]);

    // Handle Vision Camera errors
    const handleVisionCameraError = (error: string) => {
      console.error(`🎥 CameraSwitcher (${owner}): Vision Camera error:`, error);
      
      if (finalConfig.fallbackOnError && !hasVisionCameraError) {
        console.log(`🎥 CameraSwitcher (${owner}): Enabling fallback due to Vision Camera error`);
        setHasVisionCameraError(true);
      }
      
      // Still pass the error to the original handler
      props.onError?.(error);
    };

    // Expose methods through ref
    React.useImperativeHandle(ref, () => {
      const activeRef = currentImplementation === 'vision' ? visionCameraRef.current : unifiedCameraRef.current;
      
      return {
        takePictureAsync: async (options?: any) => {
          return activeRef?.takePictureAsync(options) || null;
        },
        getState: () => {
          return activeRef?.getState() || { 
            mode: 'inactive', 
            isActive: false, 
            isCapturing: false, 
            hasPermission: null, 
            error: 'No active camera ref', 
            config: {} as any 
          };
        },
        clearLastScannedBarcode: () => {
          activeRef?.clearLastScannedBarcode();
        },
        logCameraHealth: () => {
          console.log(`🎥 CameraSwitcher (${owner}): Current implementation: ${currentImplementation}`);
          console.log(`🎥 CameraSwitcher (${owner}): Config:`, finalConfig);
          console.log(`🎥 CameraSwitcher (${owner}): Has Vision Camera error:`, hasVisionCameraError);
          activeRef?.logCameraHealth();
        },
        getCurrentImplementation: () => currentImplementation,
        switchToVisionCamera: () => {
          console.log(`🎥 CameraSwitcher (${owner}): Manually switching to Vision Camera`);
          setHasVisionCameraError(false);
          setCurrentImplementation('vision');
        },
        switchToUnifiedCamera: () => {
          console.log(`🎥 CameraSwitcher (${owner}): Manually switching to Unified Camera`);
          setCurrentImplementation('unified');
        },
      };
    });

    // Render the appropriate camera implementation
    if (currentImplementation === 'vision') {
      return (
        <CameraErrorBoundary
          fallback={finalConfig.fallbackOnError ? (
            <UnifiedCameraView
              {...props}
              ref={unifiedCameraRef}
              owner={`${owner}-fallback`}
            />
          ) : undefined}
        >
          <VisionCameraView
            {...props}
            ref={visionCameraRef}
            owner={owner}
            onError={handleVisionCameraError}
          />
        </CameraErrorBoundary>
      );
    }

    return (
      <UnifiedCameraView
        {...props}
        ref={unifiedCameraRef}
        owner={owner}
      />
    );
  }
);

CameraViewSwitcher.displayName = 'CameraViewSwitcher';

// Utility functions for external configuration
export const CameraConfig = {
  /**
   * Enable Vision Camera globally
   */
  enableVisionCamera: () => {
    DEFAULT_CONFIG.useVisionCamera = true;
    console.log('🎥 CameraSwitcher: Vision Camera enabled globally');
  },

  /**
   * Disable Vision Camera globally
   */
  disableVisionCamera: () => {
    DEFAULT_CONFIG.useVisionCamera = false;
    console.log('🎥 CameraSwitcher: Vision Camera disabled globally');
  },

  /**
   * Enable Vision Camera for production
   */
  enableForProduction: () => {
    DEFAULT_CONFIG.useVisionCamera = true;
    DEFAULT_CONFIG.environment = 'all';
    console.log('🎥 CameraSwitcher: Vision Camera enabled for production');
  },

  /**
   * Get current configuration
   */
  getConfig: (): CameraSwitcherConfig => ({ ...DEFAULT_CONFIG }),

  /**
   * Update configuration
   */
  updateConfig: (updates: Partial<CameraSwitcherConfig>) => {
    Object.assign(DEFAULT_CONFIG, updates);
    console.log('🎥 CameraSwitcher: Configuration updated:', DEFAULT_CONFIG);
  },
};

export default CameraViewSwitcher;