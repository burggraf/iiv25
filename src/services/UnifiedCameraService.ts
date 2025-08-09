/**
 * UnifiedCameraService - Single camera instance manager
 * 
 * Manages a single camera instance across the entire app to eliminate hardware 
 * resource conflicts and crashes when switching between camera modes.
 * 
 * Features:
 * - Single camera instance with dynamic mode switching
 * - Hardware resource conflict prevention
 * - Centralized camera state management
 * - Integration with existing app architecture
 */

// Simple event emitter for React Native compatibility
interface EventListener {
  [event: string]: ((...args: any[]) => void)[];
}

export type CameraMode = 'scanner' | 'product-photo' | 'ingredients-photo' | 'inactive';

export interface CameraConfig {
  mode: CameraMode;
  facing: 'front' | 'back';
  enableBarcode: boolean;
  barcodeTypes: ('upc_a' | 'upc_e' | 'ean13' | 'ean8' | 'code128' | 'code39')[];
  enablePhotoCapture: boolean;
  quality?: number;
  flashMode?: 'on' | 'off' | 'auto';
  autofocus?: 'on' | 'off';
  focusDepth?: number;
  enableTouchFocus?: boolean;
  zoom?: number;
}

export interface CameraModeConfig {
  scanner: CameraConfig;
  'product-photo': CameraConfig;
  'ingredients-photo': CameraConfig;
  inactive: CameraConfig;
}

export interface CameraState {
  mode: CameraMode;
  isActive: boolean;
  isCapturing: boolean;
  hasPermission: boolean | null;
  error: string | null;
  config: CameraConfig;
}

export interface CameraOwnership {
  owner: string;
  mode: CameraMode;
  timestamp: number;
}

class UnifiedCameraService {
  private static instance: UnifiedCameraService;
  private state: CameraState;
  private modeConfigs: CameraModeConfig;
  private listeners: EventListener = {};
  private currentOwner: CameraOwnership | null = null;
  private listenerCleanupTimers: Map<(...args: any[]) => void, ReturnType<typeof setTimeout>> = new Map();
  private performanceMetrics: {
    modeTransitions: Array<{ from: CameraMode; to: CameraMode; timestamp: number; duration: number }>;
    barcodeScansEnabled: number;
    lastScannerActivation: number | null;
  } = {
    modeTransitions: [],
    barcodeScansEnabled: 0,
    lastScannerActivation: null
  };

