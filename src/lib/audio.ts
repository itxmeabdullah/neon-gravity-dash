/**
 * Web Audio API synthesizer for retro synthwave sound effects and procedural continuous music.
 * Completely zero external sound files required!
 * Synthesized 100% programmatically with Web Audio API oscillators, filters, and scheduled events.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private musicInterval: number | null = null;
  private isMuted = false;
  private isMusicMuted = false;

  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Music lookahead scheduler state (rock-solid 125 BPM groove)
  private tempo = 125;
  private current16thNote = 0;
  private nextNoteTime = 0;
  private isMusicRunning = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // First try immediate start
      const tryAutoStart = () => {
        this.initContext();
        if (this.ctx && this.ctx.state === 'running') {
          this.startMusic();
        }
      };

      // Ensure start on first user interaction (pointerdown, click, touch, keydown)
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

      // Check autoplay right away
      tryAutoStart();
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // Music master gain bus
        this.musicGainNode = this.ctx.createGain();
        this.musicGainNode.gain.setValueAtTime(this.isMusicMuted ? 0 : 0.22, this.ctx.currentTime);
        this.musicGainNode.connect(this.ctx.destination);

        // SFX master gain bus
        this.sfxGainNode = this.ctx.createGain();
        this.sfxGainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
        this.sfxGainNode.connect(this.ctx.destination);

        this.createNoiseBuffer();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate; // 1 second loopable white noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  public setSoundMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setValueAtTime(muted ? 0 : 0.35, this.ctx.currentTime);
    }
  }

  public setMusicMuted(muted: boolean) {
    this.isMusicMuted = muted;
    if (this.ctx && this.musicGainNode) {
      const now = this.ctx.currentTime;
      // Smooth ramp to avoid pops
      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.linearRampToValueAtTime(muted ? 0 : 0.22, now + 0.05);
    }

    if (!muted) {
      this.startMusic();
    }
  }

  public isMuteState() {
    return { sound: this.isMuted, music: this.isMusicMuted };
  }

  // ==================== PROCEDURAL SYNTHWAVE MUSIC ====================
  // Continuous looping retro synthwave track: upbeat bassline arpeggio & electronic drum clicks
  public startMusic() {
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.isMusicRunning) return;
    this.isMusicRunning = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    // Scheduler tick every 25ms using Web Audio lookahead
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

    const secondsPer16th = 60.0 / this.tempo / 4.0; // ~0.12s
    const scheduleAheadTime = 0.12;

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.current16thNote, this.nextNoteTime);
      this.nextNoteTime += secondsPer16th;
      this.current16thNote = (this.current16thNote + 1) % 64; // 4-bar progression (16 steps * 4)
    }
  }

  // 4-Bar Synthwave D-Minor Chord Progression with Octave Arpeggiator
  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.musicGainNode) return;

    // Bassline Notes (in Hz): D Minor -> Bb Major -> C Major -> G Minor / A Turnaround
    // D2=73.42, D3=146.83, A2=110, F2=87.31, F3=174.61, C3=130.81, Bb1=58.27, Bb2=116.54, C2=65.41, G1=49, G2=98, A1=55
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    let bassFreq = 73.42; // default D2

    if (bar === 0) {
      // Bar 1: D Minor drive
      const dPattern = [73.42, 146.83, 73.42, 146.83, 110.0, 146.83, 73.42, 87.31, 73.42, 146.83, 73.42, 146.83, 110.0, 146.83, 87.31, 110.0];
      bassFreq = dPattern[stepInBar];
    } else if (bar === 1) {
      // Bar 2: Bb Major to F Major
      const bbPattern = [58.27, 116.54, 58.27, 116.54, 87.31, 116.54, 58.27, 87.31, 87.31, 174.61, 87.31, 174.61, 130.81, 174.61, 110.0, 130.81];
      bassFreq = bbPattern[stepInBar];
    } else if (bar === 2) {
      // Bar 3: C Major drive
      const cPattern = [65.41, 130.81, 65.41, 130.81, 98.0, 130.81, 65.41, 82.41, 65.41, 130.81, 65.41, 130.81, 98.0, 130.81, 82.41, 98.0];
      bassFreq = cPattern[stepInBar];
    } else {
      // Bar 4: G Minor to A Turnaround
      const gPattern = [49.0, 98.0, 49.0, 98.0, 73.42, 98.0, 58.27, 73.42, 55.0, 110.0, 55.0, 110.0, 82.41, 110.0, 138.59, 164.81];
      bassFreq = gPattern[stepInBar];
    }

    // 1. Synth Bass Note (Sawtooth + Lowpass resonant filter envelope)
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, time);

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(3.5, time);
      filter.frequency.setValueAtTime(620, time);
      filter.frequency.exponentialRampToValueAtTime(140, time + 0.1);

      gain.gain.setValueAtTime(0.24, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGainNode);

      osc.start(time);
      osc.stop(time + 0.115);
    } catch {
      // safe fallback
    }

    // 2. Electronic Drum Clicks & Beats
    // A) 4-on-the-floor electro kick punch: steps 0, 4, 8, 12
    if (stepInBar % 4 === 0) {
      try {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();

        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(140, time);
        kickOsc.frequency.exponentialRampToValueAtTime(36, time + 0.08);

        kickGain.gain.setValueAtTime(0.38, time);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGainNode);

        kickOsc.start(time);
        kickOsc.stop(time + 0.095);
      } catch {
        // safe
      }
    }

    // B) Electronic Snare / Clap click on beats 4 and 12 (backbeat)
    if (stepInBar === 4 || stepInBar === 12) {
      try {
        // Snappy tonal click
        const snareOsc = this.ctx.createOscillator();
        const snareGain = this.ctx.createGain();

        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(320, time);
        snareOsc.frequency.exponentialRampToValueAtTime(70, time + 0.06);

        snareGain.gain.setValueAtTime(0.22, time);
        snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

        snareOsc.connect(snareGain);
        snareGain.connect(this.musicGainNode);

        snareOsc.start(time);
        snareOsc.stop(time + 0.075);

        // Electronic noise crackle
        if (this.noiseBuffer) {
          const noiseSrc = this.ctx.createBufferSource();
          noiseSrc.buffer = this.noiseBuffer;
          const noiseFilter = this.ctx.createBiquadFilter();
          noiseFilter.type = 'bandpass';
          noiseFilter.frequency.setValueAtTime(1400, time);
          noiseFilter.Q.setValueAtTime(2.0, time);

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.18, time);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

          noiseSrc.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(this.musicGainNode);

          noiseSrc.start(time);
          noiseSrc.stop(time + 0.085);
        }
      } catch {
        // safe
      }
    }

    // C) Electronic Hi-hat tick / click on offbeats (every odd 16th note)
    if (stepInBar % 2 === 1) {
      try {
        if (this.noiseBuffer) {
          const hatSrc = this.ctx.createBufferSource();
          hatSrc.buffer = this.noiseBuffer;
          const hatFilter = this.ctx.createBiquadFilter();
          hatFilter.type = 'highpass';
          hatFilter.frequency.setValueAtTime(7200, time);

          const hatGain = this.ctx.createGain();
          hatGain.gain.setValueAtTime(0.08, time);
          hatGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

          hatSrc.connect(hatFilter);
          hatFilter.connect(hatGain);
          hatGain.connect(this.musicGainNode);

          hatSrc.start(time);
          hatSrc.stop(time + 0.03);
        }
      } catch {
        // safe
      }
    }

    // D) Neon Synth Arpeggio High Lead (steps in bars 2 and 3 for melodic synthwave atmosphere)
    if (bar >= 1 && stepInBar % 4 === 2) {
      try {
        const leadNotes = [587.33, 698.46, 880.0, 1046.5]; // D5, F5, A5, C6
        const leadFreq = leadNotes[(step / 2) % leadNotes.length];

        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();

        leadOsc.type = 'triangle';
        leadOsc.frequency.setValueAtTime(leadFreq, time);

        leadGain.gain.setValueAtTime(0.05, time);
        leadGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

        leadOsc.connect(leadGain);
        leadGain.connect(this.musicGainNode);

        leadOsc.start(time);
        leadOsc.stop(time + 0.1);
      } catch {
        // safe
      }
    }
  }

  // ==================== RETRO SOUND EFFECTS ====================

  // Snappy gravity reverse flip effect
  public playFlip(direction: 'UP' | 'DOWN' = 'UP') {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // 1. Fast transient click/zap
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(direction === 'UP' ? 480 : 880, now);
      clickOsc.frequency.exponentialRampToValueAtTime(direction === 'UP' ? 1300 : 320, now + 0.04);
      clickGain.gain.setValueAtTime(0.32, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      clickOsc.connect(clickGain);
      clickGain.connect(this.sfxGainNode || this.ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.055);

      // 2. Body resonant sweep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(direction === 'UP' ? 820 : 1200, now);
      filter.Q.setValueAtTime(3, now);

      osc.type = 'sawtooth';
      if (direction === 'UP') {
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);
      } else {
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      }

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.095);
    } catch {
      // Audio playback failsafe
    }
  }

  // Play retro coin collect chime with combo pitch scaling
  public playCoinCollect(combo: number = 1) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const pitchMultiplier = Math.min(1.6, 1 + (combo - 1) * 0.08);
      const note1 = 987.77 * pitchMultiplier; // B5
      const note2 = 1318.51 * pitchMultiplier; // E6

      [note1, note2].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.045);

        gain.gain.setValueAtTime(0, now + idx * 0.045);
        gain.gain.setValueAtTime(0.25, now + idx * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.13);

        osc.connect(gain);
        gain.connect(this.sfxGainNode || this.ctx.destination);

        osc.start(now + idx * 0.045);
        osc.stop(now + idx * 0.045 + 0.14);
      });
    } catch {
      // Audio failsafe
    }
  }

  // Energy orb collectible sound
  public playOrbCollect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [659.25, 880, 1318.51];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.035);

        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.2, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.14);

        osc.connect(gain);
        gain.connect(this.sfxGainNode || this.ctx.destination);

        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.15);
      });
    } catch {
      // Audio failsafe
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
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Audio failsafe
    }
  }

  // Crash explosion / collision sound
  public playCrash() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Noise burst using pre-allocated noise buffer
      if (this.noiseBuffer) {
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = this.noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(1200, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.35);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.38, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        whiteNoise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.sfxGainNode || this.ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 0.36);
      }

      // 2. Heavy Sub Bass impact
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(170, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.4);

      subGain.gain.setValueAtTime(0.42, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      subOsc.connect(subGain);
      subGain.connect(this.sfxGainNode || this.ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.42);
    } catch {
      // Audio failsafe
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
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGainNode || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Audio failsafe
    }
  }
}

export const soundFx = new SoundSynthesizer();
