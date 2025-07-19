import deviceIdService from '../deviceIdService';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

jest.mock('expo-secure-store');
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios'
  }
}));

describe('DeviceIdService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deviceIdService as any).deviceId = null;
  });

  it('should generate and store a new device ID if none exists', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    const deviceId = await deviceIdService.getDeviceId();

    expect(deviceId).toBeDefined();
    expect(typeof deviceId).toBe('string');
    expect(deviceId.length).toBe(36); // UUID v4 length
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('device_id');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('device_id', deviceId);
  });

  it('should return existing device ID if already stored', async () => {
    const existingId = 'existing-uuid-123';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(existingId);

    const deviceId = await deviceIdService.getDeviceId();

    expect(deviceId).toBe(existingId);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('should return cached device ID on subsequent calls', async () => {
    const existingId = 'cached-uuid-456';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(existingId);

    const deviceId1 = await deviceIdService.getDeviceId();
    const deviceId2 = await deviceIdService.getDeviceId();

    expect(deviceId1).toBe(existingId);
    expect(deviceId2).toBe(existingId);
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it('should reset and generate new device ID', async () => {
    const newDeviceId = await deviceIdService.resetDeviceId();

    expect(newDeviceId).toBeDefined();
    expect(typeof newDeviceId).toBe('string');
    expect(newDeviceId.length).toBe(36);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('device_id', newDeviceId);
  });
});