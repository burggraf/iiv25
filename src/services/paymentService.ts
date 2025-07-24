import {
  initConnection,
  endConnection,
  getProducts,
  requestSubscription,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
  clearTransactionIOS,
  Product,
  Subscription,
  SubscriptionPurchase,
  ProductPurchase,
  PurchaseError,
} from 'react-native-iap';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { SubscriptionService } from './subscriptionService';

// Product IDs for different subscription tiers
export const SUBSCRIPTION_PRODUCT_IDS = {
  MONTHLY: 'isitvegan_standard_monthly',
  QUARTERLY: 'isitvegan_standard_quarterly', 
  SEMIANNUAL: 'isitvegan_standard_semiannual',
  ANNUAL: 'isitvegan_standard_annual',
  LIFETIME: 'isitvegan_standard_lifetime',
} as const;

export type SubscriptionProductId = typeof SUBSCRIPTION_PRODUCT_IDS[keyof typeof SUBSCRIPTION_PRODUCT_IDS];

export interface PaymentProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  localizedPrice: string;
  currency: string;
  duration: string;
  savings?: string;
}

export interface PurchaseResult {
  success: boolean;
  productId?: string;
  transactionId?: string;
  error?: string;
  subscription?: {
    level: string;
    expiresAt: Date;
  };
}

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  activeSubscriptions: string[];
  error?: string;
}

export class PaymentService {
  private static isInitialized = false;
  private static purchaseUpdateSubscription: any = null;
  private static purchaseErrorSubscription: any = null;
  private static products: Product[] = [];

