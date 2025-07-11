import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Logo from '../components/Logo';
import NumericKeypad from '../components/NumericKeypad';
import ProductResult from '../components/ProductResult';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { useApp } from '../context/AppContext';
import { Product } from '../types';

export default function ManualEntryScreen() {
  const { addToHistory } = useApp();
  const [upcCode, setUpcCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNumberPress = (number: string) => {
    if (upcCode.length < 13) { // Max length for EAN-13
      setUpcCode(prev => prev + number);
    }
  };

  const handleBackspace = () => {
    setUpcCode(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setUpcCode('');
    setError(null);
  };

  const handleLookup = async () => {
    if (upcCode.length < 8) {
      setError('Please enter at least 8 digits');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const productData = await OpenFoodFactsService.getProductByBarcode(upcCode);
      
      if (productData) {
        setProduct(productData);
        addToHistory(productData); // Add to history
      } else {
        setError(`Product not found for UPC: ${upcCode}`);
      }
    } catch (err) {
      setError('Failed to lookup product. Please try again.');
      console.error('Error looking up product:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSearch = () => {
    setProduct(null);
    setError(null);
    setUpcCode('');
  };

  // Show loading screen
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Logo size={60} style={styles.loadingLogo} />
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Looking up UPC: {upcCode}...</Text>
      </View>
    );
  }

  // Show product result
  if (product) {
    return (
      <View style={styles.container}>
        <ProductResult product={product} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleNewSearch}>
            <Text style={styles.newSearchButton}>
              🔢 Enter Another UPC
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show manual entry interface
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centerHeader}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Is It Vegan?</Text>
        </View>
        <View style={styles.rightSpacer} />
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionTitle}>Enter UPC Code Manually</Text>
        <Text style={styles.instructionText}>
          Type the barcode number using the keypad below
        </Text>
      </View>

      {/* UPC Display */}
      <View style={styles.upcContainer}>
        <Text style={styles.upcLabel}>UPC Code:</Text>
        <View style={styles.upcDisplay}>
          <Text style={styles.upcText}>
            {upcCode || 'Enter digits below...'}
          </Text>
          <View style={styles.cursor} />
        </View>
        <Text style={styles.digitCount}>
          {upcCode.length}/13 digits
        </Text>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      )}

      {/* Lookup Button */}
      <View style={styles.lookupContainer}>
        <TouchableOpacity
          style={[
            styles.lookupButton,
            upcCode.length < 8 && styles.lookupButtonDisabled
          ]}
          onPress={handleLookup}
          disabled={upcCode.length < 8}
        >
          <Text style={[
            styles.lookupButtonText,
            upcCode.length < 8 && styles.lookupButtonTextDisabled
          ]}>
            🔍 Lookup Product
          </Text>
        </TouchableOpacity>
      </View>

      {/* Numeric Keypad */}
      <NumericKeypad
        onNumberPress={handleNumberPress}
        onBackspace={handleBackspace}
        onClear={handleClear}
      />
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
    width: 60,
  },
  instructionsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  upcContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  upcLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  upcDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minWidth: 280,
    justifyContent: 'center',
  },
  upcText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  cursor: {
    width: 2,
    height: 24,
    backgroundColor: '#007AFF',
    marginLeft: 4,
  },
  digitCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  errorContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
  },
  lookupContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  lookupButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  lookupButtonDisabled: {
    backgroundColor: '#ccc',
  },
  lookupButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  lookupButtonTextDisabled: {
    color: '#999',
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
  buttonContainer: {
    padding: 20,
    backgroundColor: 'white',
  },
  newSearchButton: {
    fontSize: 18,
    color: '#007AFF',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    fontWeight: 'bold',
  },
});