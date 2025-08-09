/**
 * VisionCameraService - Single camera instance manager using React Native Vision Camera
 * 
 * Manages a single camera instance across the entire app using react-native-vision-camera
 * for superior autofocus control and hardware management.
 * 
 * Features:
 * - Native hardware-level camera control
 * - Simplified autofocus management (no complex resets)
 * - Better barcode scanning with MLKit integration
 * - Maintains compatibility with UnifiedCameraService interface
 */

import { Camera, useCameraDevice, useCameraPermission, CameraDevice } from 'react-native-vision-camera';
import { useBarcodeScanner } from 'vision-camera-code-scanner';

// Event emitter for React Native compatibility
interface EventListener {
  [event: string]: ((...args: any[]) => void)[];
}

export type CameraMode = 'scanner' | 'product-photo' | 'ingredients-photo' | 'inactive';

export interface VisionCameraConfig {
  mode: CameraMode;
  facing: 'front' | 'back';
  enableBarcode: boolean;
  barcodeTypes: ('upc-a' | 'upc-e' | 'ean-13' | 'ean-8' | 'code-128' | 'code-39')[];
  enablePhotoCapture: boolean;
  quality?: number;
  flash?: 'on' | 'off' | 'auto';
  enableTouchFocus?: boolean;
  zoom?: number;
  fps?: number;
}

export interface VisionCameraModeConfig {
  scanner: VisionCameraConfig;
  'product-photo': VisionCameraConfig;
  'ingredients-photo': VisionCameraConfig;
  inactive: VisionCameraConfig;
}

export interface VisionCameraState {
  mode: CameraMode;
  isActive: boolean;
  isCapturing: boolean;
  hasPermission: boolean | null;
  error: string | null;
  config: VisionCameraConfig;
  device: CameraDevice | null;
}

export interface CameraOwnership {
  owner: string;
  mode: CameraMode;
  timestamp: number;
}

class VisionCameraService {
  private static instance: VisionCameraService;
  private state: VisionCameraState;
  private modeConfigs: VisionCameraModeConfig;
  private listeners: EventListener = {};
  private currentOwner: CameraOwnership | null = null;
  private listenerCleanupTimers: Map<(...args: any[]) => void, ReturnType<typeof setTimeout>> = new Map();
  private cameraRef: React.RefObject<Camera> | null = null;
  private performanceMetrics: {
    modeTransitions: Array<{ from: CameraMode; to: CameraMode; timestamp: number; duration: number }>;
    barcodeScansEnabled: number;
    lastScannerActivation: number | null;
    focusCalls: number;
    lastFocusCall: number | null;
  } = {
    modeTransitions: [],
    barcodeScansEnabled: 0,
    lastScannerActivation: null,
    focusCalls: 0,
    lastFocusCall: null
  };

  private constructor() {
    // Initialize default mode configurations optimized for Vision Camera
    this.modeConfigs = {
      scanner: {
        mode: 'scanner',
        facing: 'back',
        enableBarcode: true,
        barcodeTypes: ['upc-a', 'upc-e', 'ean-13', 'ean-8'],
        enablePhotoCapture: false,
        enableTouchFocus: true,
        zoom: 1.0, // Use neutral zoom instead of 0.1
        fps: 30, // Balanced for barcode scanning
      },
      'product-photo': {
        mode: 'product-photo',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: true,
        quality: 0.8,
        enableTouchFocus: true,
        fps: 30,
      },
      'ingredients-photo': {
        mode: 'ingredients-photo',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: true,
        quality: 0.8,
        enableTouchFocus: true,
        fps: 30,
      },
      inactive: {
        mode: 'inactive',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: false,
        enableTouchFocus: false,
      },
    };

    // Initialize camera state
    this.state = {
      mode: 'inactive',
      isActive: false,
      isCapturing: false,
      hasPermission: null,
      error: null,
      config: this.modeConfigs.inactive,
      device: null,
    };
  }

  static getInstance(): VisionCameraService {
    if (!VisionCameraService.instance) {
      VisionCameraService.instance = new VisionCameraService();
    }
    return VisionCameraService.instance;
  }

  /**
   * Set camera reference for imperative operations
   */
  setCameraRef(ref: React.RefObject<Camera>): void {
    this.cameraRef = ref;
  }

  /**
   * Set camera device (usually from useCameraDevice hook)
   */
  setCameraDevice(device: CameraDevice | null): void {
    this.state.device = device;
    if (!device && this.state.isActive) {
      this.setError('No camera device available');
    }
  }

  /**
   * Native tap-to-focus implementation (eliminates complex workarounds)
   */
  async focusAtPoint(x: number, y: number): Promise<boolean> {
    if (!this.cameraRef?.current || !this.state.isActive) {
      return false;
    }

    try {
      await this.cameraRef.current.focus({ x, y });
      
      // Track focus calls for performance metrics
      this.performanceMetrics.focusCalls++;
      this.performanceMetrics.lastFocusCall = Date.now();
      
      this.emit('focusChanged', { x, y, success: true });
      return true;
    } catch (error) {
      console.error('VisionCamera: Focus failed:', error);
      this.emit('focusChanged', { x, y, success: false, error });
      return false;
    }
  }

