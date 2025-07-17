import { supabase } from './supabaseClient';

export interface SupabaseIngredient {
  id?: number;
  title: string;
  class?: string;
  productcount?: number;
  lastupdated?: string;
  created?: string;
}

export interface SupabaseProduct {
  id: number;
  upc?: string;
  ean13?: string;
  product_name?: string;
  brand?: string;
  ingredients?: string;
  calculated_code?: string;
  override_code?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export class SupabaseService {
  // Valid ingredient classes to filter by
  private static readonly VALID_CLASSES = [
    'may be non-vegetarian',
    'non-vegetarian',
    'typically non-vegan',
    'typically non-vegetarian',
    'typically vegan',
    'typically vegetarian',
    'vegan',
    'vegetarian'
  ];

  /**
   * Search for ingredients by title using hierarchical search strategy
   * @param title - The ingredient title to search for
   * @returns Promise with matching ingredients (limited to 100 results)
   */
  static async searchIngredientsByTitle(title: string): Promise<SupabaseIngredient[]> {
    try {
      // Step 1 & 2: Trim and convert to lowercase
      const searchTerm = title.trim().toLowerCase();
      
      if (!searchTerm) {
        return [];
      }

      // Step 3: Search for exact match first
      const { data: exactMatch, error: exactError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('title', searchTerm)
        .in('class', this.VALID_CLASSES)
        .order('title')
        .limit(100);

      if (exactError) {
        console.error('Error in exact search:', exactError);
      }

      // Step 4: If exact match found, return it
      if (exactMatch && exactMatch.length > 0) {
        return exactMatch;
      }

      // Step 5: Search for starts with pattern
      const { data: startsWithMatch, error: startsWithError } = await supabase
        .from('ingredients')
        .select('*')
        .ilike('title', `${searchTerm}%`)
        .in('class', this.VALID_CLASSES)
        .order('title')
        .limit(100);

      if (startsWithError) {
        console.error('Error in starts with search:', startsWithError);
      }

      // Step 6: If starts with match found, return it
      if (startsWithMatch && startsWithMatch.length > 0) {
        return startsWithMatch;
      }

      // Step 7: Search for contains pattern
      const { data: containsMatch, error: containsError } = await supabase
        .from('ingredients')
        .select('*')
        .ilike('title', `%${searchTerm}%`)
        .in('class', this.VALID_CLASSES)
        .order('title')
        .limit(100);

      if (containsError) {
        console.error('Error in contains search:', containsError);
        throw containsError;
      }

      return containsMatch || [];
    } catch (error) {
      console.error('Failed to search ingredients:', error);
      throw error;
    }
  }

  /**
   * Get ingredient by exact title match
   * @param title - The exact ingredient title
   * @returns Promise with the ingredient if found
   */
  static async getIngredientByTitle(title: string): Promise<SupabaseIngredient | null> {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('title', title)
        .in('class', this.VALID_CLASSES)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting ingredient:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Failed to get ingredient:', error);
      throw error;
    }
  }

  /**
   * Search for products by UPC/EAN13 barcode
   * @param barcode - The barcode to search for
   * @returns Promise with the product if found
   */
  static async getProductByBarcode(barcode: string): Promise<SupabaseProduct | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`upc.eq.${barcode},ean13.eq.${barcode}`)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting product:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Failed to get product:', error);
      throw error;
    }
  }

  /**
   * Search for products by name
   * @param name - The product name to search for
   * @returns Promise with matching products
   */
  static async searchProductsByName(name: string): Promise<SupabaseProduct[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('product_name', `%${name}%`)
        .order('product_name')
        .limit(50);

      if (error) {
        console.error('Error searching products:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to search products:', error);
      throw error;
    }
  }

  /**
   * Test database connection
   * @returns Promise with connection status
   */
  static async testConnection(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ingredients')
        .select('count')
        .limit(1);

      if (error) {
        console.error('Database connection test failed:', error);
        return false;
      }

      console.log('Database connection successful');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}