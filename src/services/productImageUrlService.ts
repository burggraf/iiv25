import { supabase } from './supabaseClient';

/**
 * Service for handling product image URL abstraction and resolution
 * Centralizes image URL logic to support multiple storage backends
 */
export class ProductImageUrlService {
  private static readonly SUPABASE_MARKER = '[SUPABASE]';
  private static readonly BUCKET_NAME = 'product-images';
  
  /**
   * Resolves an abstract image URL to a concrete URL for display
   * @param imageUrl - The stored image URL (could be [SUPABASE], full URL, or null)
   * @param upc - The UPC code for Supabase image resolution
   * @returns Concrete URL for image display, or null if no image
   */
  static resolveImageUrl(imageUrl: string | null | undefined, upc?: string): string | null {
    if (!imageUrl) {
      return null;
    }

    // Handle Supabase storage marker (with or without query parameters for cache busting)
    if (imageUrl === this.SUPABASE_MARKER || imageUrl.startsWith(this.SUPABASE_MARKER + '?')) {
      if (!upc) {
        console.warn('Cannot resolve [SUPABASE] image URL without UPC');
        return null;
      }
      const baseUrl = this.buildSupabaseImageUrl(upc);
      
      // If there are query parameters in the imageUrl, append them for cache busting
      if (imageUrl.includes('?')) {
        const queryParams = imageUrl.split('?')[1];
        return `${baseUrl}?${queryParams}`;
      }
      
      return baseUrl;
    }

    // Handle full URLs (OpenFoodFacts, etc.)
    if (this.isValidUrl(imageUrl)) {
      return imageUrl;
    }

    // Handle legacy Supabase URLs (for backward compatibility)
    if (imageUrl.includes('supabase.co/storage/v1/object/public/product-images/')) {
      return imageUrl;
    }

    console.warn(`Unknown image URL format: ${imageUrl}`);
    return null;
  }

  /**
   * Builds a Supabase Storage URL for a given UPC
   * @param upc - The UPC code
   * @returns Full Supabase Storage URL
   */
  static buildSupabaseImageUrl(upc: string): string {
    const { data } = supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(`${upc}.jpg`);
    
    return data.publicUrl;
  }

  /**
   * Abstracts a concrete image URL for storage
   * @param imageUrl - The concrete image URL
   * @param upc - The UPC code (for identifying Supabase images)
   * @returns Abstract URL for database storage
   */
  static abstractImageUrl(imageUrl: string | null | undefined, upc?: string): string | null {
    if (!imageUrl) {
      return null;
    }

    // Check if this is a Supabase image URL
    if (this.isSupabaseImageUrl(imageUrl, upc)) {
      return this.SUPABASE_MARKER;
    }

    // Return external URLs as-is (OpenFoodFacts, etc.)
    return imageUrl;
  }

  /**
   * Checks if a URL is a Supabase image URL for the given UPC
   * @param imageUrl - The URL to check
   * @param upc - The UPC code
   * @returns True if this is a Supabase image URL
   */
  static isSupabaseImageUrl(imageUrl: string, upc?: string): boolean {
    if (!imageUrl.includes('supabase.co/storage/v1/object/public/product-images/')) {
      return false;
    }

    if (upc && imageUrl.endsWith(`${upc}.jpg`)) {
      return true;
    }

    // General Supabase product-images bucket check
    return imageUrl.includes('/product-images/');
  }

  /**
   * Validates if a string is a valid URL
   * @param urlString - The string to validate
   * @returns True if valid URL
   */
  private static isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Gets the Supabase marker constant
   * @returns The marker used to indicate Supabase storage
   */
  static getSupabaseMarker(): string {
    return this.SUPABASE_MARKER;
  }

  /**
   * Checks if an image URL is the Supabase marker
   * @param imageUrl - The URL to check
   * @returns True if this is the Supabase marker
   */
  static isSupabaseMarker(imageUrl: string | null | undefined): boolean {
    return imageUrl === this.SUPABASE_MARKER;
  }

  /**
   * Utility method to handle multiple image sources with priority
   * @param sources - Array of potential image sources with their UPCs
   * @returns First available resolved image URL
   */
  static resolveFirstAvailableImage(sources: Array<{ imageUrl: string | null | undefined, upc?: string }>): string | null {
    for (const source of sources) {
      const resolved = this.resolveImageUrl(source.imageUrl, source.upc);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
}