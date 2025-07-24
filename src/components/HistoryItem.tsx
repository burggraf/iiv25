import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Product, VeganStatus } from '../types';
import LogoWhite from './LogoWhite';

interface HistoryItemProps {
  product: Product;
  onPress: () => void;
}

export default function HistoryItem({ product, onPress }: HistoryItemProps) {
  const getStatusColor = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return '#4CAF50';
      case VeganStatus.VEGETARIAN:
        return '#FF9800';
      case VeganStatus.NOT_VEGETARIAN:
        return '#F44336';
      case VeganStatus.UNKNOWN:
        return '#9E9E9E';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: VeganStatus) => {
    switch (status) {
      case VeganStatus.VEGAN:
        return <LogoWhite size={28} />;
      case VeganStatus.VEGETARIAN:
        return <Text style={styles.statusIconText}>🥛</Text>;
      case VeganStatus.NOT_VEGETARIAN:
        return <Text style={styles.statusIconText}>🥩</Text>;
      case VeganStatus.UNKNOWN:
        return <Text style={styles.unknownIconText}>?</Text>;
      default:
        return <Text style={styles.unknownIconText}>?</Text>;
    }
  };

  const getStatusText = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return 'VEGAN';
      case VeganStatus.VEGETARIAN:
        return 'VEGETARIAN';
      case VeganStatus.NOT_VEGETARIAN:
        return 'NOT VEGETARIAN';
      case VeganStatus.UNKNOWN:
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
        {/* Product Image */}
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>📦</Text>
          </View>
        )}

        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          {product.brand && (
            <Text style={styles.productBrand} numberOfLines={1}>
              {product.brand}
            </Text>
          )}
          <Text style={styles.barcode}>UPC: {product.barcode}</Text>
          <Text style={styles.scanTime}>{formatDate(product.lastScanned!)}</Text>
        </View>

        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(product.veganStatus) }]}>
            <View style={styles.statusIconContainer}>{getStatusIcon(product.veganStatus)}</View>
            <Text style={styles.statusText}>{getStatusText(product.veganStatus)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholderImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  productBrand: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  barcode: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  scanTime: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  statusContainer: {
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    width: 110,
    height: 50,
    justifyContent: 'center',
  },
  statusIconContainer: {
    marginBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconText: {
    fontSize: 16,
  },
  unknownIconText: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
});