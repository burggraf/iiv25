/**
 * Photo Workflow Configuration Service
 * 
 * Centralizes workflow definition logic and provides type-safe configuration management
 */

import { 
  PhotoWorkflowType, 
  PhotoWorkflowConfig, 
  PhotoStepConfig, 
  PHOTO_WORKFLOW_CONFIGS, 
  PHOTO_STEP_CONFIGS 
} from '../types/photoWorkflow';

export class PhotoWorkflowConfigService {
  /**
   * Creates a complete workflow configuration for a given type and barcode
   */
  static createWorkflowConfig(type: PhotoWorkflowType, barcode: string): PhotoWorkflowConfig {
    const baseConfig = PHOTO_WORKFLOW_CONFIGS[type];
    const workflowId = this.generateWorkflowId();

    return {
      ...baseConfig,
      barcode,
      workflowId,
    };
  }

  /**
   * Gets the step configuration for a specific workflow and step
   */
  static getStepConfig(workflowType: PhotoWorkflowType, stepIndex: number): PhotoStepConfig | null {
    const baseConfig = PHOTO_WORKFLOW_CONFIGS[workflowType];
    const steps = baseConfig.steps;
    
    if (stepIndex < 0 || stepIndex >= steps.length) {
      return null;
    }

    const step = steps[stepIndex];
    const stepConfigs = PHOTO_STEP_CONFIGS[workflowType];
    const stepConfig = stepConfigs[step];

    if (!stepConfig) {
      return null;
    }

    return {
      ...stepConfig,
      stepNumber: stepIndex + 1,
      totalSteps: steps.length,
    };
  }

  /**
   * Gets all step configurations for a workflow
   */
  static getAllStepConfigs(workflowType: PhotoWorkflowType): PhotoStepConfig[] {
    const baseConfig = PHOTO_WORKFLOW_CONFIGS[workflowType];
    return baseConfig.steps
      .map((_, index) => this.getStepConfig(workflowType, index))
      .filter((config): config is PhotoStepConfig => config !== null);
  }

  /**
   * Validates if a workflow configuration is valid
   */
  static isValidWorkflowConfig(config: PhotoWorkflowConfig): boolean {
    const baseConfig = PHOTO_WORKFLOW_CONFIGS[config.type];
    
    if (!baseConfig) {
      return false;
    }

    // Validate required fields
    if (!config.barcode || !config.workflowId) {
      return false;
    }

    // Validate steps match the expected configuration
    if (config.steps.length !== baseConfig.steps.length) {
      return false;
    }

    for (let i = 0; i < config.steps.length; i++) {
      if (config.steps[i] !== baseConfig.steps[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Gets the display title for a workflow type
   */
  static getWorkflowTitle(workflowType: PhotoWorkflowType): string {
    switch (workflowType) {
      case 'add_new_product':
        return 'Add New Product';
      case 'report_product_issue':
        return 'Update Product Photo';
      case 'report_ingredients_issue':
        return 'Update Ingredients';
      default:
        return 'Photo Capture';
    }
  }

  /**
   * Determines if workflow should navigate back or to a specific route on completion
   */
  static getCompletionNavigation(workflowType: PhotoWorkflowType): 'back' | 'home' | 'product' {
    switch (workflowType) {
      case 'add_new_product':
        return 'back';
      case 'report_product_issue':
      case 'report_ingredients_issue':
        return 'back';
      default:
        return 'back';
    }
  }

  /**
   * Generates a unique workflow ID
   */
  private static generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets workflow-specific error handling configuration
   */
  static getErrorHandling(workflowType: PhotoWorkflowType): {
    showRetryButton: boolean;
    allowSkipStep: boolean;
    maxRetries: number;
  } {
    switch (workflowType) {
      case 'add_new_product':
        return {
          showRetryButton: true,
          allowSkipStep: false, // Both steps are critical
          maxRetries: 3,
        };
      case 'report_product_issue':
      case 'report_ingredients_issue':
        return {
          showRetryButton: true,
          allowSkipStep: true, // User can cancel if needed
          maxRetries: 3,
        };
      default:
        return {
          showRetryButton: true,
          allowSkipStep: true,
          maxRetries: 3,
        };
    }
  }
}