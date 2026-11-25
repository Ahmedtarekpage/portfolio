// xfer-wizard.js — تحويل فلوس بين العملات خطوة بخطوة في شاشة منبثقة (نفس شكل ess-wizard):
// من أنهي محفظة وبند ← لفين (بند أو سداد دين) ← كام ← وصل كام (أو السعر والعمولة) ← مراجعة وتأكيد "أيوه حوّل".
// كل خطوة تحتها رد فعل فوري بالأرقام، ومفيش حاجة بتتحفظ غير بعد التأكيد في آخر خطوة.
//
// deps: { L, fmt, esc, parseNum, CUR, B, sfx, money: ['AED','EGP',…], bal(cu, k) → رصيد البند بعملته,
//         rate(cu) → كام درهم للوحدة, debtsIn(cu) → [{ id, name, left }] (left بعملة cu), preset: { from, bk } }
//         golds: [{ id, name, grams, karat, bk }] (الدهب اللي معاك، كل حتة في بندها)
// الدهب (XAU) بيتعامل كأنه عملة بالجرام: تبيع جرامات لدرهم/جنيه، أو تشتري جرامات من أي محفظة.
// بيرجّع Promise: { from, bk, to, tb, debt, amount, toAmount, fee, mkt, hold, toHold, toKarat, rate, toRate } أو null لو اتقفل.

const BUCKETS = ['essentials', 'growth', 'stability', 'reward'];

