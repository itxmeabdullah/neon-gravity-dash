/**
 * Web Audio API synthesizer for retro synthwave sound effects and procedural music.
 * Completely zero external sound files required!
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private musicInterval: number | null = null;
  private musicStep = 0;
  private isMuted = false;
  private isMusicMuted = false;

  constructor() {
    // Automatically prepare and resume audio context on first user interaction
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.initContext();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setSoundMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public setMusicMuted(muted: boolean) {
    this.isMusicMuted = muted;
    if (muted) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
  }

  public isMuteState() {
    return { sound: this.isMuted, music: this.isMusicMuted };
  }

  // Play snappy flip / gravity reverse effect
  public playFlip(direction: 'UP' | 'DOWN' = 'UP') {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // 1. Transient click/zap for immediate feedback
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(direction === 'UP' ? 440 : 880, now);
      clickOsc.frequency.exponentialRampToValueAtTime(direction === 'UP' ? 1200 : 300, now + 0.05);
      clickGain.gain.setValueAtTime(0.3, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      clickOsc.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.06);

      // 2. Body resonant sweep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(direction === 'UP' ? 800 : 1200, now);
      filter.Q.setValueAtTime(3, now);

      osc.type = 'sawtooth';
      if (direction === 'UP') {
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.09);
      } else {
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
      }

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      // Audio playback failsafe
    }
  }

  // Play crisp retro coin collect sound with ascending combo pitch
  public playCoinCollect(combo: number = 1) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Base frequencies with combo multiplier pitch scaling
      const pitchMultiplier = Math.min(1.6, 1 + (combo - 1) * 0.08);
      const note1 = 987.77 * pitchMultiplier; // B5
      const note2 = 1318.51 * pitchMultiplier; // E6

      [note1, note2].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0, now + idx * 0.05);
        gain.gain.setValueAtTime(0.24, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.15);
      });
    } catch {
      // Audio failsafe
    }
  }

  // Play energy orb / bonus collectible sound
  public playOrbCollect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [659.25, 880, 1318.51]; // E5, A5, E6
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.2, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.16);
      });
    } catch {
      // Audio failsafe
    }
  }

  // Play distance milestone / score chime
  public playScoreMilestone() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Audio failsafe
    }
  }

  // Play crash explosion / collision sound
  public playCrash() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. White Noise burst
      const bufferSize = this.ctx.sampleRate * 0.35;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1200, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.35);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.36);

      // 2. Heavy Sub Bass impact
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(160, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.4);

      subGain.gain.setValueAtTime(0.4, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.42);
    } catch {
      // Audio failsafe
    }
  }

  // Play UI button click
  public playClick() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Audio failsafe
    }
  }

  // Start procedural synthwave bassline & rhythm
  public startMusic() {
    if (this.isMusicMuted || this.musicInterval !== null) return;
    this.initContext();

    // 124 BPM synthwave bassline: 16th notes = ~121ms per step
    const stepDuration = 122; // ms
    // Synthwave bass progression in D Minor: D2, F2, C2, G2
    const bassScale = [
      73.42, 73.42, 146.83, 73.42, 73.42, 73.42, 146.83, 110.0, // D2, D2, D3, D2, D2, D2, D3, A2
      87.31, 87.31, 174.61, 87.31, 87.31, 87.31, 174.61, 130.81, // F2, F2, F3, F2, F2, F2, F3, C3
      65.41, 65.41, 130.81, 65.41, 65.41, 65.41, 130.81, 98.0,   // C2, C2, C3, C2, C2, C2, C3, G2
      98.0,  98.0,  196.0,  98.0,  98.0,  98.0,  196.0,  146.83  // G2, G2, G3, G2, G2, G2, G3, D3
    ];

    this.musicInterval = window.setInterval(() => {
      if (this.isMusicMuted || !this.ctx) return;

      try {
        const now = this.ctx.currentTime;
        const noteFreq = bassScale[this.musicStep % bassScale.length];

        // Bass synth pulse
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(noteFreq, now);

        filter.type = 'lowpass';
        // Filter envelope for classic synth pluck
        filter.frequency.setValueAtTime(450, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 0.09);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.11);

        // Hi-hat tick on 16th notes (soft white noise)
        if (this.musicStep % 2 === 1) {
          const hatBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.03, this.ctx.sampleRate);
          const data = hatBuf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.02;
          const hatSource = this.ctx.createBufferSource();
          hatSource.buffer = hatBuf;
          const hatGain = this.ctx.createGain();
          hatGain.gain.setValueAtTime(0.05, now);
          hatSource.connect(hatGain);
          hatGain.connect(this.ctx.destination);
          hatSource.start(now);
        }

        this.musicStep = (this.musicStep + 1) % bassScale.length;
      } catch {
        // audio safeguard
      }
    }, stepDuration);
  }

  public stopMusic() {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const soundFx = new SoundSynthesizer();
