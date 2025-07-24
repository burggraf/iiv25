import { supabase } from './supabaseClient';
import { ActionLog, ActionType, SubscriptionLevel, VeganStatus } from '../types';
import deviceIdService from './deviceIdService';

export interface SupabaseIngredient {
  title: string;
  class?: string;
  productcount?: number;
  lastupdated?: string;
  created?: string;
}

export interface SupabaseProduct {
  ean13: string;
  upc?: string;
  product_name?: string;
  brand?: string;
  ingredients?: string;
  classification?: string;
  imageurl?: string;
  issues?: string;
  created?: string;
  lastupdated?: string;
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
   * Map classification field from database to VeganStatus enum
   * @param classification - The classification from the database ("vegan", "vegetarian", "non-vegetarian", "undetermined")
   * @returns VeganStatus enum value
   */
  static mapClassificationToVeganStatus(classification: string | null | undefined): VeganStatus {
    if (!classification) {
      return VeganStatus.UNKNOWN;
    }

    switch (classification.toLowerCase()) {
      case 'vegan':
        return VeganStatus.VEGAN;
      case 'vegetarian':
        return VeganStatus.VEGETARIAN;
      case 'non-vegetarian':
        return VeganStatus.NOT_VEGETARIAN;
      case 'undetermined':
      default:
        return VeganStatus.UNKNOWN;
    }
  }


  /**
   * Check if classification field represents a valid/actionable result
   * @param classification - The classification from the database
   * @returns true if the classification is valid and not undetermined
   */
  static isValidClassification(classification: string | null | undefined): boolean {
    if (!classification) {
      return false;
    }
    
    const normalizedClassification = classification.toLowerCase();
    return ['vegan', 'vegetarian', 'non-vegetarian'].includes(normalizedClassification);
  }

  /**
   * Get the vegan status for a product using the classification field
   * @param product - The product from the database
   * @returns VeganStatus enum value
   */
  static getProductVeganStatus(product: SupabaseProduct): VeganStatus {
    // Use the classification field
    if (product.classification && this.isValidClassification(product.classification)) {
      const result = this.mapClassificationToVeganStatus(product.classification);
      console.log(`🎯 Using classification field "${product.classification}" → ${result}`);
      return result;
    }
    
    // If classification is not available or invalid, return unknown
    console.log(`❌ No valid classification available, returning UNKNOWN`);
    return VeganStatus.UNKNOWN;
  }


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

      // Get device ID for logging
      const deviceId = await deviceIdService.getDeviceId();

      const { data, error } = await supabase
        .rpc('search_ingredients', { 
          search_term: searchTerm,
          device_id: deviceId
        });

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
   * Search for products by barcode using PostgreSQL function with auth check, rate limiting, and logging
   * @param barcode - The barcode to search for
   * @returns Promise with the product if found, null if not found, or throws error for rate limiting
   * @throws Error if user is not authenticated ('not logged in')
   * @throws Error if rate limit exceeded ('rate limit exceeded')
   */
  static async searchProductByBarcode(barcode: string): Promise<{
    product: SupabaseProduct | null;
    isRateLimited: boolean;
    rateLimitInfo?: {
      subscriptionLevel: string;
      rateLimit: number;
    };
  }> {
    try {
      const searchBarcode = barcode.trim();
      
      if (!searchBarcode) {
        return { product: null, isRateLimited: false };
      }

      // Get device ID for logging
      const deviceId = await deviceIdService.getDeviceId();

      const { data, error } = await supabase
        .rpc('lookup_product', { 
          barcode: searchBarcode,
          device_id: deviceId
        });

      if (error) {
        // Check if it's an authentication error
        if (error.message === 'not logged in') {
          throw new Error('not logged in');
        }
        console.error('Error searching product:', error);
        throw error;
      }

      // Check if we got a rate limit response
      if (data && data.length > 0 && data[0].ean13 === '__RATE_LIMIT_EXCEEDED__') {
        return {
          product: null,
          isRateLimited: true,
          rateLimitInfo: {
            subscriptionLevel: data[0].upc || 'free',
            rateLimit: parseInt(data[0].brand || '3')
          }
        };
      }

      // Return the product data (or null if not found) - now includes classification field
      const product = data && data.length > 0 ? data[0] : null;
      return {
        product,
        isRateLimited: false
      };
    } catch (error) {
      console.error('Failed to search product:', error);
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
   * @param deviceid - Optional ID of the device performing the action
   * @param result - Optional result of the action
   * @param metadata - Optional metadata about the action
   * @returns Promise with the created action log
   */
  static async logAction(
    type: ActionType,
    input: string,
    userid: string,
    deviceid?: string | null,
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
          deviceid,
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