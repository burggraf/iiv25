/**
 * @jest-environment jsdom
 * 
 * Edge case tests for the notification system fix.
 * Tests individual jobs, unknown workflow types, error conditions,
 * and other edge cases to ensure robust error handling.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
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

// Test component
function TestComponent() {
  const { notifications, clearAllNotifications } = useNotifications();
  
  return (
    <div>
      <div data-testid="notification-count">{notifications.length}</div>
      <button onClick={clearAllNotifications} data-testid="clear-all">Clear All</button>
      {notifications.map((notification, index) => (
        <div key={notification.id} data-testid={`notification-${index}`}>
          <span data-testid={`message-${index}`}>{notification.message}</span>
          <span data-testid={`type-${index}`}>{notification.type}</span>
          <span data-testid={`workflow-${index}`}>{notification.job.workflowType || 'individual'}</span>
          <span data-testid={`jobtype-${index}`}>{notification.job.jobType}</span>
          <span data-testid={`job-id-${index}`}>{notification.job.id}</span>
        </div>
      ))}
    </div>
  );
}

// Helper to create individual jobs (no workflow)
const createIndividualJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  success: boolean = true,
  errorType: 'confidence' | 'network' | 'generic' = 'generic'
): BackgroundJob => {
  let resultData: any = success ? { success: true } : {};
  let errorMessage = '';

  if (!success) {
    switch (errorType) {
      case 'confidence':
        resultData = { error: 'confidence below threshold - photo quality too low' };
        errorMessage = 'confidence below threshold - photo quality too low';
        break;
      case 'network':
        resultData = { error: 'network timeout' };
        errorMessage = 'network timeout';
        break;
      case 'generic':
        resultData = { error: 'processing failed' };
        errorMessage = 'processing failed';
        break;
    }
  }

  return {
    id: `individual_${Math.random().toString(36).substr(2, 9)}`,
    upc: '123456789012',
    deviceId: 'test-device',
    imageUri: 'file://test-image.jpg',
    retryCount: 0,
    maxRetries: 3,
    jobType,
    workflowId: undefined,
    workflowType: undefined,
    workflowSteps: undefined,
    status: success ? 'completed' : 'failed',
    resultData,
    errorMessage,
    priority: 1,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: success ? new Date() : undefined,
  };
};

// Helper to create job with unknown workflow type
const createUnknownWorkflowJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing'
): BackgroundJob => ({
  id: `unknown_${Math.random().toString(36).substr(2, 9)}`,
  upc: '123456789012',
  deviceId: 'test-device',
  imageUri: 'file://test-image.jpg',
  retryCount: 0,
  maxRetries: 3,
  jobType,
  workflowId: 'workflow_unknown_123',
  workflowType: 'unknown_workflow' as any,
  workflowSteps: { total: 1, current: 1 },
  status: 'completed',
  resultData: { success: true },
  priority: 1,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
});

describe('NotificationEdgeCases', () => {
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

  describe('Individual Job Handling', () => {
    it('does not show notifications for successful individual jobs', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successfulJobs = [
        createIndividualJob('product_creation'),
        createIndividualJob('product_photo_upload'),
        createIndividualJob('ingredient_parsing'),
      ];

      for (const job of successfulJobs) {
        await act(async () => {
          eventListeners['job_completed'](job);
          await waitFor(() => {}, { timeout: 100 });
        });
      }

      // Individual successful jobs should not show notifications
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('shows notifications for individual jobs with confidence errors', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValueOnce(true);

      const confidenceErrorJob = createIndividualJob('product_creation', false, 'confidence');

      await act(async () => {
        eventListeners['job_completed'](confidenceErrorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent(
        'Photo processing completed with low confidence. Please consider retaking the photo.'
      );
      
      const types = getAllByTestId(/^type-/);
      expect(types[0]).toHaveTextContent('error');
      
      const workflows = getAllByTestId(/^workflow-/);
      expect(workflows[0]).toHaveTextContent('individual');
    });

    it('does not update history for individual jobs', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const individualJob = createIndividualJob('product_creation');

      await act(async () => {
        eventListeners['job_completed'](individualJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Individual jobs should not update history
      expect(mockHistoryService.addToHistory).not.toHaveBeenCalled();
    });

    it('shows different messages for different individual job types with errors', async () => {
      const testCases = [
        { type: 'product_photo_upload' as const, expected: 'Product photo updated successfully!' },
        { type: 'ingredient_parsing' as const, expected: 'Ingredients processed successfully!' },
        { type: 'product_creation' as const, expected: 'Product created successfully!' },
      ];

      for (const testCase of testCases) {
        const { getByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        // Mock non-confidence error to test success message path
        (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValueOnce(false);

        const individualJob = createIndividualJob(testCase.type, false, 'generic');

        await act(async () => {
          eventListeners['job_completed'](individualJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        // Individual jobs with non-confidence errors don't show notifications
        expect(getByTestId('notification-count')).toHaveTextContent('0');

        unmount();
      }
    });
  });

  describe('Unknown Workflow Types', () => {
    it('handles unknown workflow types gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const unknownWorkflowJob = createUnknownWorkflowJob('product_creation');

      await act(async () => {
        eventListeners['job_completed'](unknownWorkflowJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash and should not show notifications
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      
      // Should log the unknown workflow type
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown workflow type: unknown_workflow')
      );

      consoleSpy.mockRestore();
    });

    it('does not update history for unknown workflow types', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const unknownWorkflowJob = createUnknownWorkflowJob('product_creation');

      await act(async () => {
        eventListeners['job_completed'](unknownWorkflowJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not update history for unknown workflows
      expect(mockHistoryService.addToHistory).not.toHaveBeenCalled();
    });
  });

  describe('Malformed Job Data', () => {
    it('handles job with missing UPC gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithoutUPC = {
        ...createIndividualJob('product_creation'),
        upc: undefined as any,
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithoutUPC);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('handles job with null resultData', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithNullData = {
        ...createIndividualJob('product_creation'),
        resultData: null,
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithNullData);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('handles job with missing workflowSteps for workflow job', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const malformedWorkflowJob = {
        ...createIndividualJob('product_creation'),
        workflowId: 'workflow_123',
        workflowType: 'add_new_product' as const,
        workflowSteps: undefined,
      };

      await act(async () => {
        eventListeners['job_completed'](malformedWorkflowJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });
  });

  describe('Service Integration Failures', () => {
    it('handles ProductLookupService errors gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock ProductLookupService to throw an error
      (mockProductLookupService.lookupProductByBarcode as jest.Mock).mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const job = createIndividualJob('product_creation');
      job.workflowId = 'workflow_123';
      job.workflowType = 'add_new_product';
      job.workflowSteps = { total: 1, current: 1 };

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash and should log error
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error getting product'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('handles HistoryService errors gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock HistoryService to throw an error
      (mockHistoryService.addToHistory as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const job = createIndividualJob('product_creation');
      job.workflowId = 'workflow_123';
      job.workflowType = 'add_new_product';
      job.workflowSteps = { total: 1, current: 1 };

      await act(async () => {
        eventListeners['job_completed'](job);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash and should log error
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating history'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Duplicate Job Prevention', () => {
    it('prevents duplicate processing of same job ID', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock already processed job
      mockWorkflowHandler.hasProcessedJob.mockReturnValueOnce(true);

      const duplicateJob = createIndividualJob('product_photo_upload');
      duplicateJob.workflowId = 'workflow_123';
      duplicateJob.workflowType = 'add_new_product';
      duplicateJob.workflowSteps = { total: 1, current: 1 };

      await act(async () => {
        eventListeners['job_completed'](duplicateJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not show notification for already processed job
      expect(getByTestId('notification-count')).toHaveTextContent('0');
      
      // Should not mark as processed again
      expect(mockWorkflowHandler.markJobAsProcessed).not.toHaveBeenCalled();
      
      // Should not update history
      expect(mockHistoryService.addToHistory).not.toHaveBeenCalled();
    });

    it('prevents duplicate notifications for same notification ID', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValue(true);

      const errorJob = createIndividualJob('product_creation', false, 'confidence');
      
      // Submit the same job twice rapidly
      await act(async () => {
        eventListeners['job_completed'](errorJob);
        eventListeners['job_completed'](errorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should only show one notification despite duplicate events
      expect(getByTestId('notification-count')).toHaveTextContent('1');
    });
  });

  describe('App State Handling', () => {
    it('handles app state changes correctly', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Mock app state as background
      const originalAppState = AppState.currentState;
      (AppState as any).currentState = 'background';

      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValueOnce(true);

      const errorJob = createIndividualJob('product_creation', false, 'confidence');

      await act(async () => {
        eventListeners['job_completed'](errorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not show notification when app is in background
      expect(getByTestId('notification-count')).toHaveTextContent('0');

      // Restore app state
      (AppState as any).currentState = originalAppState;
    });
  });

  describe('Notification Management', () => {
    it('clears all notifications correctly', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Create multiple notifications
      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValue(true);

      const errorJobs = [
        createIndividualJob('product_creation', false, 'confidence'),
        createIndividualJob('ingredient_parsing', false, 'confidence'),
      ];

      for (const job of errorJobs) {
        await act(async () => {
          eventListeners['job_completed'](job);
          await waitFor(() => {}, { timeout: 50 });
        });
      }

      expect(getByTestId('notification-count')).toHaveTextContent('2');

      // Clear all notifications
      await act(async () => {
        getByTestId('clear-all').click();
      });

      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('handles notification overflow (more than 5 notifications)', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      (mockErrorNotificationService.isConfidenceError as jest.Mock).mockReturnValue(true);

      // Create 7 notifications to test the 5-notification limit
      const errorJobs = Array.from({ length: 7 }, (_, i) => {
        const job = createIndividualJob('product_creation', false, 'confidence');
        job.id = `test_job_${i}`;
        return job;
      });

      for (const job of errorJobs) {
        await act(async () => {
          eventListeners['job_completed'](job);
          await waitFor(() => {}, { timeout: 10 });
        });
      }

      // Should only show 5 notifications (most recent)
      expect(getByTestId('notification-count')).toHaveTextContent('5');
    });
  });

  describe('Error Message Edge Cases', () => {
    it('handles empty error message strings', async () => {
      const { getByTestId, getAllByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithEmptyError = {
        ...createIndividualJob('product_creation', false),
        resultData: { error: '' },
        errorMessage: '',
      };
      jobWithEmptyError.workflowId = 'workflow_123';
      jobWithEmptyError.workflowType = 'report_product_issue';
      jobWithEmptyError.workflowSteps = { total: 1, current: 1 };

      await act(async () => {
        eventListeners['job_completed'](jobWithEmptyError);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      const messages = getAllByTestId(/^message-/);
      // Should still show the appropriate error message
      expect(messages[0]).toHaveTextContent('❌ Invalid product photo - please try again');
    });

    it('handles job with undefined jobType', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithUndefinedType = {
        ...createIndividualJob('product_creation'),
        jobType: undefined as any,
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithUndefinedType);
        await waitFor(() => {}, { timeout: 100 });
      });

      // Should not crash
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });
  });

  describe('Component Lifecycle', () => {
    it('cleans up properly on unmount', () => {
      const { unmount } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      unmount();

      // Should clean up event listeners
      expect(mockBackgroundQueueService.removeListener).toHaveBeenCalledWith(
        'job_completed',
        expect.any(Function)
      );
      expect(mockBackgroundQueueService.removeListener).toHaveBeenCalledWith(
        'job_failed',
        expect.any(Function)
      );
      
      // Should clean up workflow handler
      expect(mockWorkflowHandler.cleanup).toHaveBeenCalled();
    });

    it('initializes background queue service on mount', () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      expect(mockBackgroundQueueService.initialize).toHaveBeenCalled();
      expect(mockBackgroundQueueService.on).toHaveBeenCalledWith(
        'job_completed',
        expect.any(Function)
      );
      expect(mockBackgroundQueueService.on).toHaveBeenCalledWith(
        'job_failed',
        expect.any(Function)
      );
    });
  });
});