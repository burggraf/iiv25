import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductLookupService } from '../services/productLookupService';
import { Product, VeganStatus } from '../types';

export default function TestScreen() {
  const [upcCode, setUpcCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateUPC = (code: string): boolean => {
    if (code.length < 8) return false;
    if (!/^\d+$/.test(code)) return false;
    const validLengths = [8, 12, 13];
    return validLengths.includes(code.length);
  };

  const handleSubmit = async () => {
    if (!validateUPC(upcCode)) {
      setError('Please enter a valid UPC code (8, 12, or 13 digits)');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProduct(null);

    try {
      const result = await ProductLookupService.lookupProductByBarcode(upcCode, { context: 'Test' });

      if (result.isRateLimited) {
        setError(result.error!);
        return;
      }

      if (result.product) {
        setProduct(result.product);
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

  const handleClear = () => {
    setUpcCode('');
    setProduct(null);
    setError(null);
  };

  const getVeganStatusColor = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '#4CAF50';
      case VeganStatus.VEGETARIAN:
        return '#FF9800';
      case VeganStatus.NOT_VEGETARIAN:
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getVeganStatusText = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '🌱 VEGAN';
      case VeganStatus.VEGETARIAN:
        return '🥛 VEGETARIAN';
      case VeganStatus.NOT_VEGETARIAN:
        return '🚫 NOT VEGETARIAN';
      default:
        return '❓ UNKNOWN';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>UPC Test Screen</Text>
          <Text style={styles.subtitle}>Enter a UPC code to test the lookup functionality</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>UPC Code:</Text>
          <TextInput
            style={styles.input}
            value={upcCode}
            onChangeText={setUpcCode}
            placeholder="Enter UPC code"
            keyboardType="numeric"
            maxLength={13}
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
          />
          <Text style={styles.digitCount}>{upcCode.length}/13 digits</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              !validateUPC(upcCode) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!validateUPC(upcCode) || isLoading}
          >
            <Text style={[
              styles.submitButtonText,
              !validateUPC(upcCode) && styles.submitButtonTextDisabled
            ]}>
              {isLoading ? 'Testing...' : 'Test UPC'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Looking up UPC: {upcCode}...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        )}

        {product && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Test Results:</Text>
            
            <View style={styles.resultsScrollContainer}>
              <ScrollView 
                style={styles.resultsScrollView} 
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                <View style={styles.productCard}>
              <View style={styles.productHeader}>
                <Text style={styles.productName}>{product.name}</Text>
                {product.brand && (
                  <Text style={styles.productBrand}>{product.brand}</Text>
                )}
              </View>

              <View style={styles.statusContainer}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: getVeganStatusColor(product.veganStatus) }
                ]}>
                  <Text style={styles.statusText}>
                    {getVeganStatusText(product.veganStatus)}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>Barcode:</Text>
                <Text style={styles.detailValue}>{product.barcode}</Text>
              </View>

              <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>Classification Method:</Text>
                <Text style={styles.detailValue}>{product.classificationMethod || 'N/A'}</Text>
              </View>

              {product.ingredients && product.ingredients.length > 0 && (
                <View style={styles.ingredientsContainer}>
                  <Text style={styles.detailLabel}>Ingredients:</Text>
                  <Text style={styles.ingredientsText}>
                    {product.ingredients.join(', ')}
                  </Text>
                </View>
              )}

              {product.nonVeganIngredients && product.nonVeganIngredients.length > 0 && (
                <View style={styles.nonVeganContainer}>
                  <Text style={styles.detailLabel}>Non-Vegetarian Ingredients:</Text>
                  {product.nonVeganIngredients.map((item, index) => (
                    <View key={index} style={styles.nonVeganItem}>
                      <Text style={styles.nonVeganIngredient}>{item.ingredient}</Text>
                      <Text style={styles.nonVeganReason}>{item.reason}</Text>
                    </View>
                  ))}
                </View>
              )}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  inputContainer: {
    padding: 20,
    backgroundColor: 'white',
    marginTop: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textAlign: 'center',
  },
  digitCount: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButtonTextDisabled: {
    color: '#999',
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clearButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
  },
  resultsContainer: {
    padding: 20,
    flex: 1,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  resultsScrollContainer: {
    flex: 1,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
  },
  resultsScrollView: {
    flex: 1,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  productHeader: {
    marginBottom: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  productBrand: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailsContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    width: 140,
  },
  detailValue: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  ingredientsContainer: {
    marginTop: 12,
  },
  ingredientsText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    lineHeight: 20,
  },
  nonVeganContainer: {
    marginTop: 12,
  },
  nonVeganItem: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F44336',
  },
  nonVeganIngredient: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  nonVeganReason: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});