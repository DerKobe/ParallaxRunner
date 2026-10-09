// Tiny WebAudio synth: chiptune sound effects and a moody synth-pad soundtrack.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('pr-muted') === '1'; } catch { /* storage unavailable */ }
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
    // cheap echo for the music
    const delay = this.ctx.createDelay(1); delay.delayTime.value = 0.45;
    const fb = this.ctx.createGain(); fb.gain.value = 0.35;
    this.musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(this.master);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('pr-muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  tone(f, dur, { type = 'square', vol = 0.3, to = null, delay = 0, bus } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus ?? this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  jump() { this.tone(300, 0.14, { to: 700, vol: 0.18 }); }
  djump() { this.tone(500, 0.16, { to: 1200, vol: 0.16 }); this.tone(750, 0.12, { to: 1600, vol: 0.08, delay: 0.04 }); }
  walljump() { this.noise(0.08, { vol: 0.25, freq: 2500, type: 'bandpass' }); this.tone(420, 0.12, { to: 900, vol: 0.15 }); }
  land(speed) { this.noise(0.09, { vol: Math.min(0.35, speed / 60), freq: 500 }); }
  slide() { this.noise(0.3, { vol: 0.18, freq: 3000, type: 'bandpass', q: 3 }); }
  bonk() { this.tone(160, 0.08, { vol: 0.15, type: 'triangle' }); }
  die() {
    this.tone(880, 0.6, { type: 'sawtooth', to: 40, vol: 0.22 });
    this.noise(0.5, { vol: 0.35, freq: 900 });
  }
  respawn() { [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.1, { vol: 0.1, delay: i * 0.06 })); }
  click() { this.tone(900, 0.05, { vol: 0.08 }); }

  startMusic() {
    // A-minor progression, slow pads + arpeggio, scheduled with a lookahead timer
    const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const step = 60 / 92 / 2; // eighth notes at 92 bpm
    let next = this.ctx.currentTime + 0.2, i = 0;
    const pad = (notes, t, dur) => {
      for (const n of notes) for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + dur * 0.5); f.frequency.linearRampToValueAtTime(500, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + dur + 0.05);
      }
    };
    const tick = () => {
      while (next < this.ctx.currentTime + 0.4) {
        const bar = Math.floor(i / 16) % chords.length, ch = chords[bar];
        if (i % 16 === 0) pad(ch, next, step * 16);
        if (i % 2 === 0) { // bass
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'triangle'; o.frequency.value = mtof(ch[0] - 24);
          g.gain.setValueAtTime(0.18, next); g.gain.exponentialRampToValueAtTime(0.001, next + step * 1.8);
          o.connect(g); g.connect(this.musicBus); o.start(next); o.stop(next + step * 2);
        }
        if (bar >= 0 && (i % 16) >= 0) { // arpeggio
          const n = ch[[0, 1, 2, 1, 2, 0, 1, 2][i % 8]] + 12 + (i % 16 >= 8 ? 12 : 0);
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'square'; o.frequency.value = mtof(n);
          g.gain.setValueAtTime(0.025, next); g.gain.exponentialRampToValueAtTime(0.0005, next + step * 0.9);
          o.connect(g); g.connect(this.musicBus); o.start(next); o.stop(next + step);
        }
        next += step; i++;
      }
    };
    this.musicTimer = setInterval(tick, 100);
    tick();
  }
}
