import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Product, VeganStatus } from '../types';
import { ProductImageUrlService } from '../services/productImageUrlService';
import LogoWhite from './LogoWhite';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

interface SwipeableHistoryItemProps {
  product: Product;
  onPress: () => void;
  onDelete: (barcode: string) => void;
  isNew?: boolean;
}

export default function SwipeableHistoryItem({ 
  product, 
  onPress, 
  onDelete, 
  isNew = false 
}: SwipeableHistoryItemProps) {
  // FORCE IMAGE REFRESH - Add timestamp when image URL changes to bust browser cache
  const resolvedImageUrl = useMemo(() => {
    if (!product.imageUrl) return undefined;
    
    const baseUrl = ProductImageUrlService.resolveImageUrl(product.imageUrl, product.barcode);
    if (!baseUrl) return undefined;
    
    // Add cache busting timestamp to force browser to reload image
    const timestamp = Date.now();
    const separator = baseUrl.includes('?') ? '&' : '?';
    const finalUrl = `${baseUrl}${separator}cache_bust=${timestamp}`;
    
    console.log(`📱 [SwipeableHistoryItem] Image URL for ${product.barcode}:`, finalUrl);
    return finalUrl;
  }, [product.imageUrl, product.barcode, product.lastScanned]); // Add lastScanned to trigger refresh

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

  const handleDelete = () => {
    Alert.alert(
      'Remove Item',
      `Remove "${product.name}" from your scan history?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDelete(product.barcode),
        },
      ]
    );
  };

  const renderRightAction = (progress: Animated.AnimatedAddition) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 0],
    });

    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    });

    const pressHandler = () => {
      handleDelete();
    };

    return (
      <View style={styles.rightActionContainer}>
        <Animated.View 
          style={[
            styles.actionContainer, 
            { 
              transform: [{ translateX: trans }, { scale }]
            }
          ]}
        >
          <TouchableOpacity
            style={styles.deleteAction}
            onPress={pressHandler}
            activeOpacity={0.8}
          >
            <MaterialIcons name="delete" size={20} color="white" />
            <Text style={styles.actionText}>Remove</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <Swipeable
        renderRightActions={renderRightAction}
        rightThreshold={30}
        overshootRight={false}
        friction={2}
      >
        <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
          <View style={styles.content}>
            {/* Product Image */}
            {resolvedImageUrl ? (
              <Image source={{ uri: resolvedImageUrl }} style={styles.productImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Text style={styles.placeholderText}>📦</Text>
              </View>
            )}

            {/* Product Info */}
            <View style={styles.productInfo}>
              <View style={styles.productNameContainer}>
                {isNew && (
                  <MaterialIcons 
                    name="star" 
                    size={16} 
                    color="#2563EB" 
                    style={styles.newStarIcon} 
                  />
                )}
                <Text style={styles.productName} numberOfLines={2}>
                  {product.name}
                </Text>
              </View>
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
      </Swipeable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  container: {
    backgroundColor: 'white',
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
  productNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  newStarIcon: {
    marginRight: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
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
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    width: 110,
    height: 65,
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
  rightActionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  actionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: 92, // Match the container height (padding + content)
  },
  deleteAction: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: 80,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  actionText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});