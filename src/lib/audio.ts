/**
 * Web Audio API synthesizer for retro synthwave sound effects and procedural continuous music.
 * Completely zero external sound files required!
 * 
 * Smooth, Melodic Synthwave BGM Engine:
 * - 100% clean, musical, and pleasant retro arcade composition
 * - Lowpass filter (cutoff around 800Hz) removing all harsh high frequencies & buzzing
 * - Pure gentle sine & triangle wave oscillators for soft, relaxing yet engaging arpeggios
 * - Zero white noise in background music: smooth, warm round bass and melodic arcade chime
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private musicInterval: number | null = null;
  private isMuted = false;
  private isMusicMuted = false;

  private musicGainNode: GainNode | null = null;
  private musicLowpassFilter: BiquadFilterNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null; // Used exclusively for crash SFX

  // Relaxing yet engaging retro synthwave tempo (124 BPM)
  private tempo = 124;
  private current16thNote = 0;
  private nextNoteTime = 0;
  private isMusicRunning = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const tryAutoStart = () => {
        this.initContext();
        if (this.ctx && this.ctx.state === 'running') {
          this.startMusic();
        }
      };

      const unlockAudio = () => {
        this.initContext();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().then(() => {
            if (!this.isMusicMuted) {
              this.startMusic();
            }
          }).catch(() => {});
        } else if (!this.isMusicMuted) {
          this.startMusic();
        }

        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
      };

      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('click', unlockAudio, { passive: true });

      tryAutoStart();
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // Music master volume bus
        this.musicGainNode = this.ctx.createGain();
        this.musicGainNode.gain.setValueAtTime(this.isMusicMuted ? 0 : 0.28, this.ctx.currentTime);
        this.musicGainNode.connect(this.ctx.destination);

        // Dedicated Music Master Lowpass Filter (800Hz cutoff to filter out harsh high frequencies)
        this.musicLowpassFilter = this.ctx.createBiquadFilter();
        this.musicLowpassFilter.type = 'lowpass';
        this.musicLowpassFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
        this.musicLowpassFilter.Q.setValueAtTime(1.1, this.ctx.currentTime);
        this.musicLowpassFilter.connect(this.musicGainNode);

        // SFX master bus
        this.sfxGainNode = this.ctx.createGain();
        this.sfxGainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.32, this.ctx.currentTime);
        this.sfxGainNode.connect(this.ctx.destination);

        this.createCrashNoiseBuffer();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private createCrashNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  public setSoundMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setValueAtTime(muted ? 0 : 0.32, this.ctx.currentTime);
    }
  }

  public setMusicMuted(muted: boolean) {
    this.isMusicMuted = muted;
    if (this.ctx && this.musicGainNode) {
      const now = this.ctx.currentTime;
      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.linearRampToValueAtTime(muted ? 0 : 0.28, now + 0.05);
    }

    if (!muted) {
      this.startMusic();
    }
  }

  public isMuteState() {
    return { sound: this.isMuted, music: this.isMusicMuted };
  }

  // ==================== SMOOTH, MELODIC SYNTHWAVE BGM ====================
  public startMusic() {
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.isMusicRunning) return;
    this.isMusicRunning = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    this.musicInterval = window.setInterval(() => {
      this.scheduleLookahead();
    }, 25);
  }

  public stopMusic() {
    this.isMusicRunning = false;
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  private scheduleLookahead() {
    if (!this.ctx || !this.isMusicRunning) return;

    const secondsPer16th = 60.0 / this.tempo / 4.0; // ~0.1209s at 124 BPM
    const scheduleAheadTime = 0.14;

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.current16thNote, this.nextNoteTime);
      this.nextNoteTime += secondsPer16th;
      this.current16thNote = (this.current16thNote + 1) % 64; // 4 bars of 16 steps
    }
  }

  /**
   * Smooth, melodic 4-bar progression:
   * Bar 0: D Minor (Dm)
   * Bar 1: Bb Major (Bb)
   * Bar 2: F Major (F)
   * Bar 3: C Major (C)
   * 
   * Uses exclusively soft sine and triangle oscillators routed through an 800Hz lowpass filter.
   */
  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.musicLowpassFilter) return;

    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    // 1. WARM, ROUND BASSLINE (Smooth Triangle Waves, strictly low register)
    // Plays a rhythmic, bouncy retro synth bass pattern on 8th notes and syncopated 16ths
    const isBassStep = stepInBar % 2 === 0 || stepInBar === 7 || stepInBar === 15;
    if (isBassStep) {
      let bassFreq = 73.42; // D2
      if (bar === 0) {
        // D2 (73.42Hz) & octave bounce D3 (146.83Hz)
        bassFreq = (stepInBar === 4 || stepInBar === 12) ? 146.83 : 73.42;
      } else if (bar === 1) {
        // Bb1 (58.27Hz) & Bb2 (116.54Hz)
        bassFreq = (stepInBar === 4 || stepInBar === 12) ? 116.54 : 58.27;
      } else if (bar === 2) {
        // F2 (87.31Hz) & F3 (174.61Hz)
        bassFreq = (stepInBar === 4 || stepInBar === 12) ? 174.61 : 87.31;
      } else {
        // C2 (65.41Hz) & C3 (130.81Hz)
        bassFreq = (stepInBar === 4 || stepInBar === 12) ? 130.81 : 65.41;
      }

      try {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();

        // Gentle triangle wave - round and warm, zero buzz
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, time);

        // Soft attack envelope to eliminate click/pop
        bassGain.gain.setValueAtTime(0.001, time);
        bassGain.gain.linearRampToValueAtTime(0.24, time + 0.008);
        bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

        bassOsc.connect(bassGain);
        bassGain.connect(this.musicLowpassFilter);

        bassOsc.start(time);
        bassOsc.stop(time + 0.115);
      } catch {
        // safe
      }
    }

    // 2. SOFT, MELODIC RETRO ARPEGGIO LOOP (Gentle Sine / Triangle Waves)
    // Frequencies stay between 260Hz and 700Hz, completely free of harsh frequencies!
    const melodicChords = [
      // Bar 0 (Dm): D4, F4, A4, D5, A4, F4, D4, E4, F4, A4, D5, E5, D5, A4, F4, A4
      [293.66, 349.23, 440.0, 587.33, 440.0, 349.23, 293.66, 329.63, 349.23, 440.0, 587.33, 659.25, 587.33, 440.0, 349.23, 440.0],
      // Bar 1 (Bb): Bb3, D4, F4, Bb4, F4, D4, Bb3, C4, D4, F4, Bb4, C5, Bb4, F4, D4, F4
      [233.08, 293.66, 349.23, 466.16, 349.23, 293.66, 233.08, 261.63, 293.66, 349.23, 466.16, 523.25, 466.16, 349.23, 293.66, 349.23],
      // Bar 2 (F): F3, A3, C4, F4, C4, A3, F3, G3, A3, C4, F4, G4, F4, C4, A3, C4
      [174.61, 220.0, 261.63, 349.23, 261.63, 220.0, 174.61, 196.0, 220.0, 261.63, 349.23, 392.0, 349.23, 261.63, 220.0, 261.63],
      // Bar 3 (C): C4, E4, G4, C5, G4, E4, C4, D4, E4, G4, B4, C5, B4, G4, E4, G4
      [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 261.63, 293.66, 329.63, 392.0, 493.88, 523.25, 493.88, 392.0, 329.63, 392.0],
    ];

    try {
      const arpFreq = melodicChords[bar][stepInBar];
      const arpOsc = this.ctx.createOscillator();
      const arpGain = this.ctx.createGain();

      // Pure gentle sine wave for crystalline, clean arcade chime
      arpOsc.type = 'sine';
      arpOsc.frequency.setValueAtTime(arpFreq, time);

      // Pleasant volume dynamic
      const isAccent = stepInBar === 0 || stepInBar === 6 || stepInBar === 10;
      const arpPeak = isAccent ? 0.075 : 0.045;

      // Soft envelope (no click, lingering musical tail)
      arpGain.gain.setValueAtTime(0.001, time);
      arpGain.gain.linearRampToValueAtTime(arpPeak, time + 0.006);
      arpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

      arpOsc.connect(arpGain);
      arpGain.connect(this.musicLowpassFilter);

      arpOsc.start(time);
      arpOsc.stop(time + 0.135);
    } catch {
      // safe
    }

    // 3. MELLOW ACOUSTIC-FEEL RETRO KICK (Pure Sine Drop, Zero Noise)
    // Steady, gentle four-on-the-floor pulse on beats 1, 2, 3, 4
    if (stepInBar % 4 === 0) {
      try {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();

        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(110, time);
        kickOsc.frequency.exponentialRampToValueAtTime(36, time + 0.075);

        kickGain.gain.setValueAtTime(0.28, time);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        kickOsc.connect(kickGain);
        kickGain.connect(this.musicLowpassFilter);

        kickOsc.start(time);
        kickOsc.stop(time + 0.085);
      } catch {
        // safe
      }
    }

    // 4. CLEAN TONAL BACKBEAT TAP (Steps 4 & 12 - Gentle Sine/Triangle Woodblock, NO WHITE NOISE)
    if (stepInBar === 4 || stepInBar === 12) {
      try {
        const tapOsc = this.ctx.createOscillator();
        const tapGain = this.ctx.createGain();

        tapOsc.type = 'triangle';
        tapOsc.frequency.setValueAtTime(320, time);
        tapOsc.frequency.exponentialRampToValueAtTime(180, time + 0.035);

        tapGain.gain.setValueAtTime(0.08, time);
        tapGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        tapOsc.connect(tapGain);
        tapGain.connect(this.musicLowpassFilter);

        tapOsc.start(time);
        tapOsc.stop(time + 0.045);
      } catch {
        // safe
      }
    }
  }

  // ==================== RETRO SOUND EFFECTS ====================

  // Snappy, clean gravity reverse flip sound
  public playFlip(direction: 'UP' | 'DOWN' = 'UP') {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      if (direction === 'UP') {
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.06);
      } else {
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.06);
      }

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.075);
    } catch {
      // safe
    }
  }

  // Play retro coin collect chime with combo pitch scaling
  public playCoinCollect(combo: number = 1) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const pitchMultiplier = Math.min(1.5, 1 + (combo - 1) * 0.06);
      const note1 = 880.0 * pitchMultiplier; // A5
      const note2 = 1174.66 * pitchMultiplier; // D6

      [note1, note2].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0, now + idx * 0.04);
        gain.gain.setValueAtTime(0.22, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.12);

        osc.connect(gain);
        gain.connect(this.sfxGainNode || this.ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.13);
      });
    } catch {
      // safe
    }
  }

  // Energy orb collectible sound
  public playOrbCollect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [587.33, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.035);

        gain.gain.setValueAtTime(0, now + idx * 0.035);
        gain.gain.setValueAtTime(0.18, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.12);

        osc.connect(gain);
        gain.connect(this.sfxGainNode || this.ctx.destination);

        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.13);
      });
    } catch {
      // safe
    }
  }

  // Distance milestone / score chime
  public playScoreMilestone() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.21);
    } catch {
      // safe
    }
  }

  // Crash explosion sound
  public playCrash() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      if (this.noiseBuffer) {
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = this.noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(50, now + 0.3);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        whiteNoise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.sfxGainNode || this.ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 0.31);
      }

      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      subGain.gain.setValueAtTime(0.35, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      subOsc.connect(subGain);
      subGain.connect(this.sfxGainNode || this.ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.36);
    } catch {
      // safe
    }
  }

  // UI button click
  public playClick() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.04);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // safe
    }
  }
}

export const soundFx = new SoundSynthesizer();
