import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { SupabaseService } from '../services/supabaseService';
import { ProductImageUrlService } from '../services/productImageUrlService';
import Logo from '../components/Logo';
import HistoryItem from '../components/HistoryItem';
import ProductDisplayContainer from '../components/ProductDisplayContainer';
import { Product } from '../types';

export default function HistoryScreen() {
  const { scanHistory, historyItems, clearHistory, isLoading, updateHistoryProduct } = useApp();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayProducts, setDisplayProducts] = useState<Product[]>([]);

  // Initialize display products from cached data
  useEffect(() => {
    setDisplayProducts(scanHistory);
    
    // Background refresh of recent items (if online and has items)
    if (historyItems.length > 0) {
      refreshLatestItems();
    }
  }, [scanHistory, historyItems, refreshLatestItems]);

  // Convert Supabase products to our Product format
  const convertSupabaseToProduct = useCallback((supabaseProduct: any, originalBarcode: string): Product => {
    return {
      id: supabaseProduct.upc || supabaseProduct.ean13 || originalBarcode,
      barcode: supabaseProduct.upc || supabaseProduct.ean13 || originalBarcode,
      name: supabaseProduct.product_name || 'Unknown Product',
      brand: supabaseProduct.brand,
      ingredients: supabaseProduct.ingredients ? 
        supabaseProduct.ingredients.split(',').map((ing: string) => ing.trim()) : [],
      veganStatus: SupabaseService.mapClassificationToVeganStatus(supabaseProduct.classification),
      imageUrl: ProductImageUrlService.resolveImageUrl(supabaseProduct.imageurl, originalBarcode) || undefined,
      issues: supabaseProduct.issues,
      lastScanned: new Date(),
      classificationMethod: 'product-level' as const
    };
  }, []);

  // Background refresh of latest items
  const refreshLatestItems = useCallback(async () => {
    if (historyItems.length === 0) return;
    
    try {
      const barcodes = historyItems.slice(0, 25).map(item => item.barcode);
      const freshProducts = await SupabaseService.getProductsByBarcodes(barcodes);
      
      // Convert to Product format and update display
      const refreshedProducts = freshProducts.map(supabaseProduct => {
        const originalBarcode = barcodes.find(bc => 
          bc === supabaseProduct.upc || bc === supabaseProduct.ean13
        ) || supabaseProduct.upc || supabaseProduct.ean13 || '';
        
        return convertSupabaseToProduct(supabaseProduct, originalBarcode);
      });

      // Update display products
      setDisplayProducts(prev => {
        const updatedProducts = [...prev];
        
        refreshedProducts.forEach(refreshedProduct => {
          const index = updatedProducts.findIndex(p => p.barcode === refreshedProduct.barcode);
          if (index >= 0) {
            // Preserve the original scan time
            const originalScanTime = updatedProducts[index].lastScanned;
            updatedProducts[index] = { ...refreshedProduct, lastScanned: originalScanTime };
            
            // Update the context cache
            updateHistoryProduct(refreshedProduct.barcode, refreshedProduct);
          }
        });
        
        return updatedProducts;
      });
    } catch (error) {
      console.error('Failed to refresh history items:', error);
      // Fail silently - cached data is still displayed
    }
  }, [historyItems, convertSupabaseToProduct, updateHistoryProduct]);

  // Manual refresh (pull-to-refresh)
  const onRefresh = useCallback(async () => {
    if (historyItems.length === 0) return;
    
    setIsRefreshing(true);
    try {
      await refreshLatestItems();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLatestItems, historyItems.length]);

  const handleProductPress = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleBackToHistory = () => {
    setSelectedProduct(null);
  };

  const handleProductUpdated = (updatedProduct: Product) => {
    // Update the selected product state to reflect changes
    setSelectedProduct(updatedProduct);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: clearHistory,
        },
      ]
    );
  };

  // Show selected product details
  if (selectedProduct) {
    return (
      <ProductDisplayContainer
        product={selectedProduct}
        onBack={handleBackToHistory}
        backButtonText="← Back to History"
        onProductUpdated={handleProductUpdated}
        useAbsolutePositioning={false}
        iconType="history"
      />
    );
  }

  // Show history list
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Logo size={32} />
        <Text style={styles.appTitle}>Scan History</Text>
      </View>

      {/* Empty State */}
      {!isLoading && displayProducts.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No scans yet</Text>
          <Text style={styles.emptyText}>
            Your scanned products will appear here.{'\n'}
            Try scanning a barcode or entering a UPC manually!
          </Text>
        </View>
      )}

      {/* History List */}
      {displayProducts.length > 0 && (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.historyCount}>
              {displayProducts.length} product{displayProducts.length !== 1 ? 's' : ''} scanned
            </Text>
            <TouchableOpacity onPress={handleClearHistory}>
              <Text style={styles.clearButton}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={displayProducts}
            keyExtractor={(item) => `${item.barcode}-${item.lastScanned?.getTime()}`}
            renderItem={({ item }) => (
              <HistoryItem
                product={item}
                onPress={() => handleProductPress(item)}
              />
            )}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl 
                refreshing={isRefreshing}
                onRefresh={onRefresh}
              />
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f8f9fa',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyCount: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  clearButton: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '500',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
});