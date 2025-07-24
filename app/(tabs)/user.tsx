import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useApp } from '../../src/context/AppContext';
import Logo from '../../src/components/Logo';
import { SubscriptionService, SubscriptionStatus, UsageStats } from '../../src/services/subscriptionService';

interface SubscriptionTier {
  id: string;
  name: string;
  price: string;
  duration: string;
  features: string[];
}

const subscriptionTiers: SubscriptionTier[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$1.99',
    duration: 'per month',
    features: ['Unlimited product scans', 'Unlimited ingredient searches', 'No advertisements'],
  },
  {
    id: 'quarterly',
    name: '3-Month',
    price: '$4.99',
    duration: 'per 3 months',
    features: ['Unlimited product scans', 'Unlimited ingredient searches', 'No advertisements', 'Save 17%'],
  },
  {
    id: 'semiannual',
    name: '6-Month',
    price: '$6.99',
    duration: 'per 6 months',
    features: ['Unlimited product scans', 'Unlimited ingredient searches', 'No advertisements', 'Save 42%'],
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$9.99',
    duration: 'per year',
    features: ['Unlimited product scans', 'Unlimited ingredient searches', 'No advertisements', 'Save 58%'],
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$19.99',
    duration: 'one-time payment',
    features: ['Unlimited product scans', 'Unlimited ingredient searches', 'No advertisements', 'Best value - pay once, use forever'],
  },
];

