// Setup for Jest testing

// Define global variables needed by React Native
global.__DEV__ = true;

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
  const mockAnimatedValue = {
    setValue: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  
  return {
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
    StyleSheet: {
      create: jest.fn((styles) => styles),
      flatten: jest.fn(),
    },
    Animated: {
      Value: jest.fn(() => mockAnimatedValue),
      spring: jest.fn(() => ({ start: jest.fn() })),
      timing: jest.fn(() => ({ start: jest.fn() })),
      View: jest.fn().mockImplementation(({ children }) => children),
      Text: jest.fn().mockImplementation(({ children }) => children),
    },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    View: 'View',
    Text: 'Text',
    Image: 'Image',
    TouchableOpacity: 'TouchableOpacity',
    ScrollView: 'ScrollView',
    SafeAreaView: 'SafeAreaView',
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

// Mock expo-av for audio functionality
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
    setAudioModeAsync: jest.fn(),
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock expo-camera
jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [
    { granted: true },
    jest.fn(),
  ]),
}));

// Mock expo-image
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulateAsync: jest.fn(),
    SaveFormat: {
      JPEG: 'jpeg',
      PNG: 'png',
    },
  },
  manipulateAsync: jest.fn(),
  useImageManipulator: jest.fn(),
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    default: React.forwardRef((props, ref) => React.createElement('View', props)),
    Svg: React.forwardRef((props, ref) => React.createElement('View', props)),
    G: React.forwardRef((props, ref) => React.createElement('View', props)),
    Path: React.forwardRef((props, ref) => React.createElement('View', props)),
    Circle: React.forwardRef((props, ref) => React.createElement('View', props)),
    Rect: React.forwardRef((props, ref) => React.createElement('View', props)),
    Line: React.forwardRef((props, ref) => React.createElement('View', props)),
    Text: React.forwardRef((props, ref) => React.createElement('Text', props)),
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: {
    Images: 'Images',
  },
}));

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  useRootNavigationState: jest.fn(() => ({ key: 'root', routeNames: [] })),
  Redirect: ({ href }: any) => `Redirect to ${href}`,
  Link: ({ href, children }: any) => `Link to ${href}: ${children}`,
  Stack: {
    Screen: ({ name, options }: any) => `Stack.Screen ${name}`,
  },
  Tabs: {
    Screen: ({ name, options }: any) => `Tabs.Screen ${name}`,
  },
  Slot: 'Slot',
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `exp://127.0.0.1:19000/${path}`),
  parse: jest.fn((url) => ({ path: url.split('/').pop() })),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock expo-font
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  DocumentDirectoryPath: '/mock/documents/',
  CacheDirectoryPath: '/mock/cache/',
  readAsStringAsync: jest.fn(() => Promise.resolve('mock-base64-content')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({
    exists: true,
    isDirectory: false,
    size: 1024,
    modificationTime: 1620000000000,
  })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  moveAsync: jest.fn(() => Promise.resolve()),
  EncodingType: {
    UTF8: 'utf8',
    Base64: 'base64',
  },
}));

// React Native Testing Library configuration
// Note: @testing-library/jest-native has dependency conflicts, using basic setup