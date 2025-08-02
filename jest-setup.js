// Setup for Jest testing

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock Expo modules
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock React Native modules
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Alert: {
      alert: jest.fn(),
    },
    Platform: {
      OS: 'ios',
      select: jest.fn(),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 375, height: 812 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    NativeModules: {
      RNIapAmazonModule: {},
      RNIapModule: {},
      RNIapIosModule: {},
    },
  };
});

// Mock the services - Note: Individual test files should mock services as needed
// jest.mock('./src/services/productLookupService', () => ({
//   ProductLookupService: {
//     lookupProductByBarcode: jest.fn(),
//   },
// }));

jest.mock('./src/services/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
    functions: {
      invoke: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

// Mock react-native-iap
jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  getProducts: jest.fn(),
  requestSubscription: jest.fn(),
  purchaseUpdatedListener: jest.fn(),
  purchaseErrorListener: jest.fn(),
  finishTransaction: jest.fn(),
  getAvailablePurchases: jest.fn(),
  clearTransactionIOS: jest.fn(),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    appOwnership: 'standalone',
    debugMode: false,
    experienceUrl: '',
    expoVersion: '1.0.0',
    installationId: 'test-installation-id',
    isDevice: true,
    manifest: {},
    platform: {
      ios: {
        buildNumber: '1',
        bundleIdentifier: 'com.test.app',
        platform: 'ios',
        userInterfaceIdiom: 'phone',
        systemVersion: '15.0',
      },
    },
    sessionId: 'test-session-id',
    statusBarHeight: 20,
    systemFonts: [],
    systemVersion: '15.0',
  },
}));