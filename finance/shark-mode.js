// shark-mode.js — 🦈 "وضع قرش": شاشة كاملة مستقبلية بتتكلم فيها مع قرش بدل الشات الصغير (طلب صاحب الحساب، 2026-11-20).
// مش منطق جديد: هي "وش" فوق الشات نفسه. كل رسالة من قرش بتظهر هنا كبيرة، والاختيارات أزرار كبيرة،
// واللي بتكتبه بيروح لنفس خانة الشات. ولما قرش عايز يوريك حاجة في الصفحة (point), الشاشة بتختفي،
// ومؤشر مضيء بيتحرك لحد المكان ويعلّم عليه، وبعدها ترجع لقرش.
//
// deps: { L, esc, sfx, logEl, chipsEl, say (form), sayIn }

import { mountShark3D } from './shark3d.js';
import { getRate, setRate, preload, speak, stop as stopVoice, listen, stopListening, canListen, setVoiceStatus, speaking } from './voice.js';

export const FEEDBACK = [
  'تمام يا معلم 👌', 'حلو أوي كده 🔥', 'ماشي يا باشا ✅', 'عاش يا وحش 💪', 'فهمتك يا كبير 😎', 'كده تمام التمام 💯', 'إيه الحلاوة دي 😍',
  'خلّيها عليا 🦈', 'جامد يا ريس 👏', 'حلو الكلام ده 🤝', 'أيوه كده انجز 😄', 'استنى بس أحسبها 🧮', 'خليني أفكر معاك 🤔', 'معاك يا صاحبي 🫡',
  'يا سلام عليك ✨', 'كلام مظبوط 👍', 'دي فكرة حلوة 💡', 'تمام، نكمّل 🚀', 'ماشي الحال 😌', 'إنت كده بتفهمها صح 🎯', 'حبيبي يا غالي ❤️',
  'جميل جميل 🌟', 'بص بقى 👀', 'حاضر من عنيا 😊', 'دقيقة واحدة ⏳', 'إحنا كده ماشيين صح 🛣️', 'يا عيني على الترتيب 📐', 'تسلم إيدك 🙌',
  'كده الصورة وضحت 🖼️', 'خلّينا نشوف الأرقام 📊', 'نورت يا معلم 💡', 'ده الكلام 👌', 'تمام يا فنان 🎨', 'حلوة دي 😁', 'معاك على طول 🦈',
  'ربنا يباركلك 🤲', 'بالراحة علينا 😅', 'ركّز معايا 🔍', 'أحلى مسا عليك 🌙', 'عظمة على عظمة 🏆', 'يلا بينا 🏃', 'أكيد طبعًا ✔️',
  'دي سهلة 😉', 'هنظبطها 🔧', 'مفيش أحسن من كده 🥇', 'شغل عالي 📈', 'تمام كده، الخطوة الجاية 👉', 'برافو عليك 👏', 'كلامك ذهب 🪙',
  'فلوسك في أمان معايا 🛟', 'يا جدع 😄', 'خلاص اتفقنا 🤝', 'أنا شايف كده برضه 👁️', 'حلوة الحركة دي 🕺', 'ماشي يا هندسة 🛠️',
];

/** 💬 كوميكس قرش: أمثال مصرية عن الفلوس، بتظهر في فقاعة كوميكس */
export const COMICS = [
  'القرش الأبيض ينفع في اليوم الأسود 🦈⚪', 'على قد لحافك مد رجليك 🛏️', 'القرش على القرش يعمل كوم 🪙🪙', 'اللي معاه قرش محيّره… يجيب حمام ويطيّره 🕊️ (بلاش إنت)',
  'اصرف ما في الجيب يأتيك ما في الغيب؟ ❌ لأ يا معلم، الأمان الأول', 'الحرص واجب 🧐', 'الدين همّ بالليل وذلّ بالنهار 🌙', 'قرشك الأبيض ينفعك في يومك الأسود، وأنا قرش 😎',
  'اللي ما يعرفش يقول عدس 🫘… وأنا عارف كل قرش', 'ابعد عن الشر وغنّيله… وابعد عن الفوايد وما تقرّبلها 🚫', 'إيد لوحدها ما تسقفش 👏 (الدخل والصرف لازم يتظبطوا سوا)',
  'اللي فات مات 🪦… بس اللي اتصرف لازم يتسجّل', 'من قدّم السبت يلاقي الحد قدامه 📅', 'خبّي قرشك الأبيض ✨ ليومك الأسود 🌑', 'الجنيه بيجري ورا الجنيه 🏃 (الاستثمار بعد الدين)',
  'ما تحطش بيضك كله في سلة واحدة 🧺🥚', 'اللي يبص لفوق يتعب 🙃… بُص على حصّالتك', 'القرش ما بيعضّش… بس الفوايد بتعضّ 🦈🦷', 'ربّنا يكفينا شر الأقساط 🤲', 'الصبر مفتاح الفرج 🔑… وقاعدة الـ7 أيام مفتاح الفلوس',
];

