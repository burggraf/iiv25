import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type SearchMode = 'products' | 'ingredients';

interface SearchModeSelectorProps {
  selectedMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

export default function SearchModeSelector({ selectedMode, onModeChange }: SearchModeSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>What would you like to search?</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            selectedMode === 'products' && styles.selectedButton
          ]}
          onPress={() => onModeChange('products')}
          activeOpacity={0.7}
        >
          <Text style={styles.modeIcon}>🛒</Text>
          <Text style={[
            styles.modeText,
            selectedMode === 'products' && styles.selectedText
          ]}>
            Products
          </Text>
          <Text style={[
            styles.modeDescription,
            selectedMode === 'products' && styles.selectedDescription
          ]}>
            Search for food products by name
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeButton,
            selectedMode === 'ingredients' && styles.selectedButton
          ]}
          onPress={() => onModeChange('ingredients')}
          activeOpacity={0.7}
        >
          <Text style={styles.modeIcon}>🥬</Text>
          <Text style={[
            styles.modeText,
            selectedMode === 'ingredients' && styles.selectedText
          ]}>
            Ingredients
          </Text>
          <Text style={[
            styles.modeDescription,
            selectedMode === 'ingredients' && styles.selectedDescription
          ]}>
            Check if specific ingredients are vegan
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  selectedButton: {
    backgroundColor: '#e3f2fd',
    borderColor: '#007AFF',
  },
  modeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  modeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  selectedText: {
    color: '#007AFF',
  },
  modeDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  selectedDescription: {
    color: '#007AFF',
  },
});