import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'device_id';

class DeviceIdService {
  private deviceId: string | null = null;

  private async storeValue(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  }

  private async getValue(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  }

  async getDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    try {
      let storedDeviceId = await this.getValue(DEVICE_ID_KEY);
      
      if (!storedDeviceId) {
        storedDeviceId = uuidv4();
        await this.storeValue(DEVICE_ID_KEY, storedDeviceId);
      }
      
      this.deviceId = storedDeviceId;
      return storedDeviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      const fallbackId = uuidv4();
      this.deviceId = fallbackId;
      return fallbackId;
    }
  }

  async resetDeviceId(): Promise<string> {
    const newDeviceId = uuidv4();
    try {
      await this.storeValue(DEVICE_ID_KEY, newDeviceId);
      this.deviceId = newDeviceId;
      return newDeviceId;
    } catch (error) {
      console.error('Error resetting device ID:', error);
      this.deviceId = newDeviceId;
      return newDeviceId;
    }
  }
}

export default new DeviceIdService();