import axios from 'axios';
import { OpenFoodFactsProduct, Product, VeganStatus, StructuredIngredient, ClassificationDetail } from '../types';

const BASE_URL = 'https://world.openfoodfacts.org/api/v0/product';

export class OpenFoodFactsService {
  static async getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      const response = await axios.get<OpenFoodFactsProduct>(`${BASE_URL}/${barcode}.json`);
      
      if (response.data.status === 0 || !response.data.product) {
        return null; // Product not found
      }

      const product = response.data.product;
      const classificationResult = this.determineVeganStatusEnhanced(product);
      
      return {
        id: barcode,
        barcode: barcode,
        name: product.product_name || 'Unknown Product',
        brand: product.brands || undefined,
        ingredients: this.parseIngredients(product.ingredients_text || ''),
        veganStatus: classificationResult.status,
        imageUrl: product.image_url || undefined,
        lastScanned: new Date(),
        structuredIngredients: product.ingredients || undefined,
        nonVeganIngredients: classificationResult.nonVeganIngredients,
        classificationMethod: classificationResult.method,
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

  private static determineVeganStatusEnhanced(product: any): {
    status: VeganStatus;
    nonVeganIngredients: ClassificationDetail[];
    method: 'structured' | 'product-level' | 'text-based';
  } {
    // Strategy 1: Use structured ingredients data (most accurate)
    if (product.ingredients && Array.isArray(product.ingredients)) {
      const result = this.analyzeStructuredIngredients(product.ingredients);
      if (result.status !== VeganStatus.UNKNOWN) {
        return {
          status: result.status,
          nonVeganIngredients: result.nonVeganIngredients,
          method: 'structured'
        };
      }
    }

    // Strategy 2: Use product-level vegan/vegetarian fields
    if (product.vegan || product.vegetarian) {
      const productLevelResult = this.analyzeProductLevelFields(product.vegan, product.vegetarian);
      if (productLevelResult !== VeganStatus.UNKNOWN) {
        return {
          status: productLevelResult,
          nonVeganIngredients: [],
          method: 'product-level'
        };
      }
    }

    // Strategy 3: Fallback to text-based analysis
    const textResult = this.determineVeganStatusWithDetails(product.ingredients_text || '');
    return {
      status: textResult.status,
      nonVeganIngredients: textResult.nonVeganIngredients,
      method: 'text-based'
    };
  }

  private static analyzeStructuredIngredients(ingredients: StructuredIngredient[]): {
    status: VeganStatus;
    nonVeganIngredients: ClassificationDetail[];
  } {
    let hasNonVeganIngredient = false;
    let hasVegetarianOnlyIngredient = false;
    let hasUnknownIngredient = false;
    const nonVeganIngredients: ClassificationDetail[] = [];

    for (const ingredient of ingredients) {
      let isProblematic = false;
      let reason = '';

      // Check vegan status
      if (ingredient.vegan === 'no') {
        hasNonVeganIngredient = true;
        isProblematic = true;
        reason = 'Contains animal products';
      } else if (ingredient.vegan === 'maybe' || !ingredient.vegan) {
        hasUnknownIngredient = true;
        isProblematic = true;
        reason = 'Vegan status uncertain';
      }

      // Check vegetarian status
      if (ingredient.vegetarian === 'no') {
        hasNonVeganIngredient = true;
        isProblematic = true;
        reason = 'Contains meat or animal products';
      } else if (ingredient.vegetarian === 'maybe' || !ingredient.vegetarian) {
        hasUnknownIngredient = true;
        if (!isProblematic) {
          isProblematic = true;
          reason = 'Vegetarian status uncertain';
        }
      }

      // Check for vegetarian-only ingredients (dairy/eggs)
      if (ingredient.vegan === 'no' && ingredient.vegetarian === 'yes') {
        hasVegetarianOnlyIngredient = true;
        if (!isProblematic) {
          isProblematic = true;
          reason = 'Contains dairy or eggs';
        }
      }

      // Add to non-vegan list if problematic
      if (isProblematic) {
        // Determine final verdict for this ingredient
        let verdict: 'vegan' | 'vegetarian' | 'not_vegan' | 'unknown';
        
        if (ingredient.vegan === 'yes') {
          verdict = 'vegan';
        } else if (ingredient.vegan === 'no' && ingredient.vegetarian === 'yes') {
          verdict = 'vegetarian';
        } else if (ingredient.vegetarian === 'no') {
          verdict = 'not_vegan';
        } else {
          verdict = 'unknown';
        }

        nonVeganIngredients.push({
          ingredient: ingredient.text,
          reason: reason,
          verdict: verdict
        });
      }
    }

    // Determine final status
    let status: VeganStatus;
    if (hasNonVeganIngredient && !hasVegetarianOnlyIngredient) {
      status = VeganStatus.NOT_VEGAN;
    } else if (hasVegetarianOnlyIngredient && !hasNonVeganIngredient) {
      status = VeganStatus.VEGETARIAN;
    } else if (hasUnknownIngredient) {
      status = VeganStatus.UNKNOWN;
    } else {
      status = VeganStatus.VEGAN;
    }

    return {
      status,
      nonVeganIngredients: status === VeganStatus.VEGAN ? [] : nonVeganIngredients
    };
  }

  private static analyzeProductLevelFields(vegan?: string, vegetarian?: string): VeganStatus {
    // Normalize the values
    const veganValue = vegan?.toLowerCase();
    const vegetarianValue = vegetarian?.toLowerCase();

    // Check for explicit vegan status
    if (veganValue === 'yes' || veganValue === '1' || veganValue === 'true') {
      return VeganStatus.VEGAN;
    }
    
    if (veganValue === 'no' || veganValue === '0' || veganValue === 'false') {
      // Check if it's at least vegetarian
      if (vegetarianValue === 'yes' || vegetarianValue === '1' || vegetarianValue === 'true') {
        return VeganStatus.VEGETARIAN;
      }
      return VeganStatus.NOT_VEGAN;
    }

    // Check vegetarian status if vegan is unclear
    if (vegetarianValue === 'yes' || vegetarianValue === '1' || vegetarianValue === 'true') {
      return VeganStatus.VEGETARIAN;
    }
    
    if (vegetarianValue === 'no' || vegetarianValue === '0' || vegetarianValue === 'false') {
      return VeganStatus.NOT_VEGAN;
    }

    return VeganStatus.UNKNOWN;
  }

  private static determineVeganStatusWithDetails(ingredientsText: string): {
    status: VeganStatus;
    nonVeganIngredients: ClassificationDetail[];
  } {
    if (!ingredientsText) {
      return {
        status: VeganStatus.UNKNOWN,
        nonVeganIngredients: []
      };
    }

    const ingredients = ingredientsText.toLowerCase();
    const nonVeganIngredients: ClassificationDetail[] = [];
    
    // Non-vegan ingredients (animal products)
    const nonVeganIngredients_list = [
      'milk', 'dairy', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein', 'lactose',
      'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'fish', 'salmon', 'tuna',
      'egg', 'eggs', 'albumin', 'ovalbumin',
      'honey', 'beeswax', 'royal jelly', 'propolis',
      'gelatin', 'gelatine', 'collagen',
      'lard', 'tallow', 'suet',
      'shellac', 'carmine', 'cochineal', 'isinglass',
      'rennet', 'pepsin', 'lipase',
      'anchovies', 'worcestershire',
    ];

    // Vegetarian-only ingredients (dairy/eggs but no meat)
    const vegetarianIngredients = [
      'milk', 'dairy', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein', 'lactose',
      'egg', 'eggs', 'albumin', 'ovalbumin',
    ];

    let hasNonVeganIngredient = false;
    let hasVegetarianOnlyIngredient = false;

    // Check for non-vegan ingredients
    for (const ingredient of nonVeganIngredients_list) {
      if (ingredients.includes(ingredient)) {
        const isVegetarianOnly = vegetarianIngredients.includes(ingredient);
        
        if (isVegetarianOnly) {
          hasVegetarianOnlyIngredient = true;
          nonVeganIngredients.push({
            ingredient: ingredient,
            reason: 'Contains dairy or eggs',
            verdict: 'vegetarian'
          });
        } else {
          hasNonVeganIngredient = true;
          nonVeganIngredients.push({
            ingredient: ingredient,
            reason: 'Contains animal products',
            verdict: 'not_vegan'
          });
        }
      }
    }

    // Determine final status
    let status: VeganStatus;
    if (hasNonVeganIngredient && !hasVegetarianOnlyIngredient) {
      status = VeganStatus.NOT_VEGAN;
    } else if (hasVegetarianOnlyIngredient && !hasNonVeganIngredient) {
      status = VeganStatus.VEGETARIAN;
    } else if (hasNonVeganIngredient || hasVegetarianOnlyIngredient) {
      status = VeganStatus.NOT_VEGAN;
    } else {
      status = VeganStatus.VEGAN;
    }

    return {
      status,
      nonVeganIngredients: status === VeganStatus.VEGAN ? [] : nonVeganIngredients
    };
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
        .map((product: any) => {
          const classificationResult = this.determineVeganStatusEnhanced(product);
          return {
            id: product.code || product._id,
            barcode: product.code || product._id,
            name: product.product_name || 'Unknown Product',
            brand: product.brands || undefined,
            ingredients: this.parseIngredients(product.ingredients_text || ''),
            veganStatus: classificationResult.status,
            imageUrl: product.image_url || undefined,
            lastScanned: new Date(),
            structuredIngredients: product.ingredients || undefined,
            nonVeganIngredients: classificationResult.nonVeganIngredients,
            classificationMethod: classificationResult.method,
          };
        });

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