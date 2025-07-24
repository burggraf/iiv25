import { ProductImageUrlService } from '../productImageUrlService';

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: jest.fn(() => ({
          data: {
            publicUrl: 'https://mock-supabase.co/storage/v1/object/public/product-images/123.jpg'
          }
        }))
      }))
    }
  }
}));

describe('ProductImageUrlService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolveImageUrl', () => {
    it('should return original URL when it is already valid HTTPS', () => {
      const validUrl = 'https://images.openfoodfacts.org/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(validUrl);
      expect(result).toBe(validUrl);
    });

    it('should return original URL when it is valid HTTP', () => {
      const httpUrl = 'http://images.openfoodfacts.org/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(httpUrl);
      expect(result).toBe(httpUrl);
    });

    it('should return null for protocol-relative URLs', () => {
      const protocolRelativeUrl = '//images.openfoodfacts.org/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(protocolRelativeUrl);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(`Unknown image URL format: ${protocolRelativeUrl}`);
    });

    it('should return null for relative URLs', () => {
      const relativeUrl = '/images/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(relativeUrl);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(`Unknown image URL format: ${relativeUrl}`);
    });

    it('should return null for URLs without protocol', () => {
      const noProtocolUrl = 'images.openfoodfacts.org/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(noProtocolUrl);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(`Unknown image URL format: ${noProtocolUrl}`);
    });

    it('should return null for null input', () => {
      const result = ProductImageUrlService.resolveImageUrl(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = ProductImageUrlService.resolveImageUrl(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = ProductImageUrlService.resolveImageUrl('');
      expect(result).toBeNull();
    });

    it('should handle URLs with query parameters', () => {
      const urlWithParams = 'https://images.openfoodfacts.org/product/123.jpg?rev=5&imgid=1';
      const result = ProductImageUrlService.resolveImageUrl(urlWithParams);
      expect(result).toBe(urlWithParams);
    });

    it('should return null for malformed URLs', () => {
      const malformedUrl = 'not-a-valid-url';
      const result = ProductImageUrlService.resolveImageUrl(malformedUrl);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(`Unknown image URL format: ${malformedUrl}`);
    });

    it('should preserve fragment identifiers in valid URLs', () => {
      const urlWithFragment = 'https://images.openfoodfacts.org/product/123.jpg#main';
      const result = ProductImageUrlService.resolveImageUrl(urlWithFragment);
      expect(result).toBe(urlWithFragment);
    });

    it('should return null for invalid relative paths', () => {
      const complexRelativePath = '/images/products/123/456/789/product.jpg';
      const result = ProductImageUrlService.resolveImageUrl(complexRelativePath);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(`Unknown image URL format: ${complexRelativePath}`);
    });
  });

  describe('Supabase marker functionality', () => {
    it('should resolve Supabase marker to Supabase URL', () => {
      const marker = ProductImageUrlService.getSupabaseMarker();
      const upc = '1234567890123';
      const result = ProductImageUrlService.resolveImageUrl(marker, upc);
      expect(result).toBe('https://mock-supabase.co/storage/v1/object/public/product-images/123.jpg');
    });

    it('should return null for Supabase marker without UPC', () => {
      const marker = ProductImageUrlService.getSupabaseMarker();
      const result = ProductImageUrlService.resolveImageUrl(marker);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('Cannot resolve [SUPABASE] image URL without UPC');
    });

    it('should handle Supabase marker with query parameters', () => {
      const markerWithQuery = `${ProductImageUrlService.getSupabaseMarker()}?t=123456`;
      const upc = '1234567890123';
      const result = ProductImageUrlService.resolveImageUrl(markerWithQuery, upc);
      expect(result).toBe('https://mock-supabase.co/storage/v1/object/public/product-images/123.jpg?t=123456');
    });

    it('should handle legacy Supabase URLs', () => {
      const legacyUrl = 'https://example.supabase.co/storage/v1/object/public/product-images/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(legacyUrl);
      expect(result).toBe(legacyUrl);
    });
  });

  describe('abstractImageUrl', () => {
    it('should return null for null input', () => {
      const result = ProductImageUrlService.abstractImageUrl(null);
      expect(result).toBeNull();
    });

    it('should return Supabase marker for Supabase URLs', () => {
      const supabaseUrl = 'https://example.supabase.co/storage/v1/object/public/product-images/123.jpg';
      const upc = '123';
      const result = ProductImageUrlService.abstractImageUrl(supabaseUrl, upc);
      expect(result).toBe(ProductImageUrlService.getSupabaseMarker());
    });

    it('should return external URLs as-is', () => {
      const externalUrl = 'https://images.openfoodfacts.org/product/123.jpg';
      const result = ProductImageUrlService.abstractImageUrl(externalUrl);
      expect(result).toBe(externalUrl);
    });
  });

  describe('Edge cases', () => {
    it('should handle URLs with different image extensions', () => {
      const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
      
      extensions.forEach(ext => {
        const url = `https://images.openfoodfacts.org/product/123.${ext}`;
        const result = ProductImageUrlService.resolveImageUrl(url);
        expect(result).toBe(url);
      });
    });

    it('should handle international domain names', () => {
      const internationalUrl = 'https://images.openfoodfacts.fr/product/123.jpg';
      const result = ProductImageUrlService.resolveImageUrl(internationalUrl);
      expect(result).toBe(internationalUrl);
    });

    it('should handle URLs with special characters', () => {
      const specialCharUrl = 'https://images.openfoodfacts.org/product/123%20test.jpg';
      const result = ProductImageUrlService.resolveImageUrl(specialCharUrl);
      expect(result).toBe(specialCharUrl);
    });
  });

  describe('Utility methods', () => {
    it('should identify Supabase markers correctly', () => {
      const marker = ProductImageUrlService.getSupabaseMarker();
      expect(ProductImageUrlService.isSupabaseMarker(marker)).toBe(true);
      expect(ProductImageUrlService.isSupabaseMarker('https://example.com/image.jpg')).toBe(false);
      expect(ProductImageUrlService.isSupabaseMarker(null)).toBe(false);
    });

    it('should resolve first available image from multiple sources', () => {
      const sources = [
        { imageUrl: null },
        { imageUrl: 'invalid-url' },
        { imageUrl: 'https://images.openfoodfacts.org/product/123.jpg' },
        { imageUrl: 'https://images.openfoodfacts.org/product/456.jpg' },
      ];

      const result = ProductImageUrlService.resolveFirstAvailableImage(sources);
      expect(result).toBe('https://images.openfoodfacts.org/product/123.jpg');
    });

    it('should return null when no sources are available', () => {
      const sources = [
        { imageUrl: null },
        { imageUrl: 'invalid-url' },
        { imageUrl: '' },
      ];

      const result = ProductImageUrlService.resolveFirstAvailableImage(sources);
      expect(result).toBeNull();
    });
  });
});