import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Product, VeganStatus } from '../types';
import Logo from './Logo';

interface ProductResultProps {
  product: Product;
}

export default function ProductResult({ product }: ProductResultProps) {
  const getStatusColor = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '#4CAF50'; // Green
      case VeganStatus.VEGETARIAN:
        return '#FF9800'; // Orange
      case VeganStatus.NOT_VEGAN:
        return '#F44336'; // Red
      case VeganStatus.UNKNOWN:
        return '#9E9E9E'; // Gray
      default:
        return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '🌱';
      case VeganStatus.VEGETARIAN:
        return '🥛';
      case VeganStatus.NOT_VEGAN:
        return '🥩';
      case VeganStatus.UNKNOWN:
        return '❓';
      default:
        return '❓';
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

  const getStatusDescription = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return 'This product contains no animal-derived ingredients.';
      case VeganStatus.VEGETARIAN:
        return 'This product may contain dairy or eggs but no meat.';
      case VeganStatus.NOT_VEGAN:
        return 'This product contains animal-derived ingredients.';
      case VeganStatus.UNKNOWN:
        return 'Could not determine vegan status. Check ingredients manually.';
      default:
        return 'Could not determine vegan status.';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App Header */}
      <View style={styles.appHeader}>
        <Logo size={32} />
        <Text style={styles.appTitle}>Is It Vegan?</Text>
      </View>
      
      <ScrollView style={styles.scrollView}>
        {/* Status Header */}
        <View style={[styles.statusHeader, { backgroundColor: getStatusColor(product.veganStatus) }]}>
          <Text style={styles.statusIcon}>{getStatusIcon(product.veganStatus)}</Text>
          <Text style={styles.statusText}>{getStatusText(product.veganStatus)}</Text>
        </View>

      {/* Product Info */}
      <View style={styles.productInfo}>
        {product.imageUrl && (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
        )}
        
        <Text style={styles.productName}>{product.name}</Text>
        
        {product.brand && (
          <Text style={styles.productBrand}>{product.brand}</Text>
        )}
        
        <Text style={styles.productBarcode}>Barcode: {product.barcode}</Text>
        
        <Text style={styles.statusDescription}>
          {getStatusDescription(product.veganStatus)}
        </Text>
      </View>

      {/* Ingredients */}
      {product.ingredients.length > 0 && (
        <View style={styles.ingredientsSection}>
          <Text style={styles.sectionTitle}>Ingredients:</Text>
          <View style={styles.ingredientsList}>
            {product.ingredients.map((ingredient, index) => (
              <Text key={index} style={styles.ingredient}>
                • {ingredient}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ This analysis is based on ingredient text from Open Food Facts. 
          Always check the product label for the most accurate information.
        </Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  scrollView: {
    flex: 1,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  statusHeader: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  productInfo: {
    padding: 20,
    alignItems: 'center',
  },
  productImage: {
    width: 150,
    height: 150,
    borderRadius: 8,
    marginBottom: 16,
  },
  productName: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  productBrand: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  productBarcode: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    lineHeight: 22,
  },
  ingredientsSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  ingredientsList: {
    paddingLeft: 8,
  },
  ingredient: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  disclaimer: {
    padding: 20,
    backgroundColor: '#f9f9f9',
    marginTop: 20,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});