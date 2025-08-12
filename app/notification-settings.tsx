import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { notificationService } from '../src/services/NotificationService';
import { Database } from '../src/lib/database.types';

type NotificationPreferences = Database['public']['Tables']['user_notification_preferences']['Row'];

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadPreferences = async () => {
    if (!user?.id) return;

    try {
      const prefs = await notificationService.getUserPreferences(user.id);
      setPreferences(prefs);
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateNotificationSetting = async (enabled: boolean) => {
    if (!user?.id) return;

    try {
      const success = await notificationService.updateUserPreferences(user.id, {
        notifications_enabled: enabled,
      });

      if (success) {
        setPreferences(prev => prev ? { ...prev, notifications_enabled: enabled } : null);
        
        if (enabled) {
          // Initialize notifications when enabling
          await notificationService.initializeForUser(user.id);
        }
      } else {
        Alert.alert('Error', 'Failed to update notification settings');
      }
    } catch (error) {
      console.error('Error updating notification settings:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  const testNotification = async () => {
    try {
      await notificationService.scheduleLocalNotification(
        'Test Notification',
        'This is a test notification from Is It Vegan!',
        { type: 'test' },
        2
      );
      Alert.alert('Success', 'Test notification scheduled! It will appear in 2 seconds.');
    } catch (error) {
      console.error('Error scheduling test notification:', error);
      Alert.alert('Error', 'Failed to schedule test notification');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Notification Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingDescription}>
              Receive notifications about your scans and account updates
            </Text>
          </View>
          <Switch
            value={preferences?.notifications_enabled ?? true}
            onValueChange={updateNotificationSetting}
            trackColor={{ false: '#E5E5EA', true: '#4CAF50' }}
            thumbColor="#ffffff"
          />
        </View>

        {preferences?.notifications_enabled && (
          <TouchableOpacity
            style={styles.testButton}
            onPress={testNotification}
          >
            <Text style={styles.testButtonText}>Test Notification</Text>
          </TouchableOpacity>
        )}
      </View>

      {preferences?.expo_push_token && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Info</Text>
          <View style={styles.debugInfo}>
            <Text style={styles.debugLabel}>User ID:</Text>
            <Text style={styles.debugValue} numberOfLines={2} ellipsizeMode="middle">
              {user?.id}
            </Text>
          </View>
          <View style={[styles.debugInfo, { marginTop: 8 }]}>
            <Text style={styles.debugLabel}>Push Token:</Text>
            <Text style={styles.debugValue} numberOfLines={3} ellipsizeMode="middle">
              {preferences.expo_push_token}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          Push notifications help you stay updated with your scanning activity and important account information.
        </Text>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  testButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  debugInfo: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  debugValue: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#333',
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});