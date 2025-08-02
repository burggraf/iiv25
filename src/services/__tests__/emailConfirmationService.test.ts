import { EmailConfirmationService } from '../emailConfirmationService';
import { supabase } from '../supabaseClient';

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

const mockSupabase = require('../supabaseClient').supabase;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variables
const originalEnv = process.env;

describe('EmailConfirmationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Set up environment variable
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('sendEmailConfirmation', () => {
    const mockSession = {
      access_token: 'test-access-token-123',
      refresh_token: 'test-refresh-token-123',
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    };

    it('should send email confirmation successfully', async () => {
      // Mock successful session retrieval
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock successful fetch response
      const mockResponseData = { success: true, message: 'Email sent successfully' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponseData),
      });

      await EmailConfirmationService.sendEmailConfirmation();

      // Verify session was retrieved
      expect(mockSupabase.auth.getSession).toHaveBeenCalled();

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/functions/v1/send-email-confirmation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-access-token-123',
          },
          body: JSON.stringify({}),
        }
      );

      // Verify success was logged
      expect(console.log).toHaveBeenCalledWith(
        'Email confirmation sent successfully:',
        mockResponseData
      );
    });

    it('should handle session errors', async () => {
      // Mock session error
      const sessionError = { message: 'Session expired' };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: sessionError,
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'Session error: Session expired'
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'EmailConfirmationService error:',
        expect.any(Error)
      );
    });

    it('should handle missing session', async () => {
      // Mock no session
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'User is not authenticated'
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle session without access token', async () => {
      // Mock session without access token
      const sessionWithoutToken = {
        ...mockSession,
        access_token: null,
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: sessionWithoutToken },
        error: null,
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'User is not authenticated'
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle HTTP error responses with error message', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock failed fetch response with error message
      const errorResponse = { error: 'Email service temporarily unavailable' };
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue(errorResponse),
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'Email service temporarily unavailable'
      );

      expect(console.error).toHaveBeenCalledWith(
        'Email confirmation error response:',
        errorResponse
      );
    });

    it('should handle HTTP error responses without error message', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock failed fetch response without error message
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({}),
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'HTTP 500: Failed to send email confirmation'
      );
    });

    it('should handle network errors', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock network error
      const networkError = new Error('Network request failed');
      mockFetch.mockRejectedValue(networkError);

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'Network request failed'
      );

      expect(console.error).toHaveBeenCalledWith(
        'EmailConfirmationService error:',
        networkError
      );
    });

    it('should handle JSON parsing errors', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      // Mock response with invalid JSON
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'Invalid JSON'
      );
    });

    it('should handle different HTTP status codes', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const testCases = [
        { status: 400, expectedError: 'HTTP 400: Failed to send email confirmation' },
        { status: 401, expectedError: 'HTTP 401: Failed to send email confirmation' },
        { status: 403, expectedError: 'HTTP 403: Failed to send email confirmation' },
        { status: 404, expectedError: 'HTTP 404: Failed to send email confirmation' },
        { status: 500, expectedError: 'HTTP 500: Failed to send email confirmation' },
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValue({
          ok: false,
          status: testCase.status,
          json: jest.fn().mockResolvedValue({}),
        });

        await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
          testCase.expectedError
        );
      }
    });

    it('should construct correct function URL', async () => {
      // Test with different Supabase URLs
      const testUrls = [
        'https://abcdefgh.supabase.co',
        'https://test-project-123.supabase.co',
        'https://my-project.supabase.co',
      ];

      for (const url of testUrls) {
        process.env.EXPO_PUBLIC_SUPABASE_URL = url;

        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: mockSession },
          error: null,
        });

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ success: true }),
        });

        await EmailConfirmationService.sendEmailConfirmation();

        expect(mockFetch).toHaveBeenCalledWith(
          `${url}/functions/v1/send-email-confirmation`,
          expect.any(Object)
        );

        jest.clearAllMocks();
      }
    });

    it('should handle empty access token', async () => {
      const sessionWithEmptyToken = {
        ...mockSession,
        access_token: '',
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: sessionWithEmptyToken },
        error: null,
      });

      await expect(EmailConfirmationService.sendEmailConfirmation()).rejects.toThrow(
        'User is not authenticated'
      );
    });

    it('should propagate fetch request with correct headers', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await EmailConfirmationService.sendEmailConfirmation();

      const fetchCall = mockFetch.mock.calls[0];
      const [url, options] = fetchCall;

      expect(url).toBe('https://test-project.supabase.co/functions/v1/send-email-confirmation');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-access-token-123');
      expect(options.body).toBe(JSON.stringify({}));
    });

    it('should handle different session token formats', async () => {
      const tokenFormats = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test', // JWT-like token
        'test-access-token-123', // Simple token
        'Bearer-token-format', // Bearer format
        'very-long-token-with-many-characters-and-numbers-123456789', // Long token
      ];

      for (const token of tokenFormats) {
        const sessionWithToken = {
          ...mockSession,
          access_token: token,
        };

        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: sessionWithToken },
          error: null,
        });

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ success: true }),
        });

        await EmailConfirmationService.sendEmailConfirmation();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': `Bearer ${token}`,
            }),
          })
        );

        jest.clearAllMocks();
      }
    });
  });
});