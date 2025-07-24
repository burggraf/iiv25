import { SubscriptionService } from '../subscriptionService';
import { supabase } from '../supabaseClient';

// Mock supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

// Helper to create mock Supabase response
const createMockResponse = (data: any, error: any = null) => ({
  data,
  error,
  count: null,
  status: error ? 500 : 200,
  statusText: error ? 'Internal Server Error' : 'OK',
});

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscriptionStatus', () => {
    it('should get subscription status successfully', async () => {
      const deviceId = 'test-device-id';
      const mockStatus = {
        subscription_level: 'premium',
        is_active: true,
        expires_at: '2024-12-31T23:59:59Z',
        device_id: deviceId,
      };

      mockSupabase.rpc.mockResolvedValue(createMockResponse(mockStatus));

      const result = await SubscriptionService.getSubscriptionStatus(deviceId);

      expect(result).toEqual(mockStatus);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_subscription_status', {
        device_id_param: deviceId,
      });
    });

    it('should return default free status when no data found', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null));

      const result = await SubscriptionService.getSubscriptionStatus(deviceId);

      expect(result).toEqual({
        subscription_level: 'free',
        is_active: true,
        expires_at: undefined,
        device_id: deviceId,
      });
    });

    it('should handle database errors gracefully', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null, {
        message: 'Database error',
        details: '',
        hint: '',
        code: '500'
      }));

      const result = await SubscriptionService.getSubscriptionStatus(deviceId);

      expect(result).toBeNull();
    });

    it('should handle missing device ID', async () => {
      const result = await SubscriptionService.getSubscriptionStatus('');

      expect(result).toBeNull();
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockRejectedValue(new Error('Network error'));

      const result = await SubscriptionService.getSubscriptionStatus(deviceId);

      expect(result).toBeNull();
    });
  });

  describe('getUsageStats', () => {
    it('should get usage statistics successfully', async () => {
      const deviceId = 'test-device-id';
      const mockStats = {
        product_lookups_today: 5,
        product_lookups_limit: 10,
        searches_today: 3,
        searches_limit: 10,
      };

      mockSupabase.rpc.mockResolvedValue(createMockResponse([mockStats]));

      const result = await SubscriptionService.getUsageStats(deviceId);

      expect(result).toEqual(mockStats);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_usage_stats', {
        device_id_param: deviceId,
      });
    });

    it('should return null when no data found', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse([]));

      const result = await SubscriptionService.getUsageStats(deviceId);

      expect(result).toBeNull();
    });

    it('should handle missing device ID', async () => {
      const result = await SubscriptionService.getUsageStats('');

      expect(result).toBeNull();
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null, {
        message: 'Database error',
        details: '',
        hint: '',
        code: '500'
      }));

      const result = await SubscriptionService.getUsageStats(deviceId);

      expect(result).toBeNull();
    });
  });

  describe('updateUserSubscriptionUserId', () => {
    it('should update user subscription user ID successfully', async () => {
      const deviceId = 'test-device-id';
      const userId = 'test-user-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      const result = await SubscriptionService.updateUserSubscriptionUserId(deviceId, userId);

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_user_subscription_userid', {
        device_id_param: deviceId,
        new_user_id: userId,
      });
    });

    it('should handle user logout (null user ID)', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      const result = await SubscriptionService.updateUserSubscriptionUserId(deviceId);

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_user_subscription_userid', {
        device_id_param: deviceId,
        new_user_id: null,
      });
    });

    it('should handle database errors', async () => {
      const deviceId = 'test-device-id';
      const userId = 'test-user-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null, {
        message: 'Database error',
        details: '',
        hint: '',
        code: '500'
      }));

      const result = await SubscriptionService.updateUserSubscriptionUserId(deviceId, userId);

      expect(result).toBe(false);
    });

    it('should handle network errors', async () => {
      const deviceId = 'test-device-id';
      const userId = 'test-user-id';

      mockSupabase.rpc.mockRejectedValue(new Error('Network error'));

      const result = await SubscriptionService.updateUserSubscriptionUserId(deviceId, userId);

      expect(result).toBe(false);
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription successfully', async () => {
      const deviceId = 'test-device-id';
      const subscriptionLevel = 'premium';
      const expiresAt = new Date('2024-12-31');
      const isActive = true;

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      const result = await SubscriptionService.updateSubscription(
        deviceId,
        subscriptionLevel,
        expiresAt,
        isActive
      );

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_subscription', {
        device_id_param: deviceId,
        subscription_level_param: subscriptionLevel,
        expires_at_param: expiresAt.toISOString(),
        is_active_param: isActive,
      });
    });

    it('should handle lifetime subscription (no expiration)', async () => {
      const deviceId = 'test-device-id';
      const subscriptionLevel = 'premium';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      const result = await SubscriptionService.updateSubscription(
        deviceId,
        subscriptionLevel,
        undefined,
        true
      );

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_subscription', {
        device_id_param: deviceId,
        subscription_level_param: subscriptionLevel,
        expires_at_param: null,
        is_active_param: true,
      });
    });

    it('should use default values for optional parameters', async () => {
      const deviceId = 'test-device-id';
      const subscriptionLevel = 'premium';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      const result = await SubscriptionService.updateSubscription(deviceId, subscriptionLevel);

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_subscription', {
        device_id_param: deviceId,
        subscription_level_param: subscriptionLevel,
        expires_at_param: null,
        is_active_param: true,
      });
    });

    it('should handle database errors', async () => {
      const deviceId = 'test-device-id';
      const subscriptionLevel = 'premium';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null, {
        message: 'Database error',
        details: '',
        hint: '',
        code: '500'
      }));

      const result = await SubscriptionService.updateSubscription(deviceId, subscriptionLevel);

      expect(result).toBe(false);
    });
  });

  describe('handleAuthStateChange', () => {
    it('should handle auth state change successfully', async () => {
      const deviceId = 'test-device-id';
      const userId = 'test-user-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      // This method doesn't return a value, just logs
      await SubscriptionService.handleAuthStateChange(deviceId, userId);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_user_subscription_userid', {
        device_id_param: deviceId,
        new_user_id: userId,
      });
    });

    it('should handle user logout', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(true));

      await SubscriptionService.handleAuthStateChange(deviceId);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_user_subscription_userid', {
        device_id_param: deviceId,
        new_user_id: null,
      });
    });

    it('should handle errors gracefully', async () => {
      const deviceId = 'test-device-id';
      const userId = 'test-user-id';

      mockSupabase.rpc.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(SubscriptionService.handleAuthStateChange(deviceId, userId)).resolves.not.toThrow();
    });
  });

  describe('isPremiumUser', () => {
    it('should return true for standard subscription', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse({
        subscription_level: 'standard',
        is_active: true,
      }));

      const result = await SubscriptionService.isPremiumUser(deviceId);

      expect(result).toBe(true);
    });

    it('should return true for premium subscription', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse({
        subscription_level: 'premium',
        is_active: true,
      }));

      const result = await SubscriptionService.isPremiumUser(deviceId);

      expect(result).toBe(true);
    });

    it('should return false for free subscription', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse({
        subscription_level: 'free',
        is_active: true,
      }));

      const result = await SubscriptionService.isPremiumUser(deviceId);

      expect(result).toBe(false);
    });

    it('should return false when subscription status is null', async () => {
      const deviceId = 'test-device-id';

      mockSupabase.rpc.mockResolvedValue(createMockResponse(null, {
        message: 'Database error',
        details: '',
        hint: '',
        code: '500'
      }));

      const result = await SubscriptionService.isPremiumUser(deviceId);

      expect(result).toBe(false);
    });
  });

  describe('getSubscriptionDisplayName', () => {
    it('should return correct display names', () => {
      expect(SubscriptionService.getSubscriptionDisplayName('free')).toBe('Free');
      expect(SubscriptionService.getSubscriptionDisplayName('premium')).toBe('Premium');
      expect(SubscriptionService.getSubscriptionDisplayName('standard')).toBe('Standard');
      expect(SubscriptionService.getSubscriptionDisplayName('unknown')).toBe('Free');
    });
  });

  describe('formatExpirationDate', () => {
    it('should format date correctly', () => {
      const dateString = '2024-12-31T23:59:59Z';
      const result = SubscriptionService.formatExpirationDate(dateString);

      // Result depends on locale, just check it's a string
      expect(typeof result).toBe('string');
      expect(result).toContain('2024');
    });

    it('should return undefined for invalid date', () => {
      const result = SubscriptionService.formatExpirationDate('invalid-date');

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = SubscriptionService.formatExpirationDate(undefined);

      expect(result).toBeUndefined();
    });
  });
});