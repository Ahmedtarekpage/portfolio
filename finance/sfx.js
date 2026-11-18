// sfx.js — مؤثرات صوتية متولدة بالكود (من غير ملفات صوت)
let ac = null;
export const sfx = { on: true };

function audio() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function tone(f, at = 0, dur = 0.1, type = 'sine', vol = 0.08, to = 0) {
  if (!sfx.on) return;
  const a = audio(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}

function whoosh(dur = 0.22, vol = 0.08, from = 2400, to = 300) {
  if (!sfx.on) return;
  const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), flt = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  src.buffer = buf; flt.type = 'bandpass'; flt.Q.value = 1.2;
  flt.frequency.setValueAtTime(from, t); flt.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(a.destination); src.start(t);
}

Object.assign(sfx, {
  tap: () => tone(740, 0, 0.05, 'triangle', 0.05),
  tick: () => tone(1200, 0, 0.03, 'square', 0.02),
  pop: () => tone(420, 0, 0.09, 'sine', 0.07, 760),
  send: () => tone(680, 0, 0.08, 'sine', 0.06, 980),
  open: () => { tone(520, 0, 0.08, 'sine', 0.06, 880); tone(880, 0.07, 0.12, 'sine', 0.05); },
  edit: () => { tone(880, 0, 0.06, 'triangle', 0.05); tone(1175, 0.06, 0.09, 'triangle', 0.05); },
  ok: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.13, 'triangle', 0.07)),
  coin: (at = 0) => { tone(988, at, 0.07, 'square', 0.035); tone(1319, at + 0.07, 0.22, 'square', 0.035); },
  coins: () => { for (let i = 0; i < 7; i++) sfx.coin(i * 0.11 + Math.random() * 0.03); },
  spend: () => { tone(520, 0, 0.12, 'sawtooth', 0.04, 300); tone(300, 0.1, 0.22, 'sawtooth', 0.04, 140); },
  del: () => whoosh(),
  drop: () => tone(220, 0, 0.1, 'sine', 0.09, 110),
  err: () => { tone(180, 0, 0.12, 'square', 0.035); tone(150, 0.13, 0.16, 'square', 0.035); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.1, i === 5 ? 0.45 : 0.12, 'triangle', 0.08)),
});