export function xferWizard(deps) {
  const { L, fmt, esc, parseNum, CUR, B, sfx } = deps;
  const pre = deps.preset || {}, golds = (deps.golds || []).filter(g => g.grams > 0.0005);
  const has = cu => BUCKETS.some(k => deps.bal(cu, k) > 0.005);
  const froms = [...deps.money.filter(has), ...(golds.length ? ['XAU'] : [])];
  // جاي من ضغطة على بند معيّن: نبدأ من العملة اللي فيها فلوس في البند ده (أو الدهب لو هو اللي فيه)
  const goldIn = k => golds.find(g => g.bk === k);
  const fromFor = k => !k ? null : (pre.from && (pre.from === 'XAU' ? goldIn(k) : deps.bal(pre.from, k) > 0.005)) ? pre.from
    : deps.money.find(c => deps.bal(c, k) > 0.005) || (goldIn(k) ? 'XAU' : null);
  const preFrom = fromFor(pre.bk) || pre.from;
  const st = { from: froms.includes(preFrom) ? preFrom : froms[0], bk: pre.bk || '', gh: '', to: '', tb: '', debt: '', tgh: '', tk: 24, amount: null, how: 'got', got: null, fx: null, fee: 0 };
  const gOf = id => golds.find(g => g.id === id);
  // الدهب: البند بييجي من الحتة اللي اخترتها، والرصيد بالجرام
  const pickGold = id => { const g = gOf(id) || goldIn(pre.bk) || golds[0]; st.gh = g?.id || ''; st.bk = g?.bk || ''; };
  if (st.from === 'XAU') pickGold(pre.gh);
  const okBk = () => st.from === 'XAU' ? !!gOf(st.gh) : st.bk && deps.bal(st.from, st.bk) > 0.005;
  if (!okBk() && st.from !== 'XAU') st.bk = BUCKETS.find(k => deps.bal(st.from, k) > 0.005) || '';
  st.to = deps.money.find(c => c !== st.from && c === 'AED') || deps.money.find(c => c !== st.from);
  st.tb = st.bk; // افتراضي: نفس البند في العملة التانية

  const sym = c => c === 'XAU' ? L('جم', 'g') : CUR[c].s;
  const tos = () => [...deps.money.filter(c => c !== st.from), ...(st.from !== 'XAU' ? ['XAU'] : [])];
  // سعر الوحدة بالدرهم: الدهب حسب عيار الحتة (اللي طالعة أو اللي داخلة)
  const unit = (c, side) => c !== 'XAU' ? deps.rate(c) : deps.rate('XAU') * ((side === 'from' ? gOf(st.gh)?.karat : st.tgh ? gOf(st.tgh)?.karat : st.tk) || 24) / 24;
  const toBk = () => st.to === 'XAU' ? (st.tgh ? gOf(st.tgh).bk : st.tb) : st.tb;
  const m = (v, c, d = 2) => `<b dir="ltr">${fmt(v, d)} ${sym(c)}</b>`;
  const mk = () => unit(st.from, 'from') / unit(st.to, 'to'); // كام "to" للوحدة من "from" بسعر السوق
  const big = () => mk() >= 1; // السعر بيتكتب بالشكل المعتاد: 1 درهم = 14.6 جنيه
  const fxTxt = per => `<span dir="ltr">${per >= 1 ? `1 ${sym(st.from)} = ${fmt(per, per >= 10 ? 2 : 4)} ${sym(st.to)}` : `1 ${sym(st.to)} = ${fmt(1 / per, 2)} ${sym(st.from)}`}</span>`; // ltr عشان العربي ما يقلبهوش
  const max = () => st.from === 'XAU' ? gOf(st.gh)?.grams || 0 : deps.bal(st.from, st.bk);
  const live = () => (st.amount || 0) * mk();
  const toAmount = () => st.how === 'got' ? (+st.got || 0) : st.fx > 0 ? (st.amount || 0) * (big() ? st.fx : 1 / st.fx) - (+st.fee || 0) : 0;
  const debts = () => st.to === 'XAU' ? [] : deps.debtsIn(st.to).filter(d => d.left > 0.5);
  const gName = g => `🥇 ${esc(g.name)} · ${L('عيار', '')} ${g.karat}${L('', 'K')}`;
  const dest = () => st.debt ? `💳 ${esc(debts().find(d => d.id === st.debt)?.name || '')}`
    : st.to === 'XAU' ? (st.tgh ? gName(gOf(st.tgh)) : `🥇 ${L('دهب جديد عيار', 'New gold')} ${st.tk}${L('', 'K')} · ${B[st.tb].i} ${B[st.tb].n}`)
    : `${B[st.tb].i} ${B[st.tb].n}`;
  const src = () => st.from === 'XAU' ? gName(gOf(st.gh)) : `${B[st.bk].i} ${B[st.bk].n}`;
  const flag = c => CUR[c].f;
  const cost = () => {
    const a = toAmount(), lv = live(); if (!(a > 0) || !(lv > 0)) return '';
    const lost = lv - a, pct = lost / lv * 100;
    if (lost < -0.005) return L(`🎉 سعرك ${fxTxt(a / st.amount)} أحسن من السوق (${fxTxt(mk())}) بـ ${m(-lost, st.to)}.`, `🎉 Your rate ${fxTxt(a / st.amount)} beats the market (${fxTxt(mk())}) by ${m(-lost, st.to)}.`);
    return lost > 0.005
      ? L(`💸 سعرك ${fxTxt(a / st.amount)} (السوق ${fxTxt(mk())}). التحويل كلّفك ${m(lost, st.to)} (${fmt(pct, 1)}%) عن سعر السوق.`, `💸 Your rate ${fxTxt(a / st.amount)} (market ${fxTxt(mk())}). The transfer cost you ${m(lost, st.to)} (${fmt(pct, 1)}%) vs the market.`)
      : L('✅ من غير عمولة ولا فرق سعر.', '✅ No fee and no rate difference.');
  };
  const opt = (data, on, icon, title, sub) => `<button type="button" class="wiz-opt row ${on ? 'on' : ''}" ${data}><span class="big">${icon}</span><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;

  const STEPS = [
    { // 1) من فين
      q: () => L('🔁 هتحوّل من فين؟', '🔁 Transfer from where?'),
      help: () => L('اختار المحفظة (العملة) والبند اللي الفلوس هتطلع منه.', 'Pick the wallet (currency) and the bucket the money leaves from.'),
      body: () => `<div class="wiz-opts">${froms.map(c => `<button type="button" class="wiz-opt ${st.from === c ? 'on' : ''}" data-from="${c}"><span class="big">${flag(c)}</span><b>${c === 'XAU' ? L('دهب', 'Gold') : CUR[c].n}</b><small>${sym(c)}</small></button>`).join('')}</div>
        <div class="wiz-opts col">${st.from === 'XAU'
          ? golds.map(g => opt(`data-gh="${g.id}"`, st.gh === g.id, '🥇', `${esc(g.name)} · ${L('عيار', '')} ${g.karat}${L('', 'K')}`, `${fmt(g.grams, 2)} ${sym('XAU')} · ${B[g.bk].i} ${B[g.bk].n} · ≈ ${fmt(g.grams * unit('XAU', 'from'))} Đ`)).join('')
          : BUCKETS.filter(k => deps.bal(st.from, k) > 0.005).map(k => opt(`data-bk="${k}"`, st.bk === k, B[k].i, B[k].n, `${L('معاك', 'You have')} ${fmt(deps.bal(st.from, k), 2)} ${sym(st.from)}`)).join('')}</div>`,
      ok: () => okBk(),
      fb: () => !okBk() ? '' : st.from === 'XAU'
        ? L(`🥇 هتبيع من ${src()}: معاك ${m(max(), 'XAU')}، قيمتها بسعر السوق ≈ ${m(max() * unit('XAU', 'from'), 'AED', 0)}.`, `🥇 Selling from ${src()}: you have ${m(max(), 'XAU')}, worth ≈ ${m(max() * unit('XAU', 'from'), 'AED', 0)} at the market price.`)
        : L(`${B[st.bk].i} هتطلع من ${B[st.bk].n} ${CUR[st.from].f}، ومعاك فيه ${m(max(), st.from)}.`, `${B[st.bk].i} It leaves ${B[st.bk].n} ${CUR[st.from].f}, where you have ${m(max(), st.from)}.`),
    },
    { // 2) لفين
      q: () => L('📥 تروح لفين؟', '📥 Where should it go?'),
      help: () => L('العملة اللي هتوصل بيها، وتقعد في أنهي بند (أو تسدّ دين على طول).', 'The currency it arrives in, and which bucket it lands in (or pay a debt right away).'),
      body: () => `<div class="wiz-opts">${tos().sort((a, b) => (b === 'AED') - (a === 'AED')).map(c => `<button type="button" class="wiz-opt ${st.to === c ? 'on' : ''}" data-to="${c}"><span class="big">${flag(c)}</span><b>${c === 'XAU' ? L('دهب', 'Gold') : CUR[c].n}</b><small>${sym(c)}</small></button>`).join('')}</div>
        ${st.to === 'XAU' ? `<div class="wiz-opts col">${golds.map(g => opt(`data-tgh="${g.id}"`, st.tgh === g.id, '🥇', L(`أزوّد ${esc(g.name)}`, `Add to ${esc(g.name)}`), `${L('عيار', '')} ${g.karat}${L('', 'K')} · ${fmt(g.grams, 2)} ${sym('XAU')} · ${B[g.bk].i} ${B[g.bk].n}`)).join('')}</div>
          <p class="wiz-help">${L('أو دهب جديد:', 'Or new gold:')}</p>
          <div class="wiz-chips">${[24, 21, 18].map(k => `<button type="button" class="wiz-chip ${!st.tgh && st.tk === k ? 'on' : ''}" data-tk="${k}">🥇 ${L('عيار', '')} ${k}${L('', 'K')}</button>`).join('')}</div>
          ${!st.tgh ? `<div class="wiz-opts">${['stability', 'growth'].map(k => opt(`data-tb="${k}"`, st.tb === k, B[k].i, B[k].n, k === 'stability' ? L('دهب زيادة للأمان', 'Spare gold for safety') : L('استثمار', 'Investing'))).join('')}</div>` : ''}` : `
        <div class="wiz-opts col">${debts().map(d => opt(`data-debt="${d.id}"`, st.debt === d.id, '💳', L(`أسدّ بيها ${esc(d.name)}`, `Pay ${esc(d.name)}`), L(`فاضل ${fmt(d.left)} ${sym(st.to)}`, `${fmt(d.left)} ${sym(st.to)} left`))).join('')}
        ${[st.bk, ...BUCKETS.filter(k => k !== st.bk)].map(k => opt(`data-tb="${k}"`, !st.debt && st.tb === k, B[k].i, B[k].n, k === st.bk ? L('نفس البند', 'Same bucket') : '')).join('')}</div>`}`,
      ok: () => !!st.to && (!!st.debt || !!toBk()) && (st.to !== 'XAU' || !!st.tgh || ['stability', 'growth'].includes(st.tb)),
      fb: () => !st.to || (!st.debt && !toBk()) ? '' : st.to === 'XAU'
        ? L(`🥇 هتشتري دهب: ${dest()}.`, `🥇 Buying gold: ${dest()}.`)
        : st.debt
        ? L(`💳 اللي هيوصل بال${CUR[st.to].n} هيسدّ ${dest()} على طول.`, `💳 What arrives in ${CUR[st.to].n} pays ${dest()} straight away.`)
        : L(`${B[st.tb].i} هتقعد في ${B[st.tb].n} ${CUR[st.to].f}.`, `${B[st.tb].i} It lands in ${B[st.tb].n} ${CUR[st.to].f}.`),
    },
    { // 3) كام
      q: () => st.from === 'XAU' ? L('💰 هتبيع كام جرام؟', '💰 How many grams are you selling?') : L(`💰 هتحوّل كام ${CUR[st.from].n}؟`, `💰 How much ${CUR[st.from].n}?`),
      help: () => L(`معاك ${fmt(max(), 2)} ${sym(st.from)} في ${src()}.`, `You have ${fmt(max(), 2)} ${sym(st.from)} in ${src()}.`),
      body: () => `<label class="wiz-amt"><input class="wiz-in num" data-k="amount" inputmode="decimal" dir="ltr" value="${st.amount ?? ''}" placeholder="0"><span dir="ltr">${sym(st.from)}</span></label>
        <div class="wiz-chips"><button type="button" class="wiz-chip" data-all>${L('الكل', 'All of it')} · ${fmt(max(), 2)}</button></div>`,
      ok: () => st.amount > 0 && st.amount <= max() + 0.005,
      fb: () => !(st.amount > 0) ? '' : st.amount > max() + 0.005
        ? `⚠️ ${L(`أكتر من اللي معاك (${fmt(max(), 2)}).`, `More than you have (${fmt(max(), 2)}).`)}`
        : L(`بسعر السوق النهارده (${fxTxt(mk())}) ده ≈ ${m(live(), st.to)}.`, `At today's market rate (${fxTxt(mk())}) that's ≈ ${m(live(), st.to)}.`),
    },
    { // 4) وصل كام
      q: () => st.to === 'XAU' ? L('🥇 خدت كام جرام؟', '🥇 How many grams did you get?') : L('🏦 وصلك كام بالظبط؟', '🏦 How much actually arrived?'),
      help: () => st.from === 'XAU' || st.to === 'XAU'
        ? L('محل الدهب بيشتري بأقل من السوق وبيبيع بأكتر (المصنعية والدمغة). اكتب اللي وصل، أو سعر الجرام والعمولة.', 'Gold shops buy below the market and sell above it (making charge and stamp). Type what you got, or the gram price and the fee.')
        : L('البنك أو الصرّاف بيدّي سعر أقل من السوق وساعات بياخد عمولة. اكتب اللي وصل، أو السعر والعمولة.', 'Banks and exchange shops give less than the market rate and sometimes take a fee. Type what arrived, or the rate and fee.'),
      body: () => `<div class="wiz-opts">${opt('data-how="got"', st.how === 'got', '✅', L('أعرف وصل كام', 'I know what arrived'), '')}${opt('data-how="rate"', st.how === 'rate', '📝', L('أعرف السعر والعمولة', 'I know the rate and fee'), '')}</div>
        ${st.how === 'got'
          ? `<label class="wiz-amt"><input class="wiz-in num" data-k="got" inputmode="decimal" dir="ltr" value="${st.got ?? ''}" placeholder="${fmt(live(), 2)}"><span dir="ltr">${sym(st.to)}</span></label>
             <div class="wiz-chips"><button type="button" class="wiz-chip" data-market>${L('بسعر السوق', 'At market rate')} · ${fmt(live(), 2)}</button></div>`
          : `<div class="wiz-grid"><label class="wiz-amt"><small><span dir="ltr">${big() ? `1 ${sym(st.from)} = ? ${sym(st.to)}` : `1 ${sym(st.to)} = ? ${sym(st.from)}`}</span> · ${L('السوق', 'market')} ${fmt(big() ? mk() : 1 / mk(), big() && mk() < 10 ? 4 : 2)}</small>
               <span class="in"><input class="wiz-in num" data-k="fx" inputmode="decimal" dir="ltr" value="${st.fx ?? ''}" placeholder="${fmt(big() ? mk() : 1 / mk(), 4)}"></span></label>
             <label class="wiz-amt"><small>${L('العمولة', 'Fee')} (${sym(st.to)})</small><span class="in"><input class="wiz-in num" data-k="fee" inputmode="decimal" dir="ltr" value="${st.fee || ''}" placeholder="0"><span dir="ltr">${sym(st.to)}</span></span></label></div>`}`,
      ok: () => toAmount() > 0,
      fb: () => toAmount() > 0 ? `${L(`هيوصل ${m(toAmount(), st.to)}.`, `${m(toAmount(), st.to)} arrives.`)}<br>${cost()}` : '',
    },
    { // 5) مراجعة وتأكيد
      q: () => L('👀 راجع قبل ما تأكد', '👀 Check before you confirm'),
      help: () => L('مفيش حاجة اتحفظت لسه. لو كله صح دوس "أيوه، حوّل".', 'Nothing is saved yet. If it all looks right, tap "Yes, transfer".'),
      body: () => `<div class="wiz-sum"><div class="wiz-sum-head"><span class="big">🔁</span><div><b>${flag(st.from)} ${src()} → ${flag(st.to)} ${dest()}</b><small>${new Date().toLocaleDateString()}</small></div></div>
        <ul class="alloc">
          <li><span>${L('هيطلع', 'Leaves')}</span><b dir="ltr" style="color:#fca5a5">−${fmt(st.amount, 2)} ${sym(st.from)}</b></li>
          <li><span>${L('هيوصل', 'Arrives')}</span><b dir="ltr" style="color:#6ee7b7">+${fmt(toAmount(), 2)} ${sym(st.to)}</b></li>
          <li><span>${L('سعرك', 'Your rate')}</span><b dir="ltr">${fxTxt(toAmount() / st.amount)}</b></li>
          <li><span>${L('سعر السوق', 'Market rate')}</span><b dir="ltr">${fxTxt(mk())}</b></li>
          ${st.how === 'rate' && st.fee > 0 ? `<li><span>${L('العمولة', 'Fee')}</span><b dir="ltr">${fmt(st.fee, 2)} ${sym(st.to)}</b></li>` : ''}
        </ul><p class="wiz-note">${cost()}</p></div>`,
      ok: () => true, fb: () => '',
    },
  ];

  return new Promise(resolve => {
    // لو ضغطت على بند والفلوس فيه فعلًا، "من فين" متجاوبة خلاص: نبدأ من "لفين" (وتقدر ترجع)
    let i = pre.bk && st.bk === pre.bk && okBk() ? 1 : 0;
    const o = document.createElement('div');
    o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    document.body.appendChild(o); sfx?.open?.();
    const close = v => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'INPUT') { e.preventDefault(); next(); }
    };
    document.addEventListener('keydown', onKey);
    const fbEl = () => o.querySelector('.wiz-fb');
    const refreshFb = () => { const s = STEPS[i], t = s.fb(); fbEl().innerHTML = t; fbEl().hidden = !t; o.querySelector('[data-next]').disabled = !s.ok(); };
    const draw = (dir = 1) => {
      const s = STEPS[i], last = i === STEPS.length - 1;
      o.innerHTML = `<div class="wiz-card glass">
        <div class="wiz-top"><b>🔁 ${L('تحويل بين العملات', 'Transfer between currencies')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
        <div class="wiz-prog"><i style="width:${((i + 1) / STEPS.length * 100).toFixed(1)}%"></i></div>
        <small class="wiz-n">${L(`خطوة ${i + 1} من ${STEPS.length}`, `Step ${i + 1} of ${STEPS.length}`)}</small>
        <div class="wiz-step ${dir > 0 ? 'fwd' : 'back'}"><h3>${s.q()}</h3><p class="wiz-help">${s.help()}</p>${s.body()}</div>
        <div class="wiz-fb" aria-live="polite" hidden></div>
        <div class="wiz-nav">${i ? `<button type="button" class="btn ghost" data-back>${L('→ رجوع', '← Back')}</button>` : '<span></span>'}
          <button type="button" class="btn primary" data-next>${last ? L('✅ أيوه، حوّل', '✅ Yes, transfer') : L('التالي ←', 'Next →')}</button></div></div>`;
      refreshFb();
      o.querySelector('input')?.focus();
    };
    const result = () => ({ from: st.from, bk: st.bk, to: st.to, tb: st.debt ? st.bk : toBk(), debt: st.debt || null, amount: st.amount, toAmount: toAmount(), fee: st.how === 'rate' ? +st.fee || 0 : 0, mkt: live(),
      hold: st.from === 'XAU' ? st.gh : null, toHold: st.to === 'XAU' ? st.tgh || null : null, toKarat: st.to === 'XAU' ? (st.tgh ? gOf(st.tgh).karat : st.tk) : null,
      rate: unit(st.from, 'from'), toRate: unit(st.to, 'to') });
    const next = () => {
      if (!STEPS[i].ok()) { sfx?.err?.(); const c = o.querySelector('.wiz-card'); c.classList.remove('shake'); void o.offsetWidth; c.classList.add('shake'); return; }
      if (i === STEPS.length - 1) return close(result());
      sfx?.step?.(); i++; draw(1);
    };
    o.addEventListener('input', e => {
      const k = e.target.dataset.k; if (!k) return;
      const v = e.target.value === '' ? null : parseNum(e.target.value);
      if (k === 'amount') st.amount = v; else if (k === 'got') st.got = v; else if (k === 'fx') st.fx = v; else if (k === 'fee') st.fee = v || 0;
      refreshFb();
    });
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === o) close(null); return; }
      const d = b.dataset;
      if ('close' in d) return close(null);
      if ('next' in d) return next();
      if ('back' in d) { i--; return draw(-1); }
      if (d.gh) { pickGold(d.gh); st.tb = st.bk; st.amount = null; return draw(0); }
      if (d.tgh) { st.tgh = d.tgh; st.debt = ''; return draw(0); }
      if (d.tk) { st.tk = +d.tk; st.tgh = ''; if (!['stability', 'growth'].includes(st.tb)) st.tb = 'stability'; return draw(0); }
      if (d.from) { st.from = d.from; if (st.from === 'XAU') pickGold(st.gh); else if (!okBk()) st.bk = BUCKETS.find(k => deps.bal(st.from, k) > 0.005) || ''; st.tb = st.bk; if (st.to === st.from) st.to = deps.money.find(c => c !== st.from); st.amount = null; return draw(0); }
      if (d.bk) { st.bk = d.bk; st.tb = d.bk; st.amount = null; st.debt = ''; return draw(0); }
      if (d.to) { st.to = d.to; st.debt = ''; st.got = null; st.fx = null; st.tgh = ''; if (st.to === 'XAU' && !['stability', 'growth'].includes(st.tb)) st.tb = 'stability'; return draw(0); }
      if (d.debt) { st.debt = d.debt; st.tb = ''; return draw(0); }
      if (d.tb) { st.tb = d.tb; st.debt = ''; return draw(0); }
      if ('all' in d) { st.amount = +max().toFixed(2); return draw(0); }
      if ('market' in d) { st.got = +live().toFixed(2); return draw(0); }
      if (d.how) { st.how = d.how; return draw(0); }
    });
    draw(1);
  });
}
