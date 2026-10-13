export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playPlaceNode(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 320, 540, 0.11, 'triangle', 0.14);
  }

  playWireConnect(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 440, 880, 0.09, 'sine', 0.12);
  }

  playUpgrade(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 400, 600, 0.08, 'triangle', 0.14);
    setTimeout(() => this.tone(ctx, 600, 920, 0.14, 'triangle', 0.14), 70);
  }

  playCacheHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 980, 1320, 0.055, 'sine', 0.05);
  }

  playPacketResolved(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 620, 780, 0.045, 'sine', 0.04);
  }

  playWafBlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 260, 140, 0.06, 'sawtooth', 0.06);
  }

  playPacketDropped(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 190, 95, 0.12, 'sawtooth', 0.11);
  }

  playWaveVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.tone(ctx, freq, freq * 1.02, 0.16, 'triangle', 0.14), idx * 95);
    });
  }

  playWaveFailed(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [340, 280, 210];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.tone(ctx, freq, freq * 0.9, 0.2, 'sawtooth', 0.14), idx * 130);
    });
  }

  private tone(
    ctx: AudioContext,
    startFreq: number,
    endFreq: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.01);
    } catch {
      // Ignore audio scheduling errors when tab is inactive
    }
  }
}
