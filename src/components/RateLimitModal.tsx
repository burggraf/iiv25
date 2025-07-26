import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

interface RateLimitModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function RateLimitModal({ isVisible, onClose }: RateLimitModalProps) {
  if (!isVisible) {
    return null;
  }

  const handleSubscribe = () => {
    onClose();
    // Navigate to home tab and automatically open subscription management
    router.push({
      pathname: '/(tabs)/',
      params: { openSubscription: 'true' }
    });
  };

  return (
    <View style={styles.modal}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.icon}>⏰</Text>
          <Text style={styles.title}>Search Limit Reached</Text>
          <Text style={styles.subtitle}>
            You&apos;ve reached your daily search limit.
          </Text>
          <Text style={styles.details}>
            Rate limit exceeded: free tier allows 10 total searches per day.
          </Text>
          <Text style={styles.upgradeMessage}>
            Upgrade to Standard or Premium for unlimited searches.
          </Text>
        </View>
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}>
            <Text style={styles.cancelText}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleSubscribe}>
            <Text style={styles.confirmText}>Upgrade Plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 32,
    margin: 20,
    alignItems: 'center',
    maxWidth: 350,
    width: '90%',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  details: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  upgradeMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});