import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabaseClient';

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
    try {
      console.log(`Starting image upload for UPC: ${upc}`);

      // Step 1: Resize the image to max height of 400px
      const resizedImage = await this.resizeImage(imageUri);
      console.log(`Resized image URI: ${resizedImage.uri}`);
      
      // Step 2: Convert to blob for upload
      console.log('Converting resized image to blob...');
      let blob: Blob;
      
      try {
        // Try fetching the URI first
        const response = await fetch(resizedImage.uri);
        console.log(`Fetch response status: ${response.status}, content-length: ${response.headers.get('content-length')}`);
        
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }
        
        blob = await response.blob();
        console.log(`Blob created from URI: size=${blob.size}, type=${blob.type}`);
        
        // Validate blob has content
        if (blob.size === 0) {
          throw new Error('Blob from URI is empty, trying base64 fallback');
        }
      } catch (fetchError) {
        console.warn('Fetch method failed, trying base64 conversion:', fetchError);
        
        // Fallback to base64 conversion
        if (!resizedImage.base64) {
          throw new Error('No base64 data available for fallback conversion');
        }
        
        // Convert base64 to blob
        const base64Data = resizedImage.base64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        blob = new Blob([bytes], { type: 'image/jpeg' });
        console.log(`Blob created from base64: size=${blob.size}, type=${blob.type}`);
        
        // Validate blob has content
        if (blob.size === 0) {
          throw new Error('Base64 converted blob is also empty (0 bytes)');
        }
      }
      
      // Step 3: Generate filename using UPC
      const fileName = `${upc}.jpg`;
      
      // Step 4: Upload to Supabase Storage
      console.log(`Uploading image to Supabase: ${fileName}`);
      console.log(`Blob details before upload: size=${blob.size}, type=${blob.type}`);
      
      let uploadData;
      let uploadError;
      
      // Try multiple upload methods for React Native compatibility
      try {
        // Method 1: Try ArrayBuffer (most reliable for React Native)
        console.log('Trying ArrayBuffer upload...');
        const arrayBuffer = await blob.arrayBuffer();
        console.log(`ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
        
        const result1 = await supabase.storage
          .from(this.BUCKET_NAME)
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });
          
        uploadData = result1.data;
        uploadError = result1.error;
        console.log(`ArrayBuffer upload result:`, { data: uploadData, error: uploadError });
        
      } catch (arrayBufferError) {
        console.warn('ArrayBuffer upload failed, trying base64...', arrayBufferError);
        
        // Method 2: Fallback to base64 upload if we have it
        if (resizedImage.base64) {
          try {
            // Convert base64 to Uint8Array
            const base64Data = resizedImage.base64;
            const binaryString = atob(base64Data);
            const uint8Array = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
              uint8Array[i] = binaryString.charCodeAt(i);
            }
            
            console.log(`Base64 converted to Uint8Array: ${uint8Array.length} bytes`);
            
            const result2 = await supabase.storage
              .from(this.BUCKET_NAME)
              .upload(fileName, uint8Array, {
                contentType: 'image/jpeg',
                upsert: true
              });
              
            uploadData = result2.data;
            uploadError = result2.error;
            console.log(`Base64 upload result:`, { data: uploadData, error: uploadError });
            
          } catch (base64Error) {
            console.error('Base64 upload also failed:', base64Error);
            uploadError = base64Error;
          }
        } else {
          uploadError = new Error('No base64 data available for fallback');
        }
      }

      if (uploadError) {
        console.error('Error uploading to Supabase:', uploadError);
        return {
          success: false,
          error: `Upload failed: ${uploadError.message}`
        };
      }

      console.log('Upload completed successfully');
      
      // Step 5: Get public URL for the uploaded image
      const { data: publicUrlData } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);

      console.log(`✅ Image upload successful. Public URL: ${publicUrlData.publicUrl}`);
      
      // Step 6: Verify the uploaded file by trying to download it
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
        imageUrl: publicUrlData.publicUrl
      };

    } catch (error) {
      console.error('Error in uploadProductImage:', error);
      return {
        success: false,
        error: `Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Resizes an image to have a maximum height of 400px while maintaining aspect ratio
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
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Updating product ${upc} with image URL via edge function (attempt ${attempt}/${maxRetries}): ${imageUrl}`);

        // Call the edge function to update the product (has service role access)
        const { data, error } = await supabase.functions.invoke('update-product-image', {
          body: {
            upc: upc,
            imageUrl: imageUrl,
          },
        });

        if (error) {
          console.error(`Edge function error (attempt ${attempt}):`, error.message);
          if (attempt === maxRetries) return false;
          console.log(`Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        if (!data?.success) {
          console.error(`Edge function returned failure (attempt ${attempt}):`, data?.error);
          if (attempt === maxRetries) return false;
          console.log(`Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        console.log('✅ Successfully updated product via edge function');
        if (data.updatedProduct) {
          console.log(`Updated product: ${data.updatedProduct.product_name} with imageurl: ${data.updatedProduct.imageurl}`);
        }
        return true;

      } catch (error) {
        console.error(`Error calling update-product-image edge function (attempt ${attempt}):`, error);
        if (attempt === maxRetries) return false;
        console.log(`Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
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
}