export default function UserScreen() {
  const { user, signOut, isAnonymous } = useAuth();
  const { deviceId } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    loadSubscriptionStatus();
    loadUsageStats();
  }, [user, deviceId]);

  // Handle auth state changes to update user_subscription table
  useEffect(() => {
    if (deviceId) {
      SubscriptionService.handleAuthStateChange(deviceId, user?.id);
    }
  }, [user, deviceId]);

  const loadSubscriptionStatus = async () => {
    try {
      if (!deviceId) {
        console.log('Device ID not available yet, skipping subscription status load');
        return;
      }
      
      const status = await SubscriptionService.getSubscriptionStatus(deviceId);
      setSubscriptionStatus(status);
    } catch (error) {
      console.error('Failed to load subscription status:', error);
      // Fallback to free tier
      setSubscriptionStatus({
        subscription_level: 'free',
        is_active: true,
        device_id: deviceId || undefined,
      });
    }
  };

  const loadUsageStats = async () => {
    try {
      if (!deviceId) {
        console.log('Device ID not available yet, skipping usage stats load');
        return;
      }
      
      const stats = await SubscriptionService.getUsageStats(deviceId);
      setUsageStats(stats);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsLoading(true);
      await signOut();
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = (tierId: string) => {
    Alert.alert(
      'Subscription',
      `Would you like to upgrade to ${subscriptionTiers.find(t => t.id === tierId)?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => {
          // TODO: Implement subscription purchase flow
          Alert.alert('Coming Soon', 'Subscription management will be available soon!');
        }},
      ]
    );
  };

  const handleRestorePurchases = () => {
    Alert.alert(
      'Restore Purchases',
      'Looking for previous purchases...',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => {
          // TODO: Implement purchase restoration
          Alert.alert('Coming Soon', 'Purchase restoration will be available soon!');
        }},
      ]
    );
  };

  const isPremium = subscriptionStatus?.subscription_level === 'basic' || subscriptionStatus?.subscription_level === 'premium';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Logo size={32} />
        <Text style={styles.appTitle}>User Account</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Authentication Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Status</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Status:</Text>
              <Text style={[styles.cardValue, { color: user ? '#4CAF50' : '#FF6B35' }]}>
                {user ? (isAnonymous ? 'Anonymous User' : 'Signed In') : 'Not Signed In'}
              </Text>
            </View>
            {user?.email && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Email:</Text>
                <Text style={styles.cardValue}>{user.email}</Text>
              </View>
            )}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Device ID:</Text>
              <Text style={[styles.cardValue, styles.deviceId]}>{deviceId}</Text>
            </View>
          </View>
        </View>

        {/* Subscription Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Plan:</Text>
              <Text style={[styles.cardValue, { 
                color: isPremium ? '#4CAF50' : '#FF6B35',
                fontWeight: 'bold'
              }]}>
                {subscriptionStatus ? SubscriptionService.getSubscriptionDisplayName(subscriptionStatus.subscription_level) : 'Loading...'}
              </Text>
            </View>
            {subscriptionStatus?.expires_at && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Expires:</Text>
                <Text style={styles.cardValue}>{SubscriptionService.formatExpirationDate(subscriptionStatus.expires_at)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Usage Statistics */}
        {usageStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today&apos;s Usage</Text>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Product Lookups:</Text>
                <Text style={[styles.cardValue, {
                  color: isPremium ? '#4CAF50' : (usageStats.product_lookups_today >= usageStats.product_lookups_limit ? '#F44336' : '#333')
                }]}>
                  {isPremium ? 'Unlimited' : `${usageStats.product_lookups_today}/${usageStats.product_lookups_limit}`}
                </Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Ingredient Searches:</Text>
                <Text style={[styles.cardValue, {
                  color: isPremium ? '#4CAF50' : (usageStats.searches_today >= usageStats.searches_limit ? '#F44336' : '#333')
                }]}>
                  {isPremium ? 'Unlimited' : `${usageStats.searches_today}/${usageStats.searches_limit}`}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Subscription Management */}
        {!isPremium && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upgrade Your Plan</Text>
            <Text style={styles.sectionSubtitle}>
              Unlock unlimited scans and searches with a premium subscription
            </Text>
            
            {subscriptionTiers.map((tier) => (
              <TouchableOpacity
                key={tier.id}
                style={[styles.tierCard, tier.id === 'lifetime' && styles.tierCardHighlight]}
                onPress={() => handleUpgrade(tier.id)}
              >
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierName, tier.id === 'lifetime' && styles.tierNameHighlight]}>
                    {tier.name}
                  </Text>
                  <View style={styles.tierPrice}>
                    <Text style={[styles.tierPriceAmount, tier.id === 'lifetime' && styles.tierPriceHighlight]}>
                      {tier.price}
                    </Text>
                    <Text style={[styles.tierPriceDuration, tier.id === 'lifetime' && styles.tierPriceHighlight]}>
                      {tier.duration}
                    </Text>
                  </View>
                </View>
                <View style={styles.tierFeatures}>
                  {tier.features.map((feature, index) => (
                    <Text key={index} style={[styles.tierFeature, tier.id === 'lifetime' && styles.tierFeatureHighlight]}>
                      • {feature}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          
          {!user && (
            <TouchableOpacity style={styles.actionButton} onPress={() => {
              // TODO: Navigate to authentication screen
              Alert.alert('Coming Soon', 'Sign in functionality will be available soon!');
            }}>
              <Text style={styles.actionButtonText}>Sign In / Sign Up</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionButton} onPress={handleRestorePurchases}>
            <Text style={styles.actionButtonText}>Restore Purchases</Text>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.signOutButton]} 
              onPress={handleSignOut}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={[styles.actionButtonText, styles.signOutButtonText]}>Sign Out</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* App Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Version:</Text>
              <Text style={styles.cardValue}>4.0.0</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Platform:</Text>
              <Text style={styles.cardValue}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
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
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  cardValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  deviceId: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tierCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e9ecef',
  },
  tierCardHighlight: {
    borderColor: '#4CAF50',
    backgroundColor: '#f8fff8',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tierNameHighlight: {
    color: '#4CAF50',
  },
  tierPrice: {
    alignItems: 'flex-end',
  },
  tierPriceAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  tierPriceHighlight: {
    color: '#4CAF50',
  },
  tierPriceDuration: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  tierFeatures: {
    marginTop: 8,
  },
  tierFeature: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    lineHeight: 20,
  },
  tierFeatureHighlight: {
    color: '#2e7d32',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#F44336',
  },
  signOutButtonText: {
    color: 'white',
  },
  bottomPadding: {
    height: 32,
  },
});