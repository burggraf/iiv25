import { playSuccessSound, playErrorSound, playWarningSound } from '../soundUtils';
import { Audio } from 'expo-av';
import { Haptics } from 'expo-haptics';

// Mock expo-av
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
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

const mockAudio = Audio as jest.Mocked<typeof Audio>;
const mockHaptics = Haptics as jest.Mocked<typeof Haptics>;

describe('soundUtils', () => {
  const mockSound = {
    playAsync: jest.fn(),
    unloadAsync: jest.fn(),
    setVolumeAsync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAudio.Sound.createAsync.mockResolvedValue({ sound: mockSound, status: {} } as any);
    mockAudio.setAudioModeAsync.mockResolvedValue();
    mockHaptics.impactAsync.mockResolvedValue();
    mockSound.playAsync.mockResolvedValue({} as any);
    mockSound.unloadAsync.mockResolvedValue({} as any);
    mockSound.setVolumeAsync.mockResolvedValue({} as any);
  });

  describe('playSuccessSound', () => {
    it('should play success sound and haptic feedback', async () => {
      await playSuccessSound();

      expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      expect(mockAudio.Sound.createAsync).toHaveBeenCalled();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.5);
      expect(mockSound.playAsync).toHaveBeenCalled();
      expect(mockSound.unloadAsync).toHaveBeenCalled();
      expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Light);
    });

    it('should handle audio creation failure gracefully', async () => {
      mockAudio.Sound.createAsync.mockRejectedValue(new Error('Audio creation failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      expect(console.warn).toHaveBeenCalledWith('Failed to play success sound:', expect.any(Error));
      expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Light);

      jest.restoreAllMocks();
    });

    it('should handle sound play failure gracefully', async () => {
      mockSound.playAsync.mockRejectedValue(new Error('Play failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      expect(console.warn).toHaveBeenCalledWith('Failed to play success sound:', expect.any(Error));
      expect(mockSound.unloadAsync).toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('should handle haptic feedback failure gracefully', async () => {
      mockHaptics.impactAsync.mockRejectedValue(new Error('Haptic failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      expect(mockSound.playAsync).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Failed to play haptic feedback:', expect.any(Error));

      jest.restoreAllMocks();
    });
  });

  describe('playErrorSound', () => {
    it('should play error sound and haptic feedback', async () => {
      await playErrorSound();

      expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      expect(mockAudio.Sound.createAsync).toHaveBeenCalled();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.3);
      expect(mockSound.playAsync).toHaveBeenCalled();
      expect(mockSound.unloadAsync).toHaveBeenCalled();
      expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Medium);
    });

    it('should handle all failures gracefully', async () => {
      mockAudio.Sound.createAsync.mockRejectedValue(new Error('Audio failed'));
      mockHaptics.impactAsync.mockRejectedValue(new Error('Haptic failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playErrorSound();

      expect(console.warn).toHaveBeenCalledWith('Failed to play error sound:', expect.any(Error));
      expect(console.warn).toHaveBeenCalledWith('Failed to play haptic feedback:', expect.any(Error));

      jest.restoreAllMocks();
    });
  });

  describe('playWarningSound', () => {
    it('should play warning sound and haptic feedback', async () => {
      await playWarningSound();

      expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      expect(mockAudio.Sound.createAsync).toHaveBeenCalled();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.4);
      expect(mockSound.playAsync).toHaveBeenCalled();
      expect(mockSound.unloadAsync).toHaveBeenCalled();
      expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Light);
    });

    it('should handle warning sound playback failure', async () => {
      mockSound.playAsync.mockRejectedValue(new Error('Warning play failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playWarningSound();

      expect(console.warn).toHaveBeenCalledWith('Failed to play warning sound:', expect.any(Error));
      expect(mockSound.unloadAsync).toHaveBeenCalled();

      jest.restoreAllMocks();
    });
  });

  describe('Volume levels', () => {
    it('should set correct volume for success sound', async () => {
      await playSuccessSound();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.5);
    });

    it('should set correct volume for error sound', async () => {
      await playErrorSound();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.3);
    });

    it('should set correct volume for warning sound', async () => {
      await playWarningSound();
      expect(mockSound.setVolumeAsync).toHaveBeenCalledWith(0.4);
    });
  });

  describe('Audio mode configuration', () => {
    it('should configure audio mode for iOS silent mode', async () => {
      await playSuccessSound();

      expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
    });

    it('should handle audio mode configuration failure', async () => {
      mockAudio.setAudioModeAsync.mockRejectedValue(new Error('Audio mode failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      // Should continue despite audio mode failure
      expect(mockAudio.Sound.createAsync).toHaveBeenCalled();

      jest.restoreAllMocks();
    });
  });

  describe('Sound cleanup', () => {
    it('should unload sound after playing', async () => {
      await playSuccessSound();

      expect(mockSound.unloadAsync).toHaveBeenCalled();
    });

    it('should unload sound even if play fails', async () => {
      mockSound.playAsync.mockRejectedValue(new Error('Play failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      expect(mockSound.unloadAsync).toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('should handle unload failure gracefully', async () => {
      mockSound.unloadAsync.mockRejectedValue(new Error('Unload failed'));
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await playSuccessSound();

      expect(mockSound.unloadAsync).toHaveBeenCalled();
      // Should not throw or crash

      jest.restoreAllMocks();
    });
  });

  describe('Concurrent sound playing', () => {
    it('should handle multiple concurrent sound plays', async () => {
      const promises = [
        playSuccessSound(),
        playErrorSound(),
        playWarningSound(),
      ];

      await Promise.all(promises);

      expect(mockAudio.Sound.createAsync).toHaveBeenCalledTimes(3);
      expect(mockSound.playAsync).toHaveBeenCalledTimes(3);
      expect(mockSound.unloadAsync).toHaveBeenCalledTimes(3);
      expect(mockHaptics.impactAsync).toHaveBeenCalledTimes(3);
    });
  });
});