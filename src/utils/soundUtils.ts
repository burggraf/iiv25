import { Audio } from 'expo-av';

export class SoundUtils {
  private static isInitialized = false;

  // Initialize the audio system
  public static async initializeBeepSound(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });
      
      this.isInitialized = true;
    } catch (error) {
      console.log('Error initializing audio:', error);
    }
  }

  // Play a short beep sound
  public static async playBeep(): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initializeBeepSound();
      }

      // Create and play a simple short beep sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: this.generateBeepDataUri() },
        { 
          shouldPlay: true,
          volume: 0.3,
          isLooping: false,
        }
      );
      
      // Unload after a short delay to clean up memory
      setTimeout(async () => {
        try {
          await sound.unloadAsync();
        } catch (error) {
          console.log('Error unloading beep sound:', error);
        }
      }, 500);

    } catch (error) {
      console.log('Error playing beep sound:', error);
    }
  }

  // Generate a simple beep sound as a data URI (short wav file)
  private static generateBeepDataUri(): string {
    // A very short beep sound encoded as base64 wav
    return 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LNeSsFJHfH8N2QQAoUXrTp66hVEwxKn+DyvmMdCDiS1O7Qfj0EKX7J7+KDQQ0YZLXn7KlXFApLnuLy0IU+AyF9yO3edBYAGVu4+6hVEw5Lp+DzvGM9BzyI1Orzej0EKX7K8OKKTAgdebHv4GcZDDqEzOn1ez0EKX7K8OKKTAgdebHv4GcZAA==';
  }

  // Cleanup (mainly for completeness)
  public static async cleanup(): Promise<void> {
    this.isInitialized = false;
  }
}