  /**
   * Initialize the payment service
   */
  static async initialize(): Promise<boolean> {
    // Check if running in Expo Go - IAP is not supported
    if (Constants.executionEnvironment === 'storeClient') {
      console.log('PaymentService: Running in Expo Go - IAP not supported');
      this.isInitialized = false;
      return false;
    }

    try {
      console.log('PaymentService: Initializing IAP connection...');
      
      const connectionResult = await initConnection();
      console.log('PaymentService: IAP connection result:', connectionResult);
      
      // Set up purchase listeners
      this.setupPurchaseListeners();
      
      // Load available products
      await this.loadProducts();
      
      this.isInitialized = true;
      console.log('PaymentService: Successfully initialized');
      return true;
    } catch (error: any) {
      console.warn('PaymentService: Failed to initialize IAP:', error?.message || error);
      
      // Handle specific IAP errors gracefully
      if (error?.code === 'E_IAP_NOT_AVAILABLE') {
        console.warn('PaymentService: IAP not available on this device/simulator');
      } else if (error?.message?.includes('E_IAP_NOT_AVAILABLE')) {
        console.warn('PaymentService: IAP not available on this device/simulator');
      } else {
        console.warn('PaymentService: IAP initialization failed:', error?.message || error);
      }
      
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Clean up the payment service
   */
  static async cleanup(): Promise<void> {
    try {
      console.log('PaymentService: Cleaning up...');
      
      // Remove listeners
      if (this.purchaseUpdateSubscription) {
        this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
      }
      
      if (this.purchaseErrorSubscription) {
        this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      
      // End IAP connection
      await endConnection();
      
      this.isInitialized = false;
      console.log('PaymentService: Cleanup completed');
    } catch (error) {
      console.error('PaymentService: Error during cleanup:', error);
    }
  }

  /**
   * Set up purchase event listeners
   */
  private static setupPurchaseListeners(): void {
    console.log('PaymentService: Setting up purchase listeners...');
    
    // Purchase success listener
    this.purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase) => {
      console.log('PaymentService: Purchase updated:', purchase);
      
      try {
        // Verify and process the purchase
        await this.processPurchase(purchase);
        
        // Finish the transaction
        await finishTransaction({ purchase, isConsumable: false });
        
        console.log('PaymentService: Purchase processed successfully');
      } catch (error) {
        console.error('PaymentService: Error processing purchase:', error);
        // Still finish the transaction to avoid stuck purchases
        try {
          await finishTransaction({ purchase, isConsumable: false });
        } catch (finishError) {
          console.error('PaymentService: Error finishing transaction:', finishError);
        }
      }
    });

    // Purchase error listener
    this.purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
      console.log('PaymentService: Purchase error:', error);
      
      // Handle specific error cases
      if (error.code === 'E_USER_CANCELLED') {
        console.log('PaymentService: User cancelled purchase');
      } else if (error.code && error.code.toString() === 'E_PAYMENT_INVALID') {
        console.log('PaymentService: Invalid payment method');
      } else {
        console.error('PaymentService: Purchase failed with error:', error.message);
      }
    });
  }

  /**
   * Load available subscription products
   */
  static async loadProducts(): Promise<PaymentProduct[]> {
    try {
      console.log('PaymentService: Loading subscription products...');
      
      const productIds = Object.values(SUBSCRIPTION_PRODUCT_IDS);
      
      if (Platform.OS === 'ios') {
        const products = await getProducts({ skus: productIds });
        this.products = products;
        console.log('PaymentService: Loaded iOS products:', products);
      } else {
        // Android subscriptions
        const subscriptions = await getProducts({ skus: productIds });
        this.products = subscriptions;
        console.log('PaymentService: Loaded Android subscriptions:', subscriptions);
      }
      
      return this.formatProducts(this.products);
    } catch (error) {
      console.error('PaymentService: Failed to load products:', error);
      return [];
    }
  }

  /**
   * Format IAP products into our PaymentProduct interface
   */
  private static formatProducts(products: Product[]): PaymentProduct[] {
    return products.map(product => {
      let duration = '';
      let savings = '';
      
      // Map product IDs to user-friendly information
      switch (product.productId) {
        case SUBSCRIPTION_PRODUCT_IDS.MONTHLY:
          duration = 'per month';
          break;
        case SUBSCRIPTION_PRODUCT_IDS.QUARTERLY:
          duration = 'per 3 months';
          savings = 'Save 17%';
          break;
        case SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL:
          duration = 'per 6 months';
          savings = 'Save 42%';
          break;
        case SUBSCRIPTION_PRODUCT_IDS.ANNUAL:
          duration = 'per year';
          savings = 'Save 58%';
          break;
        case SUBSCRIPTION_PRODUCT_IDS.LIFETIME:
          duration = 'one-time payment';
          savings = 'Best value';
          break;
      }

      return {
        productId: product.productId,
        title: product.title || this.getProductTitle(product.productId),
        description: product.description || this.getProductDescription(product.productId),
        price: product.price || '0',
        localizedPrice: product.localizedPrice || product.price || '0',
        currency: product.currency || 'USD',
        duration,
        savings: savings || undefined,
      };
    });
  }

  /**
   * Get fallback product titles
   */
  private static getProductTitle(productId: string): string {
    switch (productId) {
      case SUBSCRIPTION_PRODUCT_IDS.MONTHLY:
        return 'Monthly Premium';
      case SUBSCRIPTION_PRODUCT_IDS.QUARTERLY:
        return '3-Month Premium';
      case SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL:
        return '6-Month Premium';
      case SUBSCRIPTION_PRODUCT_IDS.ANNUAL:
        return 'Annual Premium';
      case SUBSCRIPTION_PRODUCT_IDS.LIFETIME:
        return 'Lifetime Premium';
      default:
        return 'Premium Subscription';
    }
  }

  /**
   * Get fallback product descriptions
   */
  private static getProductDescription(productId: string): string {
    const baseDescription = 'Unlimited product scans and ingredient searches with no advertisements';
    
    switch (productId) {
      case SUBSCRIPTION_PRODUCT_IDS.QUARTERLY:
        return `${baseDescription} - Save 17%`;
      case SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL:
        return `${baseDescription} - Save 42%`;
      case SUBSCRIPTION_PRODUCT_IDS.ANNUAL:
        return `${baseDescription} - Save 58%`;
      case SUBSCRIPTION_PRODUCT_IDS.LIFETIME:
        return `${baseDescription} - Pay once, use forever`;
      default:
        return baseDescription;
    }
  }

  /**
   * Purchase a subscription
   */
  static async purchaseSubscription(
    productId: SubscriptionProductId,
    deviceId: string
  ): Promise<PurchaseResult> {
    try {
      console.log('PaymentService: Initiating purchase for:', productId);
      
      if (!this.isInitialized) {
        throw new Error('Payment service not initialized');
      }

      // Clear any pending iOS transactions first
      if (Platform.OS === 'ios') {
        await clearTransactionIOS();
      }

      // Request the subscription purchase
      await requestSubscription({ sku: productId });
      
      // Note: The actual purchase processing happens in the purchase listener
      // This method initiates the purchase flow
      console.log('PaymentService: Purchase flow initiated for:', productId);
      
      return {
        success: true,
        productId,
      };
    } catch (error: any) {
      console.error('PaymentService: Purchase failed:', error);
      
      return {
        success: false,
        error: error.message || 'Purchase failed',
      };
    }
  }

  /**
   * Process a completed purchase
   */
  private static async processPurchase(
    purchase: SubscriptionPurchase | ProductPurchase
  ): Promise<void> {
    try {
      console.log('PaymentService: Processing purchase:', purchase.productId);
      
      // Determine subscription level and expiration based on product ID
      const subscriptionInfo = this.getSubscriptionInfo(purchase.productId);
      
      if (!subscriptionInfo) {
        throw new Error(`Unknown product ID: ${purchase.productId}`);
      }
      
      // Update subscription in database
      // Note: We'll need the device ID from the purchase context
      // For now, we'll store the purchase info and let the app update the subscription
      console.log('PaymentService: Purchase processed for:', subscriptionInfo);
      
      // Store purchase info for the app to pick up
      await this.storePurchaseInfo(purchase, subscriptionInfo);
      
    } catch (error) {
      console.error('PaymentService: Error processing purchase:', error);
      throw error;
    }
  }

  /**
   * Get subscription information from product ID
   */
  private static getSubscriptionInfo(productId: string): { level: string; duration: number } | null {
    switch (productId) {
      case SUBSCRIPTION_PRODUCT_IDS.MONTHLY:
        return { level: 'premium', duration: 30 };
      case SUBSCRIPTION_PRODUCT_IDS.QUARTERLY:
        return { level: 'premium', duration: 90 };
      case SUBSCRIPTION_PRODUCT_IDS.SEMIANNUAL:
        return { level: 'premium', duration: 180 };
      case SUBSCRIPTION_PRODUCT_IDS.ANNUAL:
        return { level: 'premium', duration: 365 };
      case SUBSCRIPTION_PRODUCT_IDS.LIFETIME:
        return { level: 'premium', duration: -1 }; // -1 indicates lifetime
      default:
        return null;
    }
  }

  /**
   * Store purchase information for app to process
   */
  private static async storePurchaseInfo(
    purchase: SubscriptionPurchase | ProductPurchase,
    subscriptionInfo: { level: string; duration: number }
  ): Promise<void> {
    // This could be stored in AsyncStorage or sent to a webhook
    // For now, just log it - the app will handle the subscription update
    console.log('PaymentService: Storing purchase info:', {
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      subscriptionInfo,
      purchaseTime: purchase.transactionDate,
    });
  }

  /**
   * Restore previous purchases
   */
  static async restorePurchases(deviceId: string): Promise<RestoreResult> {
    try {
      console.log('PaymentService: Restoring purchases...');
      
      if (!this.isInitialized) {
        throw new Error('Payment service not initialized');
      }

      const purchases = await getAvailablePurchases();
      console.log('PaymentService: Found purchases:', purchases);
      
      const activeSubscriptions: string[] = [];
      let latestSubscription: { productId: string; expiresAt?: Date } | null = null;
      
      // Process each purchase
      for (const purchase of purchases) {
        const subscriptionInfo = this.getSubscriptionInfo(purchase.productId);
        
        if (subscriptionInfo) {
          activeSubscriptions.push(purchase.productId);
          
          // For lifetime subscriptions or active subscriptions, update the database
          if (subscriptionInfo.duration === -1 || this.isSubscriptionActive(purchase)) {
            latestSubscription = {
              productId: purchase.productId,
              expiresAt: this.calculateExpirationDate(purchase, subscriptionInfo.duration),
            };
          }
        }
      }
      
      // Update the subscription in the database if we found an active one
      if (latestSubscription && deviceId) {
        const subscriptionInfo = this.getSubscriptionInfo(latestSubscription.productId);
        if (subscriptionInfo) {
          await SubscriptionService.updateSubscription(
            deviceId,
            subscriptionInfo.level,
            latestSubscription.expiresAt,
            true
          );
        }
      }
      
      console.log('PaymentService: Restore completed:', {
        restoredCount: purchases.length,
        activeSubscriptions,
      });
      
      return {
        success: true,
        restoredCount: purchases.length,
        activeSubscriptions,
      };
    } catch (error: any) {
      console.error('PaymentService: Restore failed:', error);
      
      return {
        success: false,
        restoredCount: 0,
        activeSubscriptions: [],
        error: error.message || 'Restore failed',
      };
    }
  }

  /**
   * Check if a subscription is currently active
   */
  private static isSubscriptionActive(purchase: SubscriptionPurchase | ProductPurchase): boolean {
    // For simplicity, we'll consider all restored purchases as potentially active
    // In a real implementation, you'd check the expiration date from the receipt
    return true;
  }

  /**
   * Calculate expiration date for a subscription
   */
  private static calculateExpirationDate(
    purchase: SubscriptionPurchase | ProductPurchase,
    durationDays: number
  ): Date | undefined {
    if (durationDays === -1) {
      // Lifetime subscription - no expiration
      return undefined;
    }
    
    const purchaseDate = purchase.transactionDate ? new Date(typeof purchase.transactionDate === 'string' ? parseInt(purchase.transactionDate) : purchase.transactionDate) : new Date();
    const expirationDate = new Date(purchaseDate);
    expirationDate.setDate(expirationDate.getDate() + durationDays);
    
    return expirationDate;
  }

  /**
   * Get available products (formatted for UI)
   */
  static async getAvailableProducts(): Promise<PaymentProduct[]> {
    if (this.products.length === 0) {
      await this.loadProducts();
    }
    
    return this.formatProducts(this.products);
  }

  /**
   * Check if payment service is available
   */
  static isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Show platform-specific subscription management
   */
  static showSubscriptionManagement(): void {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Manage Subscription',
        'To manage your subscription, go to Settings > Apple ID > Subscriptions on your device.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Manage Subscription',
        'To manage your subscription, open the Google Play Store app and go to Menu > Subscriptions.',
        [{ text: 'OK' }]
      );
    }
  }
}