/**
 * Integration test for the unified photo workflow system
 * 
 * Tests the complete flow from photo capture to job submission to notification
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BackgroundJob } from '../../types/backgroundJobs';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../context/AppContext', () => ({
  useApp: () => ({
    queueJob: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../services/UnifiedCameraService', () => ({
  getInstance: () => ({
    switchToMode: jest.fn().mockResolvedValue(true),
    getState: jest.fn().mockReturnValue({ mode: 'inactive' }),
    getCurrentOwner: jest.fn().mockReturnValue(null),
  }),
}));

jest.mock('../../components/UnifiedCameraView', () => {
  const MockUnifiedCameraView = React.forwardRef<any, any>((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file://test-photo.jpg',
      }),
    }));
    
    return React.createElement('View', { testID: 'unified-camera-view' });
  });
  
  MockUnifiedCameraView.displayName = 'MockUnifiedCameraView';
  
  return MockUnifiedCameraView;
});

// Import after mocks
import UnifiedPhotoWorkflowScreen from '../../screens/UnifiedPhotoWorkflowScreen';
import { PhotoWorkflowConfigService } from '../../services/PhotoWorkflowConfig';
import { JobSubmissionService } from '../../services/JobSubmissionService';
import { PhotoErrorHandler } from '../../services/PhotoErrorHandler';
import { WorkflowNotificationHandler } from '../../services/WorkflowNotificationHandler';

// Mock implementations
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};

const mockParams = {
  barcode: '12345678901',
  workflowType: 'add_new_product',
};

// Spy on Alert
jest.spyOn(Alert, 'alert');

describe('UnifiedPhotoWorkflow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue(mockParams);
  });

  describe('PhotoWorkflowConfig Integration', () => {
    it('should create valid workflow configuration', () => {
      const config = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345678901');
      
      expect(config.type).toBe('add_new_product');
      expect(config.barcode).toBe('12345678901');
      expect(config.steps).toEqual(['front-photo', 'ingredients-photo']);
      expect(config.workflowId).toMatch(/workflow_\d+_[a-z0-9]+/);
      
      // Validate the configuration
      expect(PhotoWorkflowConfigService.isValidWorkflowConfig(config)).toBe(true);
    });

    it('should provide correct step configurations for multi-step workflow', () => {
      const step1 = PhotoWorkflowConfigService.getStepConfig('add_new_product', 0);
      const step2 = PhotoWorkflowConfigService.getStepConfig('add_new_product', 1);
      
      expect(step1).toEqual({
        step: 'front-photo',
        title: 'Product Front',
        instruction: 'Take a clear photo of the front of the product, making sure the name and brand information is visible.',
        stepNumber: 1,
        totalSteps: 2,
        cameraMode: 'product-photo',
        jobType: 'product_creation',
        jobPriority: 3,
        workflowSteps: { total: 3, current: 1 },
      });

      expect(step2).toEqual({
        step: 'ingredients-photo',
        title: 'Ingredients',
        instruction: 'Take a clear photo of the product ingredients.',
        stepNumber: 2,
        totalSteps: 2,
        cameraMode: 'ingredients-photo',
        jobType: 'ingredient_parsing',
        jobPriority: 2,
        workflowSteps: { total: 3, current: 2 },
      });
    });
  });

  describe('JobSubmissionService Integration', () => {
    it('should create and validate standardized job parameters', () => {
      const factory = JobSubmissionService.createJobFactory();
      
      // Create product creation job
      const productCreationJob = factory.productCreation({
        imageUri: 'file://test-photo.jpg',
        upc: '12345678901',
        workflowId: 'workflow_test_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 3, current: 1 },
      });

      // Validate the job parameters
      const validation = JobSubmissionService.validateJobParams(productCreationJob);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Create standardized parameters
      const standardized = JobSubmissionService.createStandardizedJobParams(productCreationJob);
      expect(standardized.jobType).toBe('product_creation');
      expect(standardized.priority).toBe(3);
      expect(standardized.maxRetries).toBe(3);
      expect(standardized.workflowId).toBe('workflow_test_123');
    });

    it('should handle ingredient parsing job correctly', () => {
      const factory = JobSubmissionService.createJobFactory();
      
      const ingredientJob = factory.ingredientParsing({
        imageUri: 'file://ingredients.jpg',
        upc: '12345678901',
        workflowId: 'workflow_test_123',
        workflowType: 'add_new_product',
        workflowSteps: { total: 3, current: 2 },
        existingProductData: null,
      });

      const validation = JobSubmissionService.validateJobParams(ingredientJob);
      expect(validation.isValid).toBe(true);

      const standardized = JobSubmissionService.createStandardizedJobParams(ingredientJob);
      expect(standardized.existingProductData).toBeNull();
      expect(standardized.priority).toBe(2);
    });
  });

  describe('PhotoErrorHandler Integration', () => {
    it('should analyze and handle photo quality errors correctly', () => {
      const mockJob = {
        id: 'test_job_123',
        jobType: 'ingredient_parsing' as const,
        status: 'completed' as const,
        priority: 2,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 1,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          error: 'photo quality too low',
          success: false,
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(mockJob);
      expect(error).toBeDefined();
      expect(error?.type).toBe('photo_quality_too_low');

      const recoveryOptions = PhotoErrorHandler.getRecoveryOptions(
        error!.type,
        'add_new_product',
        mockJob.retryCount
      );
      
      expect(recoveryOptions.allowRetry).toBe(true);
      expect(recoveryOptions.maxRetryAttempts).toBe(3);
      expect(recoveryOptions.alternativeActions).toContainEqual(
        expect.objectContaining({ action: 'different_photo' })
      );

      const formatted = PhotoErrorHandler.formatErrorForUser(error!);
      expect(formatted.title).toBe('Photo Quality Too Low');
      expect(formatted.suggestions).toContain('Take a clearer photo with better lighting');
    });

    it('should handle confidence threshold errors for product creation', () => {
      const mockJob = {
        id: 'test_job_456',
        jobType: 'product_creation' as const,
        status: 'completed' as const,
        priority: 3,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        resultData: {
          error: 'Product title scan failed.',
          success: false,
        },
      };

      const error = PhotoErrorHandler.analyzeJobError(mockJob);
      expect(error?.type).toBe('confidence_threshold_not_met');
      expect(error?.userMessage).toContain('Unable to read the product information clearly');
    });
  });

  describe('WorkflowNotificationHandler Integration', () => {
    let workflowHandler: WorkflowNotificationHandler;
    let mockNotificationCallback: jest.Mock;
    let mockHistoryCallback: jest.Mock;

    beforeEach(() => {
      workflowHandler = new WorkflowNotificationHandler();
      mockNotificationCallback = jest.fn();
      mockHistoryCallback = jest.fn();
    });

    it('should handle multi-step workflow completion correctly', async () => {
      const workflowId = 'workflow_test_789';
      
      // First job: product creation
      const productCreationJob = {
        id: 'job_1',
        jobType: 'product_creation' as const,
        status: 'completed' as const,
        priority: 3,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://product.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        completedAt: new Date(),
        workflowId,
        workflowType: 'add_new_product' as const,
        workflowSteps: { total: 3, current: 1 },
        resultData: {
          success: true,
          productData: { id: '123', name: 'Test Product' },
        },
      };

      // Second job: ingredient parsing
      const ingredientJob = {
        id: 'job_2',
        jobType: 'ingredient_parsing' as const,
        status: 'completed' as const,
        priority: 2,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://ingredients.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        completedAt: new Date(),
        workflowId,
        workflowType: 'add_new_product' as const,
        workflowSteps: { total: 3, current: 2 },
        resultData: {
          success: true,
          ingredients: ['ingredient 1', 'ingredient 2'],
        },
      };

      // Process first job
      await workflowHandler.processWorkflowJobCompleted(
        productCreationJob,
        mockNotificationCallback,
        mockHistoryCallback
      );

      // Should not show notification yet (workflow not complete)
      expect(mockNotificationCallback).not.toHaveBeenCalled();
      expect(mockHistoryCallback).not.toHaveBeenCalled();

      // Process second job (completes workflow)
      await workflowHandler.processWorkflowJobCompleted(
        ingredientJob,
        mockNotificationCallback,
        mockHistoryCallback
      );

      // Should show success notification and update history
      expect(mockNotificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: expect.stringContaining('Product created successfully'),
        })
      );
      
      expect(mockHistoryCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '12345678901',
        }),
        true
      );
    });

    it('should handle workflow with partial errors correctly', async () => {
      const workflowId = 'workflow_error_test';
      
      // Successful product creation
      const productCreationJob = {
        id: 'job_1',
        jobType: 'product_creation' as const,
        status: 'completed' as const,
        priority: 3,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://product.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        workflowId,
        workflowType: 'add_new_product' as const,
        workflowSteps: { total: 3, current: 1 },
        resultData: {
          success: true,
          productData: { id: '123' },
        },
      };

      // Failed ingredient parsing
      const ingredientJob = {
        id: 'job_2',
        jobType: 'ingredient_parsing' as const,
        status: 'completed' as const,
        priority: 2,
        upc: '12345678901',
        deviceId: 'device_123',
        imageUri: 'file://ingredients.jpg',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        workflowId,
        workflowType: 'add_new_product' as const,
        workflowSteps: { total: 3, current: 2 },
        resultData: {
          error: 'photo quality too low',
          success: false,
        },
      };

      // Process both jobs
      await workflowHandler.processWorkflowJobCompleted(
        productCreationJob,
        mockNotificationCallback,
        mockHistoryCallback
      );
      
      await workflowHandler.processWorkflowJobCompleted(
        ingredientJob,
        mockNotificationCallback,
        mockHistoryCallback
      );

      // Should show error notification but still update history (product was created)
      expect(mockNotificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('ingredient scanning failed'),
        })
      );
      
      // History should still be updated since product creation succeeded
      expect(mockHistoryCallback).toHaveBeenCalled();
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should handle complete add_new_product workflow', async () => {
      // 1. Create workflow configuration
      const config = PhotoWorkflowConfigService.createWorkflowConfig('add_new_product', '12345678901');
      expect(PhotoWorkflowConfigService.isValidWorkflowConfig(config)).toBe(true);

      // 2. Get step configurations
      const step1Config = PhotoWorkflowConfigService.getStepConfig(config.type, 0);
      const step2Config = PhotoWorkflowConfigService.getStepConfig(config.type, 1);
      
      expect(step1Config?.jobType).toBe('product_creation');
      expect(step2Config?.jobType).toBe('ingredient_parsing');

      // 3. Create job parameters using JobSubmissionService
      const factory = JobSubmissionService.createJobFactory();
      
      const job1Params = factory.productCreation({
        imageUri: 'file://product.jpg',
        upc: config.barcode,
        workflowId: config.workflowId,
        workflowType: config.type,
        workflowSteps: step1Config!.workflowSteps,
      });

      const job2Params = factory.ingredientParsing({
        imageUri: 'file://ingredients.jpg',
        upc: config.barcode,
        workflowId: config.workflowId,
        workflowType: config.type,
        workflowSteps: step2Config!.workflowSteps,
        existingProductData: null,
      });

      // 4. Validate job parameters
      expect(JobSubmissionService.validateJobParams(job1Params).isValid).toBe(true);
      expect(JobSubmissionService.validateJobParams(job2Params).isValid).toBe(true);

      // 5. Create standardized parameters
      const standardizedJob1 = JobSubmissionService.createStandardizedJobParams(job1Params);
      const standardizedJob2 = JobSubmissionService.createStandardizedJobParams(job2Params);

      expect(standardizedJob1.workflowId).toBe(config.workflowId);
      expect(standardizedJob2.workflowId).toBe(config.workflowId);

      // 6. Simulate error handling
      const mockFailedJob: BackgroundJob = {
        ...standardizedJob1,
        id: 'failed_job',
        jobType: 'product_creation',
        status: 'completed' as const,
        deviceId: 'test-device-123',
        upc: config.barcode,
        imageUri: 'file://test.jpg',
        retryCount: 0,
        maxRetries: 3,
        priority: 5,
        createdAt: new Date(),
        resultData: { error: 'photo quality too low', success: false },
      };

      const error = PhotoErrorHandler.analyzeJobError(mockFailedJob);
      expect(error?.type).toBe('photo_quality_too_low');

      const recoveryOptions = PhotoErrorHandler.getRecoveryOptions(
        error!.type,
        config.type,
        0
      );
      expect(recoveryOptions.allowRetry).toBe(true);
      expect(recoveryOptions.allowSkip).toBe(false); // Critical workflow
    });

    it('should handle report_product_issue workflow', async () => {
      const config = PhotoWorkflowConfigService.createWorkflowConfig('report_product_issue', '12345678901');
      
      expect(config.steps).toEqual(['single-photo']);
      expect(config.metadata?.issueType).toBe('product');

      const stepConfig = PhotoWorkflowConfigService.getStepConfig(config.type, 0);
      expect(stepConfig?.jobType).toBe('product_creation');
      expect(stepConfig?.totalSteps).toBe(1);

      const errorHandling = PhotoWorkflowConfigService.getErrorHandling(config.type);
      expect(errorHandling.allowSkipStep).toBe(true); // User can cancel report workflows
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle legacy route parameters correctly', () => {
      const legacyParams = {
        barcode: '12345678901',
        type: 'product', // Legacy parameter
      };

      (useLocalSearchParams as jest.Mock).mockReturnValue(legacyParams);

      // The screen should handle legacy parameters by mapping them to new workflow types
      const { getByTestId } = render(<UnifiedPhotoWorkflowScreen />);
      
      // Should render without errors
      expect(getByTestId('unified-camera-view')).toBeDefined();
    });

    it('should maintain existing job submission interface', () => {
      // Ensure the new JobSubmissionService creates parameters compatible with existing queueJob function
      const factory = JobSubmissionService.createJobFactory();
      const jobParams = factory.productPhotoUpload({
        imageUri: 'file://test.jpg',
        upc: '12345678901',
      });

      const standardized = JobSubmissionService.createStandardizedJobParams(jobParams);
      
      // Should have all required fields for existing queueJob function
      expect(standardized).toHaveProperty('jobType');
      expect(standardized).toHaveProperty('imageUri');
      expect(standardized).toHaveProperty('upc');
      expect(standardized).toHaveProperty('priority');
      expect(standardized).toHaveProperty('retryCount');
      expect(standardized).toHaveProperty('maxRetries');
    });
  });
});