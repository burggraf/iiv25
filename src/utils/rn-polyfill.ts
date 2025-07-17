// React Native polyfills for Supabase compatibility

// Simple polyfill for structuredClone
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = function<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }
    
    if (obj instanceof Array) {
      return obj.map(item => global.structuredClone(item)) as T;
    }
    
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags) as T;
    }
    
    if (typeof obj === 'object') {
      const cloned: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = global.structuredClone((obj as any)[key]);
        }
      }
      return cloned as T;
    }
    
    return obj;
  };
}

// Simple polyfill for AbortController
if (typeof global.AbortController === 'undefined') {
  global.AbortController = class AbortController {
    signal: any;
    
    constructor() {
      this.signal = {
        aborted: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    }
    
    abort() {
      this.signal.aborted = true;
    }
  };
}

// Polyfill for fetch if needed (usually available in RN)
if (typeof global.fetch === 'undefined') {
  // This is usually not needed in React Native, but just in case
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  global.fetch = require('react-native/Libraries/Network/fetch').fetch;
}

export {};