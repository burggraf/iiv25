/**
 * Tests for PhotoValidationService
 */

import { PhotoValidationService } from '../PhotoValidationService';

// Mock ImageManipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
  },
}));

const mockImageManipulator = require('expo-image-manipulator');

describe('PhotoValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validatePhoto', () => {
    it('should reject images that are too small', async () => {
      // Mock very small image
      mockImageManipulator.manipulateAsync
        .mockResolvedValueOnce({
          width: 50,
          height: 50,
          uri: 'file://test.jpg',
        })
        .mockResolvedValueOnce({
          width: 50,
          height: 50,
          uri: 'file://test-resized.jpg',
          base64: 'dGVzdA==', // Very short base64
        });

      const result = await PhotoValidationService.validatePhoto('file://test.jpg');

      expect(result.isValid).toBe(false);
      expect(result.errorType).toBe('too_small');
      expect(result.error).toContain('too small');
    });

    it('should reject images with very small file size (blank images)', async () => {
      // Mock image with good dimensions but tiny file size
      mockImageManipulator.manipulateAsync
        .mockResolvedValueOnce({
          width: 800,
          height: 600,
          uri: 'file://test.jpg',
        })
        .mockResolvedValueOnce({
          width: 800,
          height: 600,
          uri: 'file://test-resized.jpg',
          base64: 'dA==', // Extremely short base64 (blank/corrupted)
        });

      const result = await PhotoValidationService.validatePhoto('file://test.jpg');

      expect(result.isValid).toBe(false);
      expect(result.errorType).toBe('blank_image');
      expect(result.error).toContain('file size is too small');
    });

    it('should accept good quality images', async () => {
      // Mock good quality image with realistic base64 content
      const largeBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAv/aAAwDAQACEAMQAAABVwAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAh//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AQH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AQH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ah//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IQH/2gAMAwEAAgADAAAAEPPPPH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EAH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EAH/2Q==' + 'A'.repeat(15000); // Start with valid JPEG header then pad
      
      mockImageManipulator.manipulateAsync
        .mockResolvedValueOnce({
          width: 1200,
          height: 800,
          uri: 'file://test.jpg',
        })
        .mockResolvedValueOnce({
          width: 800,
          height: 533,
          uri: 'file://test-resized.jpg',
          base64: largeBase64,
        });

      const result = await PhotoValidationService.validatePhoto('file://test.jpg');

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle image processing errors gracefully', async () => {
      mockImageManipulator.manipulateAsync.mockRejectedValue(new Error('Image processing failed'));

      const result = await PhotoValidationService.validatePhoto('file://test.jpg');

      expect(result.isValid).toBe(false);
      expect(result.errorType).toBe('unknown_error');
      expect(result.error).toContain('Failed to validate photo quality');
    });
  });

  describe('formatValidationError', () => {
    it('should format blank image errors correctly', () => {
      const result = {
        isValid: false,
        errorType: 'blank_image' as const,
        error: 'Test error'
      };

      const formatted = PhotoValidationService.formatValidationError(result);

      expect(formatted.title).toBe('Photo Quality Too Low');
      expect(formatted.message).toContain('blank');
      expect(formatted.suggestions).toContain('Make sure the camera lens is clean');
    });

    it('should format low quality errors correctly', () => {
      const result = {
        isValid: false,
        errorType: 'low_quality' as const,
        error: 'Photo quality too low',
        confidence: 0.3
      };

      const formatted = PhotoValidationService.formatValidationError(result);

      expect(formatted.title).toBe('Photo Quality Too Low');
      expect(formatted.message).toBe('Photo quality too low');
      expect(formatted.suggestions).toContain('Take a clearer photo with better lighting');
    });

    it('should format too small errors correctly', () => {
      const result = {
        isValid: false,
        errorType: 'too_small' as const,
        error: 'Image too small'
      };

      const formatted = PhotoValidationService.formatValidationError(result);

      expect(formatted.title).toBe('Photo Quality Too Low');
      expect(formatted.message).toContain('resolution is too low');
      expect(formatted.suggestions).toContain('Move closer to the product');
    });

    it('should format unknown errors correctly', () => {
      const result = {
        isValid: false,
        errorType: 'unknown_error' as const,
        error: 'Something went wrong'
      };

      const formatted = PhotoValidationService.formatValidationError(result);

      expect(formatted.title).toBe('Photo Validation Failed');
      expect(formatted.message).toBe('Something went wrong');
      expect(formatted.suggestions).toContain('Try taking the photo again');
    });
  });
});