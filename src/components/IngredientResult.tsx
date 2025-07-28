import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VeganStatus } from '../types';
import { IngredientInfo } from '../services/ingredientDatabase';
import Logo from './Logo';
import LogoWhite from './LogoWhite';
import SearchIcon from './icons/SearchIcon';

interface IngredientResultProps {
  ingredient: IngredientInfo;
  onBack: () => void;
}

export default function IngredientResult({ ingredient, onBack }: IngredientResultProps) {
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
        return <LogoWhite size={64} />;
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

  const getStatusDescription = (status: VeganStatus): string => {
    switch (status) {
      case VeganStatus.VEGAN:
        return 'This ingredient is plant-based and suitable for vegans.';
      case VeganStatus.VEGETARIAN:
        return 'This ingredient may contain dairy or eggs but no meat.';
      case VeganStatus.NOT_VEGETARIAN:
        return 'This ingredient is derived from animals and is not vegetarian.';
      case VeganStatus.UNKNOWN:
        return 'The vegan status of this ingredient depends on its source or processing method.';
      default:
        return 'Could not determine vegan status.';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.centerHeader}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Is It Vegan?</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Status Header */}
        <View style={[styles.statusHeader, { backgroundColor: getStatusColor(ingredient.status) }]}>
          <View style={styles.statusIconContainer}>{getStatusIcon(ingredient.status)}</View>
          <Text style={styles.statusText}>{getStatusText(ingredient.status)}</Text>
        </View>

        {/* Ingredient Info */}
        <View style={styles.ingredientInfo}>
          <Text style={styles.ingredientName}>{ingredient.name}</Text>
          <Text style={styles.statusDescription}>
            {getStatusDescription(ingredient.status)}
          </Text>
          <Text style={styles.description}>{ingredient.description}</Text>
        </View>

        {/* Alternatives */}
        {ingredient.alternatives && ingredient.alternatives.length > 0 && (
          <View style={styles.alternativesSection}>
            <Text style={styles.sectionTitle}>Vegan Alternatives:</Text>
            <View style={styles.alternativesList}>
              {ingredient.alternatives.map((alternative, index) => (
                <View key={index} style={styles.alternativeItem}>
                  <Text style={styles.alternativeText}>• {alternative}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠️ This information is based on general knowledge about ingredients. 
            Processing methods and sources can vary. When in doubt, contact the manufacturer 
            or look for certified vegan products.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Back Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonContainer}>
          <View style={styles.backButtonContent}>
            <SearchIcon size={18} color="#666" />
            <Text style={styles.backButton}>Back to Search Results</Text>
          </View>
        </TouchableOpacity>
      </View>
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
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  centerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
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
  scrollView: {
    flex: 1,
  },
  statusHeader: {
    padding: 24,
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
  ingredientInfo: {
    padding: 24,
    alignItems: 'center',
  },
  ingredientName: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  statusDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    lineHeight: 22,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
  },
  alternativesSection: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  alternativesList: {
    gap: 8,
  },
  alternativeItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
  },
  alternativeText: {
    fontSize: 16,
    color: '#333',
  },
  disclaimer: {
    padding: 24,
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