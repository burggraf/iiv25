/**
 * @jest-environment jsdom
 * 
 * Direct test of the notification suppression logic
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import { jest } from '@jest/globals';

// Mock all dependencies
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

const mockBackgroundQueueService = {
  initialize: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
};

const mockProductLookupService = {
  lookupProductByBarcode: jest.fn(),
};

const mockHistoryService = {
  addToHistory: jest.fn(),
  getHistory: jest.fn(),
  getNewItemsCount: jest.fn(),
};

const mockWorkflowHandler = {
  hasProcessedJob: jest.fn(() => false),
  markJobAsProcessed: jest.fn(),
  cleanup: jest.fn(),
};

const mockErrorNotificationService = {
  isConfidenceError: jest.fn(() => false),
};

jest.mock('../../services/backgroundQueueService', () => ({
  backgroundQueueService: mockBackgroundQueueService,
}));

jest.mock('../../services/productLookupService', () => ({
  ProductLookupService: mockProductLookupService,
}));

jest.mock('../../services/HistoryService', () => ({
  historyService: mockHistoryService,
}));

jest.mock('../../services/WorkflowNotificationHandler', () => ({
  WorkflowNotificationHandler: jest.fn(() => mockWorkflowHandler),
}));

jest.mock('../../services/ErrorNotificationService', () => ({
  ErrorNotificationService: mockErrorNotificationService,
}));

import { NotificationProvider, useNotifications } from '../NotificationContext.refactored';
import { BackgroundJob } from '../../types/backgroundJobs';
import { VeganStatus } from '../../types';

// Test component
function TestComponent() {
  const { notifications } = useNotifications();
  return (
    <View>
      <Text testID="notification-count">{notifications.length}</Text>
      <Text testID="notifications-debug">
        {JSON.stringify(notifications.map(n => ({ message: n.message, type: n.type })))}
      </Text>
    </View>
  );
}

describe('NotificationSuppressionTest', () => {
  let eventHandler: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Capture the event handler
    mockBackgroundQueueService.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'job_completed') {
        eventHandler = handler;
      }
    });
    
    // Setup mocks
    mockProductLookupService.lookupProductByBarcode.mockResolvedValue({
      product: {
        id: 'product-123456789012',
        barcode: '123456789012',
        name: 'Test Product',
        veganStatus: VeganStatus.VEGAN,
        ingredients: [],
      },
    });
    
    mockHistoryService.addToHistory.mockResolvedValue(undefined);
    mockHistoryService.getHistory.mockReturnValue([]);
    mockHistoryService.getNewItemsCount.mockReturnValue(0);
  });

  it('should suppress notifications for add_new_product product_creation jobs', async () => {
    const { findByTestId } = render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    // Create a product_creation job for add_new_product workflow
    const job: BackgroundJob = {
      id: 'test-job-1',
      upc: '123456789012',
      deviceId: 'test-device',
      imageUri: 'file://test.jpg',
      retryCount: 0,
      maxRetries: 3,
      jobType: 'product_creation',
      workflowId: 'workflow-test',
      workflowType: 'add_new_product',
      workflowSteps: { total: 2, current: 1 },
      status: 'completed',
      resultData: { success: true },
      priority: 1,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
    };

    // Trigger the job completion
    if (eventHandler) {
      await eventHandler(job);
    }

    // Wait for component to update
    const notificationCount = await findByTestId('notification-count');
    const notificationsDebug = await findByTestId('notifications-debug');

    console.log('Notification count:', notificationCount.props.children);
    console.log('Notifications debug:', notificationsDebug.props.children);

    // Should have zero notifications
    expect(notificationCount.props.children).toBe(0);
  });

  it('should suppress notifications for report_product_issue product_creation jobs', async () => {
    const { findByTestId } = render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    // Create a product_creation job for report_product_issue workflow
    const job: BackgroundJob = {
      id: 'test-job-2',
      upc: '123456789012',
      deviceId: 'test-device',
      imageUri: 'file://test.jpg',
      retryCount: 0,
      maxRetries: 3,
      jobType: 'product_creation',
      workflowId: 'workflow-report',
      workflowType: 'report_product_issue',
      workflowSteps: { total: 2, current: 1 },
      status: 'completed',
      resultData: { success: true },
      priority: 1,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
    };

    // Trigger the job completion
    if (eventHandler) {
      await eventHandler(job);
    }

    // Wait for component to update
    const notificationCount = await findByTestId('notification-count');
    const notificationsDebug = await findByTestId('notifications-debug');

    console.log('Notification count:', notificationCount.props.children);
    console.log('Notifications debug:', notificationsDebug.props.children);

    // Should have zero notifications
    expect(notificationCount.props.children).toBe(0);
  });

  it('should show notifications for non-product_creation jobs', async () => {
    const { findByTestId } = render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    // Create an ingredient_parsing job for add_new_product workflow
    const job: BackgroundJob = {
      id: 'test-job-3',
      upc: '123456789012',
      deviceId: 'test-device',
      imageUri: 'file://test.jpg',
      retryCount: 0,
      maxRetries: 3,
      jobType: 'ingredient_parsing',
      workflowId: 'workflow-ingredient',
      workflowType: 'add_new_product',
      workflowSteps: { total: 2, current: 1 },
      status: 'completed',
      resultData: { success: true },
      priority: 1,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
    };

    // Trigger the job completion
    if (eventHandler) {
      await eventHandler(job);
    }

    // Wait for component to update
    const notificationCount = await findByTestId('notification-count');
    const notificationsDebug = await findByTestId('notifications-debug');

    console.log('Notification count:', notificationCount.props.children);
    console.log('Notifications debug:', notificationsDebug.props.children);

    // Should have one notification
    expect(notificationCount.props.children).toBe(1);
  });
});