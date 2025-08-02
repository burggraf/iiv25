import { PaymentService, SUBSCRIPTION_PRODUCT_IDS, PaymentProduct, PurchaseResult, RestoreResult } from '../paymentService';
import { SubscriptionService } from '../subscriptionService';
import { Platform, Alert } from 'react-native';
import * as RNIap from 'react-native-iap';
import { Product, ProductPurchase, SubscriptionPurchase } from 'react-native-iap';

// Mock react-native-iap
jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  getProducts: jest.fn(),
  requestSubscription: jest.fn(),
  purchaseUpdatedListener: jest.fn(),
  purchaseErrorListener: jest.fn(),
  finishTransaction: jest.fn(),
  getAvailablePurchases: jest.fn(),
  clearTransactionIOS: jest.fn(),
}));

// Mock SubscriptionService
jest.mock('../subscriptionService', () => ({
  SubscriptionService: {
    updateSubscription: jest.fn(),
  },
}));

// Mock Platform and Alert
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

const mockRNIap = RNIap as jest.Mocked<typeof RNIap>;
const mockSubscriptionService = SubscriptionService as jest.Mocked<typeof SubscriptionService>;

// Helper to create mock listener subscription
const mockSubscription = { remove: jest.fn() };

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset any static state
    (PaymentService as any).isInitialized = false;
    (PaymentService as any).products = [];
    (PaymentService as any).purchaseUpdateSubscription = null;
    (PaymentService as any).purchaseErrorSubscription = null;
  });

  describe('Product IDs', () => {
    it('should have correct subscription product IDs', () => {
      expect(SUBSCRIPTION_PRODUCT_IDS.MONTHLY).toBe('isitvegan_premium_monthly');
      expect(SUBSCRIPTION_PRODUCT_IDS.QUARTERLY).toBe('isitvegan_premium_quarterly');
      expect(SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL).toBe('isitvegan_premium_semiannual');
      expect(SUBSCRIPTION_PRODUCT_IDS.ANNUAL).toBe('isitvegan_premium_annual');
      expect(SUBSCRIPTION_PRODUCT_IDS.LIFETIME).toBe('isitvegan_premium_lifetime');
    });
  });

  describe('initialize', () => {
    it('should successfully initialize payment service', async () => {
      const mockProducts: Product[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.MONTHLY,
          title: 'Monthly Premium',
          description: 'Monthly subscription',
          price: '$1.99',
          localizedPrice: '$1.99',
          currency: 'USD',
          type: 'iap',
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
      ];

      mockRNIap.initConnection.mockResolvedValue(true);
      mockRNIap.getProducts.mockResolvedValue(mockProducts);
      mockRNIap.purchaseUpdatedListener.mockReturnValue(mockSubscription as any);
      mockRNIap.purchaseErrorListener.mockReturnValue(mockSubscription as any);

      const result = await PaymentService.initialize();

      expect(result).toBe(true);
      expect(mockRNIap.initConnection).toHaveBeenCalled();
      expect(mockRNIap.getProducts).toHaveBeenCalledWith({
        skus: Object.values(SUBSCRIPTION_PRODUCT_IDS),
      });
      expect(mockRNIap.purchaseUpdatedListener).toHaveBeenCalled();
      expect(mockRNIap.purchaseErrorListener).toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
      mockRNIap.initConnection.mockRejectedValue(new Error('Connection failed'));

      const result = await PaymentService.initialize();

      expect(result).toBe(false);
      expect(mockRNIap.initConnection).toHaveBeenCalled();
    });

    it('should handle Android products loading', async () => {
      (Platform as any).OS = 'android';
      
      const mockProducts: Product[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.ANNUAL,
          title: 'Annual Premium',
          price: '$9.99',
          type: 'iap', // Use 'iap' instead of 'subs' for subscription products
          description: 'Annual subscription',
          localizedPrice: '$9.99',
          currency: 'USD',
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
      ];

      mockRNIap.initConnection.mockResolvedValue(true);
      mockRNIap.getProducts.mockResolvedValue(mockProducts);
      mockRNIap.purchaseUpdatedListener.mockReturnValue(mockSubscription as any);
      mockRNIap.purchaseErrorListener.mockReturnValue(mockSubscription as any);

      const result = await PaymentService.initialize();

      expect(result).toBe(true);
      expect(mockRNIap.getProducts).toHaveBeenCalledWith({
        skus: Object.values(SUBSCRIPTION_PRODUCT_IDS),
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup payment service properly', async () => {
      // Set up initial state
      (PaymentService as any).isInitialized = true;
      (PaymentService as any).purchaseUpdateSubscription = mockSubscription;
      (PaymentService as any).purchaseErrorSubscription = mockSubscription;

      await PaymentService.cleanup();

      expect(mockSubscription.remove).toHaveBeenCalledTimes(2);
      expect(mockRNIap.endConnection).toHaveBeenCalled();
      expect((PaymentService as any).isInitialized).toBe(false);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockRNIap.endConnection.mockRejectedValue(new Error('Cleanup failed'));

      await expect(PaymentService.cleanup()).resolves.not.toThrow();
    });
  });

  describe('loadProducts', () => {
    it('should load and format products correctly', async () => {
      const mockProducts: Product[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.MONTHLY,
          title: 'Monthly Premium',
          description: 'Monthly subscription',
          price: '$1.99',
          localizedPrice: '$1.99',
          currency: 'USD',
          type: 'iap',
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.LIFETIME,
          title: 'Lifetime Premium',
          description: 'Lifetime access',
          price: '$19.99',
          localizedPrice: '$19.99',
          currency: 'USD',
          type: 'iap',
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
      ];

      mockRNIap.getProducts.mockResolvedValue(mockProducts);

      const result = await PaymentService.loadProducts();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        productId: SUBSCRIPTION_PRODUCT_IDS.MONTHLY,
        title: 'Monthly Premium',
        description: 'Monthly subscription',
        price: '$1.99',
        localizedPrice: '$1.99',
        currency: 'USD',
        duration: 'per month',
      });
      expect(result[1]).toEqual({
        productId: SUBSCRIPTION_PRODUCT_IDS.LIFETIME,
        title: 'Lifetime Premium',
        description: 'Lifetime access',
        price: '$19.99',
        localizedPrice: '$19.99',
        currency: 'USD',
        duration: 'one-time payment',
        savings: 'Best value',
      });
    });

    it('should handle product loading failure', async () => {
      mockRNIap.getProducts.mockRejectedValue(new Error('Failed to load products'));

      const result = await PaymentService.loadProducts();

      expect(result).toEqual([]);
    });

    it('should provide fallback titles and descriptions', async () => {
      const mockProducts: Product[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.QUARTERLY,
          title: '',
          description: '',
          price: '$4.99',
          localizedPrice: '$4.99',
          currency: 'USD',
          type: 'iap', // Use 'iap' instead of 'subs' for subscription products
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
      ];

      mockRNIap.getProducts.mockResolvedValue(mockProducts);

      const result = await PaymentService.loadProducts();

      expect(result[0].title).toBe('3-Month Premium');
      expect(result[0].description).toContain('Save 17%');
      expect(result[0].duration).toBe('per 3 months');
      expect(result[0].savings).toBe('Save 17%');
    });
  });

  describe('purchaseSubscription', () => {
    beforeEach(() => {
      (PaymentService as any).isInitialized = true;
    });

    it('should initiate subscription purchase successfully', async () => {
      const deviceId = 'test-device-id';
      const productId = SUBSCRIPTION_PRODUCT_IDS.MONTHLY;

      mockRNIap.clearTransactionIOS.mockResolvedValue(undefined as any);
      mockRNIap.requestSubscription.mockResolvedValue(undefined as any);

      const result = await PaymentService.purchaseSubscription(productId, deviceId);

      expect(result.success).toBe(true);
      expect(result.productId).toBe(productId);
      expect(mockRNIap.clearTransactionIOS).toHaveBeenCalled();
      expect(mockRNIap.requestSubscription).toHaveBeenCalledWith({ sku: productId });
    });

    it('should not clear transactions on Android', async () => {
      (Platform as any).OS = 'android';
      
      const deviceId = 'test-device-id';
      const productId = SUBSCRIPTION_PRODUCT_IDS.ANNUAL;

      mockRNIap.requestSubscription.mockResolvedValue(undefined as any);

      const result = await PaymentService.purchaseSubscription(productId, deviceId);

      expect(result.success).toBe(true);
      expect(mockRNIap.clearTransactionIOS).not.toHaveBeenCalled();
      expect(mockRNIap.requestSubscription).toHaveBeenCalledWith({ sku: productId });
    });

    it('should handle purchase initiation failure', async () => {
      const deviceId = 'test-device-id';
      const productId = SUBSCRIPTION_PRODUCT_IDS.LIFETIME;

      mockRNIap.requestSubscription.mockRejectedValue(new Error('Purchase failed'));

      const result = await PaymentService.purchaseSubscription(productId, deviceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Purchase failed');
    });

    it('should fail if not initialized', async () => {
      (PaymentService as any).isInitialized = false;
      
      const deviceId = 'test-device-id';
      const productId = SUBSCRIPTION_PRODUCT_IDS.MONTHLY;

      const result = await PaymentService.purchaseSubscription(productId, deviceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment service not initialized');
    });
  });

  describe('restorePurchases', () => {
    beforeEach(() => {
      (PaymentService as any).isInitialized = true;
    });

    it('should restore purchases successfully', async () => {
      const deviceId = 'test-device-id';
      const mockPurchases: SubscriptionPurchase[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.ANNUAL,
          transactionId: 'txn-123',
          transactionDate: Date.now(), // Should be a number, not a string
          transactionReceipt: 'receipt-123',
          purchaseToken: 'token-123',
          dataAndroid: '{}',
          signatureAndroid: 'signature',
          isAcknowledgedAndroid: true,
          originalTransactionDateIOS: Date.now(), // Should be a number, not a string
          originalTransactionIdentifierIOS: '',
          developerPayloadAndroid: '',
          obfuscatedAccountIdAndroid: '',
          obfuscatedProfileIdAndroid: '',
          autoRenewingAndroid: true,
        },
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.LIFETIME,
          transactionId: 'txn-456',
          transactionDate: Date.now(), // Should be a number, not a string
          transactionReceipt: 'receipt-456',
          purchaseToken: 'token-456',
          dataAndroid: '{}',
          signatureAndroid: 'signature',
          isAcknowledgedAndroid: true,
          originalTransactionDateIOS: Date.now(), // Should be a number, not a string
          originalTransactionIdentifierIOS: '',
          developerPayloadAndroid: '',
          obfuscatedAccountIdAndroid: '',
          obfuscatedProfileIdAndroid: '',
          autoRenewingAndroid: true,
        },
      ];

      mockRNIap.getAvailablePurchases.mockResolvedValue(mockPurchases as any);
      mockSubscriptionService.updateSubscription.mockResolvedValue(true);

      const result = await PaymentService.restorePurchases(deviceId);

      expect(result.success).toBe(true);
      expect(result.restoredCount).toBe(2);
      expect(result.activeSubscriptions).toEqual([
        SUBSCRIPTION_PRODUCT_IDS.ANNUAL,
        SUBSCRIPTION_PRODUCT_IDS.LIFETIME,
      ]);
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalled();
    });

    it('should handle restore failure', async () => {
      const deviceId = 'test-device-id';

      mockRNIap.getAvailablePurchases.mockRejectedValue(new Error('Restore failed'));

      const result = await PaymentService.restorePurchases(deviceId);

      expect(result.success).toBe(false);
      expect(result.restoredCount).toBe(0);
      expect(result.activeSubscriptions).toEqual([]);
      expect(result.error).toBe('Restore failed');
    });

    it('should fail if not initialized', async () => {
      (PaymentService as any).isInitialized = false;
      
      const deviceId = 'test-device-id';

      const result = await PaymentService.restorePurchases(deviceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment service not initialized');
    });

    it('should handle empty purchase list', async () => {
      const deviceId = 'test-device-id';

      mockRNIap.getAvailablePurchases.mockResolvedValue([]);

      const result = await PaymentService.restorePurchases(deviceId);

      expect(result.success).toBe(true);
      expect(result.restoredCount).toBe(0);
      expect(result.activeSubscriptions).toEqual([]);
    });
  });

  describe('getAvailableProducts', () => {
    it('should return cached products if available', async () => {
      const mockProducts: PaymentProduct[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.MONTHLY,
          title: 'Monthly',
          description: 'Monthly subscription',
          price: '$1.99',
          localizedPrice: '$1.99',
          currency: 'USD',
          duration: 'per month',
        },
      ];

      (PaymentService as any).products = [{
        productId: SUBSCRIPTION_PRODUCT_IDS.MONTHLY,
        title: 'Monthly',
        price: '$1.99',
        localizedPrice: '$1.99',
        currency: 'USD',
        type: 'iap',
        description: 'Monthly subscription',
        introductoryPrice: '',
        introductoryPriceAsAmountIOS: '',
        introductoryPricePaymentModeIOS: '',
        introductoryPriceNumberOfPeriodsIOS: '',
        introductoryPriceSubscriptionPeriodIOS: '',
        subscriptionPeriodNumberIOS: '',
        subscriptionPeriodUnitIOS: '',
        countryCode: 'US',
      }];

      const result = await PaymentService.getAvailableProducts();

      expect(result).toHaveLength(1);
      expect(mockRNIap.getProducts).not.toHaveBeenCalled();
    });

    it('should load products if cache is empty', async () => {
      const mockProducts: Product[] = [
        {
          productId: SUBSCRIPTION_PRODUCT_IDS.ANNUAL,
          title: 'Annual',
          description: 'Annual subscription',
          price: '$9.99',
          localizedPrice: '$9.99',
          currency: 'USD',
          type: 'iap', // Use 'iap' instead of 'subs' for subscription products
          // introductoryPrice: '', // This property doesn't exist on Product type
          // introductoryPriceAsAmountIOS: '', // This property doesn't exist on Product type
          // introductoryPricePaymentModeIOS: '', // This property doesn't exist on Product type
          // introductoryPriceNumberOfPeriodsIOS: '', // This property doesn't exist on Product type
          // introductoryPriceSubscriptionPeriodIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodNumberIOS: '', // This property doesn't exist on Product type
          // subscriptionPeriodUnitIOS: '', // This property doesn't exist on Product type
          countryCode: 'US',
        },
      ];

      (PaymentService as any).products = [];
      mockRNIap.getProducts.mockResolvedValue(mockProducts);

      const result = await PaymentService.getAvailableProducts();

      expect(result).toHaveLength(1);
      expect(mockRNIap.getProducts).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when initialized', () => {
      (PaymentService as any).isInitialized = true;

      expect(PaymentService.isAvailable()).toBe(true);
    });

    it('should return false when not initialized', () => {
      (PaymentService as any).isInitialized = false;

      expect(PaymentService.isAvailable()).toBe(false);
    });
  });

  describe('showSubscriptionManagement', () => {
    it('should show iOS subscription management alert', () => {
      (Platform as any).OS = 'ios';

      PaymentService.showSubscriptionManagement();

      expect(Alert.alert).toHaveBeenCalledWith(
        'Manage Subscription',
        'To manage your subscription, go to Settings > Apple ID > Subscriptions on your device.',
        [{ text: 'OK' }]
      );
    });

    it('should show Android subscription management alert', () => {
      (Platform as any).OS = 'android';

      PaymentService.showSubscriptionManagement();

      expect(Alert.alert).toHaveBeenCalledWith(
        'Manage Subscription',
        'To manage your subscription, open the Google Play Store app and go to Menu > Subscriptions.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('getSubscriptionInfo', () => {
    it('should return correct subscription info for each product', () => {
      const getSubscriptionInfo = (PaymentService as any).getSubscriptionInfo;

      expect(getSubscriptionInfo(SUBSCRIPTION_PRODUCT_IDS.MONTHLY)).toEqual({
        level: 'premium',
        duration: 30,
      });

      expect(getSubscriptionInfo(SUBSCRIPTION_PRODUCT_IDS.QUARTERLY)).toEqual({
        level: 'premium',
        duration: 90,
      });

      expect(getSubscriptionInfo(SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL)).toEqual({
        level: 'premium',
        duration: 180,
      });

      expect(getSubscriptionInfo(SUBSCRIPTION_PRODUCT_IDS.ANNUAL)).toEqual({
        level: 'premium',
        duration: 365,
      });

      expect(getSubscriptionInfo(SUBSCRIPTION_PRODUCT_IDS.LIFETIME)).toEqual({
        level: 'premium',
        duration: -1,
      });

      expect(getSubscriptionInfo('unknown-product')).toBeNull();
    });
  });

  describe('calculateExpirationDate', () => {
    it('should calculate correct expiration dates', () => {
      const calculateExpirationDate = (PaymentService as any).calculateExpirationDate;
      const mockPurchase = {
        transactionDate: '1640995200000', // Jan 1, 2022
      };

      // 30-day subscription
      const monthly = calculateExpirationDate(mockPurchase, 30);
      expect(monthly).toEqual(new Date('2022-01-31T00:00:00.000Z'));

      // 365-day subscription
      const annual = calculateExpirationDate(mockPurchase, 365);
      expect(annual).toEqual(new Date('2023-01-01T00:00:00.000Z'));

      // Lifetime subscription
      const lifetime = calculateExpirationDate(mockPurchase, -1);
      expect(lifetime).toBeUndefined();
    });

    it('should handle missing transaction date', () => {
      const calculateExpirationDate = (PaymentService as any).calculateExpirationDate;
      const mockPurchase = {};

      const result = calculateExpirationDate(mockPurchase, 30);
      
      // Should use current date
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('purchase event handling', () => {
    it('should set up purchase listeners correctly', async () => {
      mockRNIap.initConnection.mockResolvedValue(true);
      mockRNIap.getProducts.mockResolvedValue([]);
      mockRNIap.purchaseUpdatedListener.mockReturnValue(mockSubscription as any);
      mockRNIap.purchaseErrorListener.mockReturnValue(mockSubscription as any);

      await PaymentService.initialize();

      expect(mockRNIap.purchaseUpdatedListener).toHaveBeenCalled();
      expect(mockRNIap.purchaseErrorListener).toHaveBeenCalled();
    });
  });
});