/**
 * @jest-environment jsdom
 * 
 * Comprehensive tests for the notification system fix addressing:
 * 1. Duplicate notifications for report workflows
 * 2. Incorrect error messages for failed product_creation jobs
 * 3. Ensuring no regression in add_new_product workflows
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
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
jest.mock('../../services/backgroundQueueService', () => ({
  backgroundQueueService: {
    initialize: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    emit: jest.fn(), // For testing event emission
  },
}));

// Mock ProductLookupService
const mockProductLookupService = {
  lookupProductByBarcode: jest.fn() as jest.MockedFunction<any>,
};

jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: mockProductLookupService,
}));

// Mock HistoryService
const mockHistoryService = {
  addToHistory: jest.fn() as jest.MockedFunction<any>,
  getHistory: jest.fn() as jest.MockedFunction<any>,
  getNewItemsCount: jest.fn() as jest.MockedFunction<any>,
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

// Test component that uses the notification context
function TestComponent() {
  const { notifications, dismissNotification, clearAllNotifications } = useNotifications();
  
  return (
    <div>
      <div data-testid="notification-count">{notifications.length}</div>
      {notifications.map((notification) => (
        <div key={notification.id} data-testid="notification">
          <span data-testid="notification-message">{notification.message}</span>
          <span data-testid="notification-type">{notification.type}</span>
        </div>
      ))}
    </div>
  );
}

// Helper functions to create mock jobs
const createMockJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  workflowType?: 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue',
  workflowId?: string,
  resultData: any = { success: true },
  errorMessage?: string
): BackgroundJob => ({
  id: `job_${Math.random().toString(36).substr(2, 9)}`,
  upc: '123456789012',
  deviceId: 'test-device',
  imageUri: 'file://test-image.jpg',
  retryCount: 0,
  maxRetries: 3,
  jobType,
  workflowId,
  workflowType,
  workflowSteps: workflowId ? { total: 2, current: 1 } : undefined,
  status: 'completed',
  resultData,
  errorMessage,
  priority: 1,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
});

const createMockProduct = (barcode: string = '123456789012'): Product => ({
  id: `product-${barcode}`,
  barcode,
  name: 'Test Product',
  brand: 'Test Brand',
  veganStatus: VeganStatus.VEGAN,
  ingredients: [],
  imageUrl: 'https://example.com/image.jpg',
});

describe('NotificationSystemFix', () => {
  let eventListeners: { [key: string]: Function } = {};
  let mockBackgroundQueueService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    eventListeners = {};
    
    // Get the mocked service
    mockBackgroundQueueService = require('../../services/backgroundQueueService').backgroundQueueService;
    
    // Mock the event listener setup
    mockBackgroundQueueService.on.mockImplementation((...args: any[]) => {
      const [event, callback] = args;
      eventListeners[event] = callback;
    });
    
    mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
      product: createMockProduct(),
    });
    
    mockHistoryService.addToHistory.mockResolvedValue(undefined);
    mockHistoryService.getHistory.mockReturnValue([]);
    mockHistoryService.getNewItemsCount.mockReturnValue(0);
  });

  describe('Notification Suppression for Report Workflows', () => {
    it('suppresses product_creation notifications for report_product_issue workflows', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createMockJob(
        'product_creation',
        'report_product_issue',
        'workflow_123',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should have 0 notifications (suppressed)
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('suppresses product_creation notifications for report_ingredients_issue workflows', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createMockJob(
        'product_creation',
        'report_ingredients_issue',
        'workflow_456',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should have 0 notifications (suppressed)
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('shows product_photo_upload notifications for report_product_issue workflows', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const photoUploadJob = createMockJob(
        'product_photo_upload',
        'report_product_issue',
        'workflow_789',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](photoUploadJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show notification for photo upload
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('✅ Photo updated');
    });

    it('shows ingredient_parsing notifications for report_ingredients_issue workflows', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const ingredientJob = createMockJob(
        'ingredient_parsing',
        'report_ingredients_issue',
        'workflow_101',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show notification for ingredient parsing
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');
    });
  });

  describe('Error Message Generation for Different Workflows', () => {
    beforeEach(() => {
      // Mock confidence error detection
      const { ErrorNotificationService } = require('../../services/ErrorNotificationService');
      ErrorNotificationService.isConfidenceError.mockImplementation((message: string) => {
        return message && message.includes('confidence below threshold');
      });
    });

    it('shows correct error message for failed product_creation in report_product_issue', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createMockJob(
        'product_creation',
        'report_product_issue',
        'workflow_error1',
        { error: 'confidence below threshold' },
        'confidence below threshold'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show specific error message for product photo
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('❌ Invalid product photo - please try again');
      
      const types = getAllByTestId('notification-type');
      expect(types[0]).toHaveTextContent('error');
    });

    it('shows correct error message for failed product_creation in report_ingredients_issue', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createMockJob(
        'product_creation',
        'report_ingredients_issue',
        'workflow_error2',
        { error: 'confidence below threshold' },
        'confidence below threshold'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show specific error message for ingredients photo
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('❌ Invalid ingredients photo - please try again');
      
      const types = getAllByTestId('notification-type');
      expect(types[0]).toHaveTextContent('error');
    });

    it('shows generic error message for other failed jobs', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createMockJob(
        'product_photo_upload',
        'report_product_issue',
        'workflow_error3',
        { error: 'upload failed' },
        'upload failed'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show generic error message
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
    });
  });

  describe('History Updates Still Work Correctly', () => {
    it('updates history for report_product_issue workflows with fresh data', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const mockProduct = createMockProduct();
      mockHistoryService.getHistory.mockReturnValue([
        { ...mockProduct, isNew: true }
      ]);

      const successJob = createMockJob(
        'product_creation',
        'report_product_issue',
        'workflow_history1',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should update history with preserved isNew flag
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '123456789012' }),
        true, // preserved isNew flag
        true
      );
    });

    it('updates history for report_ingredients_issue workflows', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const mockProduct = createMockProduct();
      mockHistoryService.getHistory.mockReturnValue([
        { ...mockProduct, isNew: false }
      ]);

      const successJob = createMockJob(
        'ingredient_parsing',
        'report_ingredients_issue',
        'workflow_history2',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should update history with preserved isNew flag
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '123456789012' }),
        false, // preserved isNew flag
        true
      );
    });

    it('creates new history entry when product not found in existing history', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Empty history
      mockHistoryService.getHistory.mockReturnValue([]);

      const successJob = createMockJob(
        'product_creation',
        'report_product_issue',
        'workflow_history3',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should create new history entry with isNew: false (reporting on existing product)
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '123456789012' }),
        false, // new entry, but not isNew since it's a report workflow
        true
      );
    });
  });

  describe('No Regression in Add New Product Behavior', () => {
    it('preserves existing behavior for add_new_product product_creation success', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createMockJob(
        'product_creation',
        'add_new_product',
        'workflow_regression1',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should NOT show notification for product_creation in add_new_product (less confusing)
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      
      // Should still update history with isNew: true
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '123456789012' }),
        true, // isNew for add_new_product
        true
      );
    });

    it('shows notifications for add_new_product ingredient_parsing jobs', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const mockProduct = createMockProduct();
      mockHistoryService.getHistory.mockReturnValue([
        { ...mockProduct, isNew: true }
      ]);

      const ingredientJob = createMockJob(
        'ingredient_parsing',
        'add_new_product',
        'workflow_regression2',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show notification for ingredient parsing
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');
    });

    it('preserves error handling for add_new_product failed jobs', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createMockJob(
        'product_photo_upload',
        'add_new_product',
        'workflow_regression3',
        { error: 'upload failed' },
        'upload failed'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show error notification
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
      
      const types = getAllByTestId('notification-type');
      expect(types[0]).toHaveTextContent('error');
    });
  });

  describe('Edge Cases', () => {
    it('handles individual (non-workflow) jobs correctly', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const individualJob = createMockJob(
        'product_photo_upload',
        undefined, // no workflow
        undefined,
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](individualJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Individual jobs should not show notifications unless there's an error
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('handles individual job errors correctly', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock confidence error detection
      const { ErrorNotificationService } = require('../../services/ErrorNotificationService');
      ErrorNotificationService.isConfidenceError.mockReturnValueOnce(true);

      const failedIndividualJob = createMockJob(
        'product_creation',
        undefined, // no workflow
        undefined,
        { error: 'confidence below threshold' },
        'confidence below threshold'
      );

      await act(async () => {
        eventListeners['job_completed'](failedIndividualJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Individual job errors should show notifications
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId('notification-message');
      expect(messages[0]).toHaveTextContent('Photo processing completed with low confidence');
    });

    it('handles unknown workflow types gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const unknownWorkflowJob = {
        ...createMockJob('product_creation', undefined, 'workflow_unknown'),
        workflowType: 'unknown_workflow_type' as any,
      };

      await act(async () => {
        eventListeners['job_completed'](unknownWorkflowJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash and should not show notification
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('prevents duplicate notifications for the same job', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      mockWorkflowHandler.hasProcessedJob.mockReturnValueOnce(true);

      const duplicateJob = createMockJob(
        'product_photo_upload',
        'report_product_issue',
        'workflow_duplicate',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](duplicateJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not show notification for already processed job
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('handles app state changes correctly', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock app state as inactive
      const originalAppState = AppState.currentState;
      (AppState as any).currentState = 'background';

      const job = createMockJob(
        'product_photo_upload',
        'report_product_issue',
        'workflow_background',
        { success: true }
      );

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not show notification when app is in background
      expect(getByTestId('notification-count')).toHaveTextContent('0');

      // Restore app state
      (AppState as any).currentState = originalAppState;
    });
  });

  describe('Integration with Background Services', () => {
    it('properly initializes background queue service', () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      expect(mockBackgroundQueueService.initialize).toHaveBeenCalled();
      expect(mockBackgroundQueueService.on).toHaveBeenCalledWith('job_completed', expect.any(Function));
      expect(mockBackgroundQueueService.on).toHaveBeenCalledWith('job_failed', expect.any(Function));
    });

    it('handles job failed events correctly', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createMockJob(
        'product_creation',
        'report_product_issue',
        'workflow_failed',
        { error: 'processing failed' }
      );

      await act(async () => {
        eventListeners['job_failed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should handle job failures appropriately
      expect(mockWorkflowHandler.markJobAsProcessed).toHaveBeenCalledWith(failedJob.id);
    });

    it('cleans up event listeners on unmount', () => {
      const { unmount } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      unmount();

      expect(mockBackgroundQueueService.removeListener).toHaveBeenCalledWith('job_completed', expect.any(Function));
      expect(mockBackgroundQueueService.removeListener).toHaveBeenCalledWith('job_failed', expect.any(Function));
      expect(mockWorkflowHandler.cleanup).toHaveBeenCalled();
    });
  });
});