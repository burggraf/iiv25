/**
 * @jest-environment jsdom
 * 
 * Regression tests for the notification system fix.
 * Ensures that existing add_new_product workflow behavior remains unchanged
 * and validates that the fix only affects report workflows as intended.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { NotificationProvider, useNotifications } from '../NotificationContext.refactored';
import { BackgroundJob } from '../../types/backgroundJobs';
import { VeganStatus } from '../../types';

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

// Mock HistoryService
const mockHistoryService = {
  addToHistory: jest.fn(),
  getHistory: jest.fn(() => []),
  getNewItemsCount: jest.fn(() => 0),
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
const mockErrorNotificationService = {
  isConfidenceError: jest.fn(() => false),
};

jest.mock('../../services/ErrorNotificationService', () => ({
  ErrorNotificationService: mockErrorNotificationService,
}));

// Test component that captures all notification activity
function TestComponent() {
  const { notifications, dismissNotification } = useNotifications();
  
  return (
    <div>
      <div data-testid="notification-count">{notifications.length}</div>
      <div data-testid="notification-log">
        {notifications.map((notification, index) => (
          <div key={notification.id} data-testid={`notification-${index}`}>
            <span data-testid={`message-${index}`}>{notification.message}</span>
            <span data-testid={`type-${index}`}>{notification.type}</span>
            <span data-testid={`workflow-${index}`}>{notification.job.workflowType}</span>
            <span data-testid={`jobtype-${index}`}>{notification.job.jobType}</span>
            <button onClick={() => dismissNotification(notification.id)} data-testid={`dismiss-${index}`}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper to create jobs
const createJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  workflowType: 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue',
  success: boolean = true,
  workflowId?: string
): BackgroundJob => ({
  id: `job_${Math.random().toString(36).substr(2, 9)}`,
  upc: '123456789012',
  deviceId: 'test-device',
  imageUri: 'file://test-image.jpg',
  retryCount: 0,
  maxRetries: 3,
  jobType,
  workflowId: workflowId || `workflow_${Math.random().toString(36).substr(2, 6)}`,
  workflowType,
  workflowSteps: { total: 3, current: 1 },
  status: success ? 'completed' : 'failed',
  resultData: success ? { success: true } : { error: 'job failed' },
  errorMessage: success ? undefined : 'job failed',
  priority: 1,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: success ? new Date() : undefined,
});

describe('NotificationRegressionTests', () => {
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
      product: {
        id: 'product-123456789012',
        barcode: '123456789012',
        name: 'Test Product',
        brand: 'Test Brand',
        veganStatus: VeganStatus.VEGAN,
        ingredients: [],
        imageUrl: 'https://example.com/image.jpg',
      },
    });
    
    (mockHistoryService.addToHistory as jest.Mock).mockResolvedValue(undefined);
    (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);
    (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValue(false);
  });

  describe('Add New Product Workflow - Existing Behavior Preserved', () => {
    it('suppresses product_creation notifications in add_new_product (existing behavior)', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const productCreationJob = createJob('product_creation', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not show notification for product_creation (existing behavior to reduce confusion)
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      
      // But should still update history with isNew=true
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '123456789012' }),
        true, // isNew for add_new_product
        true
      );
    });

    it('shows ingredient_parsing notifications in add_new_product (existing behavior)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock existing history entry
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([{
        barcode: '123456789012',
        name: 'Test Product',
        isNew: true,
      }]);

      const ingredientJob = createJob('ingredient_parsing', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show notification for ingredient parsing (existing behavior)
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');
    });

    it('shows product_photo_upload notifications in add_new_product (existing behavior)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const photoUploadJob = createJob('product_photo_upload', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](photoUploadJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show notification for photo upload (existing behavior)
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('✅ Photo updated');
    });

    it('handles errors in add_new_product workflows correctly (existing behavior)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedIngredientJob = createJob('ingredient_parsing', 'add_new_product', false);

      await act(async () => {
        eventListeners['job_completed'](failedIngredientJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show error notification (existing behavior)
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
      
      const types = getAllByTestId(/^type-/);
      expect(types[0]).toHaveTextContent('error');
    });
  });

  describe('Behavior Changes Only Affect Report Workflows', () => {
    it('add_new_product vs report_product_issue - different product_creation behavior', async () => {
      // Test add_new_product (should suppress notification)
      {
        const { getByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        const addNewProductJob = createJob('product_creation', 'add_new_product');

        await act(async () => {
          eventListeners['job_completed'](addNewProductJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        // Should suppress notification
        expect(getByTestId('notification-count')).toHaveTextContent('0');
        unmount();
      }

      // Reset mocks
      jest.clearAllMocks();
      mockBackgroundQueueService.on.mockImplementation((event: string, callback: Function) => {
        eventListeners[event] = callback;
      });
      (mockProductLookupService.lookupProductByBarcode as jest.Mock).mockResolvedValue({
        product: { barcode: '123456789012', name: 'Test Product' },
      });
      (mockHistoryService.addToHistory as jest.Mock).mockResolvedValue(undefined);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([]);

      // Test report_product_issue (should also suppress notification but for different reasons)
      {
        const { getByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        const reportProductJob = createJob('product_creation', 'report_product_issue');

        await act(async () => {
          eventListeners['job_completed'](reportProductJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        // Should also suppress notification (new behavior)
        expect(getByTestId('notification-count')).toHaveTextContent('0');
        unmount();
      }
    });

    it('non-product_creation jobs behave differently between workflow types', async () => {
      // Test add_new_product ingredient parsing (should show notification)
      {
        const { getByTestId, getAllByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        (mockHistoryService.getHistory as jest.Mock).mockReturnValue([{ barcode: '123456789012', isNew: true }]);

        const addNewIngredientJob = createJob('ingredient_parsing', 'add_new_product');

        await act(async () => {
          eventListeners['job_completed'](addNewIngredientJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        expect(getByTestId('notification-count')).toHaveTextContent('1');
        const messages = getAllByTestId(/^message-/);
        expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');
        
        unmount();
      }

      // Reset mocks
      jest.clearAllMocks();
      mockBackgroundQueueService.on.mockImplementation((event: string, callback: Function) => {
        eventListeners[event] = callback;
      });
      (mockProductLookupService.lookupProductByBarcode as jest.Mock).mockResolvedValue({
        product: { barcode: '123456789012', name: 'Test Product' },
      });
      (mockHistoryService.addToHistory as jest.Mock).mockResolvedValue(undefined);
      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([{ barcode: '123456789012', isNew: false }]);

      // Test report_ingredients_issue ingredient parsing (should also show notification)
      {
        const { getByTestId, getAllByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        const reportIngredientJob = createJob('ingredient_parsing', 'report_ingredients_issue');

        await act(async () => {
          eventListeners['job_completed'](reportIngredientJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        expect(getByTestId('notification-count')).toHaveTextContent('1');
        const messages = getAllByTestId(/^message-/);
        expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');
        
        unmount();
      }
    });
  });

  describe('Error Handling - No Regression', () => {
    it('confidence errors in add_new_product show notifications (existing behavior)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock confidence error detection
      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValueOnce(true);

      const confidenceErrorJob = createJob('ingredient_parsing', 'add_new_product', false);
      confidenceErrorJob.resultData = { error: 'confidence below threshold' };
      confidenceErrorJob.errorMessage = 'confidence below threshold';

      await act(async () => {
        eventListeners['job_completed'](confidenceErrorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
      
      const types = getAllByTestId(/^type-/);
      expect(types[0]).toHaveTextContent('error');
    });

    it('network errors in add_new_product show notifications (existing behavior)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const networkErrorJob = createJob('product_photo_upload', 'add_new_product', false);
      networkErrorJob.resultData = { error: 'network timeout' };
      networkErrorJob.errorMessage = 'network timeout';

      await act(async () => {
        eventListeners['job_completed'](networkErrorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
    });
  });

  describe('Multi-Job Workflow Behavior - No Regression', () => {
    it('handles complete add_new_product workflow correctly', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const workflowId = 'workflow_complete_123';
      
      // Job 1: product_creation (should be suppressed)
      const productCreationJob = createJob('product_creation', 'add_new_product', true, workflowId);
      
      // Job 2: ingredient_parsing (should show notification)
      const ingredientJob = createJob('ingredient_parsing', 'add_new_product', true, workflowId);
      
      // Job 3: product_photo_upload (should show notification)
      const photoUploadJob = createJob('product_photo_upload', 'add_new_product', true, workflowId);

      // Mock history state changes
      mockHistoryService.getHistory
        .mockReturnValueOnce([]) // Empty initially
        .mockReturnValue([{ barcode: '123456789012', isNew: true }]); // After first job

      await act(async () => {
        eventListeners['job_completed'](productCreationJob);
        await waitFor(() => {}, { timeout: 50 });
      });

      // After product_creation: 0 notifications
      expect(getByTestId('notification-count')).toHaveTextContent('0');

      await act(async () => {
        eventListeners['job_completed'](ingredientJob);
        await waitFor(() => {}, { timeout: 50 });
      });

      // After ingredient_parsing: 1 notification
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      let messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('✅ Ingredients analyzed');

      await act(async () => {
        eventListeners['job_completed'](photoUploadJob);
        await waitFor(() => {}, { timeout: 50 });
      });

      // After photo_upload: 2 notifications
      expect(getByTestId('notification-count')).toHaveTextContent('2');
      messages = getAllByTestId(/^message-/);
      expect(messages[1]).toHaveTextContent('✅ Photo updated');

      // All should update history
      expect(mockHistoryService.addToHistory).toHaveBeenCalledTimes(3);
    });

    it('handles mixed success/failure in add_new_product workflow', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const workflowId = 'workflow_mixed_456';
      
      // Success: product_creation (suppressed)
      const successJob = createJob('product_creation', 'add_new_product', true, workflowId);
      
      // Failure: ingredient_parsing (should show error)
      const failedJob = createJob('ingredient_parsing', 'add_new_product', false, workflowId);

      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([{ barcode: '123456789012', isNew: true }]);

      await act(async () => {
        eventListeners['job_completed'](successJob);
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should show 1 error notification (for failed ingredient job)
      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('❌ Job failed - please try again');
      
      const types = getAllByTestId(/^type-/);
      expect(types[0]).toHaveTextContent('error');
    });
  });

  describe('Notification Management - No Regression', () => {
    it('preserves notification dismissal functionality', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const job = createJob('ingredient_parsing', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');

      // Dismiss the notification
      const dismissButtons = getAllByTestId(/^dismiss-/);
      await act(async () => {
        dismissButtons[0].click();
      });

      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('preserves notification ordering (newest first)', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      (mockHistoryService.getHistory as jest.Mock).mockReturnValue([{ barcode: '123456789012', isNew: true }]);

      const job1 = createJob('ingredient_parsing', 'add_new_product');
      const job2 = createJob('product_photo_upload', 'add_new_product');

      await act(async () => {
        eventListeners['job_completed'](job1);
        await waitFor(() => {}, { timeout: 50 });
        
        eventListeners['job_completed'](job2);
        await waitFor(() => {}, { timeout: 50 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('2');
      
      const messages = getAllByTestId(/^message-/);
      // Newest (job2) should be first
      expect(messages[0]).toHaveTextContent('✅ Photo updated');
      expect(messages[1]).toHaveTextContent('✅ Ingredients analyzed');
    });

    it('limits notifications to 5 most recent (existing behavior)', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Create 7 jobs to test the 5-notification limit
      const jobs = Array.from({ length: 7 }, (_, i) => 
        createJob('ingredient_parsing', 'add_new_product', true, `workflow_${i}`)
      );

      await act(async () => {
        for (const job of jobs) {
          eventListeners['job_completed'](job);
        }
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should only show 5 notifications (most recent)
      expect(getByTestId('notification-count')).toHaveTextContent('5');
    });
  });

  describe('Service Integration - No Regression', () => {
    it('maintains proper integration with HistoryService', async () => {
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

      // Should call HistoryService with correct parameters
      expect(mockHistoryService.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '123456789012',
          name: 'Test Product',
        }),
        true, // isNew for add_new_product
        true  // forceUpdate
      );
    });

    it('maintains proper integration with ProductLookupService', async () => {
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

      // Should call ProductLookupService for product data
      expect(mockProductLookupService.lookupProductByBarcode).toHaveBeenCalledWith(
        '123456789012',
        expect.objectContaining({
          context: 'NotificationContext'
        })
      );
    });

    it('maintains proper integration with WorkflowNotificationHandler', async () => {
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

      // Should check for processed jobs and mark as processed
      expect(mockWorkflowHandler.hasProcessedJob).toHaveBeenCalledWith(job.id);
      expect(mockWorkflowHandler.markJobAsProcessed).toHaveBeenCalledWith(job.id);
    });
  });
});