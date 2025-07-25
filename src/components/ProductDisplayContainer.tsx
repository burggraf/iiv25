import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import ProductResult from './ProductResult';
import { Product } from '../types';

interface ProductDisplayContainerProps {
  product: Product;
  onBack: () => void;
  backButtonText: string;
  onProductUpdated?: (updatedProduct: Product) => void;
  useAbsolutePositioning?: boolean;
}

export default function ProductDisplayContainer({
  product,
  onBack,
  backButtonText,
  onProductUpdated,
  useAbsolutePositioning = true,
}: ProductDisplayContainerProps) {
  const containerStyle = useAbsolutePositioning ? styles.overlayContainer : styles.fullScreenContainer;
  
  return (
    <View style={containerStyle}>
      <ProductResult 
        product={product} 
        onBack={onBack} 
        hideHeaderBackButton={true}
        onProductUpdated={onProductUpdated} 
      />
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>
            {backButtonText}
          </Text>
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
  backButton: {
    fontSize: 18,
    color: '#007AFF',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    fontWeight: 'bold',
  },
});