/**
 * Job Submission Service
 * 
 * Centralizes job creation patterns and provides type-safe job parameter validation
 * for consistent background job submission across photo workflows
 */

import { BackgroundJob } from '../types/backgroundJobs';
import { PhotoWorkflowType } from '../types/photoWorkflow';

// Enhanced job parameters with workflow context
interface BaseJobParams {
  imageUri: string;
  upc: string;
  priority?: number;
  workflowId?: string;
  workflowType?: PhotoWorkflowType | 'individual_action';
  workflowSteps?: { total: number; current: number };
}

interface ProductCreationJobParams extends BaseJobParams {
  jobType: 'product_creation';
  workflowType: PhotoWorkflowType | 'individual_action';
  workflowSteps: { total: number; current: number };
}

interface IngredientParsingJobParams extends BaseJobParams {
  jobType: 'ingredient_parsing';
  existingProductData?: any;
  workflowType?: PhotoWorkflowType | 'individual_action';
}

interface ProductPhotoUploadJobParams extends BaseJobParams {
  jobType: 'product_photo_upload';
  workflowType?: 'report_product_issue' | 'individual_action';
}

type JobSubmissionParams = ProductCreationJobParams | IngredientParsingJobParams | ProductPhotoUploadJobParams;

interface JobValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface JobSubmissionResult {
  success: boolean;
  jobId?: string;
  error?: string;
  job?: Partial<BackgroundJob>;
}

export class JobSubmissionService {
  /**
   * Validates job parameters before submission
   */
  static validateJobParams(params: JobSubmissionParams): JobValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Common validation
    if (!params.imageUri) {
      errors.push('Image URI is required');
    }

    if (!params.upc) {
      errors.push('UPC/barcode is required');
    }

    if (!params.imageUri.startsWith('file://') && !params.imageUri.startsWith('content://')) {
      warnings.push('Image URI may not be a valid local file path');
    }

    // Job-specific validation
    switch (params.jobType) {
      case 'product_creation':
        if (!params.workflowId) {
          errors.push('Workflow ID is required for product creation jobs');
        }
        if (params.workflowType !== 'add_new_product' && params.workflowType !== 'report_product_issue') {
          errors.push('Product creation jobs must use add_new_product or report_product_issue workflow type');
        }
        if (!params.workflowSteps || params.workflowSteps.total < 1) {
          errors.push('Valid workflow steps required for product creation jobs');
        }
        if (params.priority && (params.priority < 1 || params.priority > 5)) {
          warnings.push('Priority should be between 1-5 for optimal processing');
        }
        break;

      case 'ingredient_parsing':
        if (params.workflowType === 'add_new_product' && !params.workflowId) {
          errors.push('Workflow ID is required for add_new_product ingredient parsing');
        }
        break;

      case 'product_photo_upload':
        if (params.workflowType === 'report_product_issue' && !params.workflowId) {
          warnings.push('Workflow ID recommended for report_product_issue jobs');
        }
        break;

      default:
        errors.push(`Unknown job type: ${(params as any).jobType}`);
    }

    // Workflow consistency validation
    if (params.workflowId && params.workflowSteps) {
      if (params.workflowSteps.current > params.workflowSteps.total) {
        errors.push('Current step cannot exceed total steps');
      }
      if (params.workflowSteps.current < 1) {
        errors.push('Current step must be at least 1');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Creates standardized job parameters with proper defaults
   */
  static createStandardizedJobParams(params: JobSubmissionParams): Partial<BackgroundJob> {
    const validation = this.validateJobParams(params);
    
    if (!validation.isValid) {
      throw new Error(`Invalid job parameters: ${validation.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('🚨 Job submission warnings:', validation.warnings);
    }

    const baseJob: Partial<BackgroundJob> = {
      jobType: params.jobType,
      imageUri: params.imageUri,
      upc: params.upc,
      priority: this.getDefaultPriority(params.jobType, params.workflowType),
      retryCount: 0,
      maxRetries: this.getMaxRetries(params.jobType),
      workflowId: params.workflowId,
      workflowType: params.workflowType,
      workflowSteps: params.workflowSteps,
    };

    // Job-specific parameters
    switch (params.jobType) {
      case 'ingredient_parsing':
        return {
          ...baseJob,
          existingProductData: (params as IngredientParsingJobParams).existingProductData || null,
        };

      default:
        return baseJob;
    }
  }

  /**
   * Gets default priority based on job type and workflow
   */
  private static getDefaultPriority(jobType: string, workflowType?: string): number {
    // Higher number = higher priority
    switch (jobType) {
      case 'product_creation':
        return 3; // High priority for new product creation
      case 'ingredient_parsing':
        return workflowType === 'add_new_product' ? 2 : 2; // Medium-high priority
      case 'product_photo_upload':
        return 2; // Medium priority for photo updates
      default:
        return 1; // Low priority for unknown jobs
    }
  }

  /**
   * Gets maximum retry count based on job type
   */
  private static getMaxRetries(jobType: string): number {
    switch (jobType) {
      case 'product_creation':
        return 3; // Allow more retries for critical product creation
      case 'ingredient_parsing':
        return 2; // Medium retries for ingredient parsing
      case 'product_photo_upload':
        return 2; // Medium retries for photo uploads
      default:
        return 1;
    }
  }

  /**
   * Creates workflow context metadata for job grouping
   */
  static createWorkflowMetadata(
    workflowType: PhotoWorkflowType | 'individual_action',
    totalSteps: number,
    currentStep: number
  ): {
    workflowType: PhotoWorkflowType | 'individual_action';
    workflowSteps: { total: number; current: number };
  } {
    return {
      workflowType,
      workflowSteps: {
        total: Math.max(1, totalSteps),
        current: Math.max(1, Math.min(currentStep, totalSteps)),
      },
    };
  }

  /**
   * Determines if jobs should be grouped in workflow notifications
   */
  static shouldGroupJobsInWorkflow(workflowType?: string): boolean {
    return workflowType === 'add_new_product';
  }

  /**
   * Gets human-readable job description for logging/debugging
   */
  static getJobDescription(params: JobSubmissionParams): string {
    const workflow = params.workflowType || 'individual';
    const step = params.workflowSteps 
      ? `(${params.workflowSteps.current}/${params.workflowSteps.total})`
      : '';
    
    switch (params.jobType) {
      case 'product_creation':
        return `Product Creation ${step} - ${workflow}`;
      case 'ingredient_parsing':
        return `Ingredient Parsing ${step} - ${workflow}`;
      case 'product_photo_upload':
        return `Photo Upload ${step} - ${workflow}`;
      default:
        return `Unknown Job - ${workflow}`;
    }
  }

  /**
   * Creates a properly typed job submission factory method
   */
  static createJobFactory() {
    return {
      productCreation: (params: Omit<ProductCreationJobParams, 'jobType'>): ProductCreationJobParams => ({
        ...params,
        jobType: 'product_creation',
      }),
      
      ingredientParsing: (params: Omit<IngredientParsingJobParams, 'jobType'>): IngredientParsingJobParams => ({
        ...params,
        jobType: 'ingredient_parsing',
      }),
      
      productPhotoUpload: (params: Omit<ProductPhotoUploadJobParams, 'jobType'>): ProductPhotoUploadJobParams => ({
        ...params,
        jobType: 'product_photo_upload',
      }),
    };
  }
}

// Export commonly used job parameter types
export type {
  JobSubmissionParams,
  ProductCreationJobParams,
  IngredientParsingJobParams,
  ProductPhotoUploadJobParams,
  JobValidationResult,
  JobSubmissionResult,
};