  /**
   * Take photo with Vision Camera
   */
  async takePhoto(): Promise<{ uri: string; width: number; height: number } | null> {
    if (!this.cameraRef?.current || !this.state.config.enablePhotoCapture) {
      return null;
    }

    try {
      this.setCapturingState(true);
      
      const photo = await this.cameraRef.current.takePhoto({
        quality: this.state.config.quality || 0.8,
        flash: this.state.config.flash || 'off',
      });

      this.emit('photoCaptured', {
        uri: `file://${photo.path}`,
        width: photo.width,
        height: photo.height,
        path: photo.path
      });

      return {
        uri: `file://${photo.path}`,
        width: photo.width,
        height: photo.height
      };
    } catch (error) {
      console.error('VisionCamera: Photo capture failed:', error);
      this.setError(error instanceof Error ? error.message : 'Photo capture failed');
      return null;
    } finally {
      this.setCapturingState(false);
    }
  }

  /**
   * Add event listener with automatic cleanup tracking
   */
  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    
    // Set up automatic cleanup timer (10 minutes)
    const existingTimer = this.listenerCleanupTimers.get(listener);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      this.off(event, listener);
    }, 10 * 60 * 1000); // 10 minutes
    
    this.listenerCleanupTimers.set(listener, timer);
  }

  /**
   * Remove event listener and cleanup timer
   */
  off(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners[event]) return;
    const index = this.listeners[event].indexOf(listener);
    if (index > -1) {
      this.listeners[event].splice(index, 1);
    }
    
    const timer = this.listenerCleanupTimers.get(listener);
    if (timer) {
      clearTimeout(timer);
      this.listenerCleanupTimers.delete(timer);
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, ...args: any[]): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for '${event}':`, error);
      }
    });
  }

  /**
   * Remove all listeners
   */
  private removeAllListeners(): void {
    // Clear all cleanup timers
    this.listenerCleanupTimers.forEach(timer => clearTimeout(timer));
    this.listenerCleanupTimers.clear();
    this.listeners = {};
  }

  /**
   * Switch camera to a specific mode (no complex resets needed!)
   */
  async switchToMode(mode: CameraMode, customConfig?: Partial<VisionCameraConfig>, owner?: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const ownerName = owner || 'unknown';
      
      // Check ownership
      if (mode !== 'inactive' && this.currentOwner && this.currentOwner.owner !== ownerName) {
        const timeSinceOwnership = Date.now() - this.currentOwner.timestamp;
        
        if (timeSinceOwnership < 1000 && !this.canTakeOver(ownerName, mode)) {
          return false;
        }
      }

      const previousMode = this.state.mode;
      const newConfig = { ...this.modeConfigs[mode], ...customConfig };
      
      // Update ownership
      if (mode !== 'inactive') {
        this.currentOwner = {
          owner: ownerName,
          mode,
          timestamp: Date.now()
        };
      } else {
        if (!this.currentOwner || this.currentOwner.owner === ownerName || 
            (Date.now() - this.currentOwner.timestamp) > 5000) {
          this.currentOwner = null;
        }
      }
      
      this.state = {
        ...this.state,
        mode,
        config: newConfig,
        error: null,
      };

      // Emit mode change event
      this.emit('modeChanged', {
        previousMode,
        currentMode: mode,
        config: newConfig,
        needsCameraReset: false,
      });

      // Handle activation/deactivation
      if (mode === 'inactive') {
        await this.deactivateCamera();
      } else {
        await this.activateCamera();
        
        // Track scanner activation
        if (mode === 'scanner') {
          this.performanceMetrics.lastScannerActivation = Date.now();
          this.performanceMetrics.barcodeScansEnabled++;
        }
      }
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceMetrics.modeTransitions.push({
        from: previousMode,
        to: mode,
        timestamp: startTime,
        duration
      });
      
      // Keep only last 50 transitions
      if (this.performanceMetrics.modeTransitions.length > 50) {
        this.performanceMetrics.modeTransitions = this.performanceMetrics.modeTransitions.slice(-50);
      }
      
      // Log slow transitions for debugging
      if (duration > 500) {
        console.warn(`VisionCamera: Slow transition (${duration}ms) from ${previousMode} to ${mode}`);
      }
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`VisionCamera: Mode switch failed after ${duration}ms:`, error);
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', this.state.error);
      return false;
    }
  }

  /**
   * Check if a component can take over camera control (same logic as UnifiedCameraService)
   */
  private canTakeOver(newOwner: string, newMode: CameraMode): boolean {
    if (!this.currentOwner) return true;
    
    // Allow scanner to be interrupted by photo modes
    if (this.currentOwner.mode === 'scanner' && 
        (newMode === 'product-photo' || newMode === 'ingredients-photo')) {
      return true;
    }
    
    // Allow same owner to switch modes
    if (this.currentOwner.owner === newOwner) {
      return true;
    }
    
    // Allow photo mode transitions
    if ((this.currentOwner.mode === 'product-photo' && newMode === 'ingredients-photo') ||
        (this.currentOwner.mode === 'ingredients-photo' && newMode === 'product-photo')) {
      return true;
    }
    
    // Allow camera screen takeovers
    if ((this.currentOwner.owner === 'ReportIssueScreen' || this.currentOwner.owner === 'ProductCreationScreen') &&
        (newOwner === 'ReportIssueScreen' || newOwner === 'ProductCreationScreen') &&
        (newMode === 'product-photo' || newMode === 'ingredients-photo')) {
      return true;
    }
    
    return false;
  }

  /**
   * Activate the camera
   */
  private async activateCamera(): Promise<void> {
    if (this.state.isActive) {
      return;
    }

    this.state.isActive = true;
    this.emit('activated', this.state);
  }

  /**
   * Deactivate the camera
   */
  private async deactivateCamera(): Promise<void> {
    if (!this.state.isActive) {
      return;
    }

    this.state.isActive = false;
    this.state.isCapturing = false;
    this.emit('deactivated', this.state);
  }

  /**
   * Set camera permission status
   */
  setPermissionStatus(hasPermission: boolean): void {
    this.state.hasPermission = hasPermission;
    this.emit('permissionChanged', hasPermission);
  }

  /**
   * Set capturing state
   */
  setCapturingState(isCapturing: boolean): void {
    this.state.isCapturing = isCapturing;
    this.emit('capturingStateChanged', isCapturing);
  }

  /**
   * Set error state
   */
  setError(error: string | null): void {
    this.state.error = error;
    if (error) {
      console.error('VisionCamera: Error occurred:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get current camera state
   */
  getState(): Readonly<VisionCameraState> {
    return { ...this.state };
  }

  /**
   * Get current camera owner
   */
  getCurrentOwner(): CameraOwnership | null {
    return this.currentOwner ? { ...this.currentOwner } : null;
  }

  /**
   * Get configuration for a specific mode
   */
  getModeConfig(mode: CameraMode): VisionCameraConfig {
    return { ...this.modeConfigs[mode] };
  }

  /**
   * Update configuration for a specific mode
   */
  updateModeConfig(mode: CameraMode, config: Partial<VisionCameraConfig>): void {
    this.modeConfigs[mode] = { ...this.modeConfigs[mode], ...config };
    
    if (this.state.mode === mode) {
      this.state.config = { ...this.modeConfigs[mode] };
      this.emit('configUpdated', this.state.config);
    }
  }

  /**
   * Check if camera is ready for a specific operation
   */
  isReadyFor(operation: 'barcode' | 'photo'): boolean {
    if (!this.state.isActive || this.state.hasPermission !== true || !this.state.device) {
      return false;
    }

    switch (operation) {
      case 'barcode':
        return this.state.config.enableBarcode;
      case 'photo':
        return this.state.config.enablePhotoCapture && !this.state.isCapturing;
      default:
        return false;
    }
  }

  /**
   * Clean shutdown of camera service
   */
  async shutdown(): Promise<void> {
    try {
      await this.switchToMode('inactive');
      this.removeAllListeners();
    } catch (error) {
      console.error('VisionCamera: Error during shutdown:', error);
    }
  }

  /**
   * Get available camera modes
   */
  getAvailableModes(): CameraMode[] {
    return ['scanner', 'product-photo', 'ingredients-photo', 'inactive'];
  }

  /**
   * Check if mode transition is valid
   */
  isValidModeTransition(fromMode: CameraMode, toMode: CameraMode): boolean {
    return true; // All transitions are seamless with Vision Camera
  }

  /**
   * Get camera performance diagnostics (enhanced with focus tracking)
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const recentTransitions = this.performanceMetrics.modeTransitions.filter(
      t => now - t.timestamp < 5 * 60 * 1000
    );
    
    return {
      totalModeTransitions: this.performanceMetrics.modeTransitions.length,
      recentTransitions: recentTransitions.length,
      barcodeScansEnabled: this.performanceMetrics.barcodeScansEnabled,
      lastScannerActivation: this.performanceMetrics.lastScannerActivation,
      focusCalls: this.performanceMetrics.focusCalls,
      lastFocusCall: this.performanceMetrics.lastFocusCall,
      averageTransitionTime: recentTransitions.length > 0 
        ? Math.round(recentTransitions.reduce((sum, t) => sum + t.duration, 0) / recentTransitions.length)
        : 0,
      slowTransitions: recentTransitions.filter(t => t.duration > 500).length, // Lower threshold for Vision Camera
      currentMode: this.state.mode,
      currentOwner: this.currentOwner?.owner || null,
      timeInCurrentMode: this.currentOwner 
        ? now - this.currentOwner.timestamp
        : null,
      hasDevice: !!this.state.device,
      devicePosition: this.state.device?.position || null,
    };
  }

  /**
   * Log camera health diagnostics
   */
  logHealthDiagnostics(): void {
    // Health diagnostics available but not logging to reduce console noise
  }
}

export default VisionCameraService;