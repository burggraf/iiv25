/**
 * Photo Error Handler
 * 
 * Centralizes error processing for photo capture workflows,
 * providing consistent error detection, categorization, and recovery suggestions
 */

import { BackgroundJob } from '../types/backgroundJobs';
import { PhotoWorkflowType } from '../types/photoWorkflow';

export type PhotoErrorType = 
  | 'camera_permission_denied'
  | 'camera_initialization_failed'
  | 'photo_capture_failed'
  | 'photo_quality_too_low'
  | 'photo_upload_failed'
  | 'product_creation_failed'
  | 'ingredient_parsing_failed'
  | 'confidence_threshold_not_met'
  | 'network_error'
  | 'storage_error'
  | 'unknown_error';

export interface PhotoError {
  type: PhotoErrorType;
  message: string;
  userMessage: string;
  isRecoverable: boolean;
  retryable: boolean;
  suggestedActions: string[];
  technicalDetails?: any;
}

export interface ErrorRecoveryOptions {
  allowRetry: boolean;
  allowSkip: boolean;
  maxRetryAttempts: number;
  retryDelayMs: number;
  alternativeActions: Array<{
    label: string;
    action: 'retry' | 'skip' | 'cancel' | 'manual_entry' | 'different_photo';
  }>;
}

export class PhotoErrorHandler {
  /**
   * Analyzes a job result to detect and categorize errors
   */
  static analyzeJobError(job: BackgroundJob): PhotoError | null {
    if (job.status === 'completed' && !this.hasJobErrors(job)) {
      return null; // No error detected
    }

    // Extract error information from different sources
    const errorMessage = job.errorMessage || job.resultData?.error || 'Unknown error occurred';
    const resultData = job.resultData || {};

    // Categorize the error based on job type and error details
    const errorType = this.categorizeError(job.jobType, errorMessage, resultData);
    
    return this.createPhotoError(errorType, errorMessage, job);
  }

  /**
   * Checks if a job has errors based on job type and result data
   */
  private static hasJobErrors(job: BackgroundJob): boolean {
    switch (job.jobType) {
      case 'product_photo_upload':
        return !job.resultData?.success || !!job.resultData?.error || job.resultData?.uploadFailed;
      
      case 'ingredient_parsing':
        return job.resultData?.error && job.resultData.error.includes('photo quality too low');
      
      case 'product_creation':
        const hasConfidenceError = job.resultData?.error === 'Product title scan failed.';
        const hasResultError = !job.resultData?.success || !!job.resultData?.error;
        const productWasCreated = job.resultData?.productData || job.resultData?.product;
        return hasConfidenceError || (hasResultError && !productWasCreated);
      
      default:
        return job.status === 'failed' || !!job.errorMessage;
    }
  }

  /**
   * Categorizes errors based on job type and error content
   */
  private static categorizeError(
    jobType: string, 
    errorMessage: string, 
    resultData: any
  ): PhotoErrorType {
    const lowerMessage = errorMessage.toLowerCase();

    // Confidence/quality issues
    if (lowerMessage.includes('photo quality too low') || 
        lowerMessage.includes('quality too low')) {
      return 'photo_quality_too_low';
    }

    if (lowerMessage.includes('product title scan failed') ||
        lowerMessage.includes('confidence') ||
        lowerMessage.includes('not enough confidence')) {
      return 'confidence_threshold_not_met';
    }

    // Network-related errors
    if (lowerMessage.includes('network') || 
        lowerMessage.includes('connection') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('fetch')) {
      return 'network_error';
    }

    // Storage/upload errors
    if (lowerMessage.includes('upload') || 
        lowerMessage.includes('storage') ||
        resultData.uploadFailed) {
      return 'photo_upload_failed';
    }

    // Job-specific error categorization
    switch (jobType) {
      case 'product_creation':
        return 'product_creation_failed';
      
      case 'ingredient_parsing':
        return 'ingredient_parsing_failed';
      
      case 'product_photo_upload':
        return 'photo_upload_failed';
      
      default:
        return 'unknown_error';
    }
  }

