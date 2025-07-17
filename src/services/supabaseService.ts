import { supabase } from './supabaseClient';
import { ActionLog, ActionType, SubscriptionLevel } from '../types';

export interface SupabaseIngredient {
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
   * Search for ingredients by title using PostgreSQL function with auth check and logging
   * @param title - The ingredient title to search for
   * @returns Promise with matching ingredients (limited to 100 results)
   * @throws Error if user is not authenticated ('not logged in')
   */
  static async searchIngredientsByTitle(title: string): Promise<SupabaseIngredient[]> {
    try {
      const searchTerm = title.trim();
      
      if (!searchTerm) {
        return [];
      }

      const { data, error } = await supabase
        .rpc('search_ingredients', { search_term: searchTerm });

      if (error) {
        // Check if it's an authentication error
        if (error.message === 'not logged in') {
          throw new Error('not logged in');
        }
        console.error('Error searching ingredients:', error);
        throw error;
      }

      return data || [];
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

  /**
   * Log a user action to the actionlog table
   * @param type - The type of action performed
   * @param input - User input (barcode, search term, etc.)
   * @param userid - ID of the user performing the action
   * @param result - Optional result of the action
   * @param metadata - Optional metadata about the action
   * @returns Promise with the created action log
   */
  static async logAction(
    type: ActionType,
    input: string,
    userid: string,
    result?: string,
    metadata?: Record<string, any>
  ): Promise<ActionLog | null> {
    try {
      const { data, error } = await supabase
        .from('actionlog')
        .insert({
          type,
          input,
          userid,
          result,
          metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Error logging action:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to log action:', error);
      throw error;
    }
  }

  /**
   * Get action logs for a specific user
   * @param userid - ID of the user
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Promise with action logs
   */
  static async getUserActionLogs(userid: string, limit: number = 50): Promise<ActionLog[]> {
    try {
      const { data, error } = await supabase
        .from('actionlog')
        .select('*')
        .eq('userid', userid)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error getting user action logs:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get user action logs:', error);
      throw error;
    }
  }

  /**
   * Get action logs by type for a specific user
   * @param userid - ID of the user
   * @param type - Type of action to filter by
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Promise with filtered action logs
   */
  static async getUserActionLogsByType(
    userid: string,
    type: ActionType,
    limit: number = 50
  ): Promise<ActionLog[]> {
    try {
      const { data, error } = await supabase
        .from('actionlog')
        .select('*')
        .eq('userid', userid)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error getting user action logs by type:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get user action logs by type:', error);
      throw error;
    }
  }

  /**
   * Get current user's subscription status
   * @returns Promise with subscription level ('free', 'standard', or 'premium')
   * @throws Error if user is not authenticated ('not logged in')
   */
  static async getSubscriptionStatus(): Promise<SubscriptionLevel> {
    try {
      const { data, error } = await supabase
        .rpc('get_subscription_status');

      if (error) {
        // Check if it's an authentication error
        if (error.message === 'not logged in') {
          throw new Error('not logged in');
        }
        console.error('Error getting subscription status:', error);
        throw error;
      }

      return data as SubscriptionLevel;
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      throw error;
    }
  }
}