/** الأماكن اللي قرش يقدر يوريك فيها حاجة */
export const PLACES = {
  hero: '#stage', debt: '[data-debtview]', have: '[data-haveview]', today: '[data-dailyview]',
  cta: '#c-cta', pay: '#c-pay', month: '#c-month', essentials: '#c-ess', living: '#c-life', safety: '#c-spare', fun: '#c-fun',
  goals: '#c-goals', sadaqa: '#c-sad', invest: '#c-inv', wallets: '#c-wal', transfers: '#c-xfer', rules: '#c-rules', transactions: '#c-tx',
  analytics: '[data-page="stats"]', log: '[data-page="log"]',
};

const SHARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="sxg" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#C1CBE0"/><stop offset=".55" stop-color="#768CBB"/><stop offset="1" stop-color="#3A4D75"/></radialGradient></defs><path d="M25 12 L37 -1 Q39 7 41 13 Z" fill="#3A4D75"/><circle cx="32" cy="35" r="27" fill="url(#sxg)" stroke="#95A6CB" stroke-width="1.5"/><ellipse cx="32" cy="47" rx="19" ry="11" fill="#F7F1E7"/><g class="sx-eyes"><ellipse cx="23" cy="29" rx="3.6" ry="4.6" fill="#0b1020"/><ellipse cx="41" cy="29" rx="3.6" ry="4.6" fill="#0b1020"/><circle cx="24.3" cy="27.4" r="1.2" fill="#fff"/><circle cx="42.3" cy="27.4" r="1.2" fill="#fff"/></g><g class="sx-mouth"><path d="M21 42 Q32 53 43 42 Z" fill="#0b1020"/><path d="M23 43 l2.5 3 2.5 -2.6 2.5 3 2.5 -3 2.5 3 2.5 -2.6 2.5 3 1.5 -3.8 Z" fill="#fff"/></g></svg>`;

