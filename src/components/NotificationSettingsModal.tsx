import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { notificationService } from '../services/NotificationService';
import { Database } from '../lib/database.types';

type NotificationPreferences = Database['public']['Tables']['user_notification_preferences']['Row'];

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSettingsModal({ visible, onClose }: NotificationSettingsModalProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && user?.id) {
      loadPreferences();
    }
  }, [visible, user?.id]);

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
      <Modal
        animationType="slide"
        transparent={false}
        visible={visible}
        onRequestClose={onClose}
        presentationStyle="fullScreen">
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header with Close Button */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Logo size={32} />
            <Text style={styles.title}>Notification Settings</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
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
          </View>

          {preferences?.expo_push_token && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Debug Info</Text>
              <View style={styles.card}>
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
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.card}>
              <Text style={styles.aboutText}>
                Push notifications help you stay updated with your scanning activity and important account information.
              </Text>
            </View>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>
    </Modal>
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
  closeButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
    backgroundColor: 'white',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
  },
  section: {
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E9F0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 18,
    flexShrink: 1,
    letterSpacing: -0.3,
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
    marginBottom: 12,
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
  bottomPadding: {
    height: 40,
  },
});