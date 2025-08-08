/**
 * Tests for JobSubmissionService
 */

import { JobSubmissionService, JobSubmissionParams } from '../JobSubmissionService';
import { PhotoWorkflowType } from '../../types/photoWorkflow';

describe('JobSubmissionService', () => {
  describe('validateJobParams', () => {
    it('should validate correct product creation job params', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct ingredient parsing job params', () => {
      const params: JobSubmissionParams = {
        jobType: 'ingredient_parsing',
        imageUri: 'file://ingredients.jpg',
        upc: '67890',
        existingProductData: null,
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject params with missing image URI', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: '',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Image URI is required');
    });

    it('should reject product creation without workflow ID', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Workflow ID is required for product creation jobs');
    });

    it('should warn about invalid image URI format', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'https://example.com/test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Image URI may not be a valid local file path');
    });

    it('should reject invalid workflow steps', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 3 }, // Current > total
      };
      
      const result = JobSubmissionService.validateJobParams(params);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Current step cannot exceed total steps');
    });
  });

  describe('createStandardizedJobParams', () => {
    it('should create standardized params for product creation', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const standardized = JobSubmissionService.createStandardizedJobParams(params);
      
      expect(standardized.jobType).toBe('product_creation');
      expect(standardized.priority).toBe(3); // High priority for product creation
      expect(standardized.maxRetries).toBe(3);
      expect(standardized.retryCount).toBe(0);
      expect(standardized.workflowId).toBe('workflow_123');
    });

    it('should throw error for invalid params', () => {
      const params: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: '',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      expect(() => {
        JobSubmissionService.createStandardizedJobParams(params);
      }).toThrow('Invalid job parameters');
    });

    it('should set correct priority based on job type', () => {
      const productCreation = JobSubmissionService.createStandardizedJobParams({
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      });
      
      const ingredientParsing = JobSubmissionService.createStandardizedJobParams({
        jobType: 'ingredient_parsing',
        imageUri: 'file://test.jpg',
        upc: '12345',
      });
      
      expect(productCreation.priority).toBe(3); // High priority
      expect(ingredientParsing.priority).toBe(2); // Medium priority
    });
  });

  describe('createJobFactory', () => {
    it('should create job factory with correct methods', () => {
      const factory = JobSubmissionService.createJobFactory();
      
      expect(factory.productCreation).toBeDefined();
      expect(factory.ingredientParsing).toBeDefined();
      expect(factory.productPhotoUpload).toBeDefined();
    });

    it('should create correct product creation job', () => {
      const factory = JobSubmissionService.createJobFactory();
      const job = factory.productCreation({
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowId: 'workflow_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      });
      
      expect(job.jobType).toBe('product_creation');
      expect(job.imageUri).toBe('file://test.jpg');
      expect(job.workflowType).toBe('add_new_product');
    });
  });

  describe('createWorkflowMetadata', () => {
    it('should create valid workflow metadata', () => {
      const metadata = JobSubmissionService.createWorkflowMetadata('add_new_product', 3, 2);
      
      expect(metadata.workflowType).toBe('add_new_product');
      expect(metadata.workflowSteps.total).toBe(3);
      expect(metadata.workflowSteps.current).toBe(2);
    });

    it('should clamp current step to valid range', () => {
      const metadata = JobSubmissionService.createWorkflowMetadata('add_new_product', 3, 5);
      expect(metadata.workflowSteps.current).toBe(3); // Clamped to total
    });

    it('should ensure minimum values', () => {
      const metadata = JobSubmissionService.createWorkflowMetadata('add_new_product', 0, 0);
      expect(metadata.workflowSteps.total).toBe(1); // Minimum 1
      expect(metadata.workflowSteps.current).toBe(1); // Minimum 1
    });
  });

  describe('getJobDescription', () => {
    it('should generate correct descriptions', () => {
      const productCreation: JobSubmissionParams = {
        jobType: 'product_creation',
        imageUri: 'file://test.jpg',
        upc: '12345',
        workflowType: 'add_new_product',
        workflowSteps: { total: 2, current: 1 },
      };
      
      const description = JobSubmissionService.getJobDescription(productCreation);
      expect(description).toBe('Product Creation (1/2) - add_new_product');
    });

    it('should handle missing workflow steps', () => {
      const ingredientParsing: JobSubmissionParams = {
        jobType: 'ingredient_parsing',
        imageUri: 'file://test.jpg',
        upc: '12345',
      };
      
      const description = JobSubmissionService.getJobDescription(ingredientParsing);
      expect(description).toBe('Ingredient Parsing  - individual');
    });
  });

  describe('shouldGroupJobsInWorkflow', () => {
    it('should group add_new_product jobs', () => {
      expect(JobSubmissionService.shouldGroupJobsInWorkflow('add_new_product')).toBe(true);
    });

    it('should not group individual action jobs', () => {
      expect(JobSubmissionService.shouldGroupJobsInWorkflow('individual_action')).toBe(false);
      expect(JobSubmissionService.shouldGroupJobsInWorkflow(undefined)).toBe(false);
    });
  });
});