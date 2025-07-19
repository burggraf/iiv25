import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Platform, View, ActivityIndicator, Text, TouchableOpacity, Image, Animated } from 'react-native';
import { router } from 'expo-router';
import { isDevice } from 'expo-device';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import SimulatorBarcodeTester from '../components/SimulatorBarcodeTester';
import ProductResult from '../components/ProductResult';
import Logo from '../components/Logo';
import LogoWhite from '../components/LogoWhite';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { IngredientOCRService } from '../services/ingredientOCRService';
import { SupabaseService } from '../services/supabaseService';
import { useApp } from '../context/AppContext';
import { Product, VeganStatus } from '../types';

export default function ScannerScreen() {
  const { addToHistory } = useApp();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayHeight] = useState(new Animated.Value(0));
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [isParsingIngredients, setIsParsingIngredients] = useState(false);
  const [parsedIngredients, setParsedIngredients] = useState<string[] | null>(null);
  const processingBarcodeRef = useRef<string | null>(null);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  const handleBarcodeScanned = async ({ type, data }: BarcodeScanningResult) => {
    // Synchronous check using ref to prevent race conditions
    if (processingBarcodeRef.current === data) {
      console.log(`🚫 Ignoring duplicate/concurrent scan: ${data} (already processing)`);
      return;
    }

    // Additional check against last scanned barcode
    if (data === lastScannedBarcode) {
      console.log(`🚫 Ignoring duplicate scan: ${data} (recently scanned)`);
      return;
    }

    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
    
    // Set processing flag immediately in ref (synchronous)
    processingBarcodeRef.current = data;
    setLastScannedBarcode(data);
    setIsLoading(true);
    setError(null);
    
    try {
      let finalProduct: Product | null = null;
      let dataSource: string = '';
      let decisionLog: string[] = [];
      
      // Step 1: Check our Supabase database first
      console.log('='.repeat(80));
      console.log('🔍 HYBRID PRODUCT LOOKUP');
      console.log('='.repeat(80));
      console.log(`📊 Barcode: ${data}`);
      console.log('🏪 Step 1: Checking Supabase database...');
      
      try {
        const supabaseResult = await SupabaseService.searchProductByBarcode(data);
        
        if (supabaseResult.isRateLimited) {
          console.log('⏰ Rate limit exceeded - showing error');
          decisionLog.push('⏰ Rate limit exceeded for database lookup');
          setError(`Rate limit exceeded. You can search ${supabaseResult.rateLimitInfo?.rateLimit} products per hour on ${supabaseResult.rateLimitInfo?.subscriptionLevel} plan.`);
          showErrorOverlay();
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
              id: supabaseResult.product.ean13 || data,
              barcode: data,
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
              const offProduct = await OpenFoodFactsService.getProductByBarcode(data);
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
          const productData = await OpenFoodFactsService.getProductByBarcode(data);
          
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
        
        setScannedProduct(finalProduct);
        addToHistory(finalProduct);
        showOverlay();
      } else {
        console.log('❌ No product data found from any source');
        console.log('='.repeat(80));
        setError(`Product not found for barcode: ${data}`);
        showErrorOverlay();
      }
    } catch (err) {
      console.log('='.repeat(80));
      console.log('🚨 PRODUCT LOOKUP ERROR');
      console.log('='.repeat(80));
      console.log(`📊 Barcode: ${data}`);
      console.log('❌ Error Details:');
      console.log(JSON.stringify(err, null, 2));
      console.log('='.repeat(80));
      
      setError('Failed to lookup product. Please try again.');
      console.error('Error looking up product:', err);
      showErrorOverlay();
    } finally {
      setIsLoading(false);
      processingBarcodeRef.current = null;
      // Reset the last scanned barcode after 3 seconds to allow rescanning
      setTimeout(() => {
        setLastScannedBarcode(null);
      }, 3000);
    }
  };

  const showOverlay = () => {
    // Use larger height if product is UNKNOWN (to accommodate scan button)
    const height = scannedProduct?.veganStatus === VeganStatus.UNKNOWN ? 160 : 120;
    Animated.timing(overlayHeight, {
      toValue: height,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const showErrorOverlay = () => {
    Animated.timing(overlayHeight, {
      toValue: 120, // Increased height to accommodate button
      duration: 300,
      useNativeDriver: false,
    }).start();
    
    // Don't auto-hide error overlay anymore since it has interaction
  };

  const hideOverlay = () => {
    Animated.timing(overlayHeight, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const handleScanIngredients = async () => {
    try {
      setIsParsingIngredients(true);
      setParsedIngredients(null);

      // Request camera permission for image picker
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission is required to scan ingredients');
        return;
      }

      // Launch camera to take photo
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled) {
        return;
      }

      if (!result.assets[0].base64) {
        setError('Failed to capture image data');
        return;
      }

      // Call ingredient OCR service with Open Food Facts data if available
      const data = await IngredientOCRService.parseIngredientsFromImage(
        result.assets[0].base64,
        scannedProduct || undefined
      );


      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.isValidIngredientsList || data.confidence < 0.7) {
        setError('Could not clearly read ingredients from the image. Please try again with better lighting.');
        return;
      }

      setParsedIngredients(data.ingredients);
      setError(null);
      
      // Update overlay to show parsed ingredients
      Animated.timing(overlayHeight, {
        toValue: 200, // Larger height for ingredients list
        duration: 300,
        useNativeDriver: false,
      }).start();

    } catch (err) {
      console.error('Error parsing ingredients:', err);
      setError('Failed to parse ingredients. Please try again.');
    } finally {
      setIsParsingIngredients(false);
    }
  };

  const handleOverlayPress = () => {
    if (scannedProduct) {
      setShowProductDetail(true);
    }
  };

  const handleBackFromDetail = () => {
    setShowProductDetail(false);
  };

  const handleCloseScanner = () => {
    router.back();
  };

  const getStatusColor = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '#4CAF50';
      case VeganStatus.VEGETARIAN:
        return '#FF9800';
      case VeganStatus.NOT_VEGAN:
        return '#F44336';
      case VeganStatus.UNKNOWN:
        return '#9E9E9E';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return 'VEGAN';
      case VeganStatus.VEGETARIAN:
        return 'VEGETARIAN';
      case VeganStatus.NOT_VEGAN:
        return 'NOT VEGAN';
      case VeganStatus.UNKNOWN:
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  };

  const getStatusIcon = (status: VeganStatus) => {
    switch (status) {
      case VeganStatus.VEGAN:
        return <LogoWhite size={24} />;
      case VeganStatus.VEGETARIAN:
        return <Text style={styles.overlayStatusIcon}>🥛</Text>;
      case VeganStatus.NOT_VEGAN:
        return <Text style={styles.overlayStatusIcon}>🥩</Text>;
      case VeganStatus.UNKNOWN:
        return <Text style={styles.overlayUnknownIcon}>?</Text>;
      default:
        return <Text style={styles.overlayUnknownIcon}>?</Text>;
    }
  };

  // Show product detail screen
  if (showProductDetail && scannedProduct) {
    return (
      <ProductResult 
        product={scannedProduct} 
        onBack={handleBackFromDetail}
      />
    );
  }

  if (hasPermission === null) {
    return (
      <View style={styles.permissionContainer}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>No access to camera</Text>
        <Text style={styles.permissionSubText}>
          Please enable camera permissions in your device settings to scan barcodes.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCloseScanner}>
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
          📷 Point your camera at a product barcode
        </Text>
      </View>

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        {!isDevice || Platform.OS === 'web' ? (
          <SimulatorBarcodeTester onBarcodeScanned={handleBarcodeScanned} />
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
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
          </>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Looking up product...</Text>
          </View>
        )}

        {/* Product Overlay */}
        <Animated.View style={[styles.productOverlay, { height: overlayHeight }]}>
          {parsedIngredients ? (
            <View style={styles.overlayIngredientsContent}>
              <Text style={styles.overlayIngredientsTitle}>Parsed Ingredients:</Text>
              <View style={styles.ingredientsList}>
                {parsedIngredients.slice(0, 6).map((ingredient, index) => (
                  <Text key={index} style={styles.ingredientItem}>• {ingredient}</Text>
                ))}
                {parsedIngredients.length > 6 && (
                  <Text style={styles.ingredientItem}>... and {parsedIngredients.length - 6} more</Text>
                )}
              </View>
              <TouchableOpacity 
                style={styles.dismissButton} 
                onPress={() => {
                  setParsedIngredients(null);
                  hideOverlay();
                }}
              >
                <Text style={styles.dismissButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : scannedProduct && !error ? (
            <View style={styles.overlayContent}>
              <TouchableOpacity style={styles.overlayProductInfo} onPress={handleOverlayPress}>
                <View style={styles.overlayLeft}>
                  {scannedProduct.imageUrl && (
                    <Image source={{ uri: scannedProduct.imageUrl }} style={styles.overlayImage} />
                  )}
                </View>
                <View style={styles.overlayCenter}>
                  <Text style={styles.overlayProductName} numberOfLines={1}>
                    {scannedProduct.name}
                  </Text>
                  {scannedProduct.brand && (
                    <Text style={styles.overlayProductBrand} numberOfLines={1}>
                      {scannedProduct.brand}
                    </Text>
                  )}
                </View>
                <View style={styles.overlayRight}>
                  <View style={[styles.overlayStatusBadge, { backgroundColor: getStatusColor(scannedProduct.veganStatus) }]}>
                    {getStatusIcon(scannedProduct.veganStatus)}
                    <Text style={styles.overlayStatusText}>
                      {getStatusText(scannedProduct.veganStatus)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              {scannedProduct.veganStatus === VeganStatus.UNKNOWN && (
                <TouchableOpacity 
                  style={styles.scanIngredientsButtonSmall} 
                  onPress={handleScanIngredients}
                  disabled={isParsingIngredients}
                >
                  {isParsingIngredients ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.scanIngredientsButtonTextSmall}>📷 Scan Ingredients</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : error && !parsedIngredients ? (
            <View style={styles.overlayErrorContent}>
              <Text style={styles.overlayErrorText}>❌ {error}</Text>
              <TouchableOpacity 
                style={styles.scanIngredientsButton} 
                onPress={handleScanIngredients}
                disabled={isParsingIngredients}
              >
                {isParsingIngredients ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.scanIngredientsButtonText}>📷 Scan Ingredients</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>
      </View>
      
      {/* Bottom Instructions */}
      <View style={styles.bottomInstructions}>
        <Text style={styles.tipText}>
          💡 Scan continuously - tap product card to view details
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
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionSubText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
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
    position: 'relative',
  },
  camera: {
    flex: 1,
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 12,
  },
  productOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  overlayContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  overlayProductInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  overlayLeft: {
    width: 60,
    height: 60,
    marginRight: 12,
  },
  overlayImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  overlayCenter: {
    flex: 1,
    marginRight: 12,
  },
  overlayProductName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  overlayProductBrand: {
    fontSize: 14,
    color: '#666',
  },
  overlayRight: {
    alignItems: 'flex-end',
  },
  overlayStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 100,
    justifyContent: 'center',
  },
  overlayStatusIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  overlayUnknownIcon: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginRight: 4,
  },
  overlayStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  overlayErrorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  overlayErrorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 12,
  },
  scanIngredientsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 140,
    alignItems: 'center',
  },
  scanIngredientsButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  scanIngredientsButtonSmall: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
  },
  scanIngredientsButtonTextSmall: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayIngredientsContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  overlayIngredientsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  ingredientsList: {
    flex: 1,
    marginBottom: 12,
  },
  ingredientItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  dismissButton: {
    backgroundColor: '#666',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'center',
  },
  dismissButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
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