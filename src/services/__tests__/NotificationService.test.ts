import { NotificationService } from '../NotificationService';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  removeNotificationSubscription: jest.fn(),
  AndroidImportance: {
    MAX: 5,
  },
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
  },
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: {
        projectId: 'test-project-id',
      },
    },
  },
}));

// Mock supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn(() => ({ error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { 
              notifications_enabled: true,
              expo_push_token: 'test-token'
            },
            error: null
          }))
        }))
      })),
    })),
  },
}));

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = NotificationService.getInstance();
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = NotificationService.getInstance();
      const instance2 = NotificationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('registerForPushNotifications', () => {
    const mockExpoNotifications = require('expo-notifications');
    const mockDevice = require('expo-device');

    beforeEach(() => {
      mockExpoNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      });
      mockExpoNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[test-token]',
      });
    });

    it('should return null on non-device', async () => {
      mockDevice.isDevice = false;
      const token = await notificationService.registerForPushNotifications();
      expect(token).toBeNull();
    });

    it('should return token when permissions granted', async () => {
      mockDevice.isDevice = true;
      const token = await notificationService.registerForPushNotifications();
      expect(token).toBe('ExponentPushToken[test-token]');
      expect(mockExpoNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
    });

    it('should request permissions when not granted', async () => {
      mockDevice.isDevice = true;
      mockExpoNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'denied',
      });
      mockExpoNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'granted',
      });

      const token = await notificationService.registerForPushNotifications();
      expect(token).toBe('ExponentPushToken[test-token]');
      expect(mockExpoNotifications.requestPermissionsAsync).toHaveBeenCalledWith({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
    });

    it('should return null when permissions denied', async () => {
      mockDevice.isDevice = true;
      mockExpoNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'denied',
      });
      mockExpoNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'denied',
      });

      const token = await notificationService.registerForPushNotifications();
      expect(token).toBeNull();
    });

    it('should set up Android notification channel', async () => {
      const mockPlatform = require('react-native').Platform;
      mockPlatform.OS = 'android';
      mockDevice.isDevice = true;

      await notificationService.registerForPushNotifications();

      expect(mockExpoNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          name: 'Default',
          importance: 5, // AndroidImportance.MAX
        })
      );
    });
  });

  describe('saveUserPushToken', () => {
    it('should save push token successfully', async () => {
      const success = await notificationService.saveUserPushToken(
        'user-123',
        'ExponentPushToken[test]'
      );

      expect(success).toBe(true);
    });
  });

  describe('areNotificationsEnabled', () => {
    it('should return true by default when no record exists', async () => {
      const mockSupabase = require('../supabaseClient').supabase;
      mockSupabase.from().select().eq().single.mockReturnValue({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      });

      const enabled = await notificationService.areNotificationsEnabled('user-123');
      expect(enabled).toBe(true);
    });

    it('should return user preference when record exists', async () => {
      const enabled = await notificationService.areNotificationsEnabled('user-123');
      expect(enabled).toBe(true);
    });
  });

  describe('setupNotificationListeners', () => {
    it('should set up listeners', () => {
      const mockExpoNotifications = require('expo-notifications');
      const onReceived = jest.fn();
      const onResponse = jest.fn();

      notificationService.setupNotificationListeners(onReceived, onResponse);

      expect(mockExpoNotifications.addNotificationReceivedListener).toHaveBeenCalled();
      expect(mockExpoNotifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });

  describe('scheduleLocalNotification', () => {
    it('should schedule local notification', async () => {
      const mockExpoNotifications = require('expo-notifications');
      mockExpoNotifications.scheduleNotificationAsync.mockResolvedValue('notification-id');

      const notificationId = await notificationService.scheduleLocalNotification(
        'Test Title',
        'Test Body',
        { type: 'test' },
        5
      );

      expect(notificationId).toBe('notification-id');
      expect(mockExpoNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Test Title',
          body: 'Test Body',
          data: { type: 'test' },
        },
        trigger: {
          type: 'timeInterval',
          seconds: 5,
        },
      });
    });
  });

  describe('initializeForUser', () => {
    it('should initialize notifications and save token', async () => {
      const mockExpoNotifications = require('expo-notifications');
      mockExpoNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      });
      mockExpoNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[test-token]',
      });

      await notificationService.initializeForUser('user-123');

      expect(mockExpoNotifications.addNotificationReceivedListener).toHaveBeenCalled();
      expect(mockExpoNotifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove listeners', () => {
      const mockExpoNotifications = require('expo-notifications');
      
      // Mock the listener objects that would be returned
      const mockListener1 = { remove: jest.fn() };
      const mockListener2 = { remove: jest.fn() };
      
      mockExpoNotifications.addNotificationReceivedListener.mockReturnValue(mockListener1);
      mockExpoNotifications.addNotificationResponseReceivedListener.mockReturnValue(mockListener2);
      
      // Set up listeners first
      notificationService.setupNotificationListeners();
      
      // Then cleanup
      notificationService.cleanup();

      expect(mockExpoNotifications.removeNotificationSubscription).toHaveBeenCalledWith(mockListener1);
      expect(mockExpoNotifications.removeNotificationSubscription).toHaveBeenCalledWith(mockListener2);
    });
  });
});