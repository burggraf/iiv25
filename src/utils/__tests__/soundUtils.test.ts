import { SoundUtils } from '../soundUtils';
import { Audio } from 'expo-av';

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
    setAudioModeAsync: jest.fn(),
  },
}));

const mockCreateAsync = (Audio.Sound.createAsync as jest.Mock);
const mockSetAudioModeAsync = (Audio.setAudioModeAsync as jest.Mock);

describe('SoundUtils', () => {
  const mockSound = {
    playAsync: jest.fn(),
    unloadAsync: jest.fn(),
    setVolumeAsync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset initialization state
    (SoundUtils as any).isInitialized = false;
    
    mockCreateAsync.mockResolvedValue({ sound: mockSound, status: {} } as any);
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockSound.playAsync.mockResolvedValue({} as any);
    mockSound.unloadAsync.mockResolvedValue({} as any);
    mockSound.setVolumeAsync.mockResolvedValue({} as any);
  });

  describe('initializeBeepSound', () => {
    it('should initialize audio mode correctly', async () => {
      await SoundUtils.initializeBeepSound();

      expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });
    });

    it('should not initialize twice', async () => {
      await SoundUtils.initializeBeepSound();
      await SoundUtils.initializeBeepSound();

      expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors gracefully', async () => {
      mockSetAudioModeAsync.mockRejectedValue(new Error('Audio init failed'));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await SoundUtils.initializeBeepSound();

      expect(console.log).toHaveBeenCalledWith('Error initializing audio:', expect.any(Error));

      jest.restoreAllMocks();
    });
  });

  describe('playBeep', () => {
    it('should play beep sound correctly', async () => {
      await SoundUtils.playBeep();

      expect(mockSetAudioModeAsync).toHaveBeenCalled();
      expect(mockCreateAsync).toHaveBeenCalledWith(
        { uri: expect.stringContaining('data:audio/wav;base64,') },
        {
          shouldPlay: true,
          volume: 0.3,
          isLooping: false,
        }
      );
    });

    it('should initialize audio if not already initialized', async () => {
      await SoundUtils.playBeep();

      expect(mockSetAudioModeAsync).toHaveBeenCalled();
      expect(mockCreateAsync).toHaveBeenCalled();
    });

    it('should handle beep sound creation failure gracefully', async () => {
      mockCreateAsync.mockRejectedValue(new Error('Sound creation failed'));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await SoundUtils.playBeep();

      expect(console.log).toHaveBeenCalledWith('Error playing beep sound:', expect.any(Error));

      jest.restoreAllMocks();
    });

    it('should unload sound after delay', async () => {
      jest.useFakeTimers();

      await SoundUtils.playBeep();

      // Fast-forward time
      jest.advanceTimersByTime(500);

      await Promise.resolve(); // Let any pending promises resolve

      expect(mockSound.unloadAsync).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle sound unload errors gracefully', async () => {
      jest.useFakeTimers();
      mockSound.unloadAsync.mockRejectedValue(new Error('Unload failed'));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await SoundUtils.playBeep();

      // Fast-forward time
      jest.advanceTimersByTime(500);

      await Promise.resolve(); // Let any pending promises resolve

      expect(console.log).toHaveBeenCalledWith('Error unloading beep sound:', expect.any(Error));

      jest.useRealTimers();
      jest.restoreAllMocks();
    });
  });

  describe('cleanup', () => {
    it('should reset initialization state', async () => {
      // Initialize first
      await SoundUtils.initializeBeepSound();
      
      // Cleanup
      await SoundUtils.cleanup();
      
      // Should initialize again since state was reset
      await SoundUtils.initializeBeepSound();
      
      expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateBeepDataUri', () => {
    it('should generate a valid data URI for beep sound', async () => {
      await SoundUtils.playBeep();

      const createAsyncCall = mockCreateAsync.mock.calls[0];
      const audioSource = createAsyncCall[0] as { uri: string };
      
      expect(audioSource.uri).toMatch(/^data:audio\/wav;base64,/);
      expect(audioSource.uri.length).toBeGreaterThan(50); // Should have meaningful content
    });
  });

  describe('multiple concurrent beep calls', () => {
    it('should handle multiple concurrent beep calls without errors', async () => {
      const promises = [
        SoundUtils.playBeep(),
        SoundUtils.playBeep(),
        SoundUtils.playBeep(),
      ];

      await Promise.all(promises);

      expect(mockCreateAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('audio configuration', () => {
    it('should set correct audio parameters', async () => {
      await SoundUtils.playBeep();

      const createAsyncCall = mockCreateAsync.mock.calls[0];
      const audioConfig = createAsyncCall[1];
      
      expect(audioConfig).toEqual({
        shouldPlay: true,
        volume: 0.3,
        isLooping: false,
      });
    });
  });
});