import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { isDevice } from 'expo-device';
import { BarcodeScanningResult } from 'expo-camera';
import Logo from './Logo';

interface SimulatorBarcodeTesterProps {
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
}

export default function SimulatorBarcodeTester({ onBarcodeScanned }: SimulatorBarcodeTesterProps) {
  const [testBarcode, setTestBarcode] = useState('');

  // Only show in simulator/web, not on real devices
  if (isDevice && Platform.OS !== 'web') {
    return null;
  }

  const sampleBarcodes = [
    { name: 'Coca-Cola (Vegan)', code: '5449000000996' },
    { name: 'Oreos (Vegan)', code: '7622210991034' },
    { name: 'Ben & Jerry\'s (Vegetarian)', code: '8712100849503' },
    { name: 'Snickers (Not Vegetarian)', code: '5000159407236' },
    { name: 'Test Product', code: '1234567890123' },
  ];

  const handleTestScan = (barcode: string) => {
    onBarcodeScanned({
      type: 'ean13',
      data: barcode
    });
    setTestBarcode('');
  };

  return (
    <View style={styles.container}>
      <Logo size={80} style={styles.logo} />
      <Text style={styles.title}>📱 Simulator Testing Mode</Text>
      <Text style={styles.subtitle}>Enter a barcode manually or use samples:</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter barcode (e.g., 1234567890123)"
          value={testBarcode}
          onChangeText={setTestBarcode}
          keyboardType="numeric"
        />
        <TouchableOpacity 
          style={styles.scanButton}
          onPress={() => handleTestScan(testBarcode)}
          disabled={!testBarcode}
        >
          <Text style={styles.scanButtonText}>Test Scan</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.samplesTitle}>Sample Barcodes:</Text>
      {sampleBarcodes.map((item, index) => (
        <TouchableOpacity
          key={index}
          style={styles.sampleButton}
          onPress={() => handleTestScan(item.code)}
        >
          <Text style={styles.sampleText}>{item.name}: {item.code}</Text>
        </TouchableOpacity>
      ))}
      
      <Text style={styles.note}>
        💡 For real camera testing, use Expo Go on your phone
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'white',
  },
  logo: {
    marginBottom: 20,
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginRight: 10,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  scanButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  samplesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sampleButton: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  sampleText: {
    fontSize: 14,
  },
  note: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
});