import React, { useState } from 'react';
import { StyleSheet, Platform, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { isDevice } from 'expo-device';
import BarcodeScanner from '../components/BarcodeScanner';
import SimulatorBarcodeTester from '../components/SimulatorBarcodeTester';
import ProductResult from '../components/ProductResult';
import Logo from '../components/Logo';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { Product } from '../types';

export default function ScannerScreen() {
  const [isScannerVisible, setIsScannerVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBarcodeScanned = async (barcode: string) => {
    console.log('Scanned barcode:', barcode);
    
    setIsScannerVisible(false);
    setIsLoading(true);
    setError(null);
    
    try {
      const productData = await OpenFoodFactsService.getProductByBarcode(barcode);
      
      if (productData) {
        setProduct(productData);
      } else {
        setError(`Product not found for barcode: ${barcode}`);
      }
    } catch (err) {
      setError('Failed to lookup product. Please try again.');
      console.error('Error looking up product:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanAgain = () => {
    setProduct(null);
    setError(null);
    setIsScannerVisible(true);
  };

  const handleCloseScanner = () => {
    setIsScannerVisible(false);
  };

  // Show loading screen
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Logo size={60} style={styles.loadingLogo} />
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Looking up product...</Text>
      </View>
    );
  }

  // Show product result
  if (product) {
    return (
      <View style={styles.container}>
        <ProductResult product={product} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleScanAgain}>
            <Text style={styles.scanAgainButton}>
              🔄 Scan Another Product
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show error
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Logo size={60} style={styles.errorLogo} />
        <Text style={styles.errorText}>❌ {error}</Text>
        <TouchableOpacity onPress={handleScanAgain}>
          <Text style={styles.scanAgainButton}>
            🔄 Try Again
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show scanner
  return (
    <View style={styles.container}>
      {/* Show simulator testing mode if not on a real device */}
      {!isDevice || Platform.OS === 'web' ? (
        <SimulatorBarcodeTester onBarcodeScanned={handleBarcodeScanned} />
      ) : (
        <BarcodeScanner
          onBarcodeScanned={handleBarcodeScanned}
          isVisible={isScannerVisible}
          onClose={handleCloseScanner}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingLogo: {
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
  },
  errorLogo: {
    marginBottom: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    padding: 20,
    backgroundColor: 'white',
  },
  scanAgainButton: {
    fontSize: 18,
    color: '#007AFF',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    fontWeight: 'bold',
  },
});