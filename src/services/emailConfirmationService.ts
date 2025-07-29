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
        
        // Try to extract specific error message from the edge function response
        let errorMessage = 'Failed to send email confirmation';
        
        if (error.message) {
          // Check if the error message contains specific error responses
          if (error.message.includes('email already verified')) {
            errorMessage = 'email already verified';
          } else if (error.message.includes('please wait 10 minutes')) {
            errorMessage = 'please wait 10 minutes before sending another confirmation email';
          } else if (error.message) {
            errorMessage = error.message;
          }
        }
        
        throw new Error(errorMessage);
      }

      // Check if the response data contains an error (in case it's in the data object)
      if (data && data.error) {
        console.error('Email confirmation data error:', data.error);
        throw new Error(data.error);
      }

      console.log('Email confirmation sent successfully:', data);
    } catch (error) {
      console.error('EmailConfirmationService error:', error);
      throw error;
    }
  }
}