import { BackgroundJob } from '../types/backgroundJobs';
import { backgroundQueueService } from './backgroundQueueService';

type JobEventType = 'job_added' | 'job_updated' | 'job_completed' | 'job_failed' | 'jobs_cleared';
type JobEventCallback = (event: JobEventType, job?: BackgroundJob) => void;

interface EventSubscription {
  id: string;
  callback: JobEventCallback;
  subscribedAt: Date;
}

/**
 * Central event manager to consolidate all background job event subscriptions
 * This replaces multiple overlapping subscriptions that were causing memory leaks and performance issues
 */
class JobEventManager {
  private static instance: JobEventManager;
  private isInitialized = false;
  private subscriptions = new Map<string, EventSubscription>();
  private unsubscribeFromBackground?: () => void;
  private eventCallCount = 0;
  private lastEventTime = 0;
  private cleanupIntervalId?: any;
  private pendingSubscriptions: Array<{ subscriberId: string; callback: JobEventCallback }> = [];

  private constructor() {}

  public static getInstance(): JobEventManager {
    if (!JobEventManager.instance) {
      JobEventManager.instance = new JobEventManager();
    }
    return JobEventManager.instance;
  }

  /**
   * Initialize the central event manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🎯 [JobEventManager] Already initialized');
      return;
    }

    if (__DEV__) {
      console.log('🚀 [JobEventManager] Initializing central job event manager');
    }

    // Subscribe to background queue service ONCE
    this.unsubscribeFromBackground = backgroundQueueService.subscribeToJobUpdates(
      this.handleBackgroundJobEvent.bind(this)
    );

    this.isInitialized = true;
    
    // Process any pending subscriptions
    if (this.pendingSubscriptions.length > 0) {
      if (__DEV__) console.log(`📡 [JobEventManager] Processing ${this.pendingSubscriptions.length} pending subscriptions`);
      
      this.pendingSubscriptions.forEach(pending => {
        const subscription: EventSubscription = {
          id: pending.subscriberId,
          callback: pending.callback,
          subscribedAt: new Date()
        };
        this.subscriptions.set(pending.subscriberId, subscription);
      });
      
      this.pendingSubscriptions = []; // Clear pending queue
      
      if (__DEV__) console.log(`📡 [JobEventManager] Processed pending subscriptions, now have ${this.subscriptions.size} total`);
    }
    
    // Set up automatic cleanup of stale subscriptions every 10 minutes
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleSubscriptions();
    }, 10 * 60 * 1000);
    
    if (__DEV__) {
      console.log('✅ [JobEventManager] Central event manager initialized with auto-cleanup');
    }
  }

  /**
   * Subscribe to job events with automatic cleanup
   */
  public subscribe(subscriberId: string, callback: JobEventCallback): () => void {
    if (!this.isInitialized) {
      // Queue the subscription until initialization is complete
      if (__DEV__) console.log(`📡 [JobEventManager] Queueing subscription for ${subscriberId} (not initialized yet)`);
      this.pendingSubscriptions.push({ subscriberId, callback });
      
      // Return unsubscribe function that works even for pending subscriptions
      return () => {
        this.unsubscribe(subscriberId);
        // Also remove from pending queue if still there
        this.pendingSubscriptions = this.pendingSubscriptions.filter(p => p.subscriberId !== subscriberId);
      };
    }

    const subscription: EventSubscription = {
      id: subscriberId,
      callback,
      subscribedAt: new Date()
    };

    this.subscriptions.set(subscriberId, subscription);

    if (__DEV__) {
      console.log(`📡 [JobEventManager] New subscription: ${subscriberId} (${this.subscriptions.size} total)`);
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(subscriberId);
    };
  }

  /**
   * Unsubscribe from job events
   */
  public unsubscribe(subscriberId: string): void {
    const existed = this.subscriptions.delete(subscriberId);
    
    if (__DEV__ && existed) {
      console.log(`📡 [JobEventManager] Unsubscribed: ${subscriberId} (${this.subscriptions.size} remaining)`);
    }
  }

  /**
   * Handle background job events and distribute to subscribers
   */
  private handleBackgroundJobEvent(event: string, job?: BackgroundJob): void {
    this.eventCallCount++;
    this.lastEventTime = Date.now();

    // Throttle logging in production
    if (__DEV__) {
      console.log(`🎯 [JobEventManager] Event: ${event} | Subscribers: ${this.subscriptions.size} | Job: ${job?.id?.slice(-6) || 'none'}`);
    } else if (this.eventCallCount % 10 === 0) {
      // Only log every 10th event in production
      console.log(`🎯 [JobEventManager] Processed ${this.eventCallCount} events (${this.subscriptions.size} subscribers)`);
    }

    // Distribute event to all subscribers
    this.subscriptions.forEach((subscription, subscriberId) => {
      try {
        subscription.callback(event as JobEventType, job);
      } catch (error) {
        console.error(`❌ [JobEventManager] Error in subscriber ${subscriberId}:`, error);
        // Don't let one subscriber's error affect others
      }
    });
  }

  /**
   * Get statistics about the event manager
   */
  public getStats(): {
    isInitialized: boolean;
    subscriberCount: number;
    totalEventsProcessed: number;
    lastEventTime: number;
    subscribers: string[];
  } {
    return {
      isInitialized: this.isInitialized,
      subscriberCount: this.subscriptions.size,
      totalEventsProcessed: this.eventCallCount,
      lastEventTime: this.lastEventTime,
      subscribers: Array.from(this.subscriptions.keys())
    };
  }

  /**
   * Cleanup all resources - should be called on app shutdown
   */
  public cleanup(): void {
    if (this.unsubscribeFromBackground) {
      this.unsubscribeFromBackground();
      this.unsubscribeFromBackground = undefined;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }

    this.subscriptions.clear();
    this.pendingSubscriptions = [];
    this.isInitialized = false;
    this.eventCallCount = 0;
    this.lastEventTime = 0;

    if (__DEV__) {
      console.log('🧹 [JobEventManager] Cleaned up all resources');
    }
  }

  /**
   * Remove stale subscriptions (subscribers that haven't been active for a long time)
   */
  public cleanupStaleSubscriptions(maxAgeMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let removedCount = 0;

    this.subscriptions.forEach((subscription, subscriberId) => {
      const age = now - subscription.subscribedAt.getTime();
      if (age > maxAgeMs) {
        this.subscriptions.delete(subscriberId);
        removedCount++;
      }
    });

    if (__DEV__ && removedCount > 0) {
      console.log(`🧹 [JobEventManager] Removed ${removedCount} stale subscriptions`);
    }

    return removedCount;
  }
}

// Export singleton instance
export const jobEventManager = JobEventManager.getInstance();
export default jobEventManager;