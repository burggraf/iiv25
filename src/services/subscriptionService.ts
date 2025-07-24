import { supabase } from './supabaseClient';

export interface SubscriptionStatus {
  subscription_level: string;
  is_active: boolean;
  expires_at?: string;
  device_id?: string;
}

export interface UsageStats {
  product_lookups_today: number;
  product_lookups_limit: number;
  searches_today: number;
  searches_limit: number;
}

export class SubscriptionService {
  /**
   * Get current subscription status for a specific device
   */
  static async getSubscriptionStatus(deviceId: string): Promise<SubscriptionStatus | null> {
    try {
      if (!deviceId) {
        console.error('Device ID is required for subscription status lookup');
        return null;
      }

      const { data, error } = await supabase.rpc('get_subscription_status', {
        device_id_param: deviceId
      });

      if (error) {
        console.error('Error getting subscription status:', error);
        return null;
      }

      // The function now returns JSON directly, not an array
      if (data) {
        return data;
      }

      // Default to free tier if no data
      return {
        subscription_level: 'free',
        is_active: true,
        expires_at: undefined,
        device_id: deviceId,
      };
    } catch (err) {
      console.error('Failed to get subscription status:', err);
      return null;
    }
  }

  /**
   * Get usage statistics for a specific device
   */
  static async getUsageStats(deviceId: string): Promise<UsageStats | null> {
    try {
      if (!deviceId) {
        console.error('Device ID is required for usage stats lookup');
        return null;
      }

      const { data, error } = await supabase.rpc('get_usage_stats', {
        device_id_param: deviceId
      });

      if (error) {
        console.error('Error getting usage stats:', error);
        return null;
      }

      if (data && data.length > 0) {
        return data[0];
      }

      return null;
    } catch (err) {
      console.error('Failed to get usage stats:', err);
      return null;
    }
  }

  /**
   * Update user_subscription table with current user ID for device
   * Call this when user logs in/out
   */
  static async updateUserSubscriptionUserId(deviceId: string, userId?: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('update_user_subscription_userid', {
        device_id_param: deviceId,
        new_user_id: userId || null,
      });

      if (error) {
        console.error('Error updating user subscription userid:', error);
        return false;
      }

      return data === true;
    } catch (err) {
      console.error('Failed to update user subscription userid:', err);
      return false;
    }
  }

  /**
   * Handle auth state changes - call when user signs in/out
   * This will update the user_subscription table to link the device to the current user
   */
  static async handleAuthStateChange(deviceId: string, userId?: string): Promise<void> {
    try {
      console.log('Handling auth state change for device:', deviceId, 'user:', userId);

      const success = await this.updateUserSubscriptionUserId(deviceId, userId);

      if (success) {
        console.log('Successfully updated user subscription for auth change');
      } else {
        // Don't log as error - might just mean no change was needed
        console.log('No subscription update needed (no changes detected)');
      }
    } catch (err) {
      console.error('Error handling auth state change:', err);
    }
  }

  /**
   * Update subscription level for current user/device
   */
  static async updateSubscription(
    deviceId: string,
    subscriptionLevel: string,
    expiresAt?: Date,
    isActive: boolean = true
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('update_subscription', {
        device_id_param: deviceId,
        subscription_level_param: subscriptionLevel,
        expires_at_param: expiresAt?.toISOString() || null,
        is_active_param: isActive,
      });

      if (error) {
        console.error('Error updating subscription:', error);
        return false;
      }

      return data === true;
    } catch (err) {
      console.error('Failed to update subscription:', err);
      return false;
    }
  }

  /**
   * Check if device has an active premium subscription
   */
  static async isPremiumUser(deviceId: string): Promise<boolean> {
    const status = await this.getSubscriptionStatus(deviceId);
    return status?.subscription_level === 'standard' || status?.subscription_level === 'premium';
  }

  /**
   * Get subscription display name for UI
   */
  static getSubscriptionDisplayName(level: string): string {
    switch (level) {
      case 'free': return 'Free';
      case 'standard': return 'Standard';
      case 'premium': return 'Premium';
      default: return 'Free';
    }
  }

  /**
   * Format expires_at date for display
   */
  static formatExpirationDate(expiresAt?: string): string | undefined {
    if (!expiresAt) return undefined;

    try {
      const date = new Date(expiresAt);
      if (isNaN(date.getTime())) return undefined;
      return date.toLocaleDateString();
    } catch (err) {
      console.error('Error formatting expiration date:', err);
      return undefined;
    }
  }
}