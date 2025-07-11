import axios from 'axios';
import { OpenFoodFactsProduct, Product, VeganStatus } from '../types';

const BASE_URL = 'https://world.openfoodfacts.org/api/v0/product';

export class OpenFoodFactsService {
  static async getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      const response = await axios.get<OpenFoodFactsProduct>(`${BASE_URL}/${barcode}.json`);
      
      if (response.data.status === 0 || !response.data.product) {
        return null; // Product not found
      }

      const product = response.data.product;
      
      return {
        id: barcode,
        barcode: barcode,
        name: product.product_name || 'Unknown Product',
        brand: product.brands || undefined,
        ingredients: this.parseIngredients(product.ingredients_text || ''),
        veganStatus: this.determineVeganStatus(product.ingredients_text || ''),
        imageUrl: product.image_url || undefined,
        lastScanned: new Date(),
      };
    } catch (error) {
      console.error('Error fetching product from Open Food Facts:', error);
      return null;
    }
  }

  private static parseIngredients(ingredientsText: string): string[] {
    if (!ingredientsText) return [];
    
    // Split by common separators and clean up
    return ingredientsText
      .split(/[,;.]/)
      .map(ingredient => ingredient.trim())
      .filter(ingredient => ingredient.length > 0)
      .map(ingredient => ingredient.toLowerCase());
  }

  private static determineVeganStatus(ingredientsText: string): VeganStatus {
    if (!ingredientsText) return VeganStatus.UNKNOWN;

    const ingredients = ingredientsText.toLowerCase();
    
    // Non-vegan ingredients (animal products)
    const nonVeganIngredients = [
      'milk', 'dairy', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein', 'lactose',
      'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'fish', 'salmon', 'tuna',
      'egg', 'eggs', 'albumin', 'ovalbumin',
      'honey', 'beeswax', 'royal jelly', 'propolis',
      'gelatin', 'gelatine', 'collagen',
      'lard', 'tallow', 'suet',
      'shellac', 'carmine', 'cochineal', 'isinglass',
      'rennet', 'pepsin', 'lipase',
      'anchovies', 'worcestershire', // often contains anchovies
    ];

    // Vegetarian-only ingredients (dairy/eggs but no meat)
    const vegetarianIngredients = [
      'milk', 'dairy', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein', 'lactose',
      'egg', 'eggs', 'albumin', 'ovalbumin',
    ];

    // Check for non-vegan ingredients
    for (const ingredient of nonVeganIngredients) {
      if (ingredients.includes(ingredient)) {
        // If it's only dairy/eggs, it's vegetarian
        if (vegetarianIngredients.includes(ingredient)) {
          // Check if there are also meat/fish ingredients
          const meatIngredients = ['meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'fish', 'salmon', 'tuna', 'anchovies'];
          const hasMeat = meatIngredients.some(meat => ingredients.includes(meat));
          
          if (!hasMeat) {
            return VeganStatus.VEGETARIAN;
          }
        }
        return VeganStatus.NOT_VEGAN;
      }
    }

    // If no non-vegan ingredients found, assume vegan
    return VeganStatus.VEGAN;
  }

  // Enhanced product search with pagination and better error handling
  static async searchProducts(query: string, page: number = 1, pageSize: number = 20): Promise<{
    products: Product[];
    totalCount: number;
    currentPage: number;
    hasNextPage: boolean;
  }> {
    try {
      const response = await axios.get(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page=${page}&page_size=${pageSize}`
      );

      if (!response.data.products) {
        return {
          products: [],
          totalCount: 0,
          currentPage: page,
          hasNextPage: false,
        };
      }

      const products = response.data.products
        .filter((product: any) => product.product_name && product.code) // Filter out incomplete products
        .map((product: any) => ({
          id: product.code || product._id,
          barcode: product.code || product._id,
          name: product.product_name || 'Unknown Product',
          brand: product.brands || undefined,
          ingredients: this.parseIngredients(product.ingredients_text || ''),
          veganStatus: this.determineVeganStatus(product.ingredients_text || ''),
          imageUrl: product.image_url || undefined,
          lastScanned: new Date(),
        }));

      const totalCount = response.data.count || 0;
      const hasNextPage = (page * pageSize) < totalCount;

      return {
        products,
        totalCount,
        currentPage: page,
        hasNextPage,
      };
    } catch (error) {
      console.error('Error searching products:', error);
      return {
        products: [],
        totalCount: 0,
        currentPage: page,
        hasNextPage: false,
      };
    }
  }
}