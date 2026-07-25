/**
 * Shared Tone.js bootstrap — loads Tone.js once and caches it.
 */
let tonePromise = null;

/** Load and cache Tone.js. Call from SFX or Music — only fetches once. */
export async function ensureTone() {
  if (tonePromise) return tonePromise;
  tonePromise = import('https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js')
    .then(mod => { window.Tone = mod.default || mod; return mod.default || mod; })
    .catch(() => { tonePromise = null; throw new Error('Tone.js not available'); });
  return tonePromise;
}

/**
 * Simple audio SFX using Tone.js
 */
export class SFX {
  constructor() { this.ready = false; this.tone = null; }

  async init() {
    if (this.ready) return;
    try {
      this.tone = await ensureTone();
      await this.tone.start();
      this.ready = true;
    } catch (e) { console.warn('[SFX] Tone.js not available'); }
  }

  play(type) {
    if (!this.ready || !this.tone) return;
    const Tone = this.tone;
    try {
      if (type === 'select') {
        const s = new Tone.Synth({ oscillator: { type: 'sine' } }).toDestination();
        s.triggerAttackRelease('C5', '32n'); s.dispose();
      } else if (type === 'move') {
        const s = new Tone.Synth({ oscillator: { type: 'triangle' } }).toDestination();
        s.triggerAttackRelease('G3', '32n'); s.dispose();
      } else if (type === 'shoot') {
        const n = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination();
        n.triggerAttackRelease('16n'); n.dispose();
      } else if (type === 'explosion') {
        const n = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0 } }).toDestination();
        n.triggerAttackRelease('8n'); n.dispose();
      } else if (type === 'build') {
        const s = new Tone.Synth({ oscillator: { type: 'square' } }).toDestination();
        s.triggerAttackRelease('E5', '16n'); s.dispose();
      }
    } catch (e) {}
  }
}