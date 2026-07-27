// Synthesised sound effects via the WebAudio API — no audio files. Each effect
// is a short procedurally-built tone/noise burst. The context is created lazily
// on first use (after a user gesture) to satisfy autoplay policies.

type NoiseKind = 'hit' | 'smash' | 'net' | 'bounce';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(this.ctx);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Resume the context after a user gesture (call from a click/keydown). */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(kind: NoiseKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const t0 = ctx.currentTime;

    let dur = 0.08;
    let gain = 0.3;
    if (kind === 'hit') {
      filt.type = 'bandpass';
      filt.frequency.value = 2200;
      filt.Q.value = 1.2;
      dur = 0.06;
      gain = 0.35;
    } else if (kind === 'smash') {
      filt.type = 'bandpass';
      filt.frequency.value = 1400;
      filt.Q.value = 0.8;
      dur = 0.12;
      gain = 0.5;
    } else if (kind === 'net') {
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      dur = 0.1;
      gain = 0.28;
    } else {
      filt.type = 'lowpass';
      filt.frequency.value = 500;
      dur = 0.09;
      gain = 0.3;
    }

    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  hit(): void {
    this.noise('hit');
    this.tone(520, 0.05, 'square', 0.12, 300);
  }

  smash(): void {
    this.noise('smash');
    this.tone(300, 0.14, 'sawtooth', 0.18, 90);
  }

  netTouch(): void {
    this.noise('net');
  }

  bounce(): void {
    this.noise('bounce');
    this.tone(140, 0.09, 'sine', 0.14, 70);
  }

  serve(): void {
    this.tone(440, 0.06, 'triangle', 0.14, 600);
  }

  point(): void {
    this.arpeggio([523, 659, 784], 0.09, 'triangle', 0.16);
  }

  gameWon(): void {
    this.arpeggio([523, 659, 784, 1046], 0.1, 'square', 0.16);
  }

  matchWon(): void {
    this.arpeggio([523, 659, 784, 1046, 1318], 0.13, 'sawtooth', 0.16);
    this.crowdSwell();
  }

  crowdSwell(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 700;
    filt.Q.value = 0.6;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 1.1);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 1.2);
  }

  private arpeggio(freqs: number[], step: number, type: OscillatorType, gain: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      const t0 = ctx.currentTime + i * step;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + step * 1.6);
      osc.connect(g).connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + step * 1.7);
    });
  }
}
