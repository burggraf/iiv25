import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import Logo from '../components/Logo';
import HistoryItem from '../components/HistoryItem';
import ProductResult from '../components/ProductResult';
import { Product } from '../types';

export default function HistoryScreen() {
  const { scanHistory, clearHistory, isLoading } = useApp();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const handleProductPress = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleBackToHistory = () => {
    setSelectedProduct(null);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all scan history? This action cannot be undone.',
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
      <View style={styles.container}>
        <ProductResult product={selectedProduct} onBack={handleBackToHistory} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleBackToHistory}>
            <Text style={styles.backToHistoryButton}>
              ← Back to History
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
      {!isLoading && scanHistory.length === 0 && (
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
      {scanHistory.length > 0 && (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.historyCount}>
              {scanHistory.length} product{scanHistory.length !== 1 ? 's' : ''} scanned
            </Text>
            <TouchableOpacity onPress={handleClearHistory}>
              <Text style={styles.clearButton}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={scanHistory}
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
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appTitle: {
    fontSize: 20,
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
  buttonContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  backToHistoryButton: {
    fontSize: 18,
    color: '#007AFF',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    fontWeight: 'bold',
  },
});