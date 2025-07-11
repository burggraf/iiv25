import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '../components/Logo';
import SearchModeSelector, { SearchMode } from '../components/SearchModeSelector';
import ProductSearchItem from '../components/ProductSearchItem';
import IngredientResult from '../components/IngredientResult';
import ProductResult from '../components/ProductResult';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { IngredientService, IngredientInfo } from '../services/ingredientDatabase';
import { useApp } from '../context/AppContext';
import { Product } from '../types';

export default function SearchScreen() {
  const { addToHistory } = useApp();
  const [searchMode, setSearchMode] = useState<SearchMode>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Product search state
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Ingredient search state
  const [ingredientResult, setIngredientResult] = useState<IngredientInfo | null>(null);
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Search Required', 'Please enter a search term.');
      return;
    }

    setIsLoading(true);
    
    if (searchMode === 'products') {
      await searchProducts(searchQuery, 1);
    } else {
      searchIngredient(searchQuery);
    }
    
    setIsLoading(false);
  };

  const searchProducts = async (query: string, page: number) => {
    try {
      const result = await OpenFoodFactsService.searchProducts(query, page);
      
      if (page === 1) {
        setProductResults(result.products);
      } else {
        setProductResults(prev => [...prev, ...result.products]);
      }
      
      setCurrentPage(result.currentPage);
      setHasNextPage(result.hasNextPage);
      setTotalResults(result.totalCount);
      
      if (result.products.length === 0 && page === 1) {
        Alert.alert('No Results', `No products found for "${query}". Try a different search term.`);
      }
    } catch (err) {
      console.error('Search error:', err);
      Alert.alert('Search Error', 'Failed to search products. Please try again.');
    }
  };

  const searchIngredient = (query: string) => {
    const result = IngredientService.searchIngredient(query);
    
    if (result) {
      setIngredientResult(result);
    } else {
      Alert.alert(
        'Ingredient Not Found',
        `We don't have information about "${query}" in our database. Try a more common ingredient name or contact the manufacturer for clarification.`
      );
    }
  };

  const handleLoadMore = () => {
    if (!isLoading && hasNextPage) {
      setIsLoading(true);
      searchProducts(searchQuery, currentPage + 1);
      setIsLoading(false);
    }
  };

  const handleProductSelect = async (product: Product) => {
    // Get full product details
    setIsLoading(true);
    try {
      const fullProduct = await OpenFoodFactsService.getProductByBarcode(product.barcode);
      if (fullProduct) {
        setSelectedProduct(fullProduct);
        addToHistory(fullProduct);
      } else {
        Alert.alert('Error', 'Could not load product details.');
      }
    } catch (err) {
      console.error('Product details error:', err);
      Alert.alert('Error', 'Failed to load product details.');
    }
    setIsLoading(false);
  };

  const handleBackToSearch = () => {
    setSelectedProduct(null);
    setIngredientResult(null);
  };

  const handleNewSearch = () => {
    setSearchQuery('');
    setProductResults([]);
    setIngredientResult(null);
    setSelectedProduct(null);
    setCurrentPage(1);
    setHasNextPage(false);
    setTotalResults(0);
  };

  // Show selected product details
  if (selectedProduct) {
    return (
      <View style={styles.container}>
        <ProductResult product={selectedProduct} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleBackToSearch}>
            <Text style={styles.backButton}>← Back to Search Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show ingredient result
  if (ingredientResult) {
    return <IngredientResult ingredient={ingredientResult} onBack={handleBackToSearch} />;
  }

  // Main search interface
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Logo size={32} />
        <Text style={styles.appTitle}>Search</Text>
      </View>

      {/* Search Mode Selector */}
      <SearchModeSelector
        selectedMode={searchMode}
        onModeChange={(mode) => {
          setSearchMode(mode);
          handleNewSearch();
        }}
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            searchMode === 'products'
              ? 'Search for products (e.g., "organic oat milk")'
              : 'Search for ingredients (e.g., "milk", "tofu")'
          }
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.searchButton, !searchQuery.trim() && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={!searchQuery.trim() || isLoading}
        >
          <Text style={[styles.searchButtonText, !searchQuery.trim() && styles.searchButtonTextDisabled]}>
            🔍
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {isLoading && productResults.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            {searchMode === 'products' ? 'Searching products...' : 'Looking up ingredient...'}
          </Text>
        </View>
      )}

      {/* Product Results */}
      {searchMode === 'products' && productResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsHeader}>
            {totalResults} product{totalResults !== 1 ? 's' : ''} found
          </Text>
          
          <FlatList
            data={productResults}
            keyExtractor={(item) => item.barcode}
            renderItem={({ item }) => (
              <ProductSearchItem
                product={item}
                onPress={() => handleProductSelect(item)}
              />
            )}
            style={styles.resultsList}
            contentContainerStyle={styles.resultsListContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoading && productResults.length > 0 ? (
                <View style={styles.loadMoreContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.loadMoreText}>Loading more...</Text>
                </View>
              ) : hasNextPage ? (
                <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreButtonText}>Load More Results</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
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
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  searchButton: {
    marginLeft: 12,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#ccc',
  },
  searchButtonText: {
    fontSize: 20,
  },
  searchButtonTextDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resultsList: {
    flex: 1,
  },
  resultsListContent: {
    paddingVertical: 8,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  loadMoreButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  loadMoreButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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