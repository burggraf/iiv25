import axios from 'axios';
import { OpenFoodFactsProduct, Product, VeganStatus, StructuredIngredient, ClassificationDetail } from '../types';
import { ProductImageUrlService } from './productImageUrlService';

const BASE_URL = 'https://world.openfoodfacts.org/api/v0/product';

export class OpenFoodFactsService {
  static async getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      const response = await axios.get<OpenFoodFactsProduct>(`${BASE_URL}/${barcode}.json`, {
        timeout: 5000 // 5 second timeout
      });
      
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
        imageUrl: ProductImageUrlService.resolveImageUrl(product.image_url) || undefined,
        lastScanned: new Date(),
        structuredIngredients: product.ingredients || undefined,
        nonVeganIngredients: classificationResult.nonVeganIngredients,
        classificationMethod: classificationResult.method,
      };
    } catch (error) {
      // Silently handle network errors - user doesn't need to see these
      // Just log a simple message without the full error details
      console.log('OpenFoodFacts API temporarily unavailable, falling back gracefully');
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
    // Strategy 1: Check product-level vegan/vegetarian fields first (most authoritative)
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

    // Strategy 2: Use structured ingredients data (detailed analysis)
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
    let hasDefinitelyNonVeganIngredient = false;
    let hasVegetarianOnlyIngredient = false;
    let veganIngredientCount = 0;
    let totalIngredientCount = ingredients.length;
    const nonVeganIngredients: ClassificationDetail[] = [];

    for (const ingredient of ingredients) {
      // Check for definitely non-vegetarian (meat/animal products)
      if (ingredient.vegetarian === 'no') {
        hasDefinitelyNonVeganIngredient = true;
        nonVeganIngredients.push({
          ingredient: ingredient.text,
          reason: 'Contains meat or animal products',
          verdict: 'not_vegetarian'
        });
        continue;
      }

      // Check for vegetarian-only ingredients (dairy/eggs)
      if (ingredient.vegan === 'no' && ingredient.vegetarian === 'yes') {
        hasVegetarianOnlyIngredient = true;
        nonVeganIngredients.push({
          ingredient: ingredient.text,
          reason: 'Contains dairy or eggs',
          verdict: 'vegetarian'
        });
        continue;
      }

      // Count clearly vegan ingredients
      if (ingredient.vegan === 'yes') {
        veganIngredientCount++;
      }

      // Handle remaining non-vegetarian ingredients that aren't clearly vegetarian
      if (ingredient.vegan === 'no') {
        // Apply domain knowledge for common dairy ingredients that might be misclassified
        const knownDairyIngredients = ['milk', 'whey', 'casein', 'lactose', 'cheese', 'butter', 'cream', 'yogurt'];
        const isDairyIngredient = knownDairyIngredients.some(dairy => 
          ingredient.text.toLowerCase().includes(dairy)
        );
        
        if (isDairyIngredient) {
          hasVegetarianOnlyIngredient = true;
          nonVeganIngredients.push({
            ingredient: ingredient.text,
            reason: 'Contains dairy products',
            verdict: 'vegetarian'
          });
        } else {
          nonVeganIngredients.push({
            ingredient: ingredient.text,
            reason: 'Contains animal products',
            verdict: 'not_vegetarian'
          });
        }
      }
    }

    // Determine final status based on definitive evidence
    let status: VeganStatus;
    if (hasDefinitelyNonVeganIngredient) {
      status = VeganStatus.NOT_VEGETARIAN;
    } else if (hasVegetarianOnlyIngredient) {
      status = VeganStatus.VEGETARIAN;
    } else if (veganIngredientCount > 0 && veganIngredientCount >= totalIngredientCount * 0.6) {
      // If 60% or more ingredients are explicitly vegan, consider the product vegan
      status = VeganStatus.VEGAN;
    } else {
      // If we don't have enough clear evidence, return unknown to try other methods
      status = VeganStatus.UNKNOWN;
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
    if (veganValue === 'yes' || veganValue === '1' || veganValue === 'true' || veganValue === 'vegan') {
      return VeganStatus.VEGAN;
    }
    
    if (veganValue === 'no' || veganValue === '0' || veganValue === 'false' || veganValue === 'non-vegan') {
      // Check if it's at least vegetarian
      if (vegetarianValue === 'yes' || vegetarianValue === '1' || vegetarianValue === 'true' || vegetarianValue === 'vegetarian') {
        return VeganStatus.VEGETARIAN;
      }
      return VeganStatus.NOT_VEGETARIAN;
    }

    // Check vegetarian status if vegan is unclear
    if (vegetarianValue === 'yes' || vegetarianValue === '1' || vegetarianValue === 'true' || vegetarianValue === 'vegetarian') {
      return VeganStatus.VEGETARIAN;
    }
    
    if (vegetarianValue === 'no' || vegetarianValue === '0' || vegetarianValue === 'false' || vegetarianValue === 'non-vegetarian') {
      return VeganStatus.NOT_VEGETARIAN;
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

    // Parse individual ingredients first
    const individualIngredients = this.parseIngredients(ingredientsText);
    const nonVeganIngredients: ClassificationDetail[] = [];
    
    // Non-vegetarian ingredients (exact matches for full ingredient names)
    const nonVeganIngredients_list = [
      'milk', 'whole milk', 'skim milk', 'dairy', 'cheese', 'butter', 'cream', 'heavy cream',
      'yogurt', 'whey', 'whey protein', 'casein', 'lactose',
      'meat', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'fish', 'salmon', 'tuna',
      'egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'ovalbumin',
      'honey', 'beeswax', 'royal jelly', 'propolis',
      'gelatin', 'gelatine', 'collagen',
      'lard', 'tallow', 'suet',
      'shellac', 'carmine', 'cochineal', 'isinglass',
      'rennet', 'pepsin', 'lipase',
      'anchovies', 'worcestershire sauce',
    ];

    // Vegetarian-only ingredients (dairy/eggs but no meat)
    const vegetarianIngredients = [
      'milk', 'whole milk', 'skim milk', 'dairy', 'cheese', 'butter', 'cream', 'heavy cream',
      'yogurt', 'whey', 'whey protein', 'casein', 'lactose',
      'egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'ovalbumin',
    ];

    let hasNonVeganIngredient = false;
    let hasVegetarianOnlyIngredient = false;

    // Check each individual ingredient against our lists
    for (const ingredient of individualIngredients) {
      const cleanIngredient = ingredient.trim().toLowerCase();
      
      // Check for exact matches (case-insensitive)
      for (const nonVeganItem of nonVeganIngredients_list) {
        if (cleanIngredient === nonVeganItem) {
          const isVegetarianOnly = vegetarianIngredients.includes(nonVeganItem);
          
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
              verdict: 'not_vegetarian'
            });
          }
          break; // Found a match, no need to check other items
        }
      }
    }

    // Determine final status
    let status: VeganStatus;
    if (hasNonVeganIngredient && !hasVegetarianOnlyIngredient) {
      status = VeganStatus.NOT_VEGETARIAN;
    } else if (hasVegetarianOnlyIngredient && !hasNonVeganIngredient) {
      status = VeganStatus.VEGETARIAN;
    } else if (hasNonVeganIngredient || hasVegetarianOnlyIngredient) {
      status = VeganStatus.NOT_VEGETARIAN;
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
    
    // Non-vegetarian ingredients (animal products)
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

    // Check for non-vegetarian ingredients
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
        return VeganStatus.NOT_VEGETARIAN;
      }
    }

    // If no non-vegetarian ingredients found, assume vegan
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
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page=${page}&page_size=${pageSize}`,
        {
          timeout: 5000 // 5 second timeout
        }
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
            imageUrl: ProductImageUrlService.resolveImageUrl(product.image_url) || undefined,
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
      // Silently handle network errors - user doesn't need to see these
      console.log('OpenFoodFacts search API temporarily unavailable');
      return {
        products: [],
        totalCount: 0,
        currentPage: page,
        hasNextPage: false,
      };
    }
  }
}