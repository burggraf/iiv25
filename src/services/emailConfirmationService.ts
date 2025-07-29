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

      // Get the Supabase function URL
      const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-email-confirmation`;
      
      // Call the send-email-confirmation edge function using fetch for better error handling
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      // Parse the response body
      const responseData = await response.json();

      // Check if the response was not successful
      if (!response.ok) {
        console.error('Email confirmation error response:', responseData);
        
        // Extract the specific error message from the response
        if (responseData && responseData.error) {
          throw new Error(responseData.error);
        } else {
          throw new Error(`HTTP ${response.status}: Failed to send email confirmation`);
        }
      }

      console.log('Email confirmation sent successfully:', responseData);
    } catch (error) {
      console.error('EmailConfirmationService error:', error);
      throw error;
    }
  }
}