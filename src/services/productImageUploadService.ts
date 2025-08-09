import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabaseClient';
import { ProductImageUrlService } from './productImageUrlService';

export interface ImageUploadResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export class ProductImageUploadService {
  private static readonly BUCKET_NAME = 'product-images';
  private static readonly MAX_IMAGE_HEIGHT = 400;

  /**
   * Uploads a product image to Supabase Storage after resizing it
   * @param imageUri - The URI of the captured image
   * @param upc - The UPC code to use as the filename
   * @returns Promise with upload result
   */
  static async uploadProductImage(imageUri: string, upc: string): Promise<ImageUploadResult> {
    let resizedImage: ImageManipulator.ImageResult | null = null;
    let blob: Blob | null = null;
    let arrayBuffer: ArrayBuffer | null = null;
    
    try {
      console.log(`Starting image upload for UPC: ${upc}`);

      // Step 1: Resize the image to max height of 400px (always with base64 for reliable upload)
      resizedImage = await this.resizeImage(imageUri);
      if (!resizedImage) {
        throw new Error('Failed to resize image');
      }
      console.log(`Resized image URI: ${resizedImage.uri}`);
      
      // Step 2: Generate filename using UPC
      const fileName = `${upc}.jpg`;
      
      // Step 3: Upload to Supabase Storage
      console.log(`Uploading image to Supabase: ${fileName}`);
      
      let uploadData;
      let uploadError;
      
      // Use base64 upload method (most reliable for React Native)
      if (!resizedImage.base64) {
        throw new Error('No base64 data available for upload');
      }

      try {
        // Convert base64 to Uint8Array (most reliable method for React Native)
        console.log('Converting base64 to Uint8Array for upload...');
        const base64Data = resizedImage.base64;
        const binaryString = atob(base64Data);
        const uint8Array = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }
        
        console.log(`Base64 converted to Uint8Array: ${uint8Array.length} bytes`);
        
        const result = await supabase.storage
          .from(this.BUCKET_NAME)
          .upload(fileName, uint8Array, {
            contentType: 'image/jpeg',
            upsert: true
          });
          
        uploadData = result.data;
        uploadError = result.error;
        console.log(`Uint8Array upload result:`, { data: uploadData, error: uploadError });
        
      } catch (uploadErr) {
        console.error('Uint8Array upload failed:', uploadErr);
        uploadError = uploadErr;
      }

      if (uploadError) {
        console.error('Error uploading to Supabase:', uploadError);
        return {
          success: false,
          error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
        };
      }

      console.log('Upload completed successfully');
      
      // Step 6: Return the Supabase marker instead of full URL
      const supabaseMarker = ProductImageUrlService.getSupabaseMarker();
      console.log(`✅ Image upload successful. Using Supabase marker: ${supabaseMarker}`);
      
      // Step 7: Verify the uploaded file by trying to download it
      console.log('Verifying uploaded file...');
      try {
        const { data: downloadData, error: downloadError } = await supabase.storage
          .from(this.BUCKET_NAME)
          .download(fileName);
          
        if (downloadError) {
          console.warn('Could not verify file:', downloadError.message);
        } else if (downloadData) {
          console.log(`File verification: downloaded size=${downloadData.size} bytes`);
          if (downloadData.size === 0) {
            console.error('❌ Downloaded file is empty!');
            return {
              success: false,
              error: 'Uploaded file verification failed - file is empty'
            };
          }
        }
      } catch (verifyError) {
        console.warn('File verification failed:', verifyError);
        // Don't fail the upload if verification fails
      }
      
      return {
        success: true,
        imageUrl: supabaseMarker
      };

    } catch (error) {
      console.error('Error in uploadProductImage:', error);
      return {
        success: false,
        error: `Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      // Clean up memory
      resizedImage = null;
      blob = null;
      arrayBuffer = null;
    }
  }

  /**
   * Resizes an image optimized for memory usage - tries without base64 first
   * @param imageUri - The URI of the image to resize
   * @returns Promise with the resized image data
   */
  private static async resizeImageOptimized(imageUri: string): Promise<ImageManipulator.ImageResult> {
    try {
      // First try without base64 to save memory
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            resize: {
              height: this.MAX_IMAGE_HEIGHT,
            }
          }
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );
      
      // Test if we can fetch the URI
      try {
        const testResponse = await fetch(manipulatedImage.uri);
        if (testResponse.ok) {
          await testResponse.blob(); // Release the test blob immediately
          return manipulatedImage;
        }
      } catch {
        // If fetch fails, fall back to base64 method
      }
    } catch (error) {
      console.warn('Optimized resize failed, falling back to base64:', error);
    }
    
    // Fallback to include base64
    return this.resizeImage(imageUri);
  }
  
  /**
   * Resizes an image to have a maximum height of 400px while maintaining aspect ratio (with base64 fallback)
   * @param imageUri - The URI of the original image
   * @returns Promise with manipulated image result
   */
  private static async resizeImage(imageUri: string): Promise<ImageManipulator.ImageResult> {
    try {
      console.log('Resizing image to max height of 400px');
      
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            resize: {
              height: this.MAX_IMAGE_HEIGHT,
              // Width will be calculated automatically to maintain aspect ratio
            }
          }
        ],
        {
          compress: 0.8, // Good quality while reducing file size
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true, // Include base64 in response for alternative conversion
        }
      );

      console.log(`Image resized. New dimensions: ${manipulatedImage.width}x${manipulatedImage.height}`);
      return manipulatedImage;

    } catch (error) {
      console.error('Error resizing image:', error);
      throw new Error(`Failed to resize image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates the product record with the uploaded image URL using the edge function
   * @param upc - The UPC of the product to update
   * @param imageUrl - The public URL of the uploaded image
   * @returns Promise with update success status
   */
  static async updateProductImageUrl(upc: string, imageUrl: string, maxRetries = 3): Promise<boolean> {
    console.log(`💾 [ProductImageUploadService] *** UPDATING DATABASE IMAGE URL ***`);
    console.log(`💾 [ProductImageUploadService] UPC: ${upc}`);
    console.log(`💾 [ProductImageUploadService] New image URL: ${imageUrl}`);
    console.log(`💾 [ProductImageUploadService] Max retries: ${maxRetries}`);
    console.log(`💾 [ProductImageUploadService] Timestamp: ${new Date().toISOString()}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`💾 [ProductImageUploadService] *** ATTEMPT ${attempt}/${maxRetries} ***`);
        console.log(`💾 [ProductImageUploadService] Calling edge function: update-product-image`);
        console.log(`💾 [ProductImageUploadService] Function payload:`, { upc, imageUrl });

        // Call the edge function to update the product (has service role access)
        const { data, error } = await supabase.functions.invoke('update-product-image', {
          body: {
            upc: upc,
            imageUrl: imageUrl,
          },
        });

        console.log(`💾 [ProductImageUploadService] Edge function response:`, {
          hasData: !!data,
          hasError: !!error,
          errorMessage: error?.message,
          dataSuccess: data?.success,
          dataError: data?.error
        });

        if (error) {
          console.error(`💾 [ProductImageUploadService] Edge function error (attempt ${attempt}):`, error.message);
          console.error(`💾 [ProductImageUploadService] Full error object:`, error);
          if (attempt === maxRetries) {
            console.error(`💾 [ProductImageUploadService] Max retries reached, giving up`);
            return false;
          }
          console.log(`💾 [ProductImageUploadService] Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        if (!data?.success) {
          console.error(`💾 [ProductImageUploadService] Edge function returned failure (attempt ${attempt}):`, data?.error);
          console.error(`💾 [ProductImageUploadService] Full response data:`, data);
          if (attempt === maxRetries) {
            console.error(`💾 [ProductImageUploadService] Max retries reached, giving up`);
            return false;
          }
          console.log(`💾 [ProductImageUploadService] Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        console.log(`✅ [ProductImageUploadService] *** DATABASE UPDATE SUCCESSFUL ***`);
        console.log(`✅ [ProductImageUploadService] Successfully updated product via edge function`);
        
        if (data.updatedProduct) {
          console.log(`✅ [ProductImageUploadService] Updated product details:`, {
            product_name: data.updatedProduct.product_name,
            imageurl: data.updatedProduct.imageurl,
            upc13: data.updatedProduct.upc13,
            barcode: data.updatedProduct.barcode
          });
          
          // Verify the image URL was actually set
          if (data.updatedProduct.imageurl === imageUrl) {
            console.log(`✅ [ProductImageUploadService] Image URL correctly saved in database`);
          } else {
            console.warn(`⚠️ [ProductImageUploadService] Image URL mismatch!`, {
              expected: imageUrl,
              actual: data.updatedProduct.imageurl
            });
          }
        } else {
          console.log(`⚠️ [ProductImageUploadService] No updated product data returned`);
        }
        
        return true;

      } catch (error) {
        console.error(`💾 [ProductImageUploadService] Exception calling edge function (attempt ${attempt}):`, error);
        console.error(`💾 [ProductImageUploadService] Exception stack:`, error.stack);
        if (attempt === maxRetries) {
          console.error(`💾 [ProductImageUploadService] Max retries reached, giving up after exception`);
          return false;
        }
        console.log(`💾 [ProductImageUploadService] Retrying in 1 second after exception...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.error(`💾 [ProductImageUploadService] All attempts failed, returning false`);
    return false;
  }

  /**
   * Complete async process: upload image and update product record
   * This is the main method to call from the product creation service
   * @param imageUri - The URI of the captured image
   * @param upc - The UPC code of the product
   */
  static async processProductImage(imageUri: string, upc: string): Promise<void> {
    try {
      console.log(`🖼️ Starting image processing for product ${upc}`);
      
      // Upload the image
      const uploadResult = await this.uploadProductImage(imageUri, upc);
      
      if (!uploadResult.success || !uploadResult.imageUrl) {
        console.error(`❌ Image upload failed for UPC ${upc}:`, uploadResult.error);
        return;
      }

      console.log(`✅ Image uploaded successfully for UPC ${upc}: ${uploadResult.imageUrl}`);

      // Update the product record with the new image URL
      const updateSuccess = await this.updateProductImageUrl(upc, uploadResult.imageUrl);
      
      if (!updateSuccess) {
        console.error(`❌ Failed to update product record for UPC ${upc} with image URL`);
        // Note: Image was uploaded successfully but database update failed
        // The image is still available in storage at the expected filename
        return;
      }

      console.log(`🎉 Successfully processed image for product ${upc}`);

    } catch (error) {
      console.error(`❌ Error processing image for product ${upc}:`, error);
    }
  }

  /**
   * Updates the product record with the uploaded image URL and returns the full response
   * @param upc - The UPC of the product to update
   * @param imageUrl - The public URL of the uploaded image
   * @returns Promise with full edge function response including updatedProduct
   */
  static async updateProductImageUrlWithResponse(upc: string, imageUrl: string, maxRetries = 3): Promise<{
    success: boolean;
    updatedProduct?: any;
    error?: string;
  }> {
    console.log(`💾 [ProductImageUploadService] *** UPDATING DATABASE WITH FULL RESPONSE ***`);
    console.log(`💾 [ProductImageUploadService] UPC: ${upc}`);
    console.log(`💾 [ProductImageUploadService] New image URL: ${imageUrl}`);
    console.log(`💾 [ProductImageUploadService] Max retries: ${maxRetries}`);
    console.log(`💾 [ProductImageUploadService] Timestamp: ${new Date().toISOString()}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`💾 [ProductImageUploadService] *** ATTEMPT ${attempt}/${maxRetries} ***`);
        console.log(`💾 [ProductImageUploadService] Calling edge function: update-product-image`);
        console.log(`💾 [ProductImageUploadService] Function payload:`, { upc, imageUrl });

        // Call the edge function to update the product (has service role access)
        const { data, error } = await supabase.functions.invoke('update-product-image', {
          body: {
            upc: upc,
            imageUrl: imageUrl,
          },
        });

        console.log(`💾 [ProductImageUploadService] Edge function response:`, {
          hasData: !!data,
          hasError: !!error,
          errorMessage: error?.message,
          dataSuccess: data?.success,
          dataError: data?.error,
          hasUpdatedProduct: !!data?.updatedProduct
        });

        if (error) {
          console.error(`💾 [ProductImageUploadService] Edge function error (attempt ${attempt}):`, error.message);
          if (attempt === maxRetries) {
            console.error(`💾 [ProductImageUploadService] Max retries reached, giving up`);
            return { success: false, error: error.message };
          }
          console.log(`💾 [ProductImageUploadService] Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        if (!data?.success) {
          console.error(`💾 [ProductImageUploadService] Edge function returned failure (attempt ${attempt}):`, data?.error);
          if (attempt === maxRetries) {
            console.error(`💾 [ProductImageUploadService] Max retries reached, giving up`);
            return { success: false, error: data?.error || 'Edge function returned failure' };
          }
          console.log(`💾 [ProductImageUploadService] Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        console.log(`✅ [ProductImageUploadService] *** DATABASE UPDATE SUCCESSFUL WITH FULL RESPONSE ***`);
        console.log(`✅ [ProductImageUploadService] Successfully updated product via edge function`);
        
        if (data.updatedProduct) {
          console.log(`✅ [ProductImageUploadService] Returning full updated product:`, {
            product_name: data.updatedProduct.product_name,
            imageurl: data.updatedProduct.imageurl,
            classification: data.updatedProduct.classification
          });
        }

        return {
          success: true,
          updatedProduct: data.updatedProduct
        };

      } catch (error) {
        console.error(`💾 [ProductImageUploadService] Unexpected error (attempt ${attempt}):`, error);
        if (attempt === maxRetries) {
          console.error(`💾 [ProductImageUploadService] Max retries reached, giving up`);
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
        console.log(`💾 [ProductImageUploadService] Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return { success: false, error: 'Should never reach here' };
  }
}