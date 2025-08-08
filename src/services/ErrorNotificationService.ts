/**
 * Error Notification Service
 * 
 * Provides consistent error messaging and notification display
 * for photo workflows and background job failures
 */

import { Alert } from 'react-native';
import { PhotoError, PhotoErrorHandler, ErrorRecoveryOptions } from './PhotoErrorHandler';
import { BackgroundJob } from '../types/backgroundJobs';
import { PhotoWorkflowType } from '../types/photoWorkflow';

export interface ErrorNotificationConfig {
  title: string;
  message: string;
  showAlert: boolean;
  showToast: boolean;
  persistent: boolean;
  actionButtons: Array<{
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress: () => void;
  }>;
}

export interface ErrorNotificationCallbacks {
  onRetry?: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
  onTakeNewPhoto?: () => void;
  onManualEntry?: () => void;
}

export class ErrorNotificationService {
  /**
   * Creates a user notification for a photo workflow error
   */
  static createErrorNotification(
    error: PhotoError,
    workflowType: PhotoWorkflowType,
    callbacks: ErrorNotificationCallbacks = {}
  ): ErrorNotificationConfig {
    const { title, message } = PhotoErrorHandler.formatErrorForUser(error);
    const recoveryOptions = PhotoErrorHandler.getRecoveryOptions(
      error.type, 
      workflowType,
      error.technicalDetails?.retryCount || 0
    );

    const actionButtons = this.createActionButtons(recoveryOptions, callbacks);

    return {
      title,
      message,
      showAlert: true,
      showToast: false,
      persistent: !error.isRecoverable,
      actionButtons,
    };
  }

  /**
   * Shows an error notification using React Native Alert
   */
  static showErrorAlert(
    error: PhotoError,
    workflowType: PhotoWorkflowType,
    callbacks: ErrorNotificationCallbacks = {}
  ): void {
    const notification = this.createErrorNotification(error, workflowType, callbacks);
    
    console.error(`🚨 [ErrorNotification] Showing error: ${error.type}`, {
      message: error.message,
      userMessage: error.userMessage,
      retryable: error.retryable,
      isRecoverable: error.isRecoverable,
    });

    Alert.alert(
      notification.title,
      notification.message,
      notification.actionButtons
    );
  }

  /**
   * Analyzes a background job and shows appropriate error notification
   */
  static async handleJobError(
    job: BackgroundJob,
    workflowType: PhotoWorkflowType,
    callbacks: ErrorNotificationCallbacks = {}
  ): Promise<void> {
    const error = PhotoErrorHandler.analyzeJobError(job);
    
    if (!error) {
      console.log(`🔔 [ErrorNotification] No error detected for job ${job.id}`);
      return;
    }

    console.log(`🚨 [ErrorNotification] Handling job error: ${error.type} for job ${job.id}`);
    
    // Add job-specific context to callbacks
    const enhancedCallbacks: ErrorNotificationCallbacks = {
      ...callbacks,
      onRetry: callbacks.onRetry || (() => {
        console.log(`🔄 [ErrorNotification] Retry requested for job ${job.id}`);
        // Could trigger job resubmission here
      }),
    };

    this.showErrorAlert(error, workflowType, enhancedCallbacks);
  }

  /**
   * Creates action buttons based on recovery options
   */
  private static createActionButtons(
    recoveryOptions: ErrorRecoveryOptions,
    callbacks: ErrorNotificationCallbacks
  ): Array<{
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress: () => void;
  }> {
    const buttons: Array<{
      text: string;
      style?: 'default' | 'cancel' | 'destructive';
      onPress: () => void;
    }> = [];

    // Add buttons based on alternative actions
    recoveryOptions.alternativeActions.forEach(action => {
      switch (action.action) {
        case 'retry':
          if (recoveryOptions.allowRetry) {
            buttons.push({
              text: action.label,
              style: 'default',
              onPress: callbacks.onRetry || (() => console.log('Retry action')),
            });
          }
          break;

        case 'skip':
          if (recoveryOptions.allowSkip) {
            buttons.push({
              text: action.label,
              style: 'default',
              onPress: callbacks.onSkip || (() => console.log('Skip action')),
            });
          }
          break;

        case 'cancel':
          buttons.push({
            text: action.label,
            style: 'cancel',
            onPress: callbacks.onCancel || (() => console.log('Cancel action')),
          });
          break;

        case 'different_photo':
          buttons.push({
            text: action.label,
            style: 'default',
            onPress: callbacks.onTakeNewPhoto || (() => console.log('Take new photo action')),
          });
          break;

        case 'manual_entry':
          buttons.push({
            text: action.label,
            style: 'default',
            onPress: callbacks.onManualEntry || (() => console.log('Manual entry action')),
          });
          break;
      }
    });

    // Ensure there's always a cancel/close option
    if (!buttons.some(button => button.style === 'cancel')) {
      buttons.push({
        text: 'Close',
        style: 'cancel',
        onPress: callbacks.onCancel || (() => console.log('Close action')),
      });
    }

    return buttons;
  }

