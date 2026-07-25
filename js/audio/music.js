/**
 * Simple looping music using Tone.js
 */
export class Music {
  constructor() { this.ready = false; this.playing = false; }

  async init() {
    try {
      const Tone = await import('https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js');
      window.Tone = Tone;
      this.ready = true;
    } catch (e) { console.warn('[Music] Tone.js not available'); }
  }

  start() {
    if (!this.ready || !window.Tone || this.playing) return;
    this.playing = true;
    const Tone = window.Tone;
    try {
      Tone.start();
      const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.3 } }).toDestination();
      synth.volume.value = -18;
      const loop = new Tone.Loop(time => {
        synth.triggerAttackRelease(['C2', 'E2', 'G2'], '8n', time);
        synth.triggerAttackRelease(['C3', 'E3', 'G3'], '8n', time + 0.5);
        synth.triggerAttackRelease(['A2', 'C3', 'E3'], '8n', time + 1);
        synth.triggerAttackRelease(['F2', 'A2', 'C3'], '8n', time + 1.5);
      }, '2n');
      loop.start(0);
      Tone.Transport.bpm.value = 130;
      Tone.Transport.start();
    } catch (e) { this.playing = false; }
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    try { window.Tone.Transport.stop(); } catch (e) {}
  }
}