export function sharkMode({ L, esc, sfx, logEl, chipsEl, form, sayIn }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // زرار عائم يفتح الوضع
  const orb = document.createElement('button');
  orb.type = 'button'; orb.className = 'sx-orb'; orb.innerHTML = `${SHARK}<span>${L('كلّم قرش', 'Talk to Shark')}</span>`;
  orb.setAttribute('aria-label', L('افتح وضع قرش', 'Open Shark mode'));
  document.body.appendChild(orb);

  const o = document.createElement('div');
  o.className = 'sx'; o.hidden = true; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', L('وضع قرش', 'Shark mode'));
  o.innerHTML = `<div class="sx-bg"><i></i><i></i><i></i></div><div class="sx-grid"></div>
    <div class="sx-top"><span class="sx-brand">🦈 SHARK <b>OS</b> · <small>${L('مستشارك المالي', 'your money consultant')}</small></span><span class="sx-tools"><span class="sx-vstat" aria-live="polite"></span><button type="button" class="sx-rate" title="${L('سرعة الكلام', 'Speaking speed')}"></button><button type="button" class="sx-voice" aria-pressed="false" title="${L('صوت قرش', "Shark's voice")}">🔇</button><button type="button" class="sx-x" aria-label="${L('اقفل', 'Close')}">✕</button></span></div>
    <div class="sx-main">
      <div class="sx-avatar"><div class="sx-ring"></div><div class="sx-ring r2"></div>${SHARK}<div class="sx-fb" aria-live="polite"></div></div>
      <div class="sx-say" aria-live="polite"></div>
      <div class="sx-me"></div>
      <div class="sx-chips"></div>
    </div>
    <form class="sx-form"><input class="sx-in" autocomplete="off" placeholder="${L('اسأل قرش أي حاجة… اشتري ولا لأ؟ أستثمر في إيه؟ عاداتي في الصرف؟', 'Ask Shark anything… buy it or not? invest in what? my spending habits?')}"><button type="button" class="sx-mic" aria-label="${L('اتكلم', 'Speak')}" title="${L('اتكلم وقرش يسمعك', 'Talk, Shark listens')}">🎙️</button><button type="submit" class="sx-send" aria-label="${L('ابعت', 'Send')}">➤</button></form>
    <div class="sx-hist"></div><div class="sx-comic" aria-live="polite"></div>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector(s), sayEl = $('.sx-say'), chipsBox = $('.sx-chips'), meEl = $('.sx-me'), fb = $('.sx-fb'), hist = $('.sx-hist');
  let open = false, typeT = 0, lastBot = null, shownAt = 0, answers = 0;
  // 🦈 3D لو المتصفح يقدر، وإلا الرسمة العادية
  let S3 = null; mountShark3D($('.sx-avatar')).then(x => { if (x) { S3 = x; o.classList.add('has3d'); } });
  const mood = st => S3?.set(st);
  // 💬 كوميكس
  const comic = $('.sx-comic');
  function showComic() { comic.textContent = COMICS[Math.floor(Math.random() * COMICS.length)]; comic.classList.remove('on'); void comic.offsetWidth; comic.classList.add('on'); clearTimeout(showComic.t); showComic.t = setTimeout(() => comic.classList.remove('on'), 6500); }
  // 🟦 الشاشة الصغيرة اللي بتظهر وقرش شغال في الصفحة
  const mini = document.createElement('div'); mini.className = 'sx-mini'; mini.hidden = true; mini.innerHTML = `${SHARK}<span></span>`; document.body.appendChild(mini);
  const miniSay = t => { mini.querySelector('span').textContent = t; };

  const talk = () => { mood('talk'); setTimeout(() => !speaking() && mood('idle'), 1600); o.classList.remove('talking'); void o.offsetWidth; o.classList.add('talking'); clearTimeout(talk.t); talk.t = setTimeout(() => o.classList.remove('talking'), 1600); };
  // 📄 الرد الطويل بيتقسم صفحات على قد الشاشة (من غير scroll)، وكل صفحة بتتقال بالصوت
  let pages = [], page = 0;
  const lang = () => L('ar', 'en');
  function paginate(html, charts) {
    const pieces = html.split(/<br\s*\/?>/i).map(x => x.trim()).filter(Boolean).map(h => ({ h })).concat(charts.map(c => ({ c })));
    // المساحة الثابتة: الشريط فوق + قرش + خانة الكتابة + مكان الأزرار (مش مكان الرسالة الحالي، لأنه بيتحرك مع الطول)
    const maxH = Math.max(170, innerHeight - 64 - $('.sx-avatar').offsetHeight - 80 - Math.min(170, chipsEl.children.length > 6 ? 170 : 110) - 70);
    const out = []; let cur = [];
    sayEl.style.visibility = 'hidden';
    for (const p of pieces) {
      cur.push(p); renderPieces(cur, false);
      if (sayEl.scrollHeight > maxH && cur.length > 1) { cur.pop(); out.push(cur); cur = [p]; }
    }
    if (cur.length) out.push(cur);
    sayEl.style.visibility = '';
    return out;
  }
  function renderPieces(list, live = true) {
    sayEl.innerHTML = list.filter(p => p.h).map(p => p.h).join('<br>');
    for (const p of list) if (p.c) { const c = live ? p.c : p.c.cloneNode(true); c.classList.remove('go'); sayEl.appendChild(c); }
  }
  const pageText = list => list.filter(p => p.h).map(p => { const d = document.createElement('div'); d.innerHTML = p.h; return d.textContent; }).join('\n');
  function showPage(k, typed = false) {
    page = k; const list = pages[k] || [];
    const nav = () => {
      if (pages.length > 1) sayEl.insertAdjacentHTML('beforeend', `<div class="sx-pager"><button type="button" data-pg="-1" ${k ? '' : 'disabled'}>${L('→ السابق', '← Back')}</button><span>${k + 1} / ${pages.length}</span><button type="button" data-pg="1" class="${k + 1 < pages.length ? 'next' : ''}" ${k + 1 < pages.length ? '' : 'disabled'}>${L('التالي ←', 'Next →')}</button></div>`);
      requestAnimationFrame(() => requestAnimationFrame(() => sayEl.querySelectorAll('.ach').forEach(c => c.classList.add('go'))));
      say(pageText(list));
    };
    clearInterval(typeT);
    const text = pageText(list);
    if (!typed || reduce.matches || text.length > 420 || list.some(p => p.c)) { renderPieces(list); return nav(); }
    let i = 0; const step = Math.max(1, Math.round(text.length / 90));
    typeT = setInterval(() => { i += step; sayEl.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typeT); renderPieces(list); nav(); } }, 16);
  }
  sayEl.addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; (+b.dataset.pg < 0 ? sfx?.back : sfx?.page)?.(); showPage(Math.max(0, Math.min(pages.length - 1, page + +b.dataset.pg))); });
  function show(msgEl) {
    if (!msgEl) return;
    const fresh = lastBot !== msgEl; lastBot = msgEl; shownAt = Date.now();
    const clone = msgEl.cloneNode(true); clone.querySelectorAll('.say').forEach(x => x.remove());
    const charts = [...clone.querySelectorAll('.ach')]; charts.forEach(c => { c.remove(); c.classList.remove('go'); });
    const text = clone.textContent.trim();
    talk();
    if (fresh) { const h = document.createElement('div'); h.className = 'sx-h'; h.textContent = '🦈 ' + text.slice(0, 140); hist.prepend(h); while (hist.children.length > 6) hist.lastChild.remove(); }
    if (fresh && ++answers % 3 === 0) setTimeout(showComic, 1800);
    const keep = fresh ? 0 : page;
    pages = paginate(clone.innerHTML, charts);
    showPage(Math.min(keep, pages.length - 1), fresh);
  }
  // 🔊 الصوت والمحادثة
  let voiceOn = false, convo = false;
  try { voiceOn = localStorage.getItem('floosy.voice') === '1'; } catch {}
  const vBtn = () => { const b = $('.sx-voice'); b.textContent = voiceOn ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(voiceOn)); b.classList.toggle('on', voiceOn); };
  setVoiceStatus((st, pct) => { const el = $('.sx-vstat'); el.textContent = st === 'loading' ? L(`🔊 بجهز الصوت${pct ? ` ${pct}%` : '…'}`, `🔊 Preparing the voice${pct ? ` ${pct}%` : '…'}`) : st === 'error' ? L('😅 الصوت مش متاح', '😅 Voice unavailable') : ''; o.classList.toggle('speaking', st === 'speaking'); });
  const cap = document.createElement('div'); cap.className = 'sx-cap'; cap.setAttribute('aria-hidden', 'true');
  function say(text) {
    if (!voiceOn || !open || !text) return;
    const myPage = page, myPages = pages;
    mood('talk'); sfx?.bubble?.();
    speak(text, lang(), (i, s, n) => { if (!cap.isConnected) $('.sx-main').insertBefore(cap, chipsBox); cap.innerHTML = `<b>${esc(s)}</b><i style="--p:${(i + 1) / n}"></i>`; cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on'); })
      .then(() => {
        cap.classList.remove('on'); mood('idle');
        if (!open || speaking()) return;
        // الصفحة خلصت كلام: يروح للي بعدها لوحده
        if (myPages === pages && myPage === page && page + 1 < pages.length) { sfx?.page?.(); return showPage(page + 1); }
        if (convo && chipsEl.children.length) hear();
      });
  }
  async function hear() {
    if (!canListen()) return;
    stopVoice(); const m = $('.sx-mic'), inp = $('.sx-in');
    m.classList.add('on'); mood('listen'); inp.placeholder = L('🎙️ سامعك… اتكلم', '🎙️ Listening… speak');
    const t = await listen(lang(), part => { inp.value = part; });
    m.classList.remove('on'); mood('idle'); inp.placeholder = L('اسأل قرش أي حاجة…', 'Ask Shark anything…');
    if (!t) { convo = false; if (/🚫/.test(inp.value)) inp.placeholder = inp.value; inp.value = ''; return; }
    inp.value = ''; sayIn.value = t; form.requestSubmit();
  }
  $('.sx-voice').onclick = () => { voiceOn = !voiceOn; try { localStorage.setItem('floosy.voice', voiceOn ? '1' : '0'); } catch {} vBtn(); if (voiceOn) say(pageText(pages[page] || [])); else { stopVoice(); convo = false; } };
  $('.sx-mic').onclick = () => { if ($('.sx-mic').classList.contains('on')) { stopListening(); convo = false; return; } convo = true; if (!voiceOn) { voiceOn = true; vBtn(); } hear(); };
  if (!canListen()) $('.sx-mic').hidden = true;
  vBtn();
  const RATES = [1, 1.15, 1.3, 1.5], rBtn = () => { $('.sx-rate').textContent = `⚡ ${getRate()}x`; };
  $('.sx-rate').onclick = () => { const i = RATES.indexOf(getRate()); setRate(RATES[(i + 1) % RATES.length]); rBtn(); sfx?.select?.(); };
  rBtn();
  function mirrorChips() {
    chipsBox.innerHTML = '';
    [...chipsEl.querySelectorAll('.chip')].forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sx-chip'; b.style.setProperty('--i', i); b.textContent = c.textContent;
      b.onclick = () => { sfx?.select?.(); stopVoice(); c.click(); };
      chipsBox.appendChild(b);
    });
  }
  const feedback = () => { fb.textContent = FEEDBACK[Math.floor(Math.random() * FEEDBACK.length)]; fb.classList.remove('on'); void fb.offsetWidth; fb.classList.add('on'); };

  // الشات هو المصدر: أي رسالة جديدة أو تغيير فيها (زي رسمة اتضافت) بتتعرض هنا
  new MutationObserver(muts => {
    if (!open) return;
    const seen = new Set();
    for (const m of muts) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const own = t?.closest?.('.msg'); if (own) seen.add(own);
      for (const n of m.addedNodes) if (n.nodeType === 1) { const msg = n.classList?.contains('msg') ? n : n.closest?.('.msg'); if (msg) seen.add(msg); }
    }
    for (const msg of [...seen].filter(x => x.isConnected).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)) {
      if (msg.classList.contains('me')) { if (msg.dataset.sxSeen) continue; msg.dataset.sxSeen = 1; meEl.textContent = '🗣️ ' + msg.textContent; meEl.classList.remove('on'); void meEl.offsetWidth; meEl.classList.add('on'); feedback(); }
      else if (msg.classList.contains('typing')) sayEl.innerHTML = '<span class="sx-dots"><i></i><i></i><i></i></span>';
      else if (msg.classList.contains('thinking')) sayEl.innerHTML = `<span class="sx-think">${msg.innerHTML}</span>`;
      else if (msg.classList.contains('greet') && lastBot && Date.now() - shownAt < 30000) { let sub = sayEl.querySelector('.sx-sub'); if (!sub) { sub = document.createElement('div'); sub.className = 'sx-sub'; const pg = sayEl.querySelector('.sx-pager'); pg ? pg.before(sub) : sayEl.appendChild(sub); } sub.textContent = msg.textContent; }
      else show(msg);
    }
  }).observe(logEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });
  new MutationObserver(() => open && mirrorChips()).observe(chipsEl, { childList: true });

  function setOpen(v) {
    open = v; o.hidden = !v; orb.classList.toggle('hide', v); document.documentElement.classList.toggle('sx-on', v);
    if (v) { sfx?.open?.(); sfx?.swim?.(); setTimeout(showComic, 900); const bots = logEl.querySelectorAll('.msg.bot:not(.typing)'); show(bots[bots.length - 1]); mirrorChips(); setTimeout(() => $('.sx-in').focus(), 200); }
    else { stopVoice(); stopListening(); convo = false; sfx?.close?.(); }
  }
  orb.onclick = () => setOpen(true);
  $('.sx-x').onclick = () => setOpen(false);
  o.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  $('.sx-form').addEventListener('submit', e => {
    e.preventDefault(); const v = $('.sx-in').value.trim(); if (!v) return; $('.sx-in').value = ''; stopVoice();
    sayIn.value = v; form.requestSubmit();
  });

  /** 👆 قرش بيوريك حاجة في الصفحة: الشاشة تختفي، والمؤشر يروح للمكان ويعلّم عليه، وبعدين ترجع */
  async function point(place, note) {
    const sel = PLACES[place] || place, el = document.querySelector(sel);
    if (!el) return { shown: false, error: 'place not found', places: Object.keys(PLACES) };
    const wasOpen = open; if (wasOpen) { o.classList.add('away'); await new Promise(r => setTimeout(r, 350)); o.hidden = true; }
    el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, reduce.matches ? 50 : 650));
    const r = el.getBoundingClientRect();
    const cur = document.createElement('div'); cur.className = 'sx-cursor'; cur.innerHTML = '<i></i>';
    cur.style.left = innerWidth / 2 + 'px'; cur.style.top = innerHeight - 80 + 'px'; document.body.appendChild(cur);
    const ring = document.createElement('div'); ring.className = 'sx-spot';
    Object.assign(ring.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: Math.min(r.height, innerHeight - 40) + 16 + 'px' });
    const tip = document.createElement('div'); tip.className = 'sx-tip';
    tip.innerHTML = `🦈 ${esc(note || '')}<button type="button">${L('رجّعني لقرش ↩️', 'Back to Shark ↩️')}</button>`;
    requestAnimationFrame(() => { cur.style.left = r.left + Math.min(r.width / 2, 120) + 'px'; cur.style.top = r.top + Math.min(r.height / 2, 60) + 'px'; });
    await new Promise(res => setTimeout(res, reduce.matches ? 50 : 750));
    document.body.append(ring, tip); sfx?.note?.();
    const tr = tip.getBoundingClientRect();
    tip.style.top = Math.min(innerHeight - tr.height - 12, Math.max(12, r.bottom + 14)) + 'px';
    tip.style.left = Math.min(innerWidth - tr.width - 12, Math.max(12, r.left + r.width / 2 - tr.width / 2)) + 'px';
    await new Promise(res => { const t = setTimeout(res, 7000); tip.querySelector('button').onclick = () => { clearTimeout(t); res(); }; });
    cur.remove(); ring.remove(); tip.remove();
    if (wasOpen) { o.hidden = false; requestAnimationFrame(() => o.classList.remove('away')); }
    return { shown: true };
  }
  /** 🔎 وقرش بيفكّر: الشاشة تصغر، والمؤشر يلف على أماكن بياناتك اللي ليها علاقة بسؤالك ويقراها، لحد ما الرد يوصل */
  const TOUR = [
    [/دين|قسط|كارت|enbd|tabby|debt|loan/i, 'debt', L('بقرا ديونك', 'Reading your debts')],
    [/أساسي|ايجار|إيجار|أكل|مواصلات|مراتي|مراتى|wife|rent|essential/i, 'essentials', L('بقرا أساسياتك', 'Reading your essentials')],
    [/استثمر|invest|سهم|ذهب|دهب|gold/i, 'invest', L('بقرا الاستثمار', 'Reading investing')],
    [/أمان|طوارئ|safety|emergency/i, 'safety', L('بقرا الأمان', 'Reading safety')],
    [/خروج|سفر|حرّة|حره|fun|trip|اشتري|أشتري|buy/i, 'fun', L('بقرا حصّالة الفلوس الحرّة', 'Reading the free money jar')],
    [/هدف|عربية|شقة|goal|car/i, 'goals', L('بقرا أهدافك', 'Reading your goals')],
    [/صرف|عادات|مصروف|spend|habit/i, 'transactions', L('بقرا معاملاتك', 'Reading your transactions')],
    [/مرتب|قبض|salary|pay/i, 'pay', L('بقرا القبض الجاي', 'Reading your next payday')],
  ];
  let working = false, workLoop = null;
  function work(on, hint = '') {
    if (!on) { working = false; return workLoop || Promise.resolve(); }
    if (working || !open) return Promise.resolve();
    working = true;
    const picks = TOUR.filter(([re]) => re.test(hint)).map(([, p, l]) => [p, l]);
    const list = [...picks, ['wallets', L('بقرا محافظك', 'Reading your wallets')], ['month', L('بقرا الشهر ده', 'Reading this month')], ['hero', L('بقرا الصورة الكاملة', 'Reading the big picture')]];
    workLoop = (async () => { let i = 0; while (working) { await visitNow(list[i % list.length][0], list[i % list.length][1], true); i++; } })();
    return Promise.resolve();
  }
  /** 🖱️ قرش "بيروح يقرا\": المؤشر يطير للمكان، يدوس (موجة)، يقرا، ويرجع. بدل "جاري التحميل" */
  let visiting = Promise.resolve();
  function visit(place, label) {
    visiting = visiting.then(() => visitNow(place, label)).catch(() => {});
    return visiting;
  }
  // 🖱️ ماوس قرش: سهم حقيقي بيتحرك ويدوس (وبيفضل ظاهر طول ما قرش شغال)
  const NAV = { transactions: { tab: 'log', target: '#logs' }, analytics: { tab: 'stats', target: '#stats' } };
  let mouse = null;
  const ARROW = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2 L4 19 L8.6 14.6 L11.6 21.4 L14.6 20.1 L11.6 13.4 L18 13.4 Z" fill="#fff" stroke="#0b1020" stroke-width="1.6" stroke-linejoin="round"/></svg><b>🦈</b>';
  function getMouse() {
    if (!mouse) { mouse = document.createElement('div'); mouse.className = 'sx-mouse'; mouse.innerHTML = ARROW; mouse.style.left = innerWidth / 2 + 'px'; mouse.style.top = innerHeight - 90 + 'px'; document.body.appendChild(mouse); }
    return mouse;
  }
  const hideMouse = () => { mouse?.remove(); mouse = null; };
  async function moveTo(x, y, ms = 650) {
    const m = getMouse(); m.style.transitionDuration = (reduce.matches ? 0 : ms) + 'ms';
    m.style.left = x + 'px'; m.style.top = y + 'px';
    await new Promise(r => setTimeout(r, reduce.matches ? 20 : ms + 40));
  }
  async function clickAt(x, y, el) {
    const m = getMouse(); m.classList.add('press'); sfx?.click?.();
    const rip = document.createElement('div'); rip.className = 'sx-click'; rip.style.left = x + 'px'; rip.style.top = y + 'px'; document.body.appendChild(rip);
    await new Promise(r => setTimeout(r, 160)); m.classList.remove('press');
    if (el) el.click();
    setTimeout(() => rip.remove(), 700);
  }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 140), r.top + Math.min(r.height / 2, 46)]; };
  async function goTab(tab) {
    const t = document.querySelector(`[data-page="${tab}"]`); if (!t || t.classList.contains('on')) return false;
    const [x, y] = center(t); await moveTo(x, y); await clickAt(x, y, t); await new Promise(r => setTimeout(r, 450)); return true;
  }
  async function visitNow(place, label, touring = false) {
    const nav = NAV[place];
    const fast = reduce.matches, wasOpen = open && !o.hidden;
    if (wasOpen) { o.classList.add('away'); await new Promise(r => setTimeout(r, 300)); o.hidden = true; }
    if (open) { mini.hidden = false; miniSay('🦈 ' + (label || '')); }
    sfx?.swim?.();
    // صفحة تانية (السجل / التحليلات): يدوس على التاب الأول، يقرا، ويرجع للرئيسية
    const before = document.querySelector('[data-page].on')?.dataset.page;
    if (nav) await goTab(nav.tab);
    const el = document.querySelector(nav ? nav.target : (PLACES[place] || place));
    if (el) {
      el.scrollIntoView({ behavior: fast ? 'auto' : 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, fast ? 30 : 480));
      const [x, y] = center(el);
      await moveTo(x, y);
      await clickAt(x, y);
      el.classList.add('sx-reading'); setTimeout(() => sfx?.scan?.(), 120);
      const tag = document.createElement('div'); tag.className = 'sx-read'; tag.textContent = '🦈 ' + (label || L('بقرا…', 'Reading…'));
      tag.style.left = Math.min(innerWidth - 260, Math.max(12, x + 18)) + 'px'; tag.style.top = Math.min(innerHeight - 50, y + 30) + 'px'; document.body.appendChild(tag);
      // "بيقرا": المؤشر بيمشي على الكارت كأنه بيقلّب فيه
      const r = el.getBoundingClientRect();
      if (!fast) { await moveTo(Math.max(r.left + 20, x - 90), Math.min(innerHeight - 40, y + 50), 420); await moveTo(Math.min(r.right - 20, x + 80), Math.min(innerHeight - 40, y + 30), 420); }
      else await new Promise(res => setTimeout(res, 200));
      tag.remove(); el.classList.remove('sx-reading');
    }
    if (nav && before && before !== nav.tab) await goTab(before);
    // وهو بيلف وقت التفكير بيفضل صغير، وأول ما يخلص يرجع
    if (touring && working) return;
    hideMouse();
    if (open) { mini.hidden = true; o.hidden = false; requestAnimationFrame(() => o.classList.remove('away')); }
  }
  async function workDone() { await work(false); hideMouse(); if (open) { mini.hidden = true; o.hidden = false; requestAnimationFrame(() => o.classList.remove('away')); } }
  return { open: () => setOpen(true), close: () => setOpen(false), point, visit, work, workDone, isOpen: () => open };
}