  /**
   * Creates a comprehensive PhotoError object
   */
  private static createPhotoError(
    errorType: PhotoErrorType, 
    technicalMessage: string, 
    job?: BackgroundJob
  ): PhotoError {
    const errorConfig = this.getErrorConfiguration(errorType);
    
    return {
      type: errorType,
      message: technicalMessage,
      userMessage: errorConfig.userMessage,
      isRecoverable: errorConfig.isRecoverable,
      retryable: errorConfig.retryable,
      suggestedActions: errorConfig.suggestedActions,
      technicalDetails: job ? {
        jobId: job.id,
        jobType: job.jobType,
        retryCount: job.retryCount,
        resultData: job.resultData,
      } : undefined,
    };
  }

  /**
   * Gets error configuration for different error types
   */
  private static getErrorConfiguration(errorType: PhotoErrorType): {
    userMessage: string;
    isRecoverable: boolean;
    retryable: boolean;
    suggestedActions: string[];
  } {
    switch (errorType) {
      case 'photo_quality_too_low':
        return {
          userMessage: 'The photo quality is too low to process. Please take a clearer photo.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Take a clearer photo with better lighting',
            'Move closer to the product',
            'Ensure the text is clearly visible',
            'Clean the camera lens',
          ],
        };

      case 'confidence_threshold_not_met':
        return {
          userMessage: 'Unable to read the product information clearly. Please try taking a different photo.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Take a photo with better lighting',
            'Ensure the product name is clearly visible',
            'Try a different angle',
            'Make sure the product is in focus',
          ],
        };

