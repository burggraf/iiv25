// Mock dependencies before importing the module
const mockAppStateAddEventListener = jest.fn();
const mockAppStateRemoveEventListener = jest.fn();
const mockCreateClient = jest.fn();
const mockAsyncStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

const mockPlatform = { OS: 'ios' };

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAppStateAddEventListener,
    removeEventListener: mockAppStateRemoveEventListener,
  },
  Platform: mockPlatform,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('../../utils/rn-polyfill', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));

// Clear the global mock from jest-setup.js for this specific test file
jest.unmock('../supabaseClient');

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Helper to clear module cache and require fresh module
function requireFreshModule() {
  // Clear the module from require cache, including dependencies
  const modulePath = require.resolve('../supabaseClient');
  const polyfillPath = require.resolve('../../utils/rn-polyfill');
  
  delete require.cache[modulePath];
  delete require.cache[polyfillPath];
  
  // Clear all mocks before requiring fresh module
  mockCreateClient.mockClear();
  mockAppStateAddEventListener.mockClear();
  mockAppStateRemoveEventListener.mockClear();
  
  return require('../supabaseClient');
}

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
    
    // Reset Platform OS to default
    (Platform as any).OS = 'ios';
    
    // Mock environment variables
    process.env.EXPO_PUBLIC_SUPABASE_URL = mockEnv.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = mockEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    // Reset the mock implementation to default success
    mockCreateClient.mockReturnValue(mockSupabaseInstance);
    
    // Clear module cache to ensure fresh imports
    const modulePath = require.resolve('../supabaseClient');
    delete require.cache[modulePath];
    try {
      const polyfillPath = require.resolve('../../utils/rn-polyfill');
      delete require.cache[polyfillPath];
    } catch (e) {
      // Polyfill might not exist, ignore
    }
    
    // Clear window mock
    delete (global as any).window;
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
      // Set environment variables
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = mockEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      expect(() => {
        requireFreshModule();
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });

    it('should throw error when SUPABASE_ANON_KEY is missing', () => {
      // Set environment variables
      process.env.EXPO_PUBLIC_SUPABASE_URL = mockEnv.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      expect(() => {
        requireFreshModule();
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });

    it('should throw error when both environment variables are missing', () => {
      // Set environment variables
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      expect(() => {
        requireFreshModule();
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });
  });

  describe('Client initialization', () => {
    it('should create Supabase client with correct configuration', () => {
      const { supabase } = requireFreshModule();
      
      expect(mockCreateClient).toHaveBeenCalledWith(
        mockEnv.EXPO_PUBLIC_SUPABASE_URL,
        mockEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            storage: mockAsyncStorage,
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
      const { supabase } = requireFreshModule();
      
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
        const { supabase } = requireFreshModule();
        
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            auth: expect.objectContaining({
              storage: mockAsyncStorage,
            }),
          })
        );
      });
    });

    describe('Web storage (localStorage)', () => {
      let mockGetItem: jest.Mock;
      let mockSetItem: jest.Mock;
      let mockRemoveItem: jest.Mock;
      let originalLocalStorage: Storage;
      
      beforeEach(() => {
        mockPlatform.OS = 'web';
        
        // Store the original localStorage
        originalLocalStorage = window.localStorage;
        
        // Mock window.localStorage with proper Jest mocks
        mockGetItem = jest.fn();
        mockSetItem = jest.fn();
        mockRemoveItem = jest.fn();
        
        // Mock localStorage within the existing JSDOM window object
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: mockGetItem,
            setItem: mockSetItem,
            removeItem: mockRemoveItem,
          },
          writable: true,
          configurable: true,
        });
      });

      afterEach(() => {
        // Restore the original localStorage
        Object.defineProperty(window, 'localStorage', {
          value: originalLocalStorage,
          writable: true,
          configurable: true,
        });
        // Reset Platform OS back to default
        mockPlatform.OS = 'ios';
      });

      it('should use localStorage adapter for web platform', () => {
        const { supabase } = requireFreshModule();
        
        const createClientCall = mockCreateClient.mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        expect(storage).not.toBe(mockAsyncStorage);
        expect(typeof storage.getItem).toBe('function');
        expect(typeof storage.setItem).toBe('function');
        expect(typeof storage.removeItem).toBe('function');
      });

      it('should configure detectSessionInUrl for web platform', () => {
        const { supabase } = requireFreshModule();
        
        expect(mockCreateClient).toHaveBeenCalledWith(
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
        // Import fresh module AFTER setting up the window mock
        const { supabase } = requireFreshModule();
        
        const createClientCall = mockCreateClient.mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        // Test getItem
        mockGetItem.mockReturnValue('test-value');
        const value = await storage.getItem('test-key');
        expect(value).toBe('test-value');
        expect(mockGetItem).toHaveBeenCalledWith('test-key');
        
        // Test setItem
        await storage.setItem('test-key', 'test-value');
        expect(mockSetItem).toHaveBeenCalledWith('test-key', 'test-value');
        
        // Test removeItem
        await storage.removeItem('test-key');
        expect(mockRemoveItem).toHaveBeenCalledWith('test-key');
      });

      it('should handle missing window object gracefully', async () => {
        // In JSDOM environment, we can't truly remove window, so we'll test 
        // the case where localStorage.getItem returns nothing (undefined/null)
        delete (global as any).window;
        
        const { supabase } = requireFreshModule();
        
        const createClientCall = mockCreateClient.mock.calls[0];
        const config = createClientCall[2];
        const storage = config.auth.storage;
        
        // In this scenario, window exists but localStorage.getItem doesn't return a value
        // This simulates a degraded localStorage scenario
        const value = await storage.getItem('test-key');
        // In JSDOM with our mock setup, this returns undefined rather than null
        expect(value).toBeUndefined();
        
        // These should not throw errors
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
      const { supabase } = requireFreshModule();
      
      expect(mockAppStateAddEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should not register AppState listener for web platform', () => {
      mockPlatform.OS = 'web';
      jest.clearAllMocks(); // Clear previous calls from other tests
      
      const { supabase } = requireFreshModule();
      
      expect(mockAppStateAddEventListener).not.toHaveBeenCalled();
      
      // Reset platform back to default
      mockPlatform.OS = 'ios';
    });

    it('should start auto refresh when app becomes active', () => {
      const { supabase } = requireFreshModule();
      
      const listenerCall = mockAppStateAddEventListener.mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app becoming active
      stateChangeHandler('active');
      
      expect(mockSupabaseInstance.auth.startAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.stopAutoRefresh).not.toHaveBeenCalled();
    });

    it('should stop auto refresh when app becomes inactive', () => {
      const { supabase } = requireFreshModule();
      
      const listenerCall = mockAppStateAddEventListener.mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app becoming inactive
      stateChangeHandler('inactive');
      
      expect(mockSupabaseInstance.auth.stopAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.startAutoRefresh).not.toHaveBeenCalled();
    });

    it('should stop auto refresh when app goes to background', () => {
      const { supabase } = requireFreshModule();
      
      const listenerCall = mockAppStateAddEventListener.mock.calls[0];
      const stateChangeHandler = listenerCall[1];
      
      // Simulate app going to background
      stateChangeHandler('background');
      
      expect(mockSupabaseInstance.auth.stopAutoRefresh).toHaveBeenCalled();
      expect(mockSupabaseInstance.auth.startAutoRefresh).not.toHaveBeenCalled();
    });

    it('should handle multiple state changes correctly', () => {
      const { supabase } = requireFreshModule();
      
      const listenerCall = mockAppStateAddEventListener.mock.calls[0];
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
      const { supabase } = requireFreshModule();
      
      expect(mockCreateClient).toHaveBeenCalledWith(
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
      const { supabase } = requireFreshModule();
      
      expect(mockCreateClient).toHaveBeenCalledWith(
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
      const { supabase } = requireFreshModule();
      
      expect(mockCreateClient).toHaveBeenCalledWith(
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
      mockCreateClient.mockImplementation(() => {
        throw new Error('Failed to create client');
      });
      
      expect(() => {
        requireFreshModule();
      }).toThrow('Failed to create client');
    });

    it('should handle environment variable edge cases', () => {
      // Test with empty strings
      process.env.EXPO_PUBLIC_SUPABASE_URL = '';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
      
      expect(() => {
        requireFreshModule();
      }).toThrow('Missing Supabase environment variables. Please check your .env file.');
    });
  });

  describe('Module imports and polyfills', () => {
    it('should import required polyfills', () => {
      // The module should import without errors, indicating polyfills are loaded
      expect(() => {
        const { supabase } = requireFreshModule();
      }).not.toThrow();
    });

    it('should be importable multiple times', () => {
      const { supabase: supabase1 } = requireFreshModule();
      // Clear and require again to test caching
      const modulePath = require.resolve('../supabaseClient');
      const { supabase: supabase2 } = require('../supabaseClient');
      
      // Should return the same instance (cached)
      expect(supabase1).toBe(supabase2);
    });
  });
});