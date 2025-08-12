/**
 * Admin Notification Service
 * 
 * Secure service for sending push notifications from admin applications
 * Uses the secured send-push-notification edge function
 */

interface NotificationPayload {
  userId?: string
  userIds?: string[]
  title: string
  body: string
  data?: Record<string, any>
  type: string
}

interface NotificationResponse {
  message: string
  sent: number
  total: number
  details?: any[]
}

export class AdminNotificationService {
  private supabaseUrl: string
  private adminApiKey: string
  private anonKey: string
  
  constructor(supabaseUrl: string, adminApiKey: string, anonKey: string) {
    this.supabaseUrl = supabaseUrl
    this.adminApiKey = adminApiKey
    this.anonKey = anonKey
  }
  
  /**
   * Send notification to a single user
   */
  async sendToUser(
    userId: string, 
    title: string, 
    body: string, 
    type: string,
    data?: Record<string, any>
  ): Promise<NotificationResponse> {
    return this.sendNotification({
      userId,
      title,
      body,
      type,
      data
    })
  }
  
  /**
   * Send notification to multiple users
   */
  async sendToUsers(
    userIds: string[], 
    title: string, 
    body: string, 
    type: string,
    data?: Record<string, any>
  ): Promise<NotificationResponse> {
    return this.sendNotification({
      userIds,
      title,
      body,
      type,
      data
    })
  }
  
  /**
   * Send notification with full payload control
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResponse> {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/send-push-notification`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.anonKey}`,
            'X-API-Key': this.adminApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`)
      }
      
      return result
    } catch (error) {
      console.error('Failed to send notification:', error)
      throw error
    }
  }
  
  /**
   * Predefined notification types for common use cases
   */
  
  async sendOrderUpdate(userId: string, orderStatus: string, orderNumber?: string): Promise<NotificationResponse> {
    return this.sendToUser(
      userId,
      'Order Update',
      `Your order ${orderNumber ? `#${orderNumber} ` : ''}is now ${orderStatus}`,
      'order_update',
      { orderStatus, orderNumber }
    )
  }
  
  async sendSystemMaintenance(userIds: string[], maintenanceTime: string): Promise<NotificationResponse> {
    return this.sendToUsers(
      userIds,
      'System Maintenance',
      `Scheduled maintenance will begin ${maintenanceTime}`,
      'system_maintenance',
      { maintenanceTime }
    )
  }
  
  async sendNewFeatureAnnouncement(userIds: string[], featureName: string): Promise<NotificationResponse> {
    return this.sendToUsers(
      userIds,
      'New Feature Available',
      `Check out our new ${featureName} feature!`,
      'feature_announcement',
      { featureName }
    )
  }
  
  async sendSecurityAlert(userId: string, alertType: string): Promise<NotificationResponse> {
    return this.sendToUser(
      userId,
      'Security Alert',
      `Important security notice: ${alertType}`,
      'security_alert',
      { alertType }
    )
  }
}

// Example usage:
// const notificationService = new AdminNotificationService(
//   process.env.SUPABASE_URL!,
//   process.env.ADMIN_API_KEY!,
//   process.env.SUPABASE_ANON_KEY!
// )
// 
// await notificationService.sendOrderUpdate('user-id', 'shipped', '12345')
// await notificationService.sendToUsers(['user1', 'user2'], 'Welcome!', 'Thanks for joining', 'welcome')