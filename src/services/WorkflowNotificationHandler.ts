/**
 * Workflow Notification Handler
 * 
 * Extracts workflow-specific notification logic from NotificationContext
 * to simplify the main context and make workflow handling more modular
 */

import { AppState } from 'react-native';
import { BackgroundJob } from '../types/backgroundJobs';
import { Product } from '../types';
import { ProductLookupService } from './productLookupService';
import { transformJobResultToProduct } from '../utils/jobResultTransform';

export interface JobNotification {
  id: string;
  job: BackgroundJob;
  product: Product | null;
  message: string;
  type: 'success' | 'error';
  timestamp: Date;
}

interface WorkflowState {
  type: 'add_new_product' | 'individual_action';
  completedJobs: Set<string>;
  failedJobs: Set<string>;
  errorTypes: Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>;
  totalSteps: number;
  latestProduct: Product | null;
  notificationShown: boolean;
}

type ErrorDetectionResult = {
  hasError: boolean;
  errorType: 'photo_upload' | 'ingredient_scan' | 'product_creation' | null;
};

export class WorkflowNotificationHandler {
  private workflowStates = new Map<string, WorkflowState>();
  private processedJobIds = new Set<string>();
  private handledConfidenceErrors = new Set<string>();

  /**
   * Detects job-specific errors with unified logic
   */
  private detectJobErrors(job: BackgroundJob): ErrorDetectionResult {
    switch (job.jobType) {
      case 'product_photo_upload':
        return {
          hasError: !job.resultData?.success || !!job.resultData?.error || job.resultData?.uploadFailed,
          errorType: 'photo_upload',
        };

      case 'ingredient_parsing':
        return {
          hasError: job.resultData?.error && job.resultData.error.includes('photo quality too low'),
          errorType: 'ingredient_scan',
        };

      case 'product_creation':
        // Check for confidence errors in product creation
        const hasConfidenceError = job.resultData?.error === 'Product title scan failed.';
        
        // For product creation, only consider it an error if the product wasn't actually created
        const hasResultError = !job.resultData?.success || !!job.resultData?.error;
        const productWasCreated = job.resultData?.productData || job.resultData?.product;
        
        // Mark as error if confidence failed OR (result error AND no product created)
        const actualError = hasConfidenceError || (hasResultError && !productWasCreated);
        
        return {
          hasError: actualError,
          errorType: actualError ? 'product_creation' : null,
        };

      default:
        return { hasError: false, errorType: null };
    }
  }

