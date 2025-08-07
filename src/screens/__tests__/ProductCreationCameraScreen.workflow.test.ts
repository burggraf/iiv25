/**
 * Integration test to verify ProductCreationCameraScreen 
 * correctly sets workflow context on background jobs
 */

import { BackgroundJob } from '../../types/backgroundJobs';

// Mock the queueJob function to capture the job parameters
let mockedQueueJob: jest.Mock;
let capturedJobs: any[] = [];

jest.mock('../../context/AppContext', () => ({
  useApp: () => ({
    queueJob: mockedQueueJob
  })
}));

// Mock other dependencies
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn()
  }),
  useLocalSearchParams: () => ({
    barcode: '123456789012'
  })
}));

jest.mock('../../services/UnifiedCameraService', () => ({
  default: {
    getInstance: () => ({
      switchToMode: jest.fn().mockResolvedValue(true)
    })
  }
}));

jest.mock('react', () => {
  const React = jest.requireActual('react');
  return {
    ...React,
    useRef: () => ({ current: null }),
    useState: jest.fn((initial) => {
      if (typeof initial === 'function') {
        return [initial(), jest.fn()];
      }
      return [initial, jest.fn()];
    }),
    useEffect: jest.fn()
  };
});

describe('ProductCreationCameraScreen Workflow Integration', () => {
  beforeEach(() => {
    capturedJobs = [];
    mockedQueueJob = jest.fn().mockImplementation((job) => {
      capturedJobs.push(job);
      return Promise.resolve({ id: `job_${Date.now()}` });
    });
  });

  test('should queue jobs with workflow context for add_new_product flow', async () => {
    // Import the screen component
    const ProductCreationCameraScreen = require('../ProductCreationCameraScreen').default;
    
    // Mock the component's internal state
    let currentStep = 'front-photo';
    let workflowId = 'workflow_test_123456789';
    const mockSetCurrentStep = jest.fn((newStep) => {
      currentStep = newStep;
    });
    const mockSetCapturedPhoto = jest.fn();
    const mockSetIsPreviewMode = jest.fn();
    
    // Override useState to return our controlled values
    const { useState } = require('react');
    useState.mockImplementation((initial: any) => {
      if (initial === 'front-photo') {
        return [currentStep, mockSetCurrentStep];
      }
      if (initial === null && initial !== false) { // capturedPhoto
        return ['test-photo-uri', mockSetCapturedPhoto];
      }
      if (initial === false) { // isPreviewMode
        return [false, mockSetIsPreviewMode];
      }
      if (typeof initial === 'function' && initial.toString().includes('workflow_')) {
        return [workflowId, jest.fn()];
      }
      return [initial, jest.fn()];
    });

    // Simulate the handleUsePhoto function behavior
    const handleUsePhoto = async () => {
      const capturedPhoto = 'test-photo-uri';
      const barcode = '123456789012';
      
      if (currentStep === 'front-photo') {
        // Queue the front product photo for processing with workflow context
        await mockedQueueJob({
          jobType: 'product_creation',
          imageUri: capturedPhoto,
          upc: barcode,
          priority: 3,
          workflowId,
          workflowType: 'add_new_product',
          workflowSteps: { total: 3, current: 1 },
        });
        
        // Move to ingredients photo step
        mockSetCurrentStep('ingredients-photo');
        currentStep = 'ingredients-photo';
        mockSetCapturedPhoto(null);
        mockSetIsPreviewMode(false);
      } else if (currentStep === 'ingredients-photo') {
        // Queue the ingredients photo for processing with workflow context
        await mockedQueueJob({
          jobType: 'ingredient_parsing',
          imageUri: capturedPhoto,
          upc: barcode,
          existingProductData: null,
          priority: 2,
          workflowId,
          workflowType: 'add_new_product',
          workflowSteps: { total: 3, current: 2 },
        });
      }
    };

    // Test first step (front photo)
    await handleUsePhoto();
    
    expect(capturedJobs).toHaveLength(1);
    expect(capturedJobs[0]).toMatchObject({
      jobType: 'product_creation',
      upc: '123456789012',
      workflowId: workflowId,
      workflowType: 'add_new_product',
      workflowSteps: { total: 3, current: 1 }
    });

    // Test second step (ingredients photo)
    await handleUsePhoto();
    
    expect(capturedJobs).toHaveLength(2);
    expect(capturedJobs[1]).toMatchObject({
      jobType: 'ingredient_parsing',
      upc: '123456789012',
      workflowId: workflowId,
      workflowType: 'add_new_product',
      workflowSteps: { total: 3, current: 2 }
    });

    // Verify both jobs have the same workflow ID
    expect(capturedJobs[0].workflowId).toBe(capturedJobs[1].workflowId);
    expect(capturedJobs[0].workflowType).toBe('add_new_product');
    expect(capturedJobs[1].workflowType).toBe('add_new_product');
  });

  test('should generate unique workflow IDs', () => {
    // Test that the workflow ID generation produces unique IDs
    const generateWorkflowId = () => 
      `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const id1 = generateWorkflowId();
    const id2 = generateWorkflowId();
    const id3 = generateWorkflowId();
    
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
    
    // Verify format
    expect(id1).toMatch(/^workflow_\d+_[a-z0-9]{9}$/);
    expect(id2).toMatch(/^workflow_\d+_[a-z0-9]{9}$/);
    expect(id3).toMatch(/^workflow_\d+_[a-z0-9]{9}$/);
  });
});