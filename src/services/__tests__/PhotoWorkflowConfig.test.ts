/**
 * Tests for PhotoWorkflowConfig Service
 */

import { PhotoWorkflowConfigService } from '../PhotoWorkflowConfig';
import { PhotoWorkflowType } from '../../types/photoWorkflow';

describe('PhotoWorkflowConfigService', () => {
  describe('createWorkflowConfig', () => {
    it('should create valid workflow config for add_new_product', () => {
      const config = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345');
      
      expect(config.type).toBe('add_new_product');
      expect(config.barcode).toBe('12345');
      expect(config.workflowId).toMatch(/workflow_\d+_[a-z0-9]+/);
      expect(config.steps).toEqual(['front-photo', 'ingredients-photo']);
    });

    it('should create valid workflow config for report_product_issue', () => {
      const config = PhotoWorkflowConfigService.createWorkflowConfig('report_product_issue', '67890');
      
      expect(config.type).toBe('report_product_issue');
      expect(config.barcode).toBe('67890');
      expect(config.steps).toEqual(['single-photo']);
      expect(config.metadata?.issueType).toBe('product');
    });

    it('should generate unique workflow IDs', () => {
      const config1 = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345');
      const config2 = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345');
      
      expect(config1.workflowId).not.toBe(config2.workflowId);
    });
  });

  describe('getStepConfig', () => {
    it('should return correct step config for add_new_product', () => {
      const step1 = PhotoWorkflowConfigService.getStepConfig('add_new_product', 0);
      const step2 = PhotoWorkflowConfigService.getStepConfig('add_new_product', 1);
      
      expect(step1).toBeDefined();
      expect(step1?.step).toBe('front-photo');
      expect(step1?.stepNumber).toBe(1);
      expect(step1?.totalSteps).toBe(2);
      expect(step1?.cameraMode).toBe('product-photo');
      
      expect(step2).toBeDefined();
      expect(step2?.step).toBe('ingredients-photo');
      expect(step2?.stepNumber).toBe(2);
      expect(step2?.totalSteps).toBe(2);
      expect(step2?.cameraMode).toBe('ingredients-photo');
    });

    it('should return null for invalid step index', () => {
      const step = PhotoWorkflowConfigService.getStepConfig('add_new_product', 5);
      expect(step).toBeNull();
    });

    it('should return correct step config for single-step workflows', () => {
      const step = PhotoWorkflowConfigService.getStepConfig('report_product_issue', 0);
      
      expect(step).toBeDefined();
      expect(step?.step).toBe('single-photo');
      expect(step?.stepNumber).toBe(1);
      expect(step?.totalSteps).toBe(1);
    });
  });

  describe('isValidWorkflowConfig', () => {
    it('should validate correct workflow config', () => {
      const config = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345');
      expect(PhotoWorkflowConfigService.isValidWorkflowConfig(config)).toBe(true);
    });

    it('should reject config with missing barcode', () => {
      const config = {
        type: 'add_new_product' as PhotoWorkflowType,
        steps: ['front-photo', 'ingredients-photo'] as any,
        barcode: '',
        workflowId: 'test_id',
      };
      expect(PhotoWorkflowConfigService.isValidWorkflowConfig(config)).toBe(false);
    });

    it('should reject config with invalid steps', () => {
      const config = {
        type: 'add_new_product' as PhotoWorkflowType,
        steps: ['invalid-step'] as any,
        barcode: '12345',
        workflowId: 'test_id',
      };
      expect(PhotoWorkflowConfigService.isValidWorkflowConfig(config)).toBe(false);
    });
  });

  describe('getWorkflowTitle', () => {
    it('should return correct titles for workflow types', () => {
      expect(PhotoWorkflowConfigService.getWorkflowTitle('add_new_product')).toBe('Add New Product');
      expect(PhotoWorkflowConfigService.getWorkflowTitle('report_product_issue')).toBe('Update Product Photo');
      expect(PhotoWorkflowConfigService.getWorkflowTitle('report_ingredients_issue')).toBe('Update Ingredients');
    });
  });

  describe('getCompletionNavigation', () => {
    it('should return correct navigation for workflow types', () => {
      expect(PhotoWorkflowConfigService.getCompletionNavigation('add_new_product')).toBe('back');
      expect(PhotoWorkflowConfigService.getCompletionNavigation('report_product_issue')).toBe('back');
      expect(PhotoWorkflowConfigService.getCompletionNavigation('report_ingredients_issue')).toBe('back');
    });
  });

  describe('getErrorHandling', () => {
    it('should return correct error handling for add_new_product', () => {
      const errorHandling = PhotoWorkflowConfigService.getErrorHandling('add_new_product');
      expect(errorHandling.showRetryButton).toBe(true);
      expect(errorHandling.allowSkipStep).toBe(false); // Both steps are critical
      expect(errorHandling.maxRetries).toBe(3);
    });

    it('should return correct error handling for report workflows', () => {
      const errorHandling = PhotoWorkflowConfigService.getErrorHandling('report_product_issue');
      expect(errorHandling.showRetryButton).toBe(true);
      expect(errorHandling.allowSkipStep).toBe(true); // User can cancel if needed
      expect(errorHandling.maxRetries).toBe(3);
    });
  });
});