/**
 * Photo Validation Service
 * 
 * Provides client-side photo validation to catch obvious quality issues
 * before sending to edge functions, matching the validation standards
 * used in the "add new product" workflow.
 */

import * as ImageManipulator from 'expo-image-manipulator';

export interface PhotoValidationResult {
  isValid: boolean;
  error?: string;
  errorType?: 'blank_image' | 'too_small' | 'low_quality' | 'unknown_error';
  confidence?: number;
}

export class PhotoValidationService {
  private static readonly MIN_IMAGE_SIZE = 100; // Minimum width/height in pixels
  private static readonly MIN_FILE_SIZE = 1024; // Minimum file size in bytes (1KB)
  
  /**
   * Validates a captured photo for basic quality issues
   * @param imageUri - The URI of the captured image
   * @returns Promise with validation result
   */
  static async validatePhoto(imageUri: string): Promise<PhotoValidationResult> {
    try {
      console.log(`📸 Validating photo: ${imageUri}`);
      
      // Step 1: Get image information
      const imageInfo = await this.getImageInfo(imageUri);
      if (!imageInfo.success) {
        return {
          isValid: false,
          error: 'Unable to read image information',
          errorType: 'unknown_error'
        };
      }
      
      // Step 2: Check image dimensions
      if (imageInfo.width < this.MIN_IMAGE_SIZE || imageInfo.height < this.MIN_IMAGE_SIZE) {
        return {
          isValid: false,
          error: 'Image is too small to process clearly',
          errorType: 'too_small'
        };
      }
      
      // Step 3: Check file size (convert to base64 to estimate)
      const base64Result = await this.convertToBase64(imageUri);
      if (!base64Result.success || !base64Result.base64) {
        return {
          isValid: false,
          error: 'Unable to process image data',
          errorType: 'unknown_error'
        };
      }
      
      // Estimate file size from base64 (base64 is roughly 4/3 the size of original)
      const estimatedSize = (base64Result.base64.length * 3) / 4;
      if (estimatedSize < this.MIN_FILE_SIZE) {
        return {
          isValid: false,
          error: 'Image file size is too small, may be blank or corrupted',
          errorType: 'blank_image'
        };
      }
      
      // Step 4: Basic quality assessment
      const qualityScore = this.assessImageQuality(base64Result.base64, imageInfo);
      if (qualityScore < 0.5) {
        return {
          isValid: false,
          error: 'The photo quality is too low to process. Please take a clearer photo.',
          errorType: 'low_quality',
          confidence: qualityScore
        };
      }
      
      console.log(`✅ Photo validation passed. Quality score: ${qualityScore.toFixed(2)}`);
      return {
        isValid: true,
        confidence: qualityScore
      };
      
    } catch (error) {
      console.error('Error validating photo:', error);
      return {
        isValid: false,
        error: 'Failed to validate photo quality',
        errorType: 'unknown_error'
      };
    }
  }
  
  /**
   * Gets basic image information
   */
  private static async getImageInfo(imageUri: string): Promise<{
    success: boolean;
    width: number;
    height: number;
    error?: string;
  }> {
    try {
      // Use ImageManipulator to get image info without modifying it
      const info = await ImageManipulator.manipulateAsync(
        imageUri,
        [], // No manipulations
        {
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      
      return {
        success: true,
        width: info.width,
        height: info.height
      };
    } catch (error) {
      return {
        success: false,
        width: 0,
        height: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Converts image to base64 for quality assessment
   */
  private static async convertToBase64(imageUri: string): Promise<{
    success: boolean;
    base64?: string;
    error?: string;
  }> {
    try {
      // Use ImageManipulator to get base64 - compress slightly to reduce processing time
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            resize: {
              width: 800, // Resize for faster processing while maintaining quality assessment
            }
          }
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      
      return {
        success: true,
        base64: result.base64
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Basic quality assessment based on image characteristics
   * Returns a score from 0 to 1, where higher is better quality
   */
  private static assessImageQuality(base64Data: string, imageInfo: { width: number; height: number }): number {
    try {
      // Start with a base score
      let qualityScore = 0.6;
      
      // Factor 1: Image size (larger images generally have more detail)
      const totalPixels = imageInfo.width * imageInfo.height;
      if (totalPixels > 500000) { // > 0.5MP
        qualityScore += 0.2;
      } else if (totalPixels > 200000) { // > 0.2MP
        qualityScore += 0.1;
      }
      
      // Factor 2: File size vs dimensions ratio (indicates compression quality)
      const estimatedFileSize = (base64Data.length * 3) / 4;
      const bytesPerPixel = estimatedFileSize / totalPixels;
      if (bytesPerPixel > 0.5) { // Good quality JPEG ratio
        qualityScore += 0.2;
      } else if (bytesPerPixel > 0.2) {
        qualityScore += 0.1;
      }
      
      // Factor 3: Base64 data length (very short suggests blank or corrupted)
      if (base64Data.length < 5000) { // Very small base64 suggests problem
        qualityScore -= 0.3;
      } else if (base64Data.length < 15000) {
        qualityScore -= 0.1;
      }
      
      // Clamp score between 0 and 1
      return Math.max(0, Math.min(1, qualityScore));
      
    } catch (error) {
      console.warn('Error assessing image quality:', error);
      return 0.3; // Conservative score if assessment fails
    }
  }
  
  /**
   * Formats validation error for display to user
   * Matches the error messages used in PhotoErrorHandler
   */
  static formatValidationError(result: PhotoValidationResult): {
    title: string;
    message: string;
    suggestions: string[];
  } {
    switch (result.errorType) {
      case 'blank_image':
        return {
          title: 'Photo Quality Too Low',
          message: 'The photo appears to be blank or corrupted. Please take a new photo.',
          suggestions: [
            'Make sure the camera lens is clean',
            'Ensure there is adequate lighting',
            'Try taking the photo again',
            'Make sure you\'re pointing the camera at the product'
          ]
        };
        
      case 'too_small':
        return {
          title: 'Photo Quality Too Low',
          message: 'The photo resolution is too low to process clearly. Please take a larger photo.',
          suggestions: [
            'Move closer to the product',
            'Make sure the product fills most of the frame',
            'Check your camera settings for higher resolution',
            'Try taking the photo again'
          ]
        };
        
      case 'low_quality':
        return {
          title: 'Photo Quality Too Low',
          message: result.error || 'The photo quality is too low to process. Please take a clearer photo.',
          suggestions: [
            'Take a clearer photo with better lighting',
            'Move closer to the product',
            'Ensure the text is clearly visible',
            'Clean the camera lens',
            'Hold the camera steady'
          ]
        };
        
      case 'unknown_error':
      default:
        return {
          title: 'Photo Validation Failed',
          message: result.error || 'Unable to validate photo quality. Please try again.',
          suggestions: [
            'Try taking the photo again',
            'Restart the camera if the problem persists',
            'Check if there is enough storage space',
            'Close and reopen the app if needed'
          ]
        };
    }
  }
}