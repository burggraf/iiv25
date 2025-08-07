/**
 * UnifiedCameraExample - Example component showing unified camera integration
 * 
 * This example demonstrates how to integrate the UnifiedCameraView and 
 * UnifiedCameraService into existing screens and workflows.
 * 
 * Usage patterns:
 * 1. Scanner mode for barcode scanning
 * 2. Product photo mode for capturing product images
 * 3. Ingredients photo mode for capturing ingredient lists
 * 4. Dynamic mode switching without recreating camera instances
 */

import React, { useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UnifiedCameraView, { CameraViewRef } from './UnifiedCameraView';
import UnifiedCameraService, { CameraMode, CameraState } from '../services/UnifiedCameraService';

interface UnifiedCameraExampleProps {
  /** Initial camera mode */
  initialMode?: CameraMode;
  
  /** Callback when back button is pressed */
  onBack?: () => void;
  
  /** Callback when barcode is scanned */
  onBarcodeScanned?: (barcode: string) => void;
  
  /** Callback when photo is captured */
  onPhotoCaptured?: (uri: string, mode: CameraMode) => void;
}

const UnifiedCameraExample: React.FC<UnifiedCameraExampleProps> = ({
  initialMode = 'scanner',
  onBack,
  onBarcodeScanned,
  onPhotoCaptured,
}) => {
  const cameraRef = useRef<CameraViewRef>(null);
  const cameraService = UnifiedCameraService.getInstance();
  
  const [currentMode, setCurrentMode] = useState<CameraMode>(initialMode);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');

  // Handle mode switching
  const switchMode = useCallback(async (newMode: CameraMode) => {
    try {
      const success = await cameraService.switchToMode(newMode);
      if (success) {
        setCurrentMode(newMode);
        console.log(`📱 Example: Switched to ${newMode} mode`);
      } else {
        Alert.alert('Error', `Failed to switch to ${newMode} mode`);
      }
    } catch (error) {
      console.error('Mode switch failed:', error);
      Alert.alert('Error', 'Failed to switch camera mode');
    }
  }, [cameraService]);

  // Handle barcode scanning
  const handleBarcodeScanned = useCallback((barcode: string) => {
    console.log('📱 Example: Barcode scanned:', barcode);
    setLastScannedBarcode(barcode);
    onBarcodeScanned?.(barcode);
    
    // Show success message
    Alert.alert(
      'Barcode Scanned',
      `Scanned: ${barcode}`,
      [
        { text: 'Scan Another', onPress: () => setLastScannedBarcode('') },
        { text: 'OK' }
      ]
    );
  }, [onBarcodeScanned]);

  // Handle photo capture
  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync();
      if (result?.uri) {
        console.log('📱 Example: Photo captured:', result.uri);
        onPhotoCaptured?.(result.uri, currentMode);
        
        Alert.alert(
          'Photo Captured',
          `Photo saved in ${currentMode} mode`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      Alert.alert('Error', 'Failed to capture photo');
    } finally {
      setIsCapturing(false);
    }
  }, [currentMode, isCapturing, onPhotoCaptured]);

  // Handle camera errors
  const handleCameraError = useCallback((error: string) => {
    console.error('📱 Example: Camera error:', error);
    Alert.alert('Camera Error', error);
  }, []);

  // Custom overlay for demonstration
  const renderCustomOverlay = useCallback((mode: CameraMode, state: CameraState) => {
    return (
      <View style={styles.customOverlay}>
        {/* Mode indicator */}
        <SafeAreaView style={styles.topControls} edges={['top']}>
          <View style={styles.modeIndicator}>
            <Text style={styles.modeText}>
              {mode === 'scanner' && '📷 Scanner'}
              {mode === 'product-photo' && '📸 Product Photo'}
              {mode === 'ingredients-photo' && '🏷️ Ingredients Photo'}
            </Text>
            {state.isCapturing && <Text style={styles.capturingText}>Capturing...</Text>}
          </View>
          
          {/* Back button */}
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>

        {/* Mode switching controls */}
        <SafeAreaView style={styles.bottomControls} edges={['bottom']}>
          {/* Mode buttons */}
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[styles.modeButton, currentMode === 'scanner' && styles.activeModeButton]}
              onPress={() => switchMode('scanner')}
            >
              <Text style={[styles.modeButtonText, currentMode === 'scanner' && styles.activeModeButtonText]}>
                📷
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modeButton, currentMode === 'product-photo' && styles.activeModeButton]}
              onPress={() => switchMode('product-photo')}
            >
              <Text style={[styles.modeButtonText, currentMode === 'product-photo' && styles.activeModeButtonText]}>
                📸
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modeButton, currentMode === 'ingredients-photo' && styles.activeModeButton]}
              onPress={() => switchMode('ingredients-photo')}
            >
              <Text style={[styles.modeButtonText, currentMode === 'ingredients-photo' && styles.activeModeButtonText]}>
                🏷️
              </Text>
            </TouchableOpacity>
          </View>

          {/* Capture button (for photo modes) */}
          {(currentMode === 'product-photo' || currentMode === 'ingredients-photo') && (
            <TouchableOpacity
              style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
              onPress={handleTakePhoto}
              disabled={isCapturing}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          )}

          {/* Scanner status */}
          {currentMode === 'scanner' && (
            <View style={styles.scannerStatus}>
              <Text style={styles.scannerStatusText}>
                {lastScannedBarcode ? `Last: ${lastScannedBarcode}` : 'Point camera at barcode'}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    );
  }, [currentMode, isCapturing, lastScannedBarcode, onBack, switchMode, handleTakePhoto]);

  return (
    <View style={styles.container}>
      <UnifiedCameraView
        ref={cameraRef}
        mode={currentMode}
        onBarcodeScanned={handleBarcodeScanned}
        onPhotoCaptured={(uri) => onPhotoCaptured?.(uri, currentMode)}
        onError={handleCameraError}
        renderOverlay={renderCustomOverlay}
        testID="unified-camera-example"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  customOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modeIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  modeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  capturingText: {
    color: 'yellow',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  backButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomControls: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  modeButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    padding: 4,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 2,
  },
  activeModeButton: {
    backgroundColor: 'white',
  },
  modeButtonText: {
    fontSize: 20,
  },
  activeModeButtonText: {
    // Active state handled by emoji visibility
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
  },
  scannerStatus: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  scannerStatusText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default UnifiedCameraExample;