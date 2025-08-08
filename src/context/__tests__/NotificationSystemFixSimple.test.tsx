/**
 * @jest-environment jsdom
 * 
 * Simplified comprehensive tests for the notification system fix addressing:
 * 1. Duplicate notifications for report workflows
 * 2. Incorrect error messages for failed product_creation jobs
 * 3. Ensuring no regression in add_new_product workflows
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AppState, View, Text } from 'react-native';
import { jest } from '@jest/globals';

// Mock dependencies first to avoid hoisting issues
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: 'ios' },
  View: 'View',
  Text: 'Text',
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../../components/JobCompletionCard', () => 'JobCompletionCard');

jest.mock('../../services/backgroundQueueService', () => ({
  backgroundQueueService: {
    initialize: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    emit: jest.fn(),
  },
}));

jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: {
    lookupProductByBarcode: jest.fn(),
  },
}));

jest.mock('../../services/HistoryService', () => ({
  historyService: {
    addToHistory: jest.fn(),
    getHistory: jest.fn(),
    getNewItemsCount: jest.fn(),
  },
}));

jest.mock('../../services/WorkflowNotificationHandler', () => ({
  WorkflowNotificationHandler: jest.fn(() => ({
    hasProcessedJob: jest.fn(() => false),
    markJobAsProcessed: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

jest.mock('../../services/ErrorNotificationService', () => ({
  ErrorNotificationService: {
    isConfidenceError: jest.fn(() => false),
  },
}));

import { NotificationProvider, useNotifications } from '../NotificationContext.refactored';
import { BackgroundJob } from '../../types/backgroundJobs';
import { Product, VeganStatus } from '../../types';

// Test component that uses the notification context
function TestComponent() {
  const { notifications, dismissNotification, clearAllNotifications } = useNotifications();
  
  return (
    <View>
      <Text testID="notification-count">{notifications.length}</Text>
      {notifications.map((notification) => (
        <View key={notification.id} testID="notification">
          <Text testID="notification-message">{notification.message}</Text>
          <Text testID="notification-type">{notification.type}</Text>
        </View>
      ))}
    </View>
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
  let mockProductLookupService: any;
  let mockHistoryService: any;
  let mockErrorNotificationService: any;

  beforeEach(() => {
    // Get references to the mocked services
    mockBackgroundQueueService = require('../../services/backgroundQueueService').backgroundQueueService;
    mockProductLookupService = require('../../services/productLookupService').ProductLookupService;
    mockHistoryService = require('../../services/HistoryService').historyService;
    mockErrorNotificationService = require('../../services/ErrorNotificationService').ErrorNotificationService;

    jest.clearAllMocks();
    eventListeners = {};
    
    // Setup event listener mock
    mockBackgroundQueueService.on.mockImplementation((...args: any[]) => {
      const [event, callback] = args;
      eventListeners[event] = callback;
    });
    
    // Setup service mocks
    mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
      product: createMockProduct(),
    });
    
    mockHistoryService.addToHistory.mockResolvedValue(undefined);
    mockHistoryService.getHistory.mockReturnValue([]);
    mockHistoryService.getNewItemsCount.mockReturnValue(0);
    
    mockErrorNotificationService.isConfidenceError.mockReturnValue(false);
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
  });

  describe('Error Message Generation for Different Workflows', () => {
    beforeEach(() => {
      // Mock confidence error detection
      mockErrorNotificationService.isConfidenceError.mockImplementation((message: string) => {
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
      mockErrorNotificationService.isConfidenceError.mockReturnValueOnce(true);

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

    it('handles service errors gracefully', async () => {
      const { getByTestId } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock ProductLookupService to throw an error
      mockProductLookupService.lookupProductByBarcode.mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const job = createMockJob('product_creation', 'add_new_product', 'workflow_123');

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
  });
});