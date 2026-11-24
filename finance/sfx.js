// sfx.js — مؤثرات صوتية متولدة بالكود (من غير ملفات صوت)
let ac = null;
// on: شغال ولا لأ · gain: مستوى الصوت (واطي 0.55 / وسط 1 / عالي 1.6) · last: آخر مرة صوت اشتغل (عشان صوت الضغطة العام ما يتكررش فوق صوت مخصوص)
export const sfx = { on: true, gain: 1, last: 0 };
export const VOLS = { low: 0.55, mid: 1, high: 1.6 };

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
  sfx.last = performance.now(); vol = Math.min(0.2, vol * sfx.gain);
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
  sfx.last = performance.now(); vol = Math.min(0.2, vol * sfx.gain);
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
  // هادية ونضيفة: ضغطات قصيرة، وصفير خفيف للصفحات والشاشات المنبثقة
  click: () => tone(1050, 0, 0.035, 'sine', 0.035, 900),
  select: () => { tone(880, 0, 0.04, 'sine', 0.04); tone(1320, 0.035, 0.05, 'sine', 0.03); },
  page: () => { whoosh(0.18, 0.035, 600, 2200); tone(660, 0.05, 0.08, 'sine', 0.035, 990); },
  step: () => tone(700, 0, 0.07, 'sine', 0.045, 1050),
  back: () => tone(1000, 0, 0.07, 'sine', 0.04, 660),
  close: () => { whoosh(0.14, 0.03, 1800, 500); tone(700, 0, 0.08, 'sine', 0.035, 420); },
  key: () => tone(1500 + Math.random() * 200, 0, 0.025, 'sine', 0.025),
  on: () => { tone(660, 0, 0.05, 'sine', 0.045); tone(990, 0.05, 0.07, 'sine', 0.045); },
  off: () => { tone(990, 0, 0.05, 'sine', 0.04); tone(660, 0.05, 0.07, 'sine', 0.04); },
  unlock: () => [784, 988, 1319].forEach((f, i) => tone(f, i * 0.05, 0.09, 'sine', 0.045)),
  lock: () => [1319, 988, 784].forEach((f, i) => tone(f, i * 0.05, 0.08, 'sine', 0.04)),
  warn: () => { tone(620, 0, 0.07, 'triangle', 0.05); tone(620, 0.1, 0.07, 'triangle', 0.05); },
  note: () => tone(880, 0, 0.12, 'sine', 0.035, 1100),
  // 🦈 أصوات قرش: عوم، فقاعات، مسح البيانات
  swim: () => { whoosh(0.35, 0.03, 300, 900); tone(220, 0.05, 0.25, 'sine', 0.03, 330); },
  bubble: () => [0, 0.07, 0.15].forEach((at, i) => tone(500 + i * 180 + Math.random() * 80, at, 0.06, 'sine', 0.035, 900 + i * 200)),
  scan: () => { tone(900, 0, 0.18, 'sine', 0.025, 1600); tone(1600, 0.16, 0.08, 'sine', 0.02, 1200); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.1, i === 5 ? 0.45 : 0.12, 'triangle', 0.08)),
});

/* 📳 هزّة خفيفة في الإيد (سنيك 2026-11-21). الآيفون مفيهوش navigator.vibrate، بس من iOS 18 دوسة على
   <input type="checkbox" switch> بتعمل هزّة صغيرة، فبنستخدم واحد مستخبي. أندرويد: vibrate. لو مش مدعوم ما بيحصلش حاجة. */
let hapLabel = null;
export function haptic() {
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    if (!hapLabel) {
      hapLabel = document.createElement('label'); hapLabel.setAttribute('aria-hidden', 'true');
      hapLabel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-9px;top:0';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      hapLabel.append(i); document.body.append(hapLabel);
    }
    hapLabel.click();
  } catch {}
}
{ const s0 = sfx.spend; sfx.spend = () => { haptic(); s0(); }; }
