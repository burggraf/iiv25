import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '../components/Logo';
import SearchModeSelector, { SearchMode } from '../components/SearchModeSelector';
import ProductSearchItem from '../components/ProductSearchItem';
import IngredientResult from '../components/IngredientResult';
import ProductResult from '../components/ProductResult';
import { OpenFoodFactsService } from '../services/openFoodFactsApi';
import { IngredientService, IngredientInfo } from '../services/ingredientDatabase';
import { SupabaseService, SupabaseIngredient } from '../services/supabaseService';
import { useApp } from '../context/AppContext';
import { Product, VeganStatus } from '../types';

export default function SearchScreen() {
  const { addToHistory } = useApp();
  const [searchMode, setSearchMode] = useState<SearchMode>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  
  // Product search state
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Ingredient search state
  const [ingredientResult, setIngredientResult] = useState<IngredientInfo | null>(null);
  const [supabaseIngredients, setSupabaseIngredients] = useState<SupabaseIngredient[]>([]);
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Search Required', 'Please enter a search term.');
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);
    
    if (searchMode === 'products') {
      await searchProducts(searchQuery, 1);
    } else {
      await searchIngredient(searchQuery);
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

  const searchIngredient = async (query: string) => {
    try {
      // First try Supabase database search
      const supabaseResults = await SupabaseService.searchIngredientsByTitle(query);
      
      if (supabaseResults.length > 0) {
        setSupabaseIngredients(supabaseResults);
        setIngredientResult(null); // Clear fallback result
        return;
      }
      
      // Fallback to local ingredient database
      const localResult = IngredientService.searchIngredient(query);
      
      if (localResult) {
        setIngredientResult(localResult);
        setSupabaseIngredients([]);
      } else {
        Alert.alert(
          'Ingredient Not Found',
          `We don't have information about "${query}" in our database. Try a more common ingredient name or contact the manufacturer for clarification.`
        );
        setSupabaseIngredients([]);
        setIngredientResult(null);
      }
    } catch (error) {
      console.error('Ingredient search error:', error);
      
      // Fallback to local database on error
      const localResult = IngredientService.searchIngredient(query);
      
      if (localResult) {
        setIngredientResult(localResult);
        setSupabaseIngredients([]);
      } else {
        Alert.alert(
          'Search Error',
          'Failed to search ingredients. Please check your connection and try again.'
        );
      }
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
    setSupabaseIngredients([]);
  };

  const handleNewSearch = () => {
    setSearchQuery('');
    setProductResults([]);
    setIngredientResult(null);
    setSupabaseIngredients([]);
    setSelectedProduct(null);
    setCurrentPage(1);
    setHasNextPage(false);
    setTotalResults(0);
  };

  // Convert Supabase ingredient to IngredientInfo format
  const convertSupabaseIngredient = (supabaseIngredient: SupabaseIngredient): IngredientInfo => {
    let status: VeganStatus = VeganStatus.UNKNOWN;
    
    switch (supabaseIngredient.class) {
      case 'vegan':
        status = VeganStatus.VEGAN;
        break;
      case 'vegetarian':
        status = VeganStatus.VEGETARIAN;
        break;
      case 'not-vegan':
        status = VeganStatus.NOT_VEGAN;
        break;
      default:
        status = VeganStatus.UNKNOWN;
    }
    
    return {
      name: supabaseIngredient.title,
      status,
      description: `Database ingredient: ${supabaseIngredient.title}${supabaseIngredient.productcount ? ` (found in ${supabaseIngredient.productcount} products)` : ''}`,
      alternatives: []
    };
  };

  // Show selected product details
  if (selectedProduct) {
    return (
      <View style={styles.container}>
        <ProductResult product={selectedProduct} onBack={handleBackToSearch} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleBackToSearch}>
            <Text style={styles.backButton}>← Back to Search Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show ingredient result (fallback)
  if (ingredientResult) {
    return <IngredientResult ingredient={ingredientResult} onBack={handleBackToSearch} />;
  }

  // Show Supabase ingredients results
  if (supabaseIngredients.length > 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Logo size={32} />
          <Text style={styles.appTitle}>Ingredient Results</Text>
        </View>
        
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsHeader}>
            {supabaseIngredients.length} ingredient{supabaseIngredients.length !== 1 ? 's' : ''} found
          </Text>
          
          <FlatList
            data={supabaseIngredients}
            keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.ingredientItem}
                onPress={() => {
                  setIngredientResult(convertSupabaseIngredient(item));
                  setSupabaseIngredients([]);
                }}
              >
                <View style={styles.ingredientInfo}>
                  <Text style={styles.ingredientName}>{item.title}</Text>
                  <View style={styles.statusContainer}>
                    <View style={[
                      styles.statusBadge,
                      item.class === 'vegan' && styles.veganBadge,
                      item.class === 'not-vegan' && styles.notVeganBadge,
                      item.class === 'vegetarian' && styles.vegetarianBadge,
                      (!item.class || item.class === 'ignore' || item.class === 'NULL') && styles.unknownBadge
                    ]}>
                      <Text style={styles.statusText}>
                        {item.class === 'vegan' ? 'VEGAN' : 
                         item.class === 'not-vegan' ? 'NOT VEGAN' : 
                         item.class === 'vegetarian' ? 'VEGETARIAN' : 'UNKNOWN'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            style={styles.resultsList}
            contentContainerStyle={styles.resultsListContent}
          />
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleBackToSearch}>
            <Text style={styles.backButton}>← Back to Search</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main search interface
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
          // Focus the search input after mode change on web
          if (Platform.OS === 'web') {
            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 100);
          }
        }}
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TouchableOpacity 
          style={styles.searchInputContainer}
          onPress={() => searchInputRef.current?.focus()}
          activeOpacity={1}
        >
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={
              searchMode === 'products'
                ? 'Search for products'
                : 'Search for ingredients'
            }
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus={Platform.OS === 'web'}
            selectTextOnFocus={Platform.OS === 'web'}
            blurOnSubmit={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery('')}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
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
    </TouchableWithoutFeedback>
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
  searchInputContainer: {
    flex: 1,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'text',
    }),
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 40, // Make room for clear button
    fontSize: 16,
    backgroundColor: 'white',
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      cursor: 'text',
    }),
  },
  clearButton: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -12 }],
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
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
  ingredientItem: {
    backgroundColor: 'white',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  ingredientInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusContainer: {
    marginLeft: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  veganBadge: {
    backgroundColor: '#4CAF50',
  },
  notVeganBadge: {
    backgroundColor: '#F44336',
  },
  vegetarianBadge: {
    backgroundColor: '#FF9800',
  },
  unknownBadge: {
    backgroundColor: '#9E9E9E',
  },
});