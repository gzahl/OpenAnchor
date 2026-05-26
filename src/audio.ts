/**
 * OpenAnchor Web Audio API Synthesizer
 * Synthesizes high-fidelity, high-penetration marine alarm sounds completely offline in code.
 * Bypasses need for external media assets.
 */

class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private sirenIntervalId: number | null = null;
  private warningIntervalId: number | null = null;
  
  // Audio Nodes for active siren
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  constructor() {
    // Context is lazily initialized on first user interaction
  }

  /**
   * Initializes and resumes the Audio Context.
   * Browsers block audio until a user gesture triggers it.
   */
  public unlock(): void {
    if (!this.ctx) {
      // Support standard and legacy webkit audio contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => {
        console.error("Failed to resume AudioContext: ", err);
      });
    }
  }

  /**
   * Helper to ensure AudioContext is active
   */
  private getContext(): AudioContext | null {
    this.unlock();
    return this.ctx;
  }

  /**
   * Plays a classic marine "sonar ping".
   * Indicates to the crew that tracking is active and safe.
   * Pitch: 880Hz (A5), decays exponentially over 1.5 seconds.
   */
  public playSonarPing(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Create nodes
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    // Slight pitch drop during decay for a satisfying sonar sound
    osc.frequency.exponentialRampToValueAtTime(800, now + 1.2);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05); // quick fade in
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5); // long fade out

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.6);
  }

  /**
   * Starts repeating boundary warnings (yellow zone).
   * Double beep (high-low chime) every 3.5 seconds.
   */
  public startWarningBeeps(): void {
    if (this.warningIntervalId !== null) return;
    
    const triggerBeep = () => {
      const ctx = this.getContext();
      if (!ctx) return;
      
      const now = ctx.currentTime;
      
      // Chime 1 (High tone)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(980, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Chime 2 (Lower tone, delayed by 250ms)
      const tDelayed = now + 0.25;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(780, tDelayed);
      gain2.gain.setValueAtTime(0.0001, tDelayed);
      gain2.gain.linearRampToValueAtTime(0.2, tDelayed + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.0001, tDelayed + 0.35);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(tDelayed);
      osc2.stop(tDelayed + 0.4);
    };

    // Play immediately and then interval
    triggerBeep();
    this.warningIntervalId = window.setInterval(triggerBeep, 3500);
  }

  /**
   * Stops boundary warnings
   */
  public stopWarningBeeps(): void {
    if (this.warningIntervalId !== null) {
      clearInterval(this.warningIntervalId);
      this.warningIntervalId = null;
    }
  }

  /**
   * Starts a continuous, aggressive, high-penetration dual-siren.
   * Alternates frequencies rapidly between 800Hz and 1300Hz (maritime warble).
   * Designed to wake sleeping crews and cut through high wind/engine noise.
   */
  public startSiren(): void {
    if (this.sirenIntervalId !== null) return;
    
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Create oscillators and gain
    this.sirenOsc1 = ctx.createOscillator();
    this.sirenOsc2 = ctx.createOscillator();
    this.sirenGain = ctx.createGain();
    
    // Waveform: sawtooth + square makes it extremely rich and piercing
    this.sirenOsc1.type = 'sawtooth';
    this.sirenOsc2.type = 'square';
    
    // Setup LFO (Low Frequency Oscillator) to modulate frequency of sirens
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.5, now); // Modulates 2.5 times a second
    lfoGain.gain.setValueAtTime(200, now); // Sweeps frequency by +/- 200 Hz
    
    // Modulate osc1 and osc2 frequencies
    this.sirenOsc1.frequency.setValueAtTime(950, now);
    this.sirenOsc2.frequency.setValueAtTime(970, now); // slightly detuned for chorus fatness
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc1.frequency);
    lfoGain.connect(this.sirenOsc2.frequency);
    
    // Dynamic volume ramping to make it "screech"
    this.sirenGain.gain.setValueAtTime(0.0001, now);
    this.sirenGain.gain.linearRampToValueAtTime(0.4, now + 0.1); // Quick ramp up to loud

    // Connect nodes
    this.sirenOsc1.connect(this.sirenGain);
    this.sirenOsc2.connect(this.sirenGain);
    this.sirenGain.connect(ctx.destination);
    
    // Start nodes
    lfo.start(now);
    this.sirenOsc1.start(now);
    this.sirenOsc2.start(now);

    // Track siren components so we can stop them cleanly
    // A secondary pulsating filter to create an extra emergency rhythm
    let volumeToggle = true;
    this.sirenIntervalId = window.setInterval(() => {
      if (!this.sirenGain || !this.ctx) return;
      const t = this.ctx.currentTime;
      // Pulsate overall volume slightly between 0.2 and 0.4 to prevent auditory accommodation
      this.sirenGain.gain.linearRampToValueAtTime(volumeToggle ? 0.4 : 0.2, t + 0.25);
      volumeToggle = !volumeToggle;
    }, 300);
  }

  /**
   * Stops the active siren
   */
  public stopSiren(): void {
    if (this.sirenIntervalId !== null) {
      clearInterval(this.sirenIntervalId);
      this.sirenIntervalId = null;
    }

    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      
      // Ramp down gain to prevent clicking pops
      if (this.sirenGain) {
        try {
          this.sirenGain.gain.cancelScheduledValues(now);
          this.sirenGain.gain.setValueAtTime(this.sirenGain.gain.value, now);
          this.sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        } catch(e) {}
      }

      // Stop oscillators after ramp completes
      const osc1 = this.sirenOsc1;
      const osc2 = this.sirenOsc2;
      setTimeout(() => {
        try { osc1?.stop(); } catch(e) {}
        try { osc2?.stop(); } catch(e) {}
      }, 150);
    }

    this.sirenOsc1 = null;
    this.sirenOsc2 = null;
    this.sirenGain = null;
  }

  /**
   * Triggers a quick Sound Check.
   * Unlocks the audio context, plays a sonar ping, then a quick alarm beep.
   */
  public triggerSoundCheck(): void {
    this.unlock();
    this.playSonarPing();
    
    // Follow up with a short alarm check after 1.8 seconds
    setTimeout(() => {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1100, now);
      
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.5);
    }, 1800);
  }

  /**
   * Stops all active alarms immediately
   */
  public silenceAll(): void {
    this.stopSiren();
    this.stopWarningBeeps();
  }
}

export const audioSynth = new AudioSynthesizer();
