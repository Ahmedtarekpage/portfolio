// voice.js — 🦈 صوت قرش: ElevenLabs (صوت هيثم المصري، من السيرفر) بطلب صاحب الحساب لأن Piper العربي مش طبيعي،
// وPiper (مفتوح المصدر، جوّه المتصفح) احتياطي لو السيرفر مش متاح. والمايك: تسجيل + ElevenLabs Scribe.
// الصوت: أول مرة بينزّل الموديل (~60MB) ويتحفظ في المتصفح (OPFS)، وبعدها بيبدأ بسرعة.
// الكلام بيتقسم جمل: والجملة بتتقال، اللي بعدها بتتجهّز، فمفيش استنى بين الجمل.
// المايك: التعرّف على الكلام من المتصفح نفسه (Web Speech API)، بالمصري (ar-EG).

const PIPER = 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm';
const WASM = {
  onnxWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/',
  piperData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  piperWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
};
const VOICE = { ar: 'ar_JO-kareem-medium', en: 'en_US-lessac-medium' };

const sessions = {};
let onStatus = () => {};
export const setVoiceStatus = fn => { onStatus = fn || (() => {}); };

/** تجهيز الصوت في الخلفية (مرة واحدة لكل لغة) */
export function preload(lang = 'ar') {
  if (sessions[lang]) return sessions[lang];
  onStatus('loading');
  sessions[lang] = (async () => {
    const tts = await import(PIPER);
    const s = await tts.TtsSession.create({ voiceId: VOICE[lang] || VOICE.ar, wasmPaths: WASM, progress: p => p?.total && onStatus('loading', Math.round(p.loaded / p.total * 100)) });
    await s.predict(lang === 'ar' ? 'أهلا' : 'Hi'); // تسخين: أول جملة بتبقى أبطأ
    onStatus('ready');
    return s;
  })().catch(e => { delete sessions[lang]; onStatus('error'); throw e; });
  return sessions[lang];
}

/** نص نضيف للنطق: من غير إيموجي ورموز، والجمل مقسومة */
export function sentences(text) {
  const clean = String(text || '')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200d]/gu, ' ')
    .replace(/[*_#>`|•→←↩️⏩]/g, ' ')
    .replace(/Đ|AED/g, ' درهم ').replace(/E£|EGP/g, ' جنيه ')
    .replace(/\s+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?؟،:\n])\s+/).map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s));
  // جمل قصيرة أوي بتتلم مع اللي بعدها، والطويلة بتتقسم عند الفاصلة
  const out = [];
  for (const s of parts) { if (out.length && out[out.length - 1].length < (out.length === 1 ? 60 : 160)) out[out.length - 1] += ' ' + s; else out.push(s); } // أول جملة قصيرة عشان يبدأ بسرعة، والباقي أطول عشان النطق يبقى طبيعي
  return out.flatMap(s => s.length > 220 ? s.split(/(?<=[,،])\s+/) : [s]);
}

/** جملة لصوت: من السيرفر (ElevenLabs)، ولو مش متاح Piper */
let serverOk = true;
async function synth(text, lang) {
  if (serverOk && window.FLOOSY_USE?.voice !== false) { // 🎛 off: ElevenLabs is not called; the on-device voice speaks instead
    try {
      const r = await fetch('/api/ideas?finance=tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) return await r.blob();
      if (r.status === 503) serverOk = false;
    } catch {}
  }
  return (await preload(lang)).predict(text);
}
let playing = null, stopFlag = 0;
// ⚡ سرعة الكلام (من غير ما الصوت يتخن أو يرفّع): 1 / 1.15 / 1.3 / 1.5
let rate = 1.15; try { rate = +localStorage.getItem('floosy.vrate') || 1.15; } catch {}
export const getRate = () => rate;
export function setRate(r) { rate = r; try { localStorage.setItem('floosy.vrate', String(r)); } catch {} if (playing) playing.playbackRate = r; }
export const speaking = () => !!playing;
export function stop() { stopFlag++; if (playing) { playing.pause(); playing = null; } onStatus('ready'); }

/** يقول النص جملة جملة: الجملة الجاية بتتجهّز وهو بيقول اللي قبلها */
export async function speak(text, lang = 'ar', onSentence = () => {}) {
  stop(); const my = stopFlag;
  const list = sentences(text); if (!list.length) return;
  onStatus('speaking');
  let next = synth(list[0], lang);
  for (let i = 0; i < list.length; i++) {
    let blob; try { blob = await next; } catch { break; }
    if (my !== stopFlag) return;
    if (i + 1 < list.length) next = synth(list[i + 1], lang);
    const a = new Audio(URL.createObjectURL(blob)); a.preservesPitch = true; a.playbackRate = rate; playing = a; onSentence(i, list[i], list.length); // الترجمة اللي تحت بتمشي مع الكلام
    await new Promise(res => { a.onended = a.onerror = res; a.play().catch(res); });
    URL.revokeObjectURL(a.src);
    if (my !== stopFlag) return;
  }
  playing = null; onStatus('ready');
}

/** 🎙️ يسمعك: بيسجّل لحد ما تسكت ثانية ونص (أو 25 ثانية)، ويبعت الصوت لـ ElevenLabs Scribe، ويرجّع النص */
export function canListen() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }
let recStop = null;
export async function listen(lang = 'ar', onPartial = () => {}) {
  if (!canListen()) return null;
  stopListening();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { onPartial(lang === 'ar' ? '🚫 المايك مقفول: اسمح للموقع يستخدم المايك' : '🚫 Mic blocked: allow the site to use it'); return null; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  // كشف السكوت: لما الصوت يعلى بعدين يسكت 1.4 ثانية، يقف لوحده
  const ac = new (window.AudioContext || window.webkitAudioContext)(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
  const buf = new Uint8Array(an.fftSize); let spoke = false, quietSince = 0, t0 = performance.now(), raf = 0;
  const done = new Promise(res => { rec.onstop = res; });
  const stopNow = () => { if (rec.state !== 'inactive') rec.stop(); };
  recStop = stopNow;
  const loop = () => {
    an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    const now = performance.now(), loud = peak > 14;
    onPartial((lang === 'ar' ? '🎙️ سامعك ' : '🎙️ Listening ') + '▮'.repeat(Math.min(12, Math.round(peak / 6))));
    if (loud) { spoke = true; quietSince = 0; } else if (spoke && !quietSince) quietSince = now;
    if ((spoke && quietSince && now - quietSince > 1400) || now - t0 > 25000 || (!spoke && now - t0 > 8000)) return stopNow();
    raf = requestAnimationFrame(loop);
  };
  rec.start(250); loop();
  await done; cancelAnimationFrame(raf); recStop = null;
  stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {});
  if (!spoke || !chunks.length) return null;
  onPartial(lang === 'ar' ? '⏳ بكتب اللي قلته…' : '⏳ Writing down what you said…');
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
  if (window.FLOOSY_USE?.voice === false) { onPartial(lang === 'ar' ? '🎛 الكتابة بالصوت مقفولة من التحكم' : '🎛 Voice typing is switched off in the controls'); return null; } // ElevenLabs Scribe is paid too
  try {
    const r = await fetch('/api/ideas?finance=stt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, mime: blob.type, lang }) });
    const d = await r.json(); return (r.ok && d.text) ? d.text : null;
  } catch { return null; }
}
export function stopListening() { recStop?.(); }
