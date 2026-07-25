/**
 * Simple audio SFX using Tone.js
 */
export class SFX {
  constructor() { this.ready = false; }

  async init() {
    try {
      const Tone = await import('https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js');
      window.Tone = Tone;
      await Tone.start();
      this.ready = true;
    } catch (e) { console.warn('[SFX] Tone.js not available'); }
  }

  play(type) {
    if (!this.ready || !window.Tone) return;
    const Tone = window.Tone;
    try {
      if (type === 'select') { const s = new Tone.Synth({ oscillator: { type: 'sine' } }).toDestination(); s.triggerAttackRelease('C5', '32n'); }
      else if (type === 'move') { const s = new Tone.Synth({ oscillator: { type: 'triangle' } }).toDestination(); s.triggerAttackRelease('G3', '32n'); }
      else if (type === 'shoot') { const n = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination(); n.triggerAttackRelease('16n'); }
      else if (type === 'explosion') { const n = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0 } }).toDestination(); n.triggerAttackRelease('8n'); }
      else if (type === 'build') { const s = new Tone.Synth({ oscillator: { type: 'square' } }).toDestination(); s.triggerAttackRelease('E5', '16n'); }
    } catch (e) {}
  }
}