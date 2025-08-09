/**
 * VisionCameraTest - Test component to verify VisionCameraView functionality
 * 
 * This component can be temporarily integrated into the app to test:
 * - Camera initialization and permissions
 * - Mode switching between scanner, product-photo, and ingredients-photo
 * - Barcode scanning with MLKit
 * - Photo capture functionality
 * - Native tap-to-focus behavior
 */

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import VisionCameraView, { VisionCameraViewRef } from './VisionCameraView';
import { CameraMode } from '../services/VisionCameraService';

export default function VisionCameraTest() {
  const cameraRef = useRef<VisionCameraViewRef>(null);
  const [currentMode, setCurrentMode] = useState<CameraMode>('scanner');
  const [lastBarcode, setLastBarcode] = useState<string>('');
  const [lastPhoto, setLastPhoto] = useState<string>('');
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (result: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults(prev => [`${timestamp}: ${result}`, ...prev.slice(0, 9)]);
  };

  const handleBarcodeScanned = (data: string) => {
    setLastBarcode(data);
    addTestResult(`✅ Barcode scanned: ${data}`);
    Alert.alert('Barcode Scanned', `Data: ${data}`);
  };

  const handlePhotoCaptured = (uri: string) => {
    setLastPhoto(uri);
    addTestResult(`✅ Photo captured: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
    Alert.alert('Photo Captured', `URI: ${uri}`);
  };

  const handleCameraReady = () => {
    addTestResult(`✅ Camera ready in ${currentMode} mode`);
  };

  const handleError = (error: string) => {
    addTestResult(`❌ Error: ${error}`);
    Alert.alert('Camera Error', error);
  };

  const switchMode = (mode: CameraMode) => {
    addTestResult(`🔄 Switching to ${mode} mode`);
    setCurrentMode(mode);
  };

  const takePicture = async () => {
    if (!cameraRef.current) {
      addTestResult(`❌ Camera ref not available`);
      return;
    }

    try {
      addTestResult(`📸 Taking picture...`);
      const result = await cameraRef.current.takePictureAsync();
      if (result) {
        addTestResult(`✅ Picture taken: ${result.uri.substring(result.uri.lastIndexOf('/') + 1)}`);
      } else {
        addTestResult(`❌ Failed to take picture`);
      }
    } catch (error) {
      addTestResult(`❌ Picture error: ${error}`);
    }
  };

  const clearBarcode = () => {
    cameraRef.current?.clearLastScannedBarcode();
    setLastBarcode('');
    addTestResult(`🧹 Cleared last scanned barcode`);
  };

  const logHealth = () => {
    cameraRef.current?.logCameraHealth();
    addTestResult(`📊 Health diagnostics logged to console`);
  };

  const testFocus = async () => {
    if (!cameraRef.current) {
      addTestResult(`❌ Camera ref not available for focus test`);
      return;
    }

    try {
      // Test focus at center of screen
      const success = await cameraRef.current.focusAtPoint(200, 400);
      addTestResult(`${success ? '✅' : '❌'} Focus test at (200, 400): ${success ? 'Success' : 'Failed'}`);
    } catch (error) {
      addTestResult(`❌ Focus test error: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <VisionCameraView
          ref={cameraRef}
          mode={currentMode}
          onBarcodeScanned={handleBarcodeScanned}
          onPhotoCaptured={handlePhotoCaptured}
          onCameraReady={handleCameraReady}
          onError={handleError}
          owner="VisionCameraTest"
          testID="vision-camera-test"
        />
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <ScrollView style={styles.scrollView}>
          {/* Mode Controls */}
          <Text style={styles.sectionTitle}>Camera Modes</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, currentMode === 'scanner' && styles.activeButton]}
              onPress={() => switchMode('scanner')}
            >
              <Text style={styles.buttonText}>Scanner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, currentMode === 'product-photo' && styles.activeButton]}
              onPress={() => switchMode('product-photo')}
            >
              <Text style={styles.buttonText}>Product</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, currentMode === 'ingredients-photo' && styles.activeButton]}
              onPress={() => switchMode('ingredients-photo')}
            >
              <Text style={styles.buttonText}>Ingredients</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, currentMode === 'inactive' && styles.activeButton]}
              onPress={() => switchMode('inactive')}
            >
              <Text style={styles.buttonText}>Inactive</Text>
            </TouchableOpacity>
          </View>

          {/* Action Controls */}
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={takePicture}>
              <Text style={styles.buttonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={clearBarcode}>
              <Text style={styles.buttonText}>Clear Barcode</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={testFocus}>
              <Text style={styles.buttonText}>Test Focus</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={logHealth}>
              <Text style={styles.buttonText}>Log Health</Text>
            </TouchableOpacity>
          </View>

          {/* Status Information */}
          <Text style={styles.sectionTitle}>Status</Text>
          <Text style={styles.statusText}>Current Mode: {currentMode}</Text>
          <Text style={styles.statusText}>Last Barcode: {lastBarcode || 'None'}</Text>
          <Text style={styles.statusText}>Last Photo: {lastPhoto ? lastPhoto.substring(lastPhoto.lastIndexOf('/') + 1) : 'None'}</Text>

          {/* Test Results */}
          <Text style={styles.sectionTitle}>Test Results</Text>
          {testResults.map((result, index) => (
            <Text key={index} style={styles.resultText}>{result}</Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  cameraContainer: {
    flex: 2,
  },
  controlsContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 10,
  },
  scrollView: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  resultText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 1,
    fontFamily: 'monospace',
  },
});