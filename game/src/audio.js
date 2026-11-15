// audio.js — every sound is synthesised with WebAudio: no audio files, no
// network. A shared noise buffer plus small oscillator envelopes cover shots,
// reloads, footsteps, beeps, the plant/defuse ticks and the explosion.

let ctx = null;
let noiseBuf = null;
let master = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function noise(dur, filterFreq, filterType, gain, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone(freq, dur, type, gain, slideTo = null, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  shot(kind) {
    if (!ctx) return;
    if (kind === 'sniper') { noise(0.22, 900, 'lowpass', 0.9); tone(160, 0.16, 'sine', 0.7, 55); }
    else if (kind === 'rifle') { noise(0.11, 1400, 'bandpass', 0.7); tone(120, 0.09, 'square', 0.28, 60); }
    else if (kind === 'smg') { noise(0.07, 1800, 'bandpass', 0.5); tone(150, 0.06, 'square', 0.2, 70); }
    else { noise(0.09, 1100, 'bandpass', 0.6); tone(110, 0.08, 'square', 0.25, 55); }
  },
  dry() { tone(1200, 0.04, 'square', 0.12); },
  reload() { tone(500, 0.05, 'square', 0.15); tone(700, 0.05, 'square', 0.15, null, 0.18); tone(420, 0.06, 'square', 0.18, null, 0.45); },
  hit() { tone(1900, 0.05, 'sine', 0.25); },
  kill() { tone(880, 0.09, 'sine', 0.25); tone(1320, 0.12, 'sine', 0.22, null, 0.08); },
  hurt() { noise(0.12, 500, 'lowpass', 0.4); tone(90, 0.12, 'sine', 0.3, 50); },
  footstep(run) { noise(0.05, 300, 'lowpass', run ? 0.12 : 0.07); },
  plantBeep() { tone(1050, 0.07, 'sine', 0.3); },
  defuseBeep() { tone(760, 0.07, 'sine', 0.3); },
  planted() { tone(520, 0.14, 'square', 0.25); tone(780, 0.2, 'square', 0.25, null, 0.14); },
  explosion() {
    noise(1.1, 320, 'lowpass', 1.0); tone(70, 0.9, 'sine', 0.9, 28); noise(0.4, 2400, 'highpass', 0.35);
  },
  grenadeThrow() { noise(0.08, 800, 'bandpass', 0.2); },
  bounce() { tone(300, 0.06, 'sine', 0.2, 180); },
  buy() { tone(660, 0.07, 'sine', 0.2); tone(990, 0.1, 'sine', 0.2, null, 0.07); },
  denied() { tone(220, 0.12, 'square', 0.18); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.25, null, i * 0.11)); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, null, i * 0.12)); },
  tick() { tone(1400, 0.04, 'sine', 0.14); },
};
