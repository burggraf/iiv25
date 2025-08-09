/**
 * Refactored Notification Context
 * 
 * Simplified version that uses WorkflowNotificationHandler for workflow logic
 * and consolidates error handling patterns. Reduces complexity from 887+ lines to ~400-500 lines.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { backgroundQueueService } from '../services/backgroundQueueService';
import { WorkflowNotificationHandler, JobNotification } from '../services/WorkflowNotificationHandler';
import { ErrorNotificationService } from '../services/ErrorNotificationService';
import { BackgroundJob } from '../types/backgroundJobs';
import { Product } from '../types';
import { historyService } from '../services/HistoryService';
import JobCompletionCard from '../components/JobCompletionCard';

interface NotificationContextType {
  notifications: JobNotification[];
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<JobNotification[]>([]);
  const [pendingJobResults, setPendingJobResults] = useState<Map<string, { job: BackgroundJob; product: Product | null }>>(new Map());
  
  // Initialize workflow notification handler
  const [workflowHandler] = useState(() => new WorkflowNotificationHandler());

  /**
   * Adds a new notification to the list
   */
  const addNotification = (notification: JobNotification) => {
    console.log(`🔔 [NotificationContext] Adding notification: ${notification.type} - ${notification.message}`);
    
    setNotifications(prev => {
      // Prevent duplicates
      if (prev.some(n => n.id === notification.id)) {
        console.log(`🔔 [NotificationContext] Duplicate notification ignored: ${notification.id}`);
        return prev;
      }
      
      // Keep only the 5 most recent notifications
      return [notification, ...prev.slice(0, 4)];
    });
  };

  /**
   * Handles history updates for product creation workflows
   */
  const handleHistoryUpdate = async (product: Product, isNew: boolean) => {
    try {
      console.log(`📚 [NotificationContext] *** ABOUT TO UPDATE HISTORY ***`);
      console.log(`📚 [NotificationContext] Product: ${product.barcode}, isNew: ${isNew}`);
      console.log(`📚 [NotificationContext] Current history count BEFORE: ${historyService.getHistory().length}`);
      console.log(`📚 [NotificationContext] Current new items count BEFORE: ${historyService.getNewItemsCount()}`);
      
      await historyService.addToHistory(product, isNew, true);
      
      console.log(`📚 [NotificationContext] Current history count AFTER: ${historyService.getHistory().length}`);
      console.log(`📚 [NotificationContext] Current new items count AFTER: ${historyService.getNewItemsCount()}`);
      console.log(`✅ [NotificationContext] Successfully updated history for product: ${product.barcode}`);
    } catch (error) {
      console.error(`❌ [NotificationContext] Error updating history:`, error);
    }
  };

  /**
   * Processes completed jobs
   */
  const handleJobCompleted = useCallback(async (job: BackgroundJob) => {
    console.log(`🔔 [NotificationContext.refactored] *** JOB COMPLETION EVENT RECEIVED ***`);
    console.log(`🔔 [NotificationContext.refactored] Job: ${job.id.slice(-6)}, Type: ${job.jobType}, WorkflowType: ${job.workflowType || 'none'}`);
    
    // Skip if already processed
    if (workflowHandler.hasProcessedJob(job.id)) {
      console.log(`🔔 [NotificationContext.refactored] Job ${job.id.slice(-6)} already processed, skipping`);
      return;
    }
    
    workflowHandler.markJobAsProcessed(job.id);
    
    // Handle workflow jobs - show notification immediately for each job
    if (job.workflowId && job.workflowType && job.workflowSteps) {
      console.log(`🔔 [NotificationContext] Processing workflow job: ${job.workflowId.slice(-6)}`);
      
      // Get product data for history updates
      const product = await getProductFromJob(job);
      
      // Update history for workflow jobs to ensure fresh data
      if (product && job.workflowType) {
        if (job.workflowType === 'add_new_product') {
          if (job.jobType === 'product_creation') {
            // Create history entry with isNew flag but DON'T show notification (less confusing)
            const isNewProduct = true;
            await handleHistoryUpdate(product, isNewProduct);
            console.log(`📚 [NotificationContext] Created history entry - isNew: ${isNewProduct} (job: ${job.jobType}) - no notification shown`);
            // Skip notification creation for product_creation to reduce user confusion
            return;
          } else if (job.jobType === 'ingredient_parsing') {
            // Update existing history entry with fresh data (preserve isNew flag)
            const existingHistoryItem = historyService.getHistory().find(item => item.barcode === product.barcode);
            const preserveIsNew = existingHistoryItem?.isNew || false;
            await handleHistoryUpdate(product, preserveIsNew);
            console.log(`📚 [NotificationContext] Updated history entry with fresh data - preserving isNew: ${preserveIsNew} (job: ${job.jobType})`);
          } else {
            console.log(`📚 [NotificationContext] Skipping history update for ${job.jobType} job in add_new_product workflow`);
          }
        } else if (job.workflowType === 'report_product_issue' || job.workflowType === 'report_ingredients_issue') {
          if (job.jobType === 'product_creation') {
            // Update existing history entry with fresh data
            const existingHistoryItem = historyService.getHistory().find(item => item.barcode === product.barcode);
            if (existingHistoryItem) {
              // Preserve isNew flag for existing items
              const preserveIsNew = existingHistoryItem.isNew || false;
              await handleHistoryUpdate(product, preserveIsNew);
              console.log(`📚 [NotificationContext] Updated history with fresh data from ${job.workflowType} - preserving isNew: ${preserveIsNew} (job: ${job.jobType})`);
            } else {
              // If product not in history, add it as non-new (since user is reporting an issue on existing product)
              await handleHistoryUpdate(product, false);
              console.log(`📚 [NotificationContext] Added product to history from ${job.workflowType} - isNew: false (job: ${job.jobType})`);
            }
            
            // Skip notification ONLY for SUCCESS cases - still show errors
            if (!hasJobError(job)) {
              console.log(`📚 [NotificationContext] Skipping successful product_creation notification for ${job.workflowType} to reduce user confusion`);
              return;
            }
            console.log(`📚 [NotificationContext] Showing error notification for failed product_creation in ${job.workflowType}`);
            // Continue to create error notification below
          } else {
            // Update existing history entry with fresh data from report issue workflows for non-product_creation jobs
            // For photo uploads and ingredient parsing, mark as NEW to show badge/star indicators
            const isPhotoOrIngredientUpdate = job.jobType === 'product_photo_upload' || job.jobType === 'ingredient_parsing';
            const markAsNew = isPhotoOrIngredientUpdate;
            
            await handleHistoryUpdate(product, markAsNew);
            
            if (isPhotoOrIngredientUpdate) {
              console.log(`📚 [NotificationContext] ✅ MARKED AS NEW: Updated history after ${job.jobType} - isNew: ${markAsNew} (will show badge/star)`);
            } else {
              console.log(`📚 [NotificationContext] Updated history from ${job.workflowType} - isNew: ${markAsNew} (job: ${job.jobType})`);
            }
          }
        } else {
          console.log(`📚 [NotificationContext] Unknown workflow type: ${job.workflowType}, skipping history update`);
        }
      }
      
      // Create notification for non-product_creation jobs
      const notification: JobNotification = {
        id: `job_${job.id}_${Date.now()}`,
        job,
        product,
        message: getJobCompletionMessage(job, product),
        type: hasJobError(job) ? 'error' : 'success',
        timestamp: new Date(),
      };
      
      console.log(`🔔 [NotificationContext] Creating notification: ${notification.message}`);
      
      if (AppState.currentState === 'active') {
        addNotification(notification);
      } else {
        setPendingJobResults(prev => new Map(prev).set(
          `job_${job.id}`, 
          { job, product: notification.product }
        ));
      }
      
      return;
    }
    
    // Handle individual jobs (non-workflow)
    console.log(`🔔 [NotificationContext] Processing individual job: ${job.id.slice(-6)}`);
    await handleIndividualJobCompleted(job);
    
    // Note: Individual jobs don't update history unless explicitly configured
    // This maintains backward compatibility with existing behavior
  }, [workflowHandler]);

  /**
   * Gets product data from job result or lookup
   */
  const getProductFromJob = async (job: BackgroundJob): Promise<Product | null> => {
    try {
      // First try to use job result data (fresher, includes updated photos)
      const { transformJobResultToProduct } = require('../utils/jobResultTransform');
      const productFromJobResult = await transformJobResultToProduct(job);
      
      if (productFromJobResult) {
        console.log(`🔔 [NotificationContext] Using fresh product data from job result for ${job.upc}`);
        return productFromJobResult;
      }
      
      // Fallback to fresh lookup if job result transformation fails
      console.log(`🔔 [NotificationContext] Job result transformation failed, doing fresh lookup for ${job.upc}`);
      const { ProductLookupService } = require('../services/productLookupService');
      const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
        context: 'NotificationContext' 
      });
      return result.product || null;
    } catch (error) {
      console.error(`❌ [NotificationContext] Error getting product for job ${job.id}:`, error);
      return null;
    }
  };

  /**
   * Creates appropriate message for job completion (without redundant product name)
   */
  const getJobCompletionMessage = (job: BackgroundJob, product: Product | null): string => {
    // Check if job has errors first
    if (hasJobError(job)) {
      // Return error messages for failed jobs in report workflows
      if (job.workflowType === 'report_product_issue') {
        switch (job.jobType) {
          case 'product_creation':
            return `Invalid product photo - please try again`;
          case 'product_photo_upload':
            return `❌ Product photo upload failed - please try again`;
          case 'ingredient_parsing':
            return `❌ Product ingredients scan failed - please try again`;
          default:
            return `❌ Product report failed - please try again`;
        }
      }
      
      if (job.workflowType === 'report_ingredients_issue') {
        switch (job.jobType) {
          case 'product_creation':
            return `Invalid ingredients photo - please try again`;
          case 'product_photo_upload':
            return `❌ Ingredients photo upload failed - please try again`;
          case 'ingredient_parsing':
            return `❌ Ingredients analysis failed - please try again`;
          default:
            return `❌ Ingredients report failed - please try again`;
        }
      }
      
      // Specific error messages based on job type for non-workflow jobs
      switch (job.jobType) {
        case 'product_creation':
          return `❌ Photo scan failed - please try again`;
        case 'ingredient_parsing':
          return `❌ Ingredients scan failed - please try again`;
        case 'product_photo_upload':
          return `❌ Photo upload failed - please try again`;
        default:
          return `❌ Job failed - please try again`;
      }
    }
    
    // Success messages for completed jobs
    switch (job.jobType) {
      case 'product_creation':
        return `✅ Product created successfully!`;
      case 'ingredient_parsing':
        return `✅ Ingredients analyzed`;
      case 'product_photo_upload':
        return `✅ Photo updated`;
      default:
        return `✅ Job completed`;
    }
  };

  /**
   * Checks if job has errors
   */
  const hasJobError = (job: BackgroundJob): boolean => {
    const errorMessage = job.resultData?.error || job.errorMessage || '';
    return ErrorNotificationService.isConfidenceError(errorMessage);
  };

  /**
   * Handles individual (non-workflow) job completion
   */
  const handleIndividualJobCompleted = async (job: BackgroundJob) => {
    // For individual jobs, show immediate notification if there's an error
    const error = ErrorNotificationService.isConfidenceError(job.resultData?.error || '');
    
    if (error) {
      const notification: JobNotification = {
        id: `individual_${job.id}_${Date.now()}`,
        job,
        product: null,
        message: getIndividualJobMessage(job),
        type: 'error',
        timestamp: new Date(),
      };
      
      if (AppState.currentState === 'active') {
        addNotification(notification);
      }
    }
  };

  /**
   * Handles failed jobs
   */
  const handleJobFailed = useCallback((job: BackgroundJob) => {
    console.log(`🔔 [NotificationContext] Job failed: ${job.id.slice(-6)} (${job.jobType})`);
    
    // Skip if already processed
    if (workflowHandler.hasProcessedJob(job.id)) {
      return;
    }
    
    workflowHandler.markJobAsProcessed(job.id);
    
    // Handle workflow job failures
    if (job.workflowId && job.workflowType) {
      workflowHandler.processWorkflowJobFailed(job);
      return;
    }
    
    // Handle individual job failures
    const notification: JobNotification = {
      id: `failed_${job.id}_${Date.now()}`,
      job,
      product: null,
      message: getFailureMessage(job),
      type: 'error',
      timestamp: new Date(),
    };
    
    if (AppState.currentState === 'active') {
      addNotification(notification);
    }
  }, [workflowHandler]);

  /**
   * Gets message for individual job completion
   */
  const getIndividualJobMessage = (job: BackgroundJob): string => {
    const errorMessage = job.resultData?.error || job.errorMessage;
    
    if (ErrorNotificationService.isConfidenceError(errorMessage)) {
      return 'Photo processing completed with low confidence. Please consider retaking the photo.';
    }
    
    switch (job.jobType) {
      case 'product_photo_upload':
        return 'Product photo updated successfully!';
      case 'ingredient_parsing':
        return 'Ingredients processed successfully!';
      case 'product_creation':
        return 'Product created successfully!';
      default:
        return 'Job completed successfully!';
    }
  };

  /**
   * Gets message for job failures
   */
  const getFailureMessage = (job: BackgroundJob): string => {
    switch (job.jobType) {
      case 'product_photo_upload':
        return 'Failed to update product photo. Please try again.';
      case 'ingredient_parsing':
        return 'Failed to process ingredients. Please try again with a clearer photo.';
      case 'product_creation':
        return 'Failed to create product. Please try again.';
      default:
        return 'Job failed. Please try again.';
    }
  };

  /**
   * Handles app state changes to show pending notifications
   */
  const handleAppStateChange = (nextAppState: string) => {
    if (nextAppState === 'active' && pendingJobResults.size > 0) {
      console.log(`🔔 [NotificationContext] App became active, showing ${pendingJobResults.size} pending notifications`);
      
      // Show pending notifications
      pendingJobResults.forEach(({ job, product }, key) => {
        const notification: JobNotification = {
          id: `pending_${key}_${Date.now()}`,
          job,
          product,
          message: getIndividualJobMessage(job),
          type: 'success',
          timestamp: new Date(),
        };
        
        addNotification(notification);
      });
      
      // Clear pending notifications
      setPendingJobResults(new Map());
    }
  };

  // Set up background job listeners
  useEffect(() => {
    console.log('🔔 [NotificationContext] *** SETTING UP JOB LISTENERS ***');
    console.log('🔔 [NotificationContext] This should catch ALL job completion events');
    console.log('🔔 [NotificationContext] BackgroundQueueService events:', Object.getOwnPropertyNames(backgroundQueueService));
    
    // Initialize background queue service
    backgroundQueueService.initialize();
    
    // Test if backgroundQueueService is an EventEmitter
    console.log('🔔 [NotificationContext] Is EventEmitter?', typeof backgroundQueueService.on === 'function');
    console.log('🔔 [NotificationContext] Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(backgroundQueueService)));
    
    // Set up EventEmitter listeners with debug logging
    console.log('🔔 [NotificationContext] Adding event listeners for job_completed and job_failed');
    
    const handleJobCompletedWithLog = (job: BackgroundJob) => {
      console.log('🔔 [NotificationContext] *** JOB_COMPLETED EVENT RECEIVED ***');
      console.log('🔔 [NotificationContext] Job details:', {
        id: job.id,
        jobType: job.jobType,
        workflowId: job.workflowId,
        workflowType: job.workflowType,
        status: job.status,
        resultData: job.resultData
      });
      handleJobCompleted(job);
    };
    
    const handleJobFailedWithLog = (job: BackgroundJob) => {
      console.log('🔔 [NotificationContext] *** JOB_FAILED EVENT RECEIVED ***');
      console.log('🔔 [NotificationContext] Job details:', {
        id: job.id,
        jobType: job.jobType,
        workflowId: job.workflowId,
        workflowType: job.workflowType,
        status: job.status
      });
      handleJobFailed(job);
    };
    
    backgroundQueueService.on('job_completed', handleJobCompletedWithLog);
    backgroundQueueService.on('job_failed', handleJobFailedWithLog);
    
    return () => {
      console.log('🔔 [NotificationContext] Cleaning up job listeners');
      backgroundQueueService.removeListener('job_completed', handleJobCompletedWithLog);
      backgroundQueueService.removeListener('job_failed', handleJobFailedWithLog);
    };
  }, [handleJobCompleted, handleJobFailed]);

  // Set up app state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [pendingJobResults.size]);

  // Cleanup handler on unmount
  useEffect(() => {
    return () => {
      workflowHandler.cleanup();
    };
  }, []);

  /**
   * Dismisses a notification by ID
   */
  const dismissNotification = (id: string) => {
    console.log(`🔔 [NotificationContext] Dismissing notification: ${id}`);
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  /**
   * Clears all notifications
   */
  const clearAllNotifications = () => {
    console.log('🔔 [NotificationContext] Clearing all notifications');
    setNotifications([]);
    setPendingJobResults(new Map());
  };

  /**
   * Handles notification press - navigate to product if available
   */
  const handleNotificationPress = (notification: JobNotification) => {
    if (notification.product && notification.product.barcode) {
      // Navigate to product detail
      console.log(`🔔 [NotificationContext] Navigating to product: ${notification.product.barcode}`);
      router.push(`/product/${notification.product.barcode}`);
      dismissNotification(notification.id);
    } else {
      dismissNotification(notification.id);
    }
  };

  const contextValue: NotificationContextType = {
    notifications,
    dismissNotification,
    clearAllNotifications,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {/* Render notification cards */}
      {notifications.map((notification, index) => (
        <JobCompletionCard
          key={notification.id}
          notification={notification}
          onPress={() => handleNotificationPress(notification)}
          onDismiss={() => dismissNotification(notification.id)}
          style={{ top: 90 + (index * 100) }} // Stack notifications with proper vertical spacing
        />
      ))}
    </NotificationContext.Provider>
  );
}

// Export the original JobNotification interface for backward compatibility
export { JobNotification };