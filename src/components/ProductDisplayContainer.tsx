import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import ProductResult from './ProductResult';
import ManualIcon from './icons/ManualIcon';
import BarcodeIcon from './icons/BarcodeIcon';
import HistoryIcon from './icons/HistoryIcon';
import SearchIcon from './icons/SearchIcon';
import { Product } from '../types';
import { useApp } from '../context/AppContext';

interface ProductDisplayContainerProps {
  product: Product;
  onBack: () => void;
  backButtonText: string;
  onProductUpdated?: (updatedProduct: Product) => void;
  useAbsolutePositioning?: boolean;
  iconType?: 'manual' | 'scanner' | 'history' | 'search';
}

export default function ProductDisplayContainer({
  product,
  onBack,
  backButtonText,
  onProductUpdated,
  useAbsolutePositioning = true,
  iconType = 'manual',
}: ProductDisplayContainerProps) {
  const { markAsViewed } = useApp();
  const containerStyle = useAbsolutePositioning ? styles.overlayContainer : styles.fullScreenContainer;

  // Mark as viewed when product is displayed
  useEffect(() => {
    if (product?.barcode) {
      markAsViewed(product.barcode);
      console.log(`📱 Marked product ${product.barcode} as viewed`);
    }
  }, [product?.barcode, markAsViewed]);
  
  return (
    <View style={containerStyle}>
      <ProductResult 
        product={product} 
        onBack={onBack} 
        hideHeaderBackButton={true}
        onProductUpdated={onProductUpdated} 
      />
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonContainer}>
          <View style={styles.backButtonContent}>
            {iconType === 'scanner' && <BarcodeIcon size={18} color="#666" />}
            {iconType === 'history' && <HistoryIcon size={18} color="#666" />}
            {iconType === 'search' && <SearchIcon size={18} color="#666" />}
            {iconType === 'manual' && <ManualIcon size={18} color="#666" />}
            <Text style={styles.backButton}>
              {backButtonText.replace('🔢 ', '').replace('← ', '')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1000,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  buttonContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  backButtonContainer: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  backButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
});