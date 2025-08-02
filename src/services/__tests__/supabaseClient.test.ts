import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Mock dependencies before importing the module
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../../utils/rn-polyfill', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));

// Mock environment variables
const mockEnv = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://test-supabase-url.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-123',
};

describe('supabaseClient', () => {
  const mockSupabaseInstance = {
    auth: {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.EXPO_PUBLIC_SUPABASE_URL = mockEnv.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = mockEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    (createClient as jest.Mock).mockReturnValue(mockSupabaseInstance);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    // Reset modules to re-import with new environment
    jest.resetModules();
  });

  describe('Environment validation', () => {
    it('should throw error when SUPABASE_URL is missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      
      expect(() => {
        jest.resetModules();
        require('../supabaseClient');
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });

    it('should throw error when SUPABASE_ANON_KEY is missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      expect(() => {
        jest.resetModules();
        require('../supabaseClient');
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });

    it('should throw error when both environment variables are missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      expect(() => {
        jest.resetModules();
        require('../supabaseClient');
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });
  });

  describe('Client initialization', () => {
    it('should create Supabase client with correct configuration', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(createClient).toHaveBeenCalledWith(
        mockEnv.EXPO_PUBLIC_SUPABASE_URL,
        mockEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            storage: expect.any(Object),
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false, // Platform.OS is 'ios' by default
            flowType: 'pkce',
          },
          global: {
            headers: {
              'X-Client-Info': 'supabase-js-react-native',
            },
          },
        }
      );
      
      expect(supabase).toBe(mockSupabaseInstance);
    });

    it('should export supabase client instance', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(supabase).toBeDefined();
      expect(supabase.auth.startAutoRefresh).toBeDefined();
      expect(supabase.auth.stopAutoRefresh).toBeDefined();
    });
  });

  describe('Storage adapter', () => {
    describe('React Native storage (AsyncStorage)', () => {
      beforeEach(() => {
        (Platform as any).OS = 'ios';
      });

      it('should use AsyncStorage for React Native platforms', () => {
        const { supabase } = require('../supabaseClient');
        
        expect(createClient).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            auth: expect.objectContaining({
              storage: AsyncStorage,
            }),
          })
        );
      });
    });

    describe('Web storage (localStorage)', () => {
      beforeEach(() => {
        (Platform as any).OS = 'web';
        
        // Mock window.localStorage
        (global as any).window = {
          localStorage: {
            getItem: jest.fn(),
            setItem: jest.fn(),
            removeItem: jest.fn(),
          },
        };
      });

      afterEach(() => {
        delete (global as any).window;
      });

      it('should use localStorage adapter for web platform', () => {
        const { supabase } = require('../supabaseClient');
        
        const createClientCall = (createClient as jest.Mock).mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        expect(storage).not.toBe(AsyncStorage);
        expect(typeof storage.getItem).toBe('function');
        expect(typeof storage.setItem).toBe('function');
        expect(typeof storage.removeItem).toBe('function');
      });

      it('should configure detectSessionInUrl for web platform', () => {
        const { supabase } = require('../supabaseClient');
        
        expect(createClient).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            auth: expect.objectContaining({
              detectSessionInUrl: true,
            }),
          })
        );
      });

      it('should handle localStorage operations correctly', async () => {
        const { supabase } = require('../supabaseClient');
        
        const createClientCall = (createClient as jest.Mock).mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        // Test getItem
        (global as any).window.localStorage.getItem.mockReturnValue('test-value');
        const value = await storage.getItem('test-key');
        expect(value).toBe('test-value');
        expect((global as any).window.localStorage.getItem).toHaveBeenCalledWith('test-key');
        
        // Test setItem
        await storage.setItem('test-key', 'test-value');
        expect((global as any).window.localStorage.setItem).toHaveBeenCalledWith('test-key', 'test-value');
        
        // Test removeItem
        await storage.removeItem('test-key');
        expect((global as any).window.localStorage.removeItem).toHaveBeenCalledWith('test-key');
      });

      it('should handle missing window object gracefully', async () => {
        delete (global as any).window;
        
        const { supabase } = require('../supabaseClient');
        
        const createClientCall = (createClient as jest.Mock).mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        // Should not throw errors when window is undefined
        const value = await storage.getItem('test-key');
        expect(value).toBeNull();
        
        await storage.setItem('test-key', 'test-value');
        await storage.removeItem('test-key');
        
        // Should complete without errors
      });
    });
  });

  describe('AppState event listeners', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios'; // Non-web platform
    });

    it('should register AppState listener for non-web platforms', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(AppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should not register AppState listener for web platform', () => {
      (Platform as any).OS = 'web';
      
      const { supabase } = require('../supabaseClient');
      
      expect(AppState.addEventListener).not.toHaveBeenCalled();
    });

    it('should start auto refresh when app becomes active', () => {
      const { supabase } = require('../supabaseClient');
      
      const listenerCall = (AppState.addEventListener as jest.Mock).mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app becoming active
      stateChangeHandler('active');
      
      expect(mockSupabaseInstance.auth.startAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.stopAutoRefresh).not.toHaveBeenCalled();
    });

    it('should stop auto refresh when app becomes inactive', () => {
      const { supabase } = require('../supabaseClient');
      
      const listenerCall = (AppState.addEventListener as jest.Mock).mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app becoming inactive
      stateChangeHandler('inactive');
      
      expect(mockSupabaseInstance.auth.stopAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.startAutoRefresh).not.toHaveBeenCalled();
    });

    it('should stop auto refresh when app goes to background', () => {
      const { supabase } = require('../supabaseClient');
      
      const listenerCall = (AppState.addEventListener as jest.Mock).mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app going to background
      stateChangeHandler('background');
      
      expect(mockSupabaseInstance.auth.stopAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.startAutoRefresh).not.toHaveBeenCalled();
    });

    it('should handle multiple state changes correctly', () => {
      const { supabase } = require('../supabaseClient');
      
      const listenerCall = (AppState.addEventListener as jest.Mock).mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Test sequence: active -> background -> active
      stateChangeHandler('active');
      expect(mockSupabaseInstance.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
      
      stateChangeHandler('background');
      expect(mockSupabaseInstance.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
      
      stateChangeHandler('active');
      expect(mockSupabaseInstance.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration validation', () => {
    it('should configure PKCE flow correctly', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(createClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          auth: expect.objectContaining({
            flowType: 'pkce',
          }),
        })
      );
    });

    it('should enable auto refresh and persist session', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(createClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          auth: expect.objectContaining({
            autoRefreshToken: true,
            persistSession: true,
          }),
        })
      );
    });

    it('should set correct client headers', () => {
      const { supabase } = require('../supabaseClient');
      
      expect(createClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          global: {
            headers: {
              'X-Client-Info': 'supabase-js-react-native',
            },
          },
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle createClient errors gracefully', () => {
      (createClient as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to create client');
      });
      
      expect(() => {
        jest.resetModules();
        require('../supabaseClient');
      }).toThrow('Failed to create client');
    });

    it('should handle environment variable edge cases', () => {
      // Test with empty strings
      process.env.EXPO_PUBLIC_SUPABASE_URL = '';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
      
      expect(() => {
        jest.resetModules();
        require('../supabaseClient');
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });
  });

  describe('Module imports and polyfills', () => {
    it('should import required polyfills', () => {
      // The module should import without errors, indicating polyfills are loaded
      expect(() => {
        const { supabase } = require('../supabaseClient');
      }).not.toThrow();
    });

    it('should be importable multiple times', () => {
      const { supabase: supabase1 } = require('../supabaseClient');
      const { supabase: supabase2 } = require('../supabaseClient');
      
      // Should return the same instance
      expect(supabase1).toBe(supabase2);
    });
  });
});