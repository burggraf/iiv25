import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';
import type { Database } from '../lib/database.types';

type NotificationPreferences = Database['public']['Tables']['user_notification_preferences']['Row'];
type NotificationHistory = Database['public']['Tables']['notification_history']['Row'];

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  type: string;
  [key: string]: any;
}

export interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: NotificationData;
  type: string;
}

export class NotificationService {
  private static instance: NotificationService;
  private notificationListener?: Notifications.EventSubscription;
  private responseListener?: Notifications.EventSubscription;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Register for push notifications and get the Expo push token
   * Returns object with token and permission status for better handling
   */
  async registerForPushNotifications(): Promise<{ token: string | null; permissionGranted: boolean }> {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return { token: null, permissionGranted: false };
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4CAF50',
      });
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permissions not granted');
      return { token: null, permissionGranted: false };
    }

    try {
      // Get the project ID from Constants
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      if (!projectId) {
        console.error('Project ID not found in Constants');
        return { token: null, permissionGranted: true };
      }

      // Get the Expo push token
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('Expo push token:', token);
      return { token, permissionGranted: true };

    } catch (error) {
      console.error('Error getting push token:', error);
      return { token: null, permissionGranted: true };
    }
  }

  /**
   * Save the user's push token and notification preferences to the database
   */
  async saveUserPushToken(userId: string, pushToken: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          expo_push_token: pushToken,
          notifications_enabled: true,
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving push token:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving push token:', error);
      return false;
    }
  }

  /**
   * Save record when user declines push notification permissions
   */
  async saveUserPermissionDeclined(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          expo_push_token: null,
          notifications_enabled: false,
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving permission declined:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving permission declined:', error);
      return false;
    }
  }

  /**
   * Get user's notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching user preferences:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return null;
    }
  }

  /**
   * Update user's notification preferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          ...preferences,
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error updating user preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }
  }

  /**
   * Check if user has notifications enabled (defaults to true if no record exists)
   */
  async areNotificationsEnabled(userId: string): Promise<boolean> {
    const preferences = await this.getUserPreferences(userId);
    return preferences?.notifications_enabled ?? true; // Default to true if no record
  }

  /**
   * Get user's notification history
   */
  async getNotificationHistory(userId: string): Promise<NotificationHistory[]> {
    try {
      const { data, error } = await supabase
        .from('notification_history')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false });

      if (error) {
        console.error('Error fetching notification history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching notification history:', error);
      return [];
    }
  }

  /**
   * Set up notification listeners for when app is running
   */
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ): void {
    // Clean up existing listeners
    this.removeNotificationListeners();

    // Listen for notifications received while app is running
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      onNotificationResponse?.(response);
    });
  }

  /**
   * Remove notification listeners
   */
  removeNotificationListeners(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = undefined;
    }

    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = undefined;
    }
  }

  /**
   * Schedule a local notification (for testing purposes)
   */
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: NotificationData,
    triggerSeconds: number = 2
  ): Promise<string> {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: triggerSeconds,
      },
    });
  }

  /**
   * Initialize notification service for a user
   * This should be called when user logs in
   */
  async initializeForUser(userId: string): Promise<void> {
    // Register for push notifications
    const { token, permissionGranted } = await this.registerForPushNotifications();
    
    if (token && permissionGranted) {
      // Save the token to database with notifications enabled
      await this.saveUserPushToken(userId, token);
    } else if (!permissionGranted) {
      // User explicitly declined permissions - create record with notifications disabled
      await this.saveUserPermissionDeclined(userId);
    } else {
      // Permission granted but token failed (technical issue) - create record but mark as disabled for now
      await this.saveUserPermissionDeclined(userId);
    }

    // Set up listeners only if permissions were granted
    if (permissionGranted) {
      this.setupNotificationListeners();
    }
  }

  /**
   * Clean up when user logs out
   */
  cleanup(): void {
    this.removeNotificationListeners();
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();