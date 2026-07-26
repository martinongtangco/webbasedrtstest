import { ensureTone } from './sfx.js';

/**
 * Simple looping music using Tone.js
 */
export class Music {
  constructor() { this.ready = false; this.playing = false; this.tone = null; this.synth = null; this.loop = null; this._volume = 0.5; }

  async init() {
    if (this.ready) return;
    try {
      this.tone = await ensureTone();
      this.ready = true;
    } catch (e) { console.warn('[Music] Tone.js not available'); }
  }

  /** ADR-13: Set volume multiplier (0.0 to 1.0) */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.synth) {
      // Map 0→-30dB (nearly silent), 1→-18dB (base volume)
      this.synth.volume.value = -18 - (1 - this._volume) * 12;
    }
  }

  start() {
    if (!this.ready || !this.tone || this.playing) return;
    this.playing = true;
    const Tone = this.tone;
    try {
      Tone.start();
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.3 }
      }).toDestination();
      // Base volume: -18dB, adjusted by _volume (0→-30dB, 1→-18dB)
      this.synth.volume.value = -18 - (1 - this._volume) * 12;
      this.loop = new Tone.Loop(time => {
        this.synth.triggerAttackRelease(['C2', 'E2', 'G2'], '8n', time);
        this.synth.triggerAttackRelease(['C3', 'E3', 'G3'], '8n', time + 0.5);
        this.synth.triggerAttackRelease(['A2', 'C3', 'E3'], '8n', time + 1);
        this.synth.triggerAttackRelease(['F2', 'A2', 'C3'], '8n', time + 1.5);
      }, '2n');
      this.loop.start(0);
      Tone.Transport.bpm.value = 130;
      Tone.Transport.start();
    } catch (e) { this.playing = false; }
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    try {
      if (this.loop) { this.loop.stop(); this.loop.dispose(); this.loop = null; }
      if (this.synth) { this.synth.dispose(); this.synth = null; }
      if (this.tone) this.tone.Transport.stop();
    } catch (e) {}
  }
}