import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Logo from '../components/Logo';
import NumericKeypad from '../components/NumericKeypad';
import ProductResult from '../components/ProductResult';
import { ProductLookupService } from '../services/productLookupService';
import { useApp } from '../context/AppContext';
import { Product } from '../types';

export default function ManualEntryScreen() {
  const { addToHistory } = useApp();
  const [upcCode, setUpcCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRateLimitModal, setShowRateLimitModal] = useState(false);

  const handleNumberPress = (number: string) => {
    if (upcCode.length < 13) { // Max length for EAN-13
      setUpcCode(prev => prev + number);
    }
  };

  const validateUPC = (code: string): boolean => {
    // Check minimum length (8 digits for UPC-8, 12 for UPC-A, 13 for EAN-13)
    if (code.length < 8) {
      return false;
    }
    
    // Check if it's all numeric
    if (!/^\d+$/.test(code)) {
      return false;
    }
    
    // Check for valid UPC/EAN lengths
    const validLengths = [8, 12, 13];
    return validLengths.includes(code.length);
  };

  const handleBackspace = () => {
    setUpcCode(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setUpcCode('');
    setError(null);
  };

  const handlePaste = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      // Only allow numeric input and limit to 13 characters
      const numericText = clipboardContent.replace(/[^0-9]/g, '').slice(0, 13);
      if (numericText.length > 0) {
        setUpcCode(numericText);
        setError(null);
      }
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
    }
  };

  const handleLookup = async () => {
    // Validate UPC before proceeding
    if (!validateUPC(upcCode)) {
      if (upcCode.length < 8) {
        setError('Please enter at least 8 digits');
      } else if (![8, 12, 13].includes(upcCode.length)) {
        setError('Please enter a valid UPC code (8, 12, or 13 digits)');
      } else {
        setError('Please enter a valid UPC code');
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await ProductLookupService.lookupProductByBarcode(upcCode, { context: 'Manual Entry' });

      if (result.isRateLimited) {
        setShowRateLimitModal(true);
        return;
      }

      if (result.product) {
        setProduct(result.product);
        addToHistory(result.product);
      } else {
        setError(result.error!);
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

  const handleProductUpdated = (updatedProduct: Product) => {
    // Update the product state to reflect changes
    setProduct(updatedProduct);
  };

  const handleRateLimitClose = () => {
    setShowRateLimitModal(false);
    setIsLoading(false);
  };

  const handleSubscribe = () => {
    setShowRateLimitModal(false);
    // Navigate to home tab and automatically open subscription management
    router.push('/(tabs)/?openSubscription=true');
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
        <ProductResult 
          product={product} 
          onBack={handleNewSearch}
          onProductUpdated={handleProductUpdated}
        />
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
        <View style={styles.centerHeader}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Is It Vegan?</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionTitle}>Enter UPC Code Manually</Text>
      </View>

      {/* UPC Display */}
      <View style={styles.upcContainer}>
        <Text style={styles.upcLabel}>UPC Code:</Text>
        <View style={styles.upcDisplay}>
          <Text style={styles.upcDisplayText}>
            {upcCode}
          </Text>
        </View>
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
            !validateUPC(upcCode) && styles.lookupButtonDisabled
          ]}
          onPress={handleLookup}
          disabled={!validateUPC(upcCode)}
        >
          <Text style={[
            styles.lookupButtonText,
            !validateUPC(upcCode) && styles.lookupButtonTextDisabled
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

      {/* Paste Button */}
      <View style={styles.pasteContainer}>
        <TouchableOpacity 
          style={styles.pasteButton} 
          onPress={handlePaste}
        >
          <Text style={styles.pasteButtonIcon}>📋</Text>
          <Text style={styles.pasteButtonLabel}>Paste from clipboard</Text>
        </TouchableOpacity>
      </View>

      {/* Rate Limit Modal */}
      {showRateLimitModal && (
        <View style={styles.rateLimitModal}>
          <View style={styles.rateLimitModalContent}>
            <View style={styles.rateLimitModalHeader}>
              <Text style={styles.rateLimitIcon}>⏰</Text>
              <Text style={styles.rateLimitTitle}>Rate Limit Exceeded</Text>
              <Text style={styles.rateLimitSubtitle}>
                You can search 10 products per day on the free plan. Upgrade to unlock unlimited searches.
              </Text>
            </View>
            <View style={styles.rateLimitButtons}>
              <TouchableOpacity
                style={styles.rateLimitCloseButton}
                onPress={handleRateLimitClose}>
                <Text style={styles.rateLimitCloseText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rateLimitUpgradeButton}
                onPress={handleSubscribe}>
                <Text style={styles.rateLimitUpgradeText}>Upgrade Plan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  centerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
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
    minWidth: 340,
    justifyContent: 'center',
  },
  upcDisplayText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 2,
    fontFamily: 'monospace',
    textAlign: 'center',
    minHeight: 30,
  },
  pasteContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pasteButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  pasteButtonLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '400',
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
  rateLimitModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  rateLimitModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 32,
    margin: 20,
    alignItems: 'center',
    maxWidth: 350,
    width: '90%',
  },
  rateLimitModalHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  rateLimitIcon: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  rateLimitTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  rateLimitSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  rateLimitButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  rateLimitCloseButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rateLimitCloseText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  rateLimitUpgradeButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rateLimitUpgradeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});