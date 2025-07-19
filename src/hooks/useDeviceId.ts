import { useApp } from '../context/AppContext';

export function useDeviceId(): string | null {
  const { deviceId } = useApp();
  return deviceId;
}