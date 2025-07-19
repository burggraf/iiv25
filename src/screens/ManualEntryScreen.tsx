import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Logo from '../components/Logo';
import NumericKeypad from '../components/NumericKeypad';
import ProductResult from '../components/ProductResult';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { SupabaseService } from '../services/supabaseService';
import { useApp } from '../context/AppContext';
import { Product, VeganStatus, ActionType } from '../types';

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

  const handleDirectInput = (text: string) => {
    // Only allow numeric input and limit to 13 characters
    const numericText = text.replace(/[^0-9]/g, '').slice(0, 13);
    setUpcCode(numericText);
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
      let finalProduct: Product | null = null;
      let dataSource: string = '';
      let decisionLog: string[] = [];
      
      // Step 1: Check our Supabase database first
      console.log('='.repeat(80));
      console.log('🔍 HYBRID PRODUCT LOOKUP (Manual Entry)');
      console.log('='.repeat(80));
      console.log(`📊 UPC: ${upcCode}`);
      console.log('🏪 Step 1: Checking Supabase database...');
      
      try {
        const supabaseResult = await SupabaseService.searchProductByBarcode(upcCode);
        
        if (supabaseResult.isRateLimited) {
          console.log('⏰ Rate limit exceeded - showing error');
          decisionLog.push('⏰ Rate limit exceeded for database lookup');
          setError(`Rate limit exceeded. You can search ${supabaseResult.rateLimitInfo?.rateLimit} products per hour on ${supabaseResult.rateLimitInfo?.subscriptionLevel} plan.`);
          return;
        }
        
        if (supabaseResult.product) {
          console.log('✅ Found product in Supabase database');
          console.log(`📝 Product: ${supabaseResult.product.product_name}`);
          console.log(`🏷️ Classification: ${supabaseResult.product.classification}`);
          console.log(`🔢 Calculated Code: ${supabaseResult.product.calculated_code}`);
          
          // Use the best available classification (prefers classification field, falls back to calculated_code)
          const veganStatus = SupabaseService.getProductVeganStatus(supabaseResult.product);
          
          // Check if we have a valid classification
          if (veganStatus !== VeganStatus.UNKNOWN) {
            console.log(`🎯 Using database result: ${veganStatus}`);
            const classificationSource = supabaseResult.product.classification && SupabaseService.isValidClassification(supabaseResult.product.classification) 
              ? `classification field "${supabaseResult.product.classification}"` 
              : `calculated_code ${supabaseResult.product.calculated_code}`;
            decisionLog.push(`✅ Database hit: Using ${classificationSource} → ${veganStatus}`);
            
            // Create product from database data
            finalProduct = {
              id: supabaseResult.product.ean13 || upcCode,
              barcode: upcCode,
              name: supabaseResult.product.product_name || 'Unknown Product',
              brand: supabaseResult.product.brand || undefined,
              ingredients: supabaseResult.product.ingredients ? supabaseResult.product.ingredients.split(',').map(i => i.trim()) : [],
              veganStatus: veganStatus,
              imageUrl: supabaseResult.product.imageurl || undefined,
              lastScanned: new Date(),
              classificationMethod: 'structured'
            };
            
            dataSource = 'supabase';
            
            // Still fetch image from OpenFoodFacts for display
            console.log('🖼️ Fetching product image from OpenFoodFacts...');
            try {
              const offProduct = await OpenFoodFactsService.getProductByBarcode(upcCode);
              if (offProduct?.imageUrl) {
                finalProduct.imageUrl = offProduct.imageUrl;
                console.log('✅ Got product image from OpenFoodFacts');
                decisionLog.push('🖼️ Product image fetched from OpenFoodFacts');
              } else {
                console.log('❌ No image available from OpenFoodFacts');
                decisionLog.push('❌ No image available from OpenFoodFacts');
              }
            } catch (imgErr) {
              console.log('⚠️ Failed to fetch image from OpenFoodFacts:', imgErr);
              decisionLog.push('⚠️ Failed to fetch image from OpenFoodFacts');
            }
          } else {
            console.log(`❓ Database result has no valid classification - falling back to OpenFoodFacts`);
            console.log(`   Classification: "${supabaseResult.product.classification || 'none'}"`);
            console.log(`   Calculated Code: ${supabaseResult.product.calculated_code || 'none'}`);
            decisionLog.push(`❓ Database result has no valid classification - falling back to OpenFoodFacts`);
          }
        } else {
          console.log('❌ Product not found in Supabase database');
          decisionLog.push('❌ Product not found in Supabase database');
        }
      } catch (supabaseErr) {
        console.log('⚠️ Supabase lookup error:', supabaseErr);
        decisionLog.push('⚠️ Supabase lookup error - falling back to OpenFoodFacts');
      }
      
      // Step 2: Fall back to OpenFoodFacts if no valid database result
      if (!finalProduct) {
        console.log('🌐 Step 2: Falling back to OpenFoodFacts API...');
        
        try {
          const productData = await OpenFoodFactsService.getProductByBarcode(upcCode);
          
          if (productData) {
            console.log('✅ Found product in OpenFoodFacts');
            console.log(`📝 Product: ${productData.name}`);
            console.log(`🎯 Vegan Status: ${productData.veganStatus}`);
            
            finalProduct = productData;
            dataSource = 'openfoodfacts';
            decisionLog.push(`✅ OpenFoodFacts hit: ${productData.veganStatus} (${productData.classificationMethod})`);
          } else {
            console.log('❌ Product not found in OpenFoodFacts');
            decisionLog.push('❌ Product not found in OpenFoodFacts');
          }
        } catch (offErr) {
          console.log('⚠️ OpenFoodFacts lookup error:', offErr);
          decisionLog.push('⚠️ OpenFoodFacts lookup error');
        }
      }
      
      // Step 3: Process results
      console.log('='.repeat(40));
      console.log('📋 DECISION SUMMARY:');
      decisionLog.forEach((log, index) => {
        console.log(`${index + 1}. ${log}`);
      });
      console.log('='.repeat(40));
      
      if (finalProduct) {
        console.log(`🎉 Final Result: ${finalProduct.name} (${finalProduct.veganStatus}) from ${dataSource}`);
        console.log('='.repeat(80));
        
        setProduct(finalProduct);
        addToHistory(finalProduct);
      } else {
        console.log('❌ No product data found from any source');
        console.log('='.repeat(80));
        setError(`Product not found for UPC: ${upcCode}`);
      }
    } catch (err) {
      console.log('='.repeat(80));
      console.log('🚨 PRODUCT LOOKUP ERROR (Manual Entry)');
      console.log('='.repeat(80));
      console.log(`📊 UPC: ${upcCode}`);
      console.log('❌ Error Details:');
      console.log(JSON.stringify(err, null, 2));
      console.log('='.repeat(80));
      
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
      </View>

      {/* UPC Display */}
      <View style={styles.upcContainer}>
        <Text style={styles.upcLabel}>UPC Code:</Text>
        <View style={styles.upcDisplay}>
          <TextInput
            style={styles.upcTextInput}
            value={upcCode}
            onChangeText={handleDirectInput}
            onSubmitEditing={handleLookup}
            placeholder="Enter digits"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={13}
            selectTextOnFocus
            returnKeyType="search"
          />
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
  upcTextInput: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 2,
    fontFamily: 'monospace',
    flex: 1,
    textAlign: 'center',
    padding: 0,
    margin: 0,
    minHeight: 30,
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