  /**
   * Gets confidence error detection patterns
   */
  static getConfidenceErrorPatterns(): RegExp[] {
    return [
      /photo quality too low/i,
      /product title scan failed/i,
      /not enough confidence/i,
      /confidence.*too low/i,
      /unable to.*confidence/i,
    ];
  }

  /**
   * Detects if an error message indicates a confidence/quality issue
   */
  static isConfidenceError(errorMessage: string): boolean {
    const patterns = this.getConfidenceErrorPatterns();
    return patterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Creates a standardized error message for workflow completion
   */
  static createWorkflowCompletionMessage(
    workflowType: PhotoWorkflowType,
    hasErrors: boolean,
    errorTypes: string[]
  ): string {
    if (!hasErrors) {
      switch (workflowType) {
        case 'add_new_product':
          return 'Product created successfully! Both photos processed.';
        case 'report_product_issue':
          return 'Product photo updated successfully!';
        case 'report_ingredients_issue':
          return 'Ingredients updated successfully!';
        default:
          return 'Photo processing completed successfully!';
      }
    }

    // Handle error combinations
    if (errorTypes.includes('product_creation') && errorTypes.includes('ingredient_scan')) {
      return 'Product created with some issues. Please check the details and consider retaking photos.';
    } else if (errorTypes.includes('product_creation')) {
      return 'Product created successfully, but photo processing had issues. You may want to update the product photo.';
    } else if (errorTypes.includes('ingredient_scan')) {
      return 'Product created successfully, but ingredient scanning failed. Please try taking a clearer photo of the ingredients.';
    } else if (errorTypes.includes('photo_upload')) {
      return 'Photo upload failed. Please try again with a different photo.';
    }

    return 'Operation completed with some issues. Please check the details.';
  }

  /**
   * Logs error for debugging and analytics
   */
  static logError(
    error: PhotoError,
    context: {
      workflowType: PhotoWorkflowType;
      jobId?: string;
      userId?: string;
      sessionId?: string;
    }
  ): void {
    const logData = {
      errorType: error.type,
      message: error.message,
      isRecoverable: error.isRecoverable,
      retryable: error.retryable,
      context,
      timestamp: new Date().toISOString(),
      technicalDetails: error.technicalDetails,
    };

    console.error('🚨 [ErrorNotification] Photo Error Log:', logData);
    
    // Here you could send to analytics service
    // Analytics.track('photo_workflow_error', logData);
  }

  /**
   * Creates a brief error summary for notifications
   */
  static createErrorSummary(errors: PhotoError[]): string {
    if (errors.length === 0) return 'No errors';
    if (errors.length === 1) return errors[0].userMessage;
    
    const errorTypes = [...new Set(errors.map(e => e.type))];
    
    if (errorTypes.length === 1) {
      return `${errors.length} ${errorTypes[0]} errors occurred`;
    }
    
    return `${errors.length} errors occurred during processing`;
  }

  /**
   * Determines notification priority based on error severity
   */
  static getNotificationPriority(error: PhotoError): 'low' | 'medium' | 'high' | 'critical' {
    if (!error.isRecoverable) return 'critical';
    
    switch (error.type) {
      case 'camera_permission_denied':
      case 'camera_initialization_failed':
        return 'high';
        
      case 'network_error':
      case 'photo_upload_failed':
        return 'medium';
        
      case 'photo_quality_too_low':
      case 'confidence_threshold_not_met':
        return 'medium';
        
      default:
        return 'low';
    }
  }
}