import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
import { ScannerProps } from '../types';
import Logo from './Logo';

interface BarcodeScannerProps extends ScannerProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function BarcodeScanner({ 
  onBarcodeScanned, 
  isVisible, 
  onClose 
}: BarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (scanned) return;
    
    setScanned(true);
    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
    
    // Call the parent callback with the barcode data
    onBarcodeScanned(data);
    
    // Reset scanner after 2 seconds
    setTimeout(() => {
      setScanned(false);
    }, 2000);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
        <Text style={styles.subText}>
          Please enable camera permissions in your device settings to scan barcodes.
        </Text>
      </View>
    );
  }

  if (!isVisible) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Logo and Instructions */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centerHeader}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Is It Vegan?</Text>
        </View>
        <View style={styles.rightSpacer} />
      </View>
      
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionText}>
          {scanned ? '✅ Barcode Scanned Successfully!' : '📷 Point your camera at a product barcode'}
        </Text>
      </View>

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'],
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.unfocusedContainer}></View>
          <View style={styles.middleContainer}>
            <View style={styles.unfocusedContainer}></View>
            <View style={styles.focusedContainer}>
              <View style={styles.scanningFrame} />
            </View>
            <View style={styles.unfocusedContainer}></View>
          </View>
          <View style={styles.unfocusedContainer}></View>
        </View>
      </View>
      
      {/* Bottom Instructions */}
      <View style={styles.bottomInstructions}>
        <Text style={styles.tipText}>
          💡 Tip: Hold steady and make sure the barcode is clearly visible
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  centerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  rightSpacer: {
    width: 60, // Same width as back button for centering
  },
  instructionsContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'white',
  },
  instructionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    fontWeight: '500',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginTop: 100,
  },
  subText: {
    fontSize: 14,
    color: 'white',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  middleContainer: {
    flexDirection: 'row',
    flex: 1.5,
  },
  focusedContainer: {
    flex: 6,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningFrame: {
    width: '80%',
    height: '60%',
    borderWidth: 3,
    borderColor: '#00ff00',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  bottomInstructions: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'white',
  },
  tipText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
});