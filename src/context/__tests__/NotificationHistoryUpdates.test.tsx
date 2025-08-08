/**
 * @jest-environment jsdom
 * 
 * Focused tests for history update functionality in the notification system fix.
 * Ensures that history updates work correctly for all workflow types while
 * maintaining proper isNew flag preservation and creation logic.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { NotificationProvider, useNotifications } from '../NotificationContext.refactored';
import { BackgroundJob } from '../../types/backgroundJobs';
import { Product, VeganStatus } from '../../types';

// Mock dependencies
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: 'ios' },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../../components/JobCompletionCard', () => 'JobCompletionCard');

// Mock backgroundQueueService as EventEmitter
const mockBackgroundQueueService = {
  initialize: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  emit: jest.fn(),
};

jest.mock('../../services/backgroundQueueService', () => ({
  backgroundQueueService: mockBackgroundQueueService,
}));

// Mock ProductLookupService
const mockProductLookupService = {
  lookupProductByBarcode: jest.fn(),
};

jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: mockProductLookupService,
}));

// Mock HistoryService with detailed tracking
const mockHistoryService = {
  addToHistory: jest.fn(),
  getHistory: jest.fn(),
  getNewItemsCount: jest.fn(),
};

jest.mock('../../services/HistoryService', () => ({
  historyService: mockHistoryService,
}));

// Mock WorkflowNotificationHandler
const mockWorkflowHandler = {
  hasProcessedJob: jest.fn(() => false),
  markJobAsProcessed: jest.fn(),
  cleanup: jest.fn(),
};

jest.mock('../../services/WorkflowNotificationHandler', () => ({
  WorkflowNotificationHandler: jest.fn(() => mockWorkflowHandler),
}));

// Mock ErrorNotificationService
jest.mock('../../services/ErrorNotificationService', () => ({
  ErrorNotificationService: {
    isConfidenceError: jest.fn(() => false),
  },
}));

// Test component - simple wrapper to trigger the context
function TestComponent() {
  const { notifications } = useNotifications();
  return <div data-testid="notification-count">{notifications.length}</div>;
}

// Helper functions
const createMockProduct = (barcode: string = '123456789012', isNew: boolean = false): Product & { isNew?: boolean } => ({
  id: `product-${barcode}`,
  barcode,
  name: 'Test Product',
  brand: 'Test Brand',
  veganStatus: VeganStatus.VEGAN,
  ingredients: [],
  imageUrl: 'https://example.com/image.jpg',
  isNew,
});

const createJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  workflowType?: 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue',
  workflowId?: string,
  resultData: any = { success: true }
): BackgroundJob => ({
  id: `job_${Math.random().toString(36).substr(2, 9)}`,
  upc: '123456789012',
  deviceId: 'test-device',
  imageUri: 'file://test-image.jpg',
  retryCount: 0,
  maxRetries: 3,
  jobType,
  workflowId: workflowId || (workflowType ? `workflow_${Math.random().toString(36).substr(2, 6)}` : undefined),
  workflowType,
  workflowSteps: workflowType ? { total: 2, current: 1 } : undefined,
  status: 'completed',
  resultData,
  priority: 1,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
});

describe('NotificationHistoryUpdates', () => {
  let eventListeners: { [key: string]: Function } = {};

  beforeEach(() => {
    jest.clearAllMocks();
    eventListeners = {};
    
    // Mock the event listener setup
    mockBackgroundQueueService.on.mockImplementation((...args: any[]) => {
      const [event, callback] = args;
      eventListeners[event] = callback;
    });
    
    (mockProductLookupService.lookupProductByBarcode as jest.Mock).mockResolvedValue({
      product: createMockProduct(),
    });
    
    (mockHistoryService.addToHistory as jest.Mock).mockResolvedValue(undefined);
    (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);
    (mockHistoryService.getNewItemsCount as jest.Mock).mockReturnValue(0);
  });

  describe('Add New Product Workflow History Updates', () => {
    it('creates new history entry with isNew=true for product_creation in add_new_product', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob(
        'product_creation',
        'add_new_product',
        'workflow_add_new_1'
      );

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
          name: 'Test Product',
        }),
        true, // isNew = true for add_new_product
        true  // forceUpdate = true
      );
    });

    it('preserves existing isNew flag for ingredient_parsing in add_new_product', async () => {
      // Setup existing history entry with isNew=true
      const existingProduct = createMockProduct('123456789012', true);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const ingredientJob = createJob(
        'ingredient_parsing',
        'add_new_product',
        'workflow_add_new_2'
      );

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        true, // preserved isNew flag
        true
      );
    });

    it('preserves isNew=false if already set for add_new_product workflows', async () => {
      // Setup existing history entry with isNew=false
      const existingProduct = createMockProduct('123456789012', false);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const photoUploadJob = createJob(
        'product_photo_upload',
        'add_new_product',
        'workflow_add_new_3'
      );

      await act(async () => {
        eventListeners['job_completed'](photoUploadJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        false, // preserved isNew=false
        true
      );
    });
  });

  describe('Report Product Issue Workflow History Updates', () => {
    it('preserves existing isNew flag for product_creation in report_product_issue', async () => {
      // Setup existing history entry with isNew=true
      const existingProduct = createMockProduct('123456789012', true);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob(
        'product_creation',
        'report_product_issue',
        'workflow_report_product_1'
      );

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        true, // preserved existing isNew=true
        true
      );
    });

    it('creates new history entry with isNew=false for product_creation when product not in history', async () => {
      // Empty history
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob(
        'product_creation',
        'report_product_issue',
        'workflow_report_product_2'
      );

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        false, // isNew=false since it's a report on existing product
        true
      );
    });

    it('updates history for non-product_creation jobs in report_product_issue', async () => {
      const existingProduct = createMockProduct('123456789012', false);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const photoUploadJob = createJob(
        'product_photo_upload',
        'report_product_issue',
        'workflow_report_product_3'
      );

      await act(async () => {
        eventListeners['job_completed'](photoUploadJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        false, // preserved isNew=false
        true
      );
    });
  });

  describe('Report Ingredients Issue Workflow History Updates', () => {
    it('preserves existing isNew flag for product_creation in report_ingredients_issue', async () => {
      const existingProduct = createMockProduct('123456789012', true);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob(
        'product_creation',
        'report_ingredients_issue',
        'workflow_report_ingredients_1'
      );

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        true, // preserved existing isNew=true
        true
      );
    });

    it('creates new history entry with isNew=false for ingredients report when product not found', async () => {
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob(
        'product_creation',
        'report_ingredients_issue',
        'workflow_report_ingredients_2'
      );

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        false, // isNew=false for report workflows
        true
      );
    });

    it('updates history for ingredient_parsing jobs in report_ingredients_issue', async () => {
      const existingProduct = createMockProduct('123456789012', true);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const ingredientJob = createJob(
        'ingredient_parsing',
        'report_ingredients_issue',
        'workflow_report_ingredients_3'
      );

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        true, // preserved existing isNew=true
        true
      );
    });
  });

  describe('History Update Error Handling', () => {
    it('handles history update errors gracefully', async () => {
      // Mock history update to throw an error
      mockHistoryService.addToHistory.mockRejectedValueOnce(new Error('History update failed'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('product_creation', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should log the error but not crash
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating history'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('handles missing product data gracefully', async () => {
      // Mock product lookup to return null
      mockProductLookupService.lookupProductByBarcode.mockResolvedValueOnce({
        product: null,
      });

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('product_creation', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not call addToHistory when product is null
      expect(mockHistoryService.addToHistory).not.toHaveBeenCalled();
    });
  });

  describe('Individual Jobs Do Not Update History', () => {
    it('does not update history for individual (non-workflow) jobs', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const individualJob = createJob(
        'product_creation',
        undefined, // no workflow
        undefined
      );
      individualJob.workflowId = undefined;
      individualJob.workflowType = undefined;
      individualJob.workflowSteps = undefined;

      await act(async () => {
        eventListeners['job_completed'](individualJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Individual jobs should not update history
      expect(mockHistoryService.addToHistory).not.toHaveBeenCalled();
    });
  });

  describe('History Update Call Patterns', () => {
    it('calls history update exactly once per job in workflows', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job1 = createJob('product_creation', 'add_new_product', 'workflow_1');
      const job2 = createJob('ingredient_parsing', 'add_new_product', 'workflow_2');
      const job3 = createJob('product_photo_upload', 'report_product_issue', 'workflow_3');

      await act(async () => {
        eventListeners['job_completed'](job1);
        eventListeners['job_completed'](job2);
        eventListeners['job_completed'](job3);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should be called exactly 3 times, once per job
      expect(mockHistoryService.addToHistory).toHaveBeenCalledTimes(3);
    });

    it('uses correct forceUpdate flag for all history updates', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('product_creation', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.any(Object), // product
        expect.any(Boolean), // isNew
        true // forceUpdate should always be true
      );
    });

    it('handles multiple products with different barcodes correctly', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock different products for different UPCs
      mockProductLookupService.lookupProductByBarcode
        .mockImplementationOnce((upc: string) => Promise.resolve({
          product: createMockProduct(upc)
        }))
        .mockImplementationOnce((upc: string) => Promise.resolve({
          product: createMockProduct(upc)
        }));

      const job1 = createJob('product_creation', 'add_new_product');
      job1.upc = '111111111111';
      
      const job2 = createJob('product_creation', 'add_new_product');
      job2.upc = '222222222222';

      await act(async () => {
        eventListeners['job_completed'](job1);
        eventListeners['job_completed'](job2);
        await waitFor(() => {}, { timeout: 200 });
      });

      expect(mockHistoryService.addToHistory).toHaveBeenCalledTimes(2);
      expect(mockHistoryService.addToHistory).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ barcode: '111111111111' }),
        true, true
      );
      expect(mockHistoryService.addToHistory).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ barcode: '222222222222' }),
        true, true
      );
    });
  });

  describe('History Lookup Logic', () => {
    it('correctly finds existing history entries by barcode', async () => {
      const existingProduct1 = createMockProduct('111111111111', true);
      const existingProduct2 = createMockProduct('222222222222', false);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([existingProduct1, existingProduct2]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('ingredient_parsing', 'report_product_issue');
      job.upc = '222222222222'; // Match second product

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should preserve the isNew=false flag from the second product
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '222222222222',
        }),
        false, // preserved from existing entry
        true
      );
    });

    it('handles empty history array correctly', async () => {
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('product_creation', 'report_product_issue');

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should create new entry with isNew=false for report workflows
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
        }),
        false, // new entry in report workflow
        true
      );
    });
  });
});