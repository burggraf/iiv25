import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Logo from '../../src/components/Logo';
import BarcodeIcon from '../../src/components/icons/BarcodeIcon';
import ManualIcon from '../../src/components/icons/ManualIcon';
import SearchIcon from '../../src/components/icons/SearchIcon';
import HistoryIcon from '../../src/components/icons/HistoryIcon';
import { useAuth } from '../../src/context/AuthContext';
import { SupabaseService } from '../../src/services/supabaseService';
import { SubscriptionLevel } from '../../src/types';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [showUserModal, setShowUserModal] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionLevel>('free');
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  
  const navigateToTab = (tabName: string) => {
    router.push(`/(tabs)/${tabName}` as any);
  };

  const handleLogout = () => {
    setShowUserModal(false);
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const loadSubscriptionStatus = async () => {
    if (!user || user.is_anonymous) {
      setSubscriptionStatus('free');
      return;
    }

    setLoadingSubscription(true);
    try {
      const status = await SupabaseService.getSubscriptionStatus();
      setSubscriptionStatus(status);
    } catch (error: any) {
      console.error('Error loading subscription status:', error);
      // Default to free if there's an error
      setSubscriptionStatus('free');
    } finally {
      setLoadingSubscription(false);
    }
  };

  // Load subscription status when modal opens
  useEffect(() => {
    if (showUserModal) {
      loadSubscriptionStatus();
    }
  }, [showUserModal, user]);

  const getSubscriptionDisplayText = (level: SubscriptionLevel) => {
    switch (level) {
      case 'free':
        return 'Free';
      case 'standard':
        return 'Standard';
      case 'premium':
        return 'Premium';
      default:
        return 'Free';
    }
  };

  const getSubscriptionColor = (level: SubscriptionLevel) => {
    switch (level) {
      case 'free':
        return '#666';
      case 'standard':
        return '#FF9800';
      case 'premium':
        return '#14A44A';
      default:
        return '#666';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.header}>
          <Logo size={100} style={styles.logo} />
          <Text style={styles.title}>Is It Vegan?</Text>
          <Text style={styles.subtitle}>Check if products are vegan instantly!</Text>
        </View>

        {/* Quick Actions Section */}
        <View style={styles.actionsSection}>
          <View style={styles.actionsSectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity 
              style={styles.userIconButton}
              onPress={() => setShowUserModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={user?.is_anonymous ? "person-outline" : "person-circle-outline"} 
                size={28} 
                color="#14A44A" 
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.actionGrid}>
            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => navigateToTab('scanner')}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <BarcodeIcon size={32} color="#14A44A" />
              </View>
              <Text style={styles.actionTitle}>Scanner</Text>
              <Text style={styles.actionDescription}>Scan barcodes with your camera</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => navigateToTab('manual')}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <ManualIcon size={32} color="#14A44A" />
              </View>
              <Text style={styles.actionTitle}>Manual Entry</Text>
              <Text style={styles.actionDescription}>Type UPC codes manually</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => navigateToTab('search')}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <SearchIcon size={32} color="#14A44A" />
              </View>
              <Text style={styles.actionTitle}>Search</Text>
              <Text style={styles.actionDescription}>Find products & ingredients</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => navigateToTab('history')}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <HistoryIcon size={32} color="#14A44A" />
              </View>
              <Text style={styles.actionTitle}>History</Text>
              <Text style={styles.actionDescription}>View your past scans</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How It Works</Text>
          <Text style={styles.infoText}>
            Our app analyzes product ingredients using the Open Food Facts database to determine if products are vegan, vegetarian, or contain animal-derived ingredients.
          </Text>
          <View style={styles.statusIndicators}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.statusLabel}>Vegan</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: '#FF9800' }]} />
              <Text style={styles.statusLabel}>Vegetarian</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: '#F44336' }]} />
              <Text style={styles.statusLabel}>Not Vegan</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* User Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showUserModal}
        onRequestClose={() => setShowUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account Information</Text>
              <TouchableOpacity 
                onPress={() => setShowUserModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <View style={styles.userInfoRow}>
                <Ionicons 
                  name={user?.is_anonymous ? "person-outline" : "person-circle-outline"} 
                  size={24} 
                  color="#14A44A" 
                  style={styles.userIcon}
                />
                <Text style={styles.userEmail}>
                  {user?.email || 'Anonymous User'}
                </Text>
              </View>
              
              {user?.is_anonymous && (
                <Text style={styles.anonymousText}>Anonymous Session</Text>
              )}
              
              <View style={styles.subscriptionRow}>
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionLabel}>Subscription:</Text>
                  <Text 
                    style={[
                      styles.subscriptionValue,
                      { color: getSubscriptionColor(subscriptionStatus) }
                    ]}
                  >
                    {loadingSubscription ? 'Loading...' : getSubscriptionDisplayText(subscriptionStatus)}
                  </Text>
                </View>
                <View style={[
                  styles.subscriptionBadge,
                  { backgroundColor: getSubscriptionColor(subscriptionStatus) }
                ]}>
                  <Text style={styles.subscriptionBadgeText}>
                    {getSubscriptionDisplayText(subscriptionStatus).toUpperCase()}
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity 
                style={styles.modalLogoutButton}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={20} color="white" />
                <Text style={styles.modalLogoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  userIconButton: {
    padding: 8,
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: 'white',
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  logo: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#14A44A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '80%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userIcon: {
    marginRight: 12,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  anonymousText: {
    fontSize: 12,
    color: '#14A44A',
    fontWeight: '500',
    marginBottom: 20,
  },
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 2,
  },
  subscriptionValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  subscriptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },
  subscriptionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 0.5,
  },
  modalLogoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalLogoutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionsSection: {
    marginBottom: 32,
  },
  actionsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  actionDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  infoSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  statusIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});