      case 'photo_upload_failed':
        return {
          userMessage: 'Failed to upload the photo. Please check your connection and try again.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Check your internet connection',
            'Try again in a few moments',
            'Close and reopen the app if the problem persists',
          ],
        };

      case 'network_error':
        return {
          userMessage: 'Network connection error. Please check your internet connection.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Check your internet connection',
            'Try switching between WiFi and mobile data',
            'Wait a moment and try again',
          ],
        };

      case 'camera_permission_denied':
        return {
          userMessage: 'Camera permission is required to take photos.',
          isRecoverable: true,
          retryable: false,
          suggestedActions: [
            'Grant camera permission in device settings',
            'Restart the app after granting permission',
          ],
        };

      case 'camera_initialization_failed':
        return {
          userMessage: 'Failed to initialize the camera. Please try again.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Close and reopen the camera',
            'Restart the app',
            'Ensure no other apps are using the camera',
          ],
        };

      case 'photo_capture_failed':
        return {
          userMessage: 'Failed to capture the photo. Please try again.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Try taking the photo again',
            'Ensure there is enough storage space',
            'Check if the camera is working properly',
          ],
        };

      case 'product_creation_failed':
        return {
          userMessage: 'Failed to create the product. Please try again.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Ensure the product photo shows the name clearly',
            'Try taking a new photo',
            'Check your internet connection',
          ],
        };

      case 'ingredient_parsing_failed':
        return {
          userMessage: 'Failed to read the ingredients. Please take a clearer photo of the ingredients list.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Take a closer photo of the ingredients list',
            'Ensure the ingredients text is clearly visible',
            'Use better lighting',
            'Try a different angle',
          ],
        };

      case 'storage_error':
        return {
          userMessage: 'Storage error occurred. Please check available space.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Free up storage space on your device',
            'Clear app cache',
            'Restart the app',
          ],
        };

      case 'unknown_error':
      default:
        return {
          userMessage: 'An unexpected error occurred. Please try again.',
          isRecoverable: true,
          retryable: true,
          suggestedActions: [
            'Try the operation again',
            'Restart the app if the problem persists',
            'Contact support if the issue continues',
          ],
        };
    }
  }

  /**
   * Gets error recovery options based on workflow type and error type
   */
  static getRecoveryOptions(
    errorType: PhotoErrorType,
    workflowType: PhotoWorkflowType,
    retryCount: number = 0
  ): ErrorRecoveryOptions {
    const maxRetries = this.getMaxRetryAttempts(errorType, workflowType);
    const canRetry = retryCount < maxRetries;

    const baseOptions: ErrorRecoveryOptions = {
      allowRetry: canRetry,
      allowSkip: false,
      maxRetryAttempts: maxRetries,
      retryDelayMs: this.getRetryDelay(errorType, retryCount),
      alternativeActions: [],
    };

    // Customize based on error type
    switch (errorType) {
      case 'photo_quality_too_low':
      case 'confidence_threshold_not_met':
        baseOptions.alternativeActions = [
          { label: 'Take New Photo', action: 'different_photo' as const },
          ...(canRetry ? [{ label: 'Retry', action: 'retry' as const }] : []),
          { label: 'Cancel', action: 'cancel' as const },
        ];
        break;

      case 'network_error':
      case 'photo_upload_failed':
        baseOptions.allowSkip = workflowType !== 'add_new_product'; // Don't allow skip for product creation
        baseOptions.alternativeActions = [
          ...(canRetry ? [{ label: 'Retry', action: 'retry' as const }] : []),
          ...(baseOptions.allowSkip ? [{ label: 'Skip for Now', action: 'skip' as const }] : []),
          { label: 'Cancel', action: 'cancel' as const },
        ];
        break;

      case 'camera_permission_denied':
      case 'camera_initialization_failed':
        baseOptions.allowRetry = false;
        baseOptions.alternativeActions = [
          { label: 'Try Again', action: 'retry' },
          { label: 'Cancel', action: 'cancel' },
        ];
        break;

      default:
        baseOptions.alternativeActions = [
          ...(canRetry ? [{ label: 'Retry', action: 'retry' as const }] : []),
          { label: 'Cancel', action: 'cancel' as const },
        ];
    }

    return baseOptions;
  }

  /**
   * Gets maximum retry attempts for different error types
   */
  private static getMaxRetryAttempts(
    errorType: PhotoErrorType,
    workflowType: PhotoWorkflowType
  ): number {
    // More retries for critical workflows
    const baseRetries = workflowType === 'add_new_product' ? 3 : 2;

    switch (errorType) {
      case 'photo_quality_too_low':
      case 'confidence_threshold_not_met':
        return baseRetries;
      
      case 'network_error':
      case 'photo_upload_failed':
        return baseRetries + 1; // Network issues may resolve quickly
      
      case 'camera_permission_denied':
        return 1; // Only one retry after permission granted
      
      default:
        return baseRetries;
    }
  }

  /**
   * Gets retry delay based on error type and retry count
   */
  private static getRetryDelay(errorType: PhotoErrorType, retryCount: number): number {
    const baseDelay = 1000; // 1 second
    const exponentialBackoff = Math.pow(2, retryCount) * baseDelay;

    switch (errorType) {
      case 'network_error':
      case 'photo_upload_failed':
        return Math.min(exponentialBackoff, 10000); // Max 10 seconds for network issues
      
      case 'photo_quality_too_low':
      case 'confidence_threshold_not_met':
        return 0; // No delay for quality issues (user needs to retake)
      
      default:
        return Math.min(exponentialBackoff, 5000); // Max 5 seconds for other errors
    }
  }

  /**
   * Formats an error for user display
   */
  static formatErrorForUser(error: PhotoError): {
    title: string;
    message: string;
    suggestions: string[];
  } {
    return {
      title: this.getErrorTitle(error.type),
      message: error.userMessage,
      suggestions: error.suggestedActions,
    };
  }

  /**
   * Gets user-friendly error titles
   */
  private static getErrorTitle(errorType: PhotoErrorType): string {
    switch (errorType) {
      case 'photo_quality_too_low':
        return 'Photo Quality Too Low';
      case 'confidence_threshold_not_met':
        return 'Unable to Read Product';
      case 'photo_upload_failed':
        return 'Upload Failed';
      case 'network_error':
        return 'Connection Error';
      case 'camera_permission_denied':
        return 'Camera Permission Required';
      case 'camera_initialization_failed':
        return 'Camera Error';
      case 'photo_capture_failed':
        return 'Photo Capture Failed';
      case 'product_creation_failed':
        return 'Product Creation Failed';
      case 'ingredient_parsing_failed':
        return 'Ingredient Reading Failed';
      case 'storage_error':
        return 'Storage Error';
      default:
        return 'Error Occurred';
    }
  }
}