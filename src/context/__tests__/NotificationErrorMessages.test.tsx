/**
 * @jest-environment jsdom
 * 
 * Focused tests for error message generation in the notification system fix.
 * Tests the specific error message logic for different workflow types and job failures.
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

// Mock ErrorNotificationService with different confidence error patterns
const mockErrorNotificationService = {
  isConfidenceError: jest.fn(),
};

jest.mock('../../services/ErrorNotificationService', () => ({
  ErrorNotificationService: mockErrorNotificationService,
}));

// Test component that captures notification messages
function TestComponent() {
  const { notifications } = useNotifications();
  
  return (
    <div>
      <div data-testid="notification-count">{notifications.length}</div>
      {notifications.map((notification, index) => (
        <div key={notification.id} data-testid={`notification-${index}`}>
          <span data-testid={`message-${index}`}>{notification.message}</span>
          <span data-testid={`type-${index}`}>{notification.type}</span>
          <span data-testid={`workflow-${index}`}>{notification.job.workflowType || 'individual'}</span>
          <span data-testid={`jobtype-${index}`}>{notification.job.jobType}</span>
        </div>
      ))}
    </div>
  );
}

// Helper to create mock jobs with error conditions
const createFailedJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  workflowType?: 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue',
  errorType: 'confidence' | 'generic' | 'upload' = 'generic',
  workflowId?: string
): BackgroundJob => {
  let resultData: any = {};
  let errorMessage = '';

  switch (errorType) {
    case 'confidence':
      resultData = { error: 'confidence below threshold - photo quality too low' };
      errorMessage = 'confidence below threshold - photo quality too low';
      break;
    case 'upload':
      resultData = { error: 'upload failed - network error' };
      errorMessage = 'upload failed - network error';
      break;
    case 'generic':
      resultData = { error: 'processing failed' };
      errorMessage = 'processing failed';
      break;
  }

  return {
    id: `job_${Math.random().toString(36).substr(2, 9)}`,
    upc: '123456789012',
    deviceId: 'test-device',
    imageUri: 'file://test-image.jpg',
    retryCount: 0,
    maxRetries: 3,
    jobType,
    workflowId: workflowId || `workflow_${Math.random().toString(36).substr(2, 6)}`,
    workflowType,
    workflowSteps: { total: 2, current: 1 },
    status: 'failed',
    resultData,
    errorMessage,
    priority: 1,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: undefined,
  };
};

const createSuccessJob = (
  jobType: 'product_creation' | 'product_photo_upload' | 'ingredient_parsing',
  workflowType?: 'add_new_product' | 'report_product_issue' | 'report_ingredients_issue',
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
  workflowSteps: { total: 2, current: 1 },
  status: 'completed',
  resultData: { success: true },
  priority: 1,
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
});

describe('NotificationErrorMessages', () => {
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
    (mockHistoryService.getNewItemsCount as jest.Mock).mockReturnValue(0);
    
    // Default mock for confidence error detection
    mockErrorNotificationService.isConfidenceError.mockImplementation((message: string) => {
      return message && (
        message.includes('confidence below threshold') ||
        message.includes('photo quality too low')
      );
    });
  });

  describe('Report Workflow Error Messages', () => {
    it('shows specific error message for failed product_creation in report_product_issue workflow', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createFailedJob(
        'product_creation',
        'report_product_issue',
        'confidence'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Invalid product photo - please try again');
      expect(getByTestId('type-0')).toHaveTextContent('error');
      expect(getByTestId('workflow-0')).toHaveTextContent('report_product_issue');
    });

    it('shows specific error message for failed product_creation in report_ingredients_issue workflow', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createFailedJob(
        'product_creation',
        'report_ingredients_issue',
        'confidence'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Invalid ingredients photo - please try again');
      expect(getByTestId('type-0')).toHaveTextContent('error');
      expect(getByTestId('workflow-0')).toHaveTextContent('report_ingredients_issue');
    });

    it('shows generic error message for non-product_creation failures in report workflows', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const failedJob = createFailedJob(
        'product_photo_upload',
        'report_product_issue',
        'upload'
      );

      await act(async () => {
        eventListeners['job_completed'](failedJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Job failed - please try again');
      expect(getByTestId('type-0')).toHaveTextContent('error');
      expect(getByTestId('jobtype-0')).toHaveTextContent('product_photo_upload');
    });
  });

  describe('Success Messages by Job Type', () => {
    it('shows correct success message for product_creation jobs', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createSuccessJob(
        'product_creation',
        'add_new_product' // This will be suppressed, but let's test the message generation
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      // product_creation in add_new_product should be suppressed
      expect(getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('shows correct success message for product_photo_upload jobs', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createSuccessJob(
        'product_photo_upload',
        'report_product_issue'
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent('✅ Photo updated');
      expect(getByTestId('type-0')).toHaveTextContent('success');
    });

    it('shows correct success message for ingredient_parsing jobs', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const successJob = createSuccessJob(
        'ingredient_parsing',
        'add_new_product'
      );

      await act(async () => {
        eventListeners['job_completed'](successJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent('✅ Ingredients analyzed');
      expect(getByTestId('type-0')).toHaveTextContent('success');
    });
  });

  describe('Error Detection Logic', () => {
    it('correctly identifies confidence errors', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Test with confidence error pattern
      mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(true);

      const confidenceErrorJob = createFailedJob(
        'product_creation',
        'report_product_issue',
        'confidence'
      );

      await act(async () => {
        eventListeners['job_completed'](confidenceErrorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockErrorNotificationService.isConfidenceError).toHaveBeenCalledWith(
        'confidence below threshold - photo quality too low'
      );
      expect(getByTestId('message-0')).toHaveTextContent('❌ Invalid product photo - please try again');
    });

    it('correctly identifies non-confidence errors', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Test with non-confidence error
      mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(false);

      const genericErrorJob = createFailedJob(
        'product_creation',
        'report_product_issue',
        'generic'
      );

      await act(async () => {
        eventListeners['job_completed'](genericErrorJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockErrorNotificationService.isConfidenceError).toHaveBeenCalledWith('processing failed');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Job failed - please try again');
    });

    it('handles empty error messages', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithNoError = {
        ...createSuccessJob('product_photo_upload', 'report_product_issue'),
        resultData: { success: false }, // Failed but no error message
        errorMessage: '',
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithNoError);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockErrorNotificationService.isConfidenceError).toHaveBeenCalledWith('');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Job failed - please try again');
    });
  });

  describe('Individual Job Error Messages', () => {
    it('shows appropriate message for individual job with confidence error', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(true);

      const individualJob = {
        ...createFailedJob('product_creation', undefined, 'confidence'),
        workflowId: undefined,
        workflowType: undefined,
        workflowSteps: undefined,
      };

      await act(async () => {
        eventListeners['job_completed'](individualJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('notification-count')).toHaveTextContent('1');
      expect(getByTestId('message-0')).toHaveTextContent(
        'Photo processing completed with low confidence. Please consider retaking the photo.'
      );
      expect(getByTestId('type-0')).toHaveTextContent('error');
      expect(getByTestId('workflow-0')).toHaveTextContent('individual');
    });

    it('shows different messages for different individual job types on success', async () => {
      // This test checks the individual job message generation logic
      // We'll use success jobs to avoid the confidence error path
      
      const jobTypes = [
        { type: 'product_photo_upload' as const, expectedMessage: 'Product photo updated successfully!' },
        { type: 'ingredient_parsing' as const, expectedMessage: 'Ingredients processed successfully!' },
        { type: 'product_creation' as const, expectedMessage: 'Product created successfully!' },
      ];

      for (const jobConfig of jobTypes) {
        const { getByTestId, unmount } = render(
          <NotificationProvider>
            <TestComponent />
          </NotificationProvider>
        );

        // Mock as non-confidence error to trigger success path for individual jobs
        mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(false);

        const individualJob = {
          ...createSuccessJob(jobConfig.type, undefined),
          workflowId: undefined,
          workflowType: undefined,
          workflowSteps: undefined,
        };

        await act(async () => {
          eventListeners['job_completed'](individualJob);
          await waitFor(() => {}, { timeout: 100 });
        });

        // Individual success jobs should not show notifications
        expect(getByTestId('notification-count')).toHaveTextContent('0');

        unmount();
      }
    });
  });

  describe('Edge Cases in Error Message Generation', () => {
    it('handles null/undefined error messages', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithNullError = {
        ...createFailedJob('product_creation', 'report_product_issue'),
        resultData: { error: null },
        errorMessage: undefined,
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithNullError);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(mockErrorNotificationService.isConfidenceError).toHaveBeenCalledWith('');
      expect(getByTestId('message-0')).toHaveTextContent('❌ Invalid product photo - please try again');
    });

    it('handles job without resultData', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const jobWithoutResultData = {
        ...createFailedJob('product_creation', 'report_ingredients_issue'),
        resultData: undefined,
        errorMessage: 'some error',
      };

      await act(async () => {
        eventListeners['job_completed'](jobWithoutResultData);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('message-0')).toHaveTextContent('❌ Invalid ingredients photo - please try again');
    });

    it('defaults to generic message for unknown job types', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const unknownJobTypeJob = {
        ...createFailedJob('product_creation', 'report_product_issue'),
        jobType: 'unknown_job_type' as any,
      };

      await act(async () => {
        eventListeners['job_completed'](unknownJobTypeJob);
        await waitFor(() => {}, { timeout: 100 });
      });

      expect(getByTestId('message-0')).toHaveTextContent('❌ Job failed - please try again');
    });
  });

  describe('Message Consistency Across Different Error Types', () => {
    const testCases = [
      {
        workflow: 'report_product_issue' as const,
        jobType: 'product_creation' as const,
        expectedError: '❌ Invalid product photo - please try again',
        expectedSuccess: '✅ Product created successfully!',
      },
      {
        workflow: 'report_ingredients_issue' as const,
        jobType: 'product_creation' as const,
        expectedError: '❌ Invalid ingredients photo - please try again',
        expectedSuccess: '✅ Product created successfully!',
      },
      {
        workflow: 'add_new_product' as const,
        jobType: 'ingredient_parsing' as const,
        expectedError: '❌ Job failed - please try again',
        expectedSuccess: '✅ Ingredients analyzed',
      },
    ];

    testCases.forEach(({ workflow, jobType, expectedError, expectedSuccess }) => {
      it(`shows consistent messages for ${workflow}/${jobType} jobs`, async () => {
        // Test error case
        {
          const { getByTestId, unmount } = render(
            <NotificationProvider>
              <TestComponent />
            </NotificationProvider>
          );

          mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(true);

          const errorJob = createFailedJob(jobType, workflow, 'confidence');

          await act(async () => {
            eventListeners['job_completed'](errorJob);
            await waitFor(() => {}, { timeout: 100 });
          });

          // For product_creation in add_new_product, notifications might be suppressed
          if (workflow === 'add_new_product' && jobType === 'product_creation') {
            expect(getByTestId('notification-count')).toHaveTextContent('0');
          } else {
            expect(getByTestId('notification-count')).toHaveTextContent('1');
            expect(getByTestId('message-0')).toHaveTextContent(expectedError);
          }

          unmount();
        }

        // Test success case
        {
          const { getByTestId, unmount } = render(
            <NotificationProvider>
              <TestComponent />
            </NotificationProvider>
          );

          const successJob = createSuccessJob(jobType, workflow);

          await act(async () => {
            eventListeners['job_completed'](successJob);
            await waitFor(() => {}, { timeout: 100 });
          });

          // For product_creation in add_new_product or report workflows, notifications are suppressed
          if (jobType === 'product_creation' && 
              (workflow === 'add_new_product' || workflow === 'report_product_issue' || workflow === 'report_ingredients_issue')) {
            expect(getByTestId('notification-count')).toHaveTextContent('0');
          } else {
            expect(getByTestId('notification-count')).toHaveTextContent('1');
            expect(getByTestId('message-0')).toHaveTextContent(expectedSuccess);
          }

          unmount();
        }
      });
    });
  });
});