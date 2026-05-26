/**
 * OpenAnchor Screen Wake Lock Manager
 * Prevents mobile screens from sleeping while the anchor alarm is Armed.
 * Ensures continuous, uninterrupted GPS updates and real-time audio alerts all night.
 */

export class ScreenWakeLockManager {
  private wakeLock: WakeLockSentinel | null = null;
  private isActive = false;

  constructor() {
    // Re-acquire lock if visibility changes (browser releases wake locks when app goes background/hidden)
    document.addEventListener('visibilitychange', async () => {
      if (this.isActive && document.visibilityState === 'visible') {
        await this.acquire();
      }
    });
  }

  /**
   * Request a Screen Wake Lock
   */
  public async acquire(): Promise<boolean> {
    if (!('wakeLock' in navigator)) {
      console.warn("Screen Wake Lock API not supported on this browser.");
      return false;
    }

    try {
      this.isActive = true;
      // Release any existing lock first
      if (this.wakeLock) {
        await this.release();
      }

      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log("Screen Wake Lock acquired successfully.");
      
      // Listen for unexpected releases (e.g. low battery)
      this.wakeLock.addEventListener('release', () => {
        console.log("Screen Wake Lock was released.");
      });

      return true;
    } catch (err: any) {
      console.error(`Failed to acquire Screen Wake Lock: ${err.name}, ${err.message}`);
      return false;
    }
  }

  /**
   * Release the active Screen Wake Lock
   */
  public async release(): Promise<void> {
    this.isActive = false;
    if (!this.wakeLock) return;

    try {
      await this.wakeLock.release();
      this.wakeLock = null;
      console.log("Screen Wake Lock released cleanly.");
    } catch (err) {
      console.error("Error releasing Screen Wake Lock: ", err);
    }
  }

  public isLocked(): boolean {
    return this.wakeLock !== null;
  }
}

export const wakeLockManager = new ScreenWakeLockManager();
