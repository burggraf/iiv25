/**
 * Photo Workflow Types
 * 
 * Defines the type-safe configuration and state management for unified photo capture workflows
 */

export type PhotoWorkflowType = 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue';

export type PhotoStep = 'front-photo' | 'ingredients-photo' | 'single-photo';

export interface PhotoWorkflowConfig {
  type: PhotoWorkflowType;
  steps: PhotoStep[];
  barcode: string;
  workflowId: string;
  metadata?: {
    issueType?: 'product' | 'ingredients';
    existingProduct?: boolean;
  };
}

export interface PhotoStepConfig {
  step: PhotoStep;
  title: string;
  instruction: string;
  stepNumber: number;
  totalSteps: number;
  cameraMode: 'product-photo' | 'ingredients-photo';
  jobType: 'product_creation' | 'ingredient_parsing' | 'product_photo_upload';
  jobPriority: number;
  workflowSteps: { total: number; current: number };
}

export interface PhotoCaptureState {
  currentStepIndex: number;
  capturedPhotos: Map<PhotoStep, string>;
  isPreviewMode: boolean;
  currentPhotoUri: string | null;
  isProcessing: boolean;
  error: string | null;
}

export interface PhotoWorkflowResult {
  success: boolean;
  completedSteps: PhotoStep[];
  error?: string;
  workflowId: string;
}

// Predefined workflow configurations
export const PHOTO_WORKFLOW_CONFIGS: Record<PhotoWorkflowType, Omit<PhotoWorkflowConfig, 'barcode' | 'workflowId'>> = {
  add_new_product: {
    type: 'add_new_product',
    steps: ['front-photo', 'ingredients-photo'],
  },
  report_product_issue: {
    type: 'report_product_issue',
    steps: ['single-photo'],
    metadata: { issueType: 'product', existingProduct: true },
  },
  report_ingredients_issue: {
    type: 'report_ingredients_issue',
    steps: ['single-photo'],
    metadata: { issueType: 'ingredients', existingProduct: true },
  },
};

// Step configurations for each workflow type
export const PHOTO_STEP_CONFIGS: Record<PhotoWorkflowType, Record<string, Omit<PhotoStepConfig, 'stepNumber' | 'totalSteps'>>> = {
  add_new_product: {
    'front-photo': {
      step: 'front-photo',
      title: 'Product Front',
      instruction: 'Take a clear photo of the front of the product, making sure the name and brand information is visible.',
      cameraMode: 'product-photo',
      jobType: 'product_creation',
      jobPriority: 3,
      workflowSteps: { total: 3, current: 1 },
    },
    'ingredients-photo': {
      step: 'ingredients-photo',
      title: 'Ingredients',
      instruction: 'Take a clear photo of the product ingredients.',
      cameraMode: 'ingredients-photo',
      jobType: 'ingredient_parsing',
      jobPriority: 2,
      workflowSteps: { total: 3, current: 2 },
    },
  },
  report_product_issue: {
    'single-photo': {
      step: 'single-photo',
      title: 'Product Photo',
      instruction: 'Take a clear photo of the front of the product, making sure the name and brand information is visible.',
      cameraMode: 'product-photo',
      jobType: 'product_photo_upload',
      jobPriority: 2,
      workflowSteps: { total: 1, current: 1 },
    },
  },
  report_ingredients_issue: {
    'single-photo': {
      step: 'single-photo',
      title: 'Ingredients Photo',
      instruction: 'Take a clear photo of the product ingredients.',
      cameraMode: 'ingredients-photo',
      jobType: 'ingredient_parsing',
      jobPriority: 2,
      workflowSteps: { total: 1, current: 1 },
    },
  },
};