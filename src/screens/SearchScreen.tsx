import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '../components/Logo';
import SearchModeSelector, { SearchMode } from '../components/SearchModeSelector';
import ProductSearchItem from '../components/ProductSearchItem';
import IngredientResult from '../components/IngredientResult';
import ProductResult from '../components/ProductResult';
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
      // Calculate page offset (20 products per page)
      const pageOffset = (page - 1) * 20;
      
      const supabaseProducts = await SupabaseService.searchProductsByName(query, pageOffset);
      
      // Convert SupabaseProduct to Product format
      const products: Product[] = supabaseProducts.map(supabaseProduct => ({
        id: supabaseProduct.ean13 || supabaseProduct.upc || '',
        barcode: supabaseProduct.ean13 || supabaseProduct.upc || '',
        name: supabaseProduct.product_name || 'Unknown Product',
        brand: supabaseProduct.brand,
        ingredients: supabaseProduct.ingredients ? 
          supabaseProduct.ingredients.split(',').map(ing => ing.trim()) : [],
        veganStatus: SupabaseService.mapClassificationToVeganStatus(supabaseProduct.classification),
        imageUrl: supabaseProduct.imageurl,
        issues: supabaseProduct.issues,
        lastScanned: supabaseProduct.lastupdated ? new Date(supabaseProduct.lastupdated) : undefined,
        classificationMethod: 'product-level' as const
      }));
      
      // Get total count from the first result (all results have the same total_count)
      const totalCount = supabaseProducts.length > 0 ? (supabaseProducts[0].total_count || 0) : 0;
      
      if (page === 1) {
        setProductResults(products);
        setCurrentPage(1);
        setTotalResults(totalCount);
        // Check if there are more pages based on total count
        setHasNextPage(totalCount > 20);
      } else {
        setProductResults(prev => [...prev, ...products]);
        setCurrentPage(page);
        setTotalResults(totalCount);
        // Check if there are more pages based on current page and total count
        setHasNextPage((page * 20) < totalCount);
      }
      
      if (products.length === 0 && page === 1) {
        Alert.alert('No Results', `No products found for "${query}". Try a different search term.`);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      
      // Handle rate limit errors
      if (err.isRateLimit) {
        const subscriptionLevel = err.subscriptionLevel;
        const rateLimit = err.rateLimit;
        
        let upgradeMessage = '';
        if (subscriptionLevel === 'free') {
          upgradeMessage = '\n\nUpgrade to Standard (20/hour) or Premium (250/hour) for more searches.';
        } else if (subscriptionLevel === 'standard') {
          upgradeMessage = '\n\nUpgrade to Premium (250/hour) for more searches.';
        }
        
        const alertTitle = 'Search Limit Reached';
        const alertMessage = `You've reached your hourly search limit.\n\nRate limit exceeded: ${subscriptionLevel} tier allows ${rateLimit} searches per hour.${upgradeMessage}`;
        
        Alert.alert(alertTitle, alertMessage);
        return;
      }
      
      Alert.alert('Search Error', 'Failed to search products. Please try again.');
    }
  };

  const searchIngredient = async (query: string) => {
    try {
      // First try Supabase database search
      const supabaseResults = await SupabaseService.searchIngredientsByTitle(query);
      
      // Check for rate limit response
      if (supabaseResults.length === 1 && supabaseResults[0].title === '__RATE_LIMIT_EXCEEDED__') {
        const rateLimitInfo = supabaseResults[0];
        const subscriptionLevel = rateLimitInfo.class;
        const rateLimit = rateLimitInfo.productcount;
        
        // Create user-friendly message
        let upgradeMessage = '';
        if (subscriptionLevel === 'free') {
          upgradeMessage = '\n\nUpgrade to Standard (20/hour) or Premium (250/hour) for more searches.';
        } else if (subscriptionLevel === 'standard') {
          upgradeMessage = '\n\nUpgrade to Premium (250/hour) for more searches.';
        }
        
        const alertTitle = 'Search Limit Reached';
        const alertMessage = `You've reached your hourly search limit.\n\nRate limit exceeded: ${subscriptionLevel} tier allows ${rateLimit} searches per hour.${upgradeMessage}`;
        
        // Use appropriate alert method based on platform
        if (Platform.OS === 'web') {
          // Web environment - use browser confirm dialog
          if (upgradeMessage) {
            const result = window.confirm(alertMessage + '\n\nWould you like to upgrade your subscription?');
            if (result) {
              // TODO: Navigate to subscription/upgrade screen
              console.log('Should navigate to upgrade screen');
            }
          } else {
            window.alert(alertMessage);
          }
        } else {
          // Native environment - use React Native Alert
          Alert.alert(
            alertTitle,
            alertMessage,
            [
              { text: 'OK' },
              ...(upgradeMessage ? [{ 
                text: 'Upgrade', 
                onPress: () => {
                  // TODO: Navigate to subscription/upgrade screen
                  console.log('Should navigate to upgrade screen');
                }
              }] : [])
            ]
          );
        }
        return;
      }
      
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
    } catch (error: any) {
      console.error('Ingredient search error:', error);
      
      // Get the error message from various possible locations
      const errorMessage = error?.message || error?.details || error?.error_description || '';
      
      // Check if it's an authentication error
      if (errorMessage === 'not logged in') {
        Alert.alert(
          'Authentication Required',
          'You need to be logged in to search ingredients. Please log in and try again.',
          [
            { text: 'OK', onPress: () => {
              // TODO: Navigate to login screen
              // This should be implemented based on your navigation setup
              console.log('Should navigate to login screen');
            }}
          ]
        );
        return;
      }
      
      // Fallback to local database on other errors
      const localResult = IngredientService.searchIngredient(query);
      
      if (localResult) {
        setIngredientResult(localResult);
        setSupabaseIngredients([]);
        
        // Show a notice that we're using fallback data
        Alert.alert(
          'Using Offline Data',
          'We\'re having trouble connecting to our servers, so we\'re showing results from our offline database. Some ingredients may not be available.',
          [{ text: 'OK' }]
        );
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
    // Since the product already has all the details from Supabase, just use it directly
    setIsLoading(true);
    try {
      setSelectedProduct(product);
      addToHistory(product);
    } catch (err) {
      console.error('Product selection error:', err);
      Alert.alert('Error', 'Failed to select product.');
    }
    setIsLoading(false);
  };

  const handleBackToSearch = () => {
    setSelectedProduct(null);
    setIngredientResult(null);
    setSupabaseIngredients([]);
  };

  const handleProductUpdated = (updatedProduct: Product) => {
    // Update the selected product state to reflect changes
    setSelectedProduct(updatedProduct);
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
      case 'typically vegan':
        status = VeganStatus.VEGAN;
        break;
      case 'vegetarian':
      case 'typically vegetarian':
        status = VeganStatus.VEGETARIAN;
        break;
      case 'non-vegetarian':
      case 'typically non-vegan':
      case 'typically non-vegetarian':
        status = VeganStatus.NOT_VEGETARIAN;
        break;
      case 'may be non-vegetarian':
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
        <ProductResult 
          product={selectedProduct} 
          onBack={handleBackToSearch}
          onProductUpdated={handleProductUpdated}
        />
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
            keyExtractor={(item, index) => `${item.title}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.ingredientItem}
                onPress={() => {
                  setIngredientResult(convertSupabaseIngredient(item));
                  setSupabaseIngredients([]);
                }}
              >
                <View style={styles.ingredientInfo}>
                  <View style={styles.ingredientDetails}>
                    <Text style={styles.ingredientName}>{item.title}</Text>
                    <Text style={styles.ingredientClass}>{item.class || 'unknown'}</Text>
                  </View>
                  <View style={styles.statusContainer}>
                    <View style={[
                      styles.statusBadge,
                      (item.class === 'vegan' || item.class === 'typically vegan') && styles.veganBadge,
                      (item.class === 'non-vegetarian' || item.class === 'typically non-vegan' || item.class === 'typically non-vegetarian') && styles.notVeganBadge,
                      (item.class === 'vegetarian' || item.class === 'typically vegetarian') && styles.vegetarianBadge,
                      (item.class === 'may be non-vegetarian' || !item.class) && styles.unknownBadge
                    ]}>
                      <Text style={styles.statusText}>
                        {item.class === 'vegan' || item.class === 'typically vegan' ? 'VEGAN' : 
                         item.class === 'non-vegetarian' || item.class === 'typically non-vegan' || item.class === 'typically non-vegetarian' ? 'NOT VEGETARIAN' : 
                         item.class === 'vegetarian' || item.class === 'typically vegetarian' ? 'VEGETARIAN' : 
                         item.class === 'may be non-vegetarian' ? 'MAYBE NOT VEGETARIAN' : 'UNKNOWN'}
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
    fontSize: 18,
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
  ingredientDetails: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  ingredientClass: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
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