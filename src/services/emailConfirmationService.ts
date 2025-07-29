import { supabase } from './supabaseClient';

export class EmailConfirmationService {
  /**
   * Sends an email confirmation to the currently authenticated user
   * @returns Promise that resolves when email is sent successfully
   * @throws Error if user is not authenticated or email sending fails
   */
  static async sendEmailConfirmation(): Promise<void> {
    try {
      // Get current session to ensure user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session?.access_token) {
        throw new Error('User is not authenticated');
      }

      // Call the send-email-confirmation edge function
      const { data, error } = await supabase.functions.invoke('send-email-confirmation', {
        body: {}, // Send empty object as body
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Email confirmation error:', error);
        throw new Error(`Failed to send email confirmation: ${error.message}`);
      }

      console.log('Email confirmation sent successfully:', data);
    } catch (error) {
      console.error('EmailConfirmationService error:', error);
      throw error;
    }
  }
}