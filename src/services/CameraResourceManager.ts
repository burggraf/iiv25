/**
 * CameraResourceManager - Singleton to prevent concurrent camera access
 * 
 * Ensures only one camera instance is active at a time to prevent crashes
 * and hardware conflicts when switching between camera screens.
 */

export type CameraScreenType = 'scanner' | 'product-creation' | 'report-issue';

class CameraResourceManager {
  private static instance: CameraResourceManager;
  private activeCameraScreen: CameraScreenType | null = null;
  private cleanupCallbacks: Map<CameraScreenType, () => void> = new Map();

  private constructor() {}

  static getInstance(): CameraResourceManager {
    if (!CameraResourceManager.instance) {
      CameraResourceManager.instance = new CameraResourceManager();
    }
    return CameraResourceManager.instance;
  }

  /**
   * Request camera access for a specific screen
   * Automatically cleans up any existing camera before granting access
   */
  requestCamera(screenType: CameraScreenType, cleanupCallback?: () => void): boolean {
    // If same screen is requesting access, allow it
    if (this.activeCameraScreen === screenType) {
      return true;
    }

    // Cleanup existing camera if any
    this.releaseCamera();

    // Grant access to new screen
    this.activeCameraScreen = screenType;
    
    if (cleanupCallback) {
      this.cleanupCallbacks.set(screenType, cleanupCallback);
    }

    return true;
  }

  /**
   * Release camera resources for a specific screen
   */
  releaseCamera(screenType?: CameraScreenType): void {
    // If specific screen provided, only release if it's the active one
    if (screenType && this.activeCameraScreen !== screenType) {
      return;
    }

    // Call cleanup callback if exists
    if (this.activeCameraScreen) {
      const cleanup = this.cleanupCallbacks.get(this.activeCameraScreen);
      if (cleanup) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`Camera cleanup failed for ${this.activeCameraScreen}:`, error);
        }
      }
      
      this.cleanupCallbacks.delete(this.activeCameraScreen);
      this.activeCameraScreen = null;
    }
  }

  /**
   * Check if camera is available for a specific screen
   */
  isCameraAvailable(screenType: CameraScreenType): boolean {
    return this.activeCameraScreen === null || this.activeCameraScreen === screenType;
  }

  /**
   * Get currently active camera screen
   */
  getActiveCameraScreen(): CameraScreenType | null {
    return this.activeCameraScreen;
  }
}

export default CameraResourceManager;