  private constructor() {
    
    // Initialize default mode configurations
    this.modeConfigs = {
      scanner: {
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
      'product-photo': {
        mode: 'product-photo',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: true,
        quality: 0.8,
        autofocus: 'on',
        enableTouchFocus: true,
      },
      'ingredients-photo': {
        mode: 'ingredients-photo',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: true,
        quality: 0.8,
        autofocus: 'on',
        enableTouchFocus: true,
      },
      inactive: {
        mode: 'inactive',
        facing: 'back',
        enableBarcode: false,
        barcodeTypes: [],
        enablePhotoCapture: false,
        autofocus: 'off',
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
    };
  }

  static getInstance(): UnifiedCameraService {
    if (!UnifiedCameraService.instance) {
      UnifiedCameraService.instance = new UnifiedCameraService();
    }
    return UnifiedCameraService.instance;
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
    // This prevents memory leaks from components that forget to unregister
    const existingTimer = this.listenerCleanupTimers.get(listener);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      console.warn(`🎥 UnifiedCameraService: Auto-cleaning stale listener for event '${event}'`);
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
    
    // Clear the cleanup timer
    const timer = this.listenerCleanupTimers.get(listener);
    if (timer) {
      clearTimeout(timer);
      this.listenerCleanupTimers.delete(listener);
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
    this.listeners = {};
  }

  /**
   * Switch camera to a specific mode
   * @param mode - The camera mode to switch to
   * @param customConfig - Optional custom configuration to override defaults
   * @param owner - Identifier for the component requesting camera control
   */
  async switchToMode(mode: CameraMode, customConfig?: Partial<CameraConfig>, owner?: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const ownerName = owner || 'unknown';
      console.log(`🎥 UnifiedCamera: ${ownerName} requesting switch to mode '${mode}'`);
      console.log(`🎥 UnifiedCamera: Current state - mode: ${this.state.mode}, isActive: ${this.state.isActive}, owner: ${this.currentOwner?.owner || 'none'}`);
      
      // Check if another component owns the camera (unless switching to inactive)
      if (mode !== 'inactive' && this.currentOwner && this.currentOwner.owner !== ownerName) {
        const timeSinceOwnership = Date.now() - this.currentOwner.timestamp;
        console.log(`🎥 UnifiedCamera: Checking takeover - current owner: ${this.currentOwner.owner} (${this.currentOwner.mode}), time since: ${timeSinceOwnership}ms`);
        
        // Only allow takeover if ownership is old (stale) or from scanner to photo modes
        if (timeSinceOwnership < 1000 && !this.canTakeOver(ownerName, mode)) {
          console.log(`🎥 UnifiedCamera: ${ownerName} blocked - camera owned by ${this.currentOwner.owner} in ${this.currentOwner.mode} mode`);
          return false;
        } else if (timeSinceOwnership >= 1000) {
          console.log(`🎥 UnifiedCamera: Allowing takeover due to stale ownership (${timeSinceOwnership}ms old)`);
        }
      }

      const previousMode = this.state.mode;
      const newConfig = { ...this.modeConfigs[mode], ...customConfig };
      
      // Detect transition back to scanner from photo modes - needs camera reset
      const isReturningToScanner = (
        mode === 'scanner' && 
        (previousMode === 'product-photo' || previousMode === 'ingredients-photo')
      );
      
      if (isReturningToScanner) {
        console.log(`🎥 UnifiedCamera: Detected return to scanner from ${previousMode} - triggering camera reset`);
        // Emit camera reset event for components to handle hardware reset
        this.emit('cameraReset', {
          fromMode: previousMode,
          toMode: mode,
          reason: 'photo_workflow_complete'
        });
      }
      
      // Update ownership
      if (mode !== 'inactive') {
        this.currentOwner = {
          owner: ownerName,
          mode,
          timestamp: Date.now()
        };
      } else {
        // Only clear ownership if the requester owns it or it's stale
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
        needsCameraReset: isReturningToScanner,
      });

      // Handle activation/deactivation with optional warmup for scanner mode
      if (mode === 'inactive') {
        await this.deactivateCamera();
      } else {
        await this.activateCamera();
        
        // Track scanner activation for performance monitoring
        if (mode === 'scanner') {
          this.performanceMetrics.lastScannerActivation = Date.now();
          this.performanceMetrics.barcodeScansEnabled++;
        }
        
        // Add warmup period for scanner mode after photo workflows
        if (isReturningToScanner) {
          console.log(`🎥 UnifiedCamera: Starting scanner warmup period`);
          // Give camera hardware time to stabilize after mode switch
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`🎥 UnifiedCamera: Scanner warmup complete`);
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
      
      // Keep only last 50 transitions for memory management
      if (this.performanceMetrics.modeTransitions.length > 50) {
        this.performanceMetrics.modeTransitions = this.performanceMetrics.modeTransitions.slice(-50);
      }
      
      console.log(`🎥 UnifiedCamera: ${ownerName} successfully switched to mode '${mode}' (${duration}ms)`);
      
      // Log performance warning if mode switch took too long
      if (duration > 1000) {
        console.warn(`⚠️ UnifiedCamera: Slow mode transition detected (${duration}ms) from ${previousMode} to ${mode}`);
      }
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🎥 UnifiedCamera: Failed to switch to mode '${mode}' after ${duration}ms:`, error);
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', this.state.error);
      return false;
    }
  }

  /**
   * Check if a component can take over camera control
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
    
    // Allow photo mode transitions (product-photo <-> ingredients-photo)
    if ((this.currentOwner.mode === 'product-photo' && newMode === 'ingredients-photo') ||
        (this.currentOwner.mode === 'ingredients-photo' && newMode === 'product-photo')) {
      console.log(`🎥 UnifiedCamera: Allowing photo mode transition from ${this.currentOwner.mode} to ${newMode}`);
      return true;
    }
    
    // Allow camera screen takeovers (ReportIssueScreen, ProductCreationScreen)
    if ((this.currentOwner.owner === 'ReportIssueScreen' || this.currentOwner.owner === 'ProductCreationScreen') &&
        (newOwner === 'ReportIssueScreen' || newOwner === 'ProductCreationScreen') &&
        (newMode === 'product-photo' || newMode === 'ingredients-photo')) {
      console.log(`🎥 UnifiedCamera: Allowing camera screen takeover from ${this.currentOwner.owner} to ${newOwner}`);
      return true;
    }
    
    return false;
  }

  /**
   * Activate the camera
   */
  private async activateCamera(): Promise<void> {
    if (this.state.isActive) {
      console.log('🎥 UnifiedCamera: Already active, skipping activation');
      return;
    }

    console.log('🎥 UnifiedCamera: Activating camera...');
    this.state.isActive = true;
    this.emit('activated', this.state);
  }

  /**
   * Deactivate the camera
   */
  private async deactivateCamera(): Promise<void> {
    if (!this.state.isActive) {
      console.log('🎥 UnifiedCamera: Already inactive, skipping deactivation');
      return;
    }

    console.log('🎥 UnifiedCamera: Deactivating camera...');
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
      console.error('🎥 UnifiedCamera: Error occurred:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get current camera state
   */
  getState(): Readonly<CameraState> {
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
  getModeConfig(mode: CameraMode): CameraConfig {
    return { ...this.modeConfigs[mode] };
  }

  /**
   * Update configuration for a specific mode
   */
  updateModeConfig(mode: CameraMode, config: Partial<CameraConfig>): void {
    this.modeConfigs[mode] = { ...this.modeConfigs[mode], ...config };
    
    // If we're currently in this mode, update the current config
    if (this.state.mode === mode) {
      this.state.config = { ...this.modeConfigs[mode] };
      this.emit('configUpdated', this.state.config);
    }
  }

  /**
   * Check if camera is ready for a specific operation
   */
  isReadyFor(operation: 'barcode' | 'photo'): boolean {
    if (!this.state.isActive || this.state.hasPermission !== true) {
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
    console.log('🎥 UnifiedCamera: Shutting down...');
    
    try {
      await this.switchToMode('inactive');
      this.removeAllListeners();
      console.log('🎥 UnifiedCamera: Shutdown complete');
    } catch (error) {
      console.error('🎥 UnifiedCamera: Error during shutdown:', error);
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
    // All transitions are valid for now, but can be restricted later if needed
    return true;
  }

  /**
   * Get camera performance diagnostics
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const recentTransitions = this.performanceMetrics.modeTransitions.filter(
      t => now - t.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );
    
    const scannerToPhotoTransitions = recentTransitions.filter(
      t => t.from === 'scanner' && (t.to === 'product-photo' || t.to === 'ingredients-photo')
    );
    
    const photoToScannerTransitions = recentTransitions.filter(
      t => (t.from === 'product-photo' || t.from === 'ingredients-photo') && t.to === 'scanner'
    );
    
    return {
      totalModeTransitions: this.performanceMetrics.modeTransitions.length,
      recentTransitions: recentTransitions.length,
      barcodeScansEnabled: this.performanceMetrics.barcodeScansEnabled,
      lastScannerActivation: this.performanceMetrics.lastScannerActivation,
      averageTransitionTime: recentTransitions.length > 0 
        ? Math.round(recentTransitions.reduce((sum, t) => sum + t.duration, 0) / recentTransitions.length)
        : 0,
      slowTransitions: recentTransitions.filter(t => t.duration > 1000).length,
      photoWorkflowTransitions: {
        scannerToPhoto: scannerToPhotoTransitions.length,
        photoToScanner: photoToScannerTransitions.length,
        avgPhotoToScannerTime: photoToScannerTransitions.length > 0
          ? Math.round(photoToScannerTransitions.reduce((sum, t) => sum + t.duration, 0) / photoToScannerTransitions.length)
          : 0
      },
      currentMode: this.state.mode,
      currentOwner: this.currentOwner?.owner || null,
      timeInCurrentMode: this.currentOwner 
        ? now - this.currentOwner.timestamp
        : null,
    };
  }

  /**
   * Log camera health diagnostics
   */
  logHealthDiagnostics(): void {
    const metrics = this.getPerformanceMetrics();
    console.log('🎥 UnifiedCamera Health Diagnostics:', {
      currentState: {
        mode: this.state.mode,
        isActive: this.state.isActive,
        owner: this.currentOwner?.owner || 'none',
        timeInCurrentMode: metrics.timeInCurrentMode ? `${metrics.timeInCurrentMode}ms` : 'N/A'
      },
      performance: {
        totalTransitions: metrics.totalModeTransitions,
        recentTransitions: metrics.recentTransitions,
        avgTransitionTime: `${metrics.averageTransitionTime}ms`,
        slowTransitions: metrics.slowTransitions,
        barcodeScansEnabled: metrics.barcodeScansEnabled
      },
      photoWorkflows: metrics.photoWorkflowTransitions,
      lastScannerActivation: metrics.lastScannerActivation 
        ? new Date(metrics.lastScannerActivation).toISOString() 
        : 'Never'
    });
  }
}

export default UnifiedCameraService;