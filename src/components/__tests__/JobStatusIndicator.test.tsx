import React from 'react';
import { render } from '@testing-library/react-native';
import JobStatusIndicator from '../JobStatusIndicator';
import { useBackgroundJobs } from '../../hooks/useBackgroundJobs';

// Mock the useBackgroundJobs hook
jest.mock('../../hooks/useBackgroundJobs');
const mockUseBackgroundJobs = useBackgroundJobs as jest.MockedFunction<typeof useBackgroundJobs>;

// Mock SafeAreaProvider context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

describe('JobStatusIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when no active jobs', () => {
    mockUseBackgroundJobs.mockReturnValue({
      activeJobs: [],
      completedJobs: [],
      loading: false,
      queueJob: jest.fn(),
      cancelJob: jest.fn(),
      retryJob: jest.fn(),
      clearCompletedJobs: jest.fn(),
      clearAllJobs: jest.fn(),
      refreshJobs: jest.fn(),
    });

    const { queryByTestId } = render(<JobStatusIndicator />);
    
    // Should not render anything when no active jobs
    expect(queryByTestId('job-status-indicator')).toBeNull();
  });

  it('renders spinner and badge when there are active jobs', () => {
    const mockActiveJobs = [
      { 
        id: '1', 
        jobType: 'product_photo_upload' as const, 
        status: 'processing' as const,
        priority: 1,
        upc: '123456789',
        deviceId: 'test-device',
        imageUri: 'test://image1.jpg',
        retryCount: 0
      },
      { 
        id: '2', 
        jobType: 'ingredient_parsing' as const, 
        status: 'queued' as const,
        priority: 1,
        upc: '987654321',
        deviceId: 'test-device',
        imageUri: 'test://image2.jpg',
        retryCount: 0
      },
    ];

    mockUseBackgroundJobs.mockReturnValue({
      activeJobs: mockActiveJobs,
      completedJobs: [],
      loading: false,
      queueJob: jest.fn(),
      cancelJob: jest.fn(),
      retryJob: jest.fn(),
      clearCompletedJobs: jest.fn(),
      clearAllJobs: jest.fn(),
      refreshJobs: jest.fn(),
    });

    const { getByText } = render(<JobStatusIndicator />);
    
    // Should show the badge with job count
    expect(getByText('2')).toBeTruthy();
  });

  it('shows correct count for single job', () => {
    const mockActiveJobs = [
      { 
        id: '1', 
        jobType: 'product_creation' as const, 
        status: 'processing' as const,
        priority: 1,
        upc: '123456789',
        deviceId: 'test-device',
        imageUri: 'test://image1.jpg',
        retryCount: 0
      },
    ];

    mockUseBackgroundJobs.mockReturnValue({
      activeJobs: mockActiveJobs,
      completedJobs: [],
      loading: false,
      queueJob: jest.fn(),
      cancelJob: jest.fn(),
      retryJob: jest.fn(),
      clearCompletedJobs: jest.fn(),
      clearAllJobs: jest.fn(),
      refreshJobs: jest.fn(),
    });

    const { getByText } = render(<JobStatusIndicator />);
    
    // Should show badge with "1"
    expect(getByText('1')).toBeTruthy();
  });
});