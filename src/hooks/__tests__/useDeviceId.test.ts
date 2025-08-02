import { renderHook, waitFor } from '@testing-library/react-native';
import { useDeviceId } from '../useDeviceId';
import deviceIdService from '../../services/deviceIdService';

// Mock the device ID service
jest.mock('../../services/deviceIdService');

const mockDeviceIdService = deviceIdService as jest.Mocked<typeof deviceIdService>;

describe('useDeviceId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return device ID when successfully retrieved', async () => {
    const mockDeviceId = 'test-device-id-123';
    mockDeviceIdService.getDeviceId.mockResolvedValue(mockDeviceId);

    const { result } = renderHook(() => useDeviceId());

    // Initially should be null
    expect(result.current).toBeNull();

    // Wait for the device ID to be loaded
    await waitFor(() => {
      expect(result.current).toBe(mockDeviceId);
    });

    expect(mockDeviceIdService.getDeviceId).toHaveBeenCalledTimes(1);
  });

  it('should return null when device ID retrieval fails', async () => {
    mockDeviceIdService.getDeviceId.mockRejectedValue(new Error('Failed to get device ID'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDeviceId());

    // Initially should be null
    expect(result.current).toBeNull();

    // Should remain null after the error
    await waitFor(() => {
      expect(mockDeviceIdService.getDeviceId).toHaveBeenCalledTimes(1);
    });

    expect(result.current).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Failed to get device ID:', expect.any(Error));

    jest.restoreAllMocks();
  });

  it('should only fetch device ID once on mount', async () => {
    const mockDeviceId = 'test-device-id-456';
    mockDeviceIdService.getDeviceId.mockResolvedValue(mockDeviceId);

    const { result, rerender } = renderHook(() => useDeviceId());

    await waitFor(() => {
      expect(result.current).toBe(mockDeviceId);
    });

    // Re-render the hook (props not needed for this hook)
    rerender({});

    // Should still have the same device ID and only called once
    expect(result.current).toBe(mockDeviceId);
    expect(mockDeviceIdService.getDeviceId).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple concurrent hook instances', async () => {
    const mockDeviceId = 'concurrent-device-id';
    mockDeviceIdService.getDeviceId.mockResolvedValue(mockDeviceId);

    const { result: result1 } = renderHook(() => useDeviceId());
    const { result: result2 } = renderHook(() => useDeviceId());

    await waitFor(() => {
      expect(result1.current).toBe(mockDeviceId);
      expect(result2.current).toBe(mockDeviceId);
    });

    // Both hooks should get the same device ID
    expect(result1.current).toBe(result2.current);
  });

  it('should handle empty string device ID', async () => {
    mockDeviceIdService.getDeviceId.mockResolvedValue('');

    const { result } = renderHook(() => useDeviceId());

    await waitFor(() => {
      expect(mockDeviceIdService.getDeviceId).toHaveBeenCalledTimes(1);
    });

    expect(result.current).toBe('');
  });

  it('should handle slow device ID service response', async () => {
    const mockDeviceId = 'slow-device-id';
    let resolvePromise: (value: string) => void;
    const slowPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    mockDeviceIdService.getDeviceId.mockReturnValue(slowPromise);

    const { result } = renderHook(() => useDeviceId());

    // Should be null initially
    expect(result.current).toBeNull();

    // Resolve the promise after a delay
    setTimeout(() => resolvePromise!(mockDeviceId), 100);

    // Wait for the device ID to be set
    await waitFor(
      () => {
        expect(result.current).toBe(mockDeviceId);
      },
      { timeout: 200 }
    );
  });
});