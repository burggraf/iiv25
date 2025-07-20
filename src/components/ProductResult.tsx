import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Product, VeganStatus } from '../types';
import Logo from './Logo';
import LogoWhite from './LogoWhite';
import { supabase } from '../services/supabaseClient';

interface ProductResultProps {
  product: Product;
  onBack: () => void;
}

interface IngredientClassification {
  title: string;
  class: string;
}

export default function ProductResult({ product, onBack }: ProductResultProps) {
  const [ingredientClassifications, setIngredientClassifications] = useState<IngredientClassification[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  // Fetch ingredient classifications from database
  useEffect(() => {
    const fetchIngredientClassifications = async () => {
      if (!product.barcode) return;
      
      setLoadingIngredients(true);
      try {
        const { data, error } = await supabase.rpc('get_ingredients_for_upc', {
          input_upc: product.barcode
        });

        if (error) {
          console.error('Error fetching ingredient classifications:', error);
        } else {
          setIngredientClassifications(data || []);
        }
      } catch (err) {
        console.error('Exception fetching ingredient classifications:', err);
      } finally {
        setLoadingIngredients(false);
      }
    };

    fetchIngredientClassifications();
  }, [product.barcode]);

  // Keep minimal logging for ingredient classifications
  console.log('Ingredient classifications loaded:', ingredientClassifications.length);

  const getVerdictColor = (verdict: string): string => {
    switch (verdict) {
      case 'vegan':
        return '#4CAF50'; // Green
      case 'vegetarian':
        return '#FF9800'; // Orange/Yellow
      case 'not_vegan':
        return '#F44336'; // Red
      case 'unknown':
        return '#9E9E9E'; // Gray
      default:
        return '#9E9E9E';
    }
  };

  const getVerdictText = (verdict: string): string => {
    switch (verdict) {
      case 'vegan':
        return 'VEGAN';
      case 'vegetarian':
        return 'VEGETARIAN';
      case 'not_vegan':
        return 'NOT VEGAN';
      case 'unknown':
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  };

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

  const getStatusIcon = (status: VeganStatus) => {
    switch (status) {
      case VeganStatus.VEGAN:
        return <LogoWhite size={64} />;
      case VeganStatus.VEGETARIAN:
        return <Text style={styles.statusIconText}>🥛</Text>;
      case VeganStatus.NOT_VEGAN:
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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centerHeader}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Is It Vegan?</Text>
        </View>
        <View style={styles.rightSpacer} />
      </View>
      
      <ScrollView style={styles.scrollView}>
        {/* Status Header */}
        <View style={[styles.statusHeader, { backgroundColor: getStatusColor(product.veganStatus) }]}>
          <View style={styles.statusIconContainer}>{getStatusIcon(product.veganStatus)}</View>
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

      {/* Non-Vegan Ingredients Analysis */}
      {product.nonVeganIngredients && product.nonVeganIngredients.length > 0 && (
        <View style={styles.analysisSection}>
          <Text style={styles.analysisSectionTitle}>⚠️ Classification Analysis</Text>
          <Text style={styles.analysisSubtitle}>
            {product.veganStatus === 'vegetarian' 
              ? 'Contains dairy or eggs but no meat:' 
              : product.veganStatus === 'not_vegan'
              ? 'Contains animal products:'
              : 'Uncertain ingredients:'
            }
          </Text>
          <View style={styles.analysisItemsList}>
            {product.nonVeganIngredients.map((detail, index) => (
              <View key={index} style={styles.analysisItem}>
                <Text style={styles.analysisIngredient}>• {detail.ingredient}</Text>
                <Text style={styles.analysisReason}>{detail.reason}</Text>
                <View style={styles.analysisLabels}>
                  <Text style={[styles.analysisLabel, { 
                    backgroundColor: getVerdictColor(detail.verdict)
                  }]}>
                    {getVerdictText(detail.verdict)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {product.classificationMethod && (
            <Text style={styles.classificationMethod}>
              Classification method: {product.classificationMethod}
            </Text>
          )}
        </View>
      )}

      {/* Unknown Ingredients */}
      {ingredientClassifications.filter(ing => ing.class === null || ing.class === 'null').length > 0 && (
        <View style={styles.unknownIngredientsSection}>
          <Text style={styles.unknownSectionTitle}>⚠️ Unknown Ingredients:</Text>
          <Text style={styles.unknownSubtitle}>
            The following ingredients are unknown and may alter the outcome of this diagnosis - please double-check these ingredients individually.
          </Text>
          <View style={styles.unknownIngredientsList}>
            {ingredientClassifications
              .filter(ing => ing.class === null || ing.class === 'null')
              .map((ingredient, index) => (
                <Text key={index} style={styles.unknownIngredient}>
                  • {ingredient.title}
                </Text>
              ))}
          </View>
        </View>
      )}

      {/* Ingredients */}
      {product.ingredients.length > 0 && (
        <View style={styles.ingredientsSection}>
          <Text style={styles.sectionTitle}>All Ingredients:</Text>
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
          ⚠️ This analysis is based on our database and Open Food Facts ingredient data. 
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
    width: 60, // Same width as back button for centering
  },
  statusHeader: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconContainer: {
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconText: {
    fontSize: 48,
  },
  unknownIconText: {
    fontSize: 60,
    color: 'white',
    fontWeight: 'bold',
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
  analysisSection: {
    padding: 20,
    backgroundColor: '#fff5f5',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  analysisSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  analysisSubtitle: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    fontWeight: '500',
  },
  analysisItemsList: {
    gap: 12,
  },
  analysisItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  analysisIngredient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  analysisReason: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  analysisLabels: {
    flexDirection: 'row',
    gap: 8,
  },
  analysisLabel: {
    fontSize: 12,
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  classificationMethod: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  unknownIngredientsSection: {
    padding: 20,
    backgroundColor: '#fff8e1',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  unknownSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 8,
  },
  unknownSubtitle: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
    lineHeight: 20,
  },
  unknownIngredientsList: {
    paddingLeft: 8,
  },
  unknownIngredient: {
    fontSize: 14,
    color: '#FF9800',
    marginBottom: 4,
    fontWeight: '500',
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