  /**
   * Gets the latest product data for a workflow
   */
  private async getLatestProductData(job: BackgroundJob): Promise<Product | null> {
    try {
      // For photo upload jobs, add a delay to ensure the image is fully processed
      if (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      let product: Product | null = null;
      if (job.upc) {
        console.log(`🔔 [WorkflowNotification] Getting product data for workflow ${job.workflowId?.slice(-6)}`);
        
        // Skip transformation for ingredient_parsing jobs since they don't contain full product data
        if (job.jobType === 'ingredient_parsing') {
          const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
            context: 'WorkflowNotification (ingredient parsing)' 
          });
          product = result.product || null;
        } else {
          // Try to transform job result data for other job types
          product = await transformJobResultToProduct(job);
          
          if (product) {
            console.log(`🔔 [WorkflowNotification] Successfully used job result data`);
          } else {
            // Fallback to fresh lookup if job result transformation failed
            const result = await ProductLookupService.lookupProductByBarcode(job.upc, { 
              context: 'WorkflowNotification (fallback)' 
            });
            product = result.product || null;
          }
        }
        
        // For photo-related jobs, ensure we have fresh image URL with cache busting
        if (product && (job.jobType === 'product_photo_upload' || job.jobType === 'product_creation')) {
          console.log(`🔔 [WorkflowNotification] Adding cache-busting to image: ${product.imageUrl}`);
          
          // Add timestamp to force fresh image load
          if (product.imageUrl && product.imageUrl.includes('[SUPABASE]')) {
            product.imageUrl = `[SUPABASE]?t=${Date.now()}`;
          } else if (product.imageUrl && product.imageUrl.includes('supabase.co')) {
            // Add timestamp parameter to existing URL
            const separator = product.imageUrl.includes('?') ? '&' : '?';
            product.imageUrl = `${product.imageUrl}${separator}t=${Date.now()}`;
          }
        }
      }
      
      return product;
    } catch (error) {
      console.error('Error getting product for workflow:', error);
      return null;
    }
  }

  /**
   * Generates workflow completion message based on error types
   */
  private getWorkflowMessage(workflowType: string, errorTypes: Set<string>): string {
    const errorArray = Array.from(errorTypes);
    
    if (errorArray.length === 0) {
      switch (workflowType) {
        case 'add_new_product':
          return 'Product created successfully! Both photos processed.';
        default:
          return 'Job completed successfully!';
      }
    }
    
    // Handle specific error combinations
    if (errorArray.includes('product_creation') && errorArray.includes('ingredient_scan')) {
      return 'Product created with some issues. Please check the details and consider retaking photos.';
    } else if (errorArray.includes('product_creation')) {
      return 'Product created successfully, but photo processing had issues. You may want to update the product photo.';
    } else if (errorArray.includes('ingredient_scan')) {
      return 'Product created successfully, but ingredient scanning failed. Please try taking a clearer photo of the ingredients.';
    } else if (errorArray.includes('photo_upload')) {
      return 'Photo upload failed. Please try again with a different photo.';
    }
    
    return 'Job completed with some issues. Please check the details.';
  }

  /**
   * Processes a completed workflow job
   */
  async processWorkflowJobCompleted(
    job: BackgroundJob, 
    onNotificationCreated: (notification: JobNotification) => void,
    onHistoryUpdate?: (product: Product, isNew: boolean) => Promise<void>
  ): Promise<void> {
    if (!job.workflowId || !job.workflowType || !job.workflowSteps) return;
    
    console.log(`🔔 [WorkflowNotification] Processing completed job: ${job.workflowId.slice(-6)} - ${job.jobType} (${job.workflowSteps.current}/${job.workflowSteps.total})`);
    
    // Update workflow state
    const current = this.workflowStates.get(job.workflowId) || {
      type: job.workflowType as 'add_new_product' | 'individual_action',
      completedJobs: new Set(),
      failedJobs: new Set(),
      errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
      totalSteps: job.workflowSteps.total,
      latestProduct: null,
      notificationShown: false,
    };
    
    current.completedJobs.add(job.id);
    
    // Check for errors and track error types
    const { hasError, errorType } = this.detectJobErrors(job);
    console.log(`🔔 [WorkflowNotification] Error detection - hasError: ${hasError}, errorType: ${errorType}`);
    
    if (hasError && errorType) {
      current.errorTypes.add(errorType);
      current.failedJobs.add(job.id);
      console.log(`🔔 [WorkflowNotification] Added error type: ${errorType}`);
    }
    
    // Get the latest product data
    const product = await this.getLatestProductData(job);
    current.latestProduct = product || current.latestProduct;
    
    // Check if workflow is complete
    const isComplete = current.completedJobs.size >= current.totalSteps;
    const hasErrors = current.errorTypes.size > 0;
    
    console.log(`🔔 [WorkflowNotification] Workflow status: ${current.completedJobs.size}/${current.totalSteps} completed, ${current.errorTypes.size} error types`);
    
    if ((isComplete || hasErrors) && !current.notificationShown) {
      // Mark notification as shown to prevent duplicates
      current.notificationShown = true;
      
      // Create workflow notification
      const notificationId = `workflow_${job.workflowId}_${Date.now()}`;
      const notification: JobNotification = {
        id: notificationId,
        job: { ...job, id: `workflow_${job.workflowId}` },
        product: current.latestProduct,
        message: this.getWorkflowMessage(current.type, current.errorTypes),
        type: hasErrors ? 'error' : 'success',
        timestamp: new Date(),
      };

      // Show notification if app is in foreground
      if (AppState.currentState === 'active') {
        onNotificationCreated(notification);
      }
      
      // Handle history updates for successful product creation workflows
      const productCreationSucceeded = !current.errorTypes.has('product_creation');
      
      if (productCreationSucceeded && current.latestProduct && current.type === 'add_new_product' && onHistoryUpdate) {
        const statusMessage = hasErrors ? 'with some errors' : 'successfully';
        console.log(`🔔 [WorkflowNotification] Updating history: Workflow completed ${statusMessage}`);
        
        try {
          await onHistoryUpdate(current.latestProduct, true);
          console.log(`✅ [WorkflowNotification] Successfully updated history for workflow`);
        } catch (error) {
          console.error(`❌ [WorkflowNotification] Error updating history:`, error);
        }
      }
      
      // Clean up completed workflow
      this.workflowStates.delete(job.workflowId);
    } else {
      // Update the workflow state
      this.workflowStates.set(job.workflowId, current);
    }
  }

  /**
   * Processes a failed workflow job
   */
  processWorkflowJobFailed(job: BackgroundJob): void {
    if (!job.workflowId || !job.workflowType) return;
    
    console.log(`🔔 [WorkflowNotification] Processing failed job: ${job.workflowId.slice(-6)} - ${job.jobType}`);
    
    this.processedJobIds.add(job.id);
    
    // Update workflow state with failure
    const current = this.workflowStates.get(job.workflowId) || {
      type: job.workflowType as 'add_new_product' | 'individual_action',
      completedJobs: new Set(),
      failedJobs: new Set(),
      errorTypes: new Set<'photo_upload' | 'ingredient_scan' | 'product_creation'>(),
      totalSteps: job.workflowSteps?.total || 1,
      latestProduct: null,
      notificationShown: false,
    };
    
    current.failedJobs.add(job.id);
    
    // Detect error type for job failure
    const { errorType } = this.detectJobErrors(job);
    if (errorType) {
      current.errorTypes.add(errorType);
      console.log(`🔔 [WorkflowNotification] Added ${errorType} error type for failed job`);
    } else {
      // Fallback: determine error type based on job type
      switch (job.jobType) {
        case 'product_photo_upload':
          current.errorTypes.add('photo_upload');
          break;
        case 'ingredient_parsing':
          current.errorTypes.add('ingredient_scan');
          break;
        case 'product_creation':
          current.errorTypes.add('product_creation');
          break;
      }
    }
    
    this.workflowStates.set(job.workflowId, current);
  }

  /**
   * Checks if a job has been processed to avoid duplicates
   */
  hasProcessedJob(jobId: string): boolean {
    return this.processedJobIds.has(jobId);
  }

  /**
   * Marks a job as processed
   */
  markJobAsProcessed(jobId: string): void {
    this.processedJobIds.add(jobId);
  }

  /**
   * Cleans up workflow states and processed job tracking
   */
  cleanup(): void {
    this.workflowStates.clear();
    this.processedJobIds.clear();
    this.handledConfidenceErrors.clear();
  }

  /**
   * Gets current workflow states for debugging
   */
  getDebugInfo(): {
    workflowStates: Map<string, WorkflowState>;
    processedJobIds: Set<string>;
  } {
    return {
      workflowStates: new Map(this.workflowStates),
      processedJobIds: new Set(this.processedJobIds),
    };
  }
}