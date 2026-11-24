// ess-wizard.js — إضافة/تعديل بند أساسيات خطوة بخطوة: سؤال واحد في كل شاشة، ورد فعل فوري تحت كل إجابة.
// نفس الشاشة للإضافة والتعديل (التعديل بيبدأ بالقيم الحالية، وآخر خطوة فيها "امسح").
//
// الشكل اللي بيتحفظ (زي ما rules.js بيقرا):
//   { id, icon, name, cur, amount, tag?, where?, whereMode? }
//   📌 ثابت: amount بس · 📍 حسب مكانك: where = { AED: x, EGP: y } · 👫 حسب مكانك ومكان مراتك: whereMode 'both', where = { 'AED+EGP': x, … }
//
// كل حاجة من التطبيق بتيجي في deps، عشان الملف ده ما يعرفش حاجة عن الحالة (S).

const ICONS = ['🏠', '💡', '🌐', '📱', '🛒', '🍳', '🚇', '🚗', '⛽', '🎓', '🏥', '💊', '🛡️', '🛠️', '🎬', '👶', '🐾', '🧾', '💳', '🎁'];
const GUESS = [[/rent|ايجار|إيجار|سكن|شقة/i, '🏠'], [/bill|فاتور|فواتير|كهرب|مياه|غاز/i, '💡'], [/internet|wifi|^\s*نت\s*$|انترنت|إنترنت/i, '🌐'], [/mobile|phone|موبايل|تليفون/i, '📱'],
  [/mainten|صيان/i, '🛠️'], [/entertain|ترفيه|خروج/i, '🎬'], [/living|معيش|grocer|سوبر/i, '🛒'], [/أكل|اكل|food/i, '🍳'], [/insur|تأمين|امين|amin/i, '🛡️'],
  [/car|عربية|بنزين|fuel/i, '🚗'], [/transport|مواصلات|مترو|metro/i, '🚇'], [/school|مدرس|مدارس|تعليم|course|كورس/i, '🎓'], [/doctor|دكتور|علاج|clinic/i, '🏥'], [/medic|دوا|pharm/i, '💊'], [/baby|طفل|بيبي/i, '👶']];
export const guessIcon = name => GUESS.find(([r]) => r.test(String(name)))?.[1] || '🧾';

/**
 * يفتح الويزرد. بيرجّع Promise:
 *   { action: 'save', item } | { action: 'delete' } | null (اتقفل من غير حفظ)
 * deps: { L, fmt, esc, parseNum, CUR, places, placeName, preview(tmpItem) → {month, perDay}, countryTotal(cur, exceptId) → month total,
 *         toAED(v, cur), sameName(name, cur, exceptId) → bool, homeShare(tag, tmpItem) → share 0..1, sfx }
 */
export function essWizard(item, deps) {
  const { L, fmt, esc, parseNum, CUR, places, placeName, sfx } = deps;
  const editing = !!item;
  const P = places();
  const st = {
    name: item?.name || '', icon: item?.icon || '', cur: item?.cur || deps.defaultCur || 'AED',
    mode: item?.where ? (item.whereMode === 'both' ? 'both' : 'me') : 'fixed',
    amount: item ? +item.amount || 0 : null, where: { ...(item?.where || {}) }, tag: item?.tag || '', paidTo: item?.paidTo || '',
  };
  // مواقف مستحيلة (زي "إنت في مصر ومراتك في الإمارات"): متشالة لكل البنود، وتقدر ترجّعها
  let noSit = [...(deps.noSit?.() || [])];
  const allCombos = () => P.flatMap(me => P.map(w => `${me}+${w}`));
  const combos = () => allCombos().filter(k => !noSit.includes(k));
  const sitName = k => { const [me, w] = k.split('+'); return `${CUR[me].f} ${L('إنت في', 'you in')} ${placeName(me)} · ${w === me ? L('👫 مراتك معاك', '👫 wife with you') : `👩 ${L('مراتك في', 'wife in')} ${placeName(w)}`}`; };
  // البند زي ما هيتحفظ، من الإجابات لحد دلوقتي
  const build = () => {
    const out = { id: item?.id, icon: st.icon || guessIcon(st.name), name: st.name.trim(), cur: st.cur, amount: +st.amount || 0 };
    if (st.tag) out.tag = st.tag;
    if (st.paidTo) out.paidTo = st.paidTo;
    if (st.mode === 'me') { out.where = Object.fromEntries(P.map(x => [x, +(st.where[x] ?? st.amount ?? 0)])); out.amount = out.where[st.cur] ?? Math.max(...Object.values(out.where)); }
    if (st.mode === 'both') {
      out.whereMode = 'both';
      out.where = Object.fromEntries(combos().map(k => [k, +(st.where[k] ?? st.where[k.split('+')[0]] ?? st.amount ?? 0)]));
      // لو الموقف المستحيل حصل برضه: بيرجع لمبلغ "حسب إنت فين" (لو اتكتب قبل كده) أو المبلغ الأساسي
      out.amount = Math.max(0, ...Object.values(out.where));
    }
    return out;
  };
  const money = (v, c = st.cur) => `<b dir="ltr">${fmt(v)} ${CUR[c].s}</b>`;
  // قاعدة الفيديو: كل الأساسيات الشهرية مع بعض (البلدين، إنت شخص واحد) = 50% أو أقل من كل دخلك
  const rule = cTot => {
    const inc = deps.countryIncome(st.cur), tot = cTot + (deps.otherEss ? deps.otherEss(st.cur, item?.id) : 0);
    if (!(inc > 0)) return `<br>📏 ${L(`لسه مفيش دخل متسجّل، فمش هقدر أقارن بقاعدة الـ50%. كل أساسياتك (البلدين) ${money(tot)}، محتاج دخل ${money(tot * 2)} في الشهر عشان تبقى النص.`, `No income recorded yet, so I can't check the 50% rule. All your essentials (both countries) are ${money(tot)}; you need ${money(tot * 2)} a month for them to be half.`)}`;
    const pct = tot / inc * 100;
    return `<br>📏 ${L(`كل أساسياتك (البلدين) ${money(tot)} = ${fmt(pct)}% من كل دخلك المتوقع (${money(inc)}). القاعدة: 50% أو أقل ${pct <= 50 ? '✅' : `⚠️ محتاج دخل ${money(tot * 2)} أو تقلّل ${money(tot - inc / 2)}`}`, `All your essentials (both countries), ${money(tot)}, are ${fmt(pct)}% of your total expected income (${money(inc)}). Rule: 50% or less ${pct <= 50 ? '✅' : `⚠️ you need ${money(tot * 2)} of income or to cut ${money(tot - inc / 2)}`}`)}`;
  };
  // الأرقام اللي ظاهرة في الخانات من قبل (مش مكتوبة من جديد) بتتحسب كأنك كتبتها — كان الزرار بيفضل مقفول (2026-11-20)
  const shown = k => st.where[k] ?? (st.mode === 'both' ? st.where[k.split('+')[0]] ?? st.amount : st.amount);
  const fillShown = () => { if (st.mode !== 'fixed') for (const k of (st.mode === 'me' ? P : combos())) { const v = shown(k); if (st.where[k] === undefined && v !== undefined && v !== null && v !== '' && isFinite(+v)) st.where[k] = +v; } };
  const amountsOk = () => { fillShown(); return st.mode === 'fixed' ? +st.amount >= 0 && st.amount !== null && st.amount !== ''
    : (st.mode === 'me' ? P : combos()).every(k => st.where[k] !== undefined && st.where[k] !== '' && +st.where[k] >= 0); };

  const STEPS = [
    { // 1) الاسم والأيقونة
      q: () => L('البند ده اسمه إيه؟', "What's this item called?"),
      help: () => L('اكتبه بكلامك. الأيقونة بتتحط لوحدها وتقدر تغيّرها.', 'In your own words. The icon picks itself and you can change it.'),
      body: () => `<input class="wiz-in" data-k="name" maxlength="40" value="${esc(st.name)}" placeholder="${L('مثال: إيجار الشقة', 'e.g. Apartment rent')}" autocomplete="off">
        <div class="wiz-chips">${[L('إيجار', 'Rent'), L('فواتير', 'Bills'), L('نت', 'Internet'), L('موبايل', 'Mobile'), L('أكل البيت', 'Groceries'), L('مواصلات', 'Transport'), L('مدارس', 'School'), L('تأمين', 'Insurance')].map(n => `<button type="button" class="wiz-chip" data-name="${esc(n)}">${guessIcon(n)} ${esc(n)}</button>`).join('')}</div>
        <div class="wiz-icons">${ICONS.map(i => `<button type="button" class="wiz-ico ${(st.icon || guessIcon(st.name)) === i ? 'on' : ''}" data-ico="${i}">${i}</button>`).join('')}</div>`,
      ok: () => st.name.trim().length > 0,
      fb: () => !st.name.trim() ? ''
        : deps.sameName(st.name, st.cur, item?.id) ? `⚠️ ${L('فيه بند بنفس الاسم في نفس البلد. لو ده نفسه، عدّله بدل ما تضيف واحد تاني.', 'There is already an item with this name in the same country. If it is the same one, edit it instead of adding another.')}`
          : `${st.icon || guessIcon(st.name)} ${L(`تمام، "${esc(st.name.trim())}".`, `Got it, "${esc(st.name.trim())}".`)}`,
    },
    { // 2) البلد / العملة
      q: () => L('بيتدفع في أنهي بلد؟', 'Which country is it paid in?'),
      help: () => L('بيتدفع بعملة البلد دي، وبيتحسب مع كل أساسياتك قصاد كل دخلك.', 'It is paid in that country’s currency, and counts with all your essentials against all your income.'),
      body: () => `<div class="wiz-opts">${P.map(c => `<button type="button" class="wiz-opt ${st.cur === c ? 'on' : ''}" data-cur="${c}"><span class="big">${CUR[c].f}</span><b>${placeName(c)}</b><small>${CUR[c].n} · ${CUR[c].s}</small></button>`).join('')}</div>`,
      ok: () => !!st.cur,
      fb: () => `${CUR[st.cur].f} ${L(`بيتدفع بال${CUR[st.cur].n}. أساسيات ${placeName(st.cur)} دلوقتي ${money(deps.countryTotal(st.cur, item?.id))} في الشهر.`, `It is paid in ${CUR[st.cur].n}. ${placeName(st.cur)} essentials are now ${money(deps.countryTotal(st.cur, item?.id))} a month.`)}`,
    },
    { // 3) نوع المبلغ
      q: () => L('المبلغ ده ثابت ولا بيتغيّر؟', 'Is the amount fixed, or does it change?'),
      help: () => L('لو بيفرق إنت فين (أو مراتك فين)، التطبيق بيحسب كل شهر بالأيام.', 'If it depends on where you (or your wife) are, the app counts each month by the days.'),
      body: () => `<div class="wiz-opts col">${[
        ['fixed', '📌', L('ثابت', 'Fixed'), L('نفس المبلغ كل شهر، أيًا كان إنت فين. زي الإيجار أو النت.', 'The same every month wherever you are. Like rent or internet.')],
        ['me', '📍', L('حسب إنت فين', 'Depends on where you are'), L('مبلغ لما تكون في كل بلد. زي المعيشة: أقل وإنت برّه، أكتر وإنت هناك.', 'One amount for each country you are in. Like living costs: less while you are away, more while you are there.')],
        ['both', '👫', L('حسب إنت ومراتك فين', 'Depends on where you and your wife are'), L('مبلغ لكل موقف: مع بعض في مصر، إنت برّه وهي هناك، مع بعض في الإمارات…', 'One amount for each situation: together in Egypt, you away and her there, together in the UAE…')],
      ].map(([k, i, t, d]) => `<button type="button" class="wiz-opt row ${st.mode === k ? 'on' : ''}" data-mode="${k}"><span class="big">${i}</span><span><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>`,
      ok: () => !!st.mode,
      fb: () => ({ fixed: L('📌 مبلغ واحد، سهل.', '📌 One amount, simple.'), me: L(`📍 هتكتب ${P.length} مبالغ، واحد لكل بلد.`, `📍 You will type ${P.length} amounts, one per country.`), both: L(`👫 هتكتب ${combos().length} مبالغ، واحد لكل موقف.`, `👫 You will type ${combos().length} amounts, one per situation.`) })[st.mode],
    },
    { // 4) المبالغ
      q: () => st.mode === 'fixed' ? L('كام في الشهر؟', 'How much a month?') : st.mode === 'me' ? L('كام في الشهر في كل حالة؟', 'How much a month in each case?') : L('كام في الشهر في كل موقف؟', 'How much a month in each situation?'),
      help: () => L(`بال${CUR[st.cur].n}. اكتب 0 لو مش بيتدفع في الحالة دي.`, `In ${CUR[st.cur].n}. Type 0 if it is not paid in that case.`),
      body: () => st.mode === 'fixed'
        ? `<label class="wiz-amt"><input class="wiz-in num" data-k="amount" inputmode="decimal" dir="ltr" value="${st.amount ?? ''}" placeholder="0"><span dir="ltr">${CUR[st.cur].s}</span></label>`
        : `<div class="wiz-grid">${(st.mode === 'me' ? P : combos()).map(k => `<label class="wiz-amt"><small>${st.mode === 'me' ? `${CUR[k].f} ${L('لما تكون في', 'When you are in')} ${placeName(k)}` : `${sitName(k)} <button type="button" class="wiz-nosit" data-nosit="${k}" title="${L('الموقف ده مش بيحصل: شيله من كل البنود', 'This never happens: remove it from every item')}">🚫 ${L('مش بيحصل', 'never happens')}</button>`}</small>
            <span class="in"><input class="wiz-in num" data-w="${k}" inputmode="decimal" dir="ltr" value="${st.where[k] ?? (st.mode === 'both' ? st.where[k.split('+')[0]] ?? st.amount ?? '' : st.amount ?? '')}" placeholder="0"><span dir="ltr">${CUR[st.cur].s}</span></span></label>`).join('')}
          ${st.mode === 'both' && noSit.length ? `<div class="wiz-hidden"><small>${L('مواقف متشالة (مش بتحصل):', 'Removed situations (never happen):')}</small>${noSit.map(k => `<button type="button" class="wiz-chip" data-sitback="${k}">↩️ ${sitName(k)}</button>`).join('')}</div>` : ''}</div>`,
      ok: amountsOk,
      fb: () => {
        if (!amountsOk()) return '';
        const it = build(), pv = deps.preview(it), tot = deps.countryTotal(st.cur, item?.id) + pv.month;
        const aed = st.cur !== 'AED' ? ` · ≈ ${money(deps.toAED(pv.month, st.cur), 'AED')}` : '';
        return `${L(`الشهر ده هيتحسب ${money(pv.month)}${st.mode !== 'fixed' ? ' (حسب الأيام اللي إنت فيها في كل مكان)' : ''}${aed}، يعني حوالي ${money(pv.perDay)} في اليوم.`, `This month it counts ${money(pv.month)}${st.mode !== 'fixed' ? ' (by the days you spend in each place)' : ''}${aed}, about ${money(pv.perDay)} a day.`)}
          <br>${L(`أساسيات ${placeName(st.cur)} هتبقى ${money(tot)}، والبند ده ${fmt(tot ? pv.month / tot * 100 : 0)}% منها.`, `${placeName(st.cur)} essentials become ${money(tot)}, and this item is ${fmt(tot ? pv.month / tot * 100 : 0)}% of them.`)}
          ${rule(tot)}`;
      },
    },
    { // 5) مدفوع مقدّم؟
      q: () => L('دفعته مقدّم لحد شهر معيّن؟', 'Did you prepay it up to a certain month?'),
      help: () => L('زي إيجار دافعه لحد ديسمبر: الشهور دي بيتحسب فيها 0، وبعدها يرجع لمبلغه.', 'Like rent paid up to December: those months count 0, then it goes back to its amount.'),
      body: () => `<div class="wiz-chips">${[{ ym: '', label: L('❌ لأ، بدفعه كل شهر', '❌ No, I pay it monthly') }, ...deps.cycles].map(c => `<button type="button" class="wiz-chip ${st.paidTo === c.ym ? 'on' : ''}" data-paid="${c.ym}">${c.ym ? `✅ ${L('لحد', 'Up to')} ${c.label}` : c.label}</button>`).join('')}</div>`,
      ok: () => true,
      fb: () => {
        if (!st.paidTo) return L('تمام، بيتحسب كل شهر.', 'Okay, it counts every month.');
        const now = deps.preview({ ...build(), paidTo: '' }).month, n = deps.cycles.findIndex(c => c.ym === st.paidTo) + 1;
        return `✅ ${L(`مدفوع لحد ${deps.cycles.find(c => c.ym === st.paidTo)?.label}: ${n === 1 ? 'شهر' : n === 2 ? 'شهرين' : `${n} شهور`} بيتحسب فيهم 0، يعني بتوفّر ${money(now)} من أساسيات الشهر ده. بعدها يرجع ${money(now)} في الشهر.`, `Paid up to ${deps.cycles.find(c => c.ym === st.paidTo)?.label}: ${n} month(s) count 0, so you save ${money(now)} from this month's essentials. After that it goes back to ${money(now)} a month.`)}`;
      },
    },
    { // 6) المراجعة
      q: () => L('راجع وأكّد', 'Review and confirm'),
      help: () => editing ? L('ده البند بعد التعديل.', 'This is the item after your changes.') : L('ده البند اللي هيتضاف.', 'This is the item that will be added.'),
      body: () => {
        const it = build(), pv = deps.preview(it);
        const amts = st.mode === 'fixed' ? `<li><span>${L('كل شهر', 'Every month')}</span>${money(it.amount)}</li>`
          : Object.entries(it.where).map(([k, v]) => `<li><span>${st.mode === 'me' ? `${CUR[k].f} ${placeName(k)}` : sitName(k)}</span>${money(v)}</li>`).join('');
        return `<div class="wiz-sum"><div class="wiz-sum-head"><span class="big">${it.icon}</span><div><b>${esc(it.name)}</b><small>${it.paidTo ? `✅ ${L('مدفوع لحد', 'Paid up to')} ${deps.cycles.find(c => c.ym === it.paidTo)?.label || it.paidTo} · ` : ''}${CUR[it.cur].f} ${placeName(it.cur)} · ${{ fixed: L('📌 ثابت', '📌 Fixed'), me: L('📍 حسب إنت فين', '📍 By where you are'), both: L('👫 حسب إنت ومراتك فين', '👫 By where you and your wife are') }[st.mode]}</small></div></div>
          <ul class="alloc">${amts}</ul>
          <p class="wiz-note">${L(`الشهر ده: ${money(pv.month)} · حوالي ${money(pv.perDay)} في اليوم`, `This month: ${money(pv.month)} · about ${money(pv.perDay)} a day`)}</p>
          ${editing ? `<button type="button" class="wiz-del" data-wdel>🗑️ ${L('امسح البند ده', 'Delete this item')}</button>` : ''}</div>`;
      },
      ok: () => true, fb: () => '',
    },
  ];

  return new Promise(resolve => {
    let i = 0, delArmed = false;
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
      const s = STEPS[i];
      o.innerHTML = `<div class="wiz-card glass">
        <div class="wiz-top"><b>${editing ? `✏️ ${L('تعديل', 'Edit')}: ${esc(item.name)}` : `＋ ${L('بند أساسيات جديد', 'New essential')}`}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
        <div class="wiz-prog"><i style="width:${((i + 1) / STEPS.length * 100).toFixed(1)}%"></i></div>
        <small class="wiz-n">${L(`خطوة ${i + 1} من ${STEPS.length}`, `Step ${i + 1} of ${STEPS.length}`)}</small>
        <div class="wiz-step ${dir > 0 ? 'fwd' : 'back'}"><h3>${s.q()}</h3><p class="wiz-help">${s.help()}</p>${s.body()}</div>
        <div class="wiz-fb" aria-live="polite" hidden></div>
        <div class="wiz-nav">${i ? `<button type="button" class="btn ghost" data-back>${L('→ رجوع', '← Back')}</button>` : '<span></span>'}
          <button type="button" class="btn primary" data-next>${i === STEPS.length - 1 ? (editing ? L('💾 احفظ التعديل', '💾 Save changes') : L('✅ ضيفه', '✅ Add it')) : L('التالي ←', 'Next →')}</button></div></div>`;
      refreshFb();
      o.querySelector('input')?.focus();
    };
    const next = () => {
      if (!STEPS[i].ok()) { sfx?.err?.(); o.querySelector('.wiz-card').classList.remove('shake'); void o.offsetWidth; o.querySelector('.wiz-card').classList.add('shake'); return; }
      if (i === STEPS.length - 1) return close({ action: 'save', item: build() });
      sfx?.step?.(); i++; draw(1);
    };
    o.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k === 'name') { st.name = t.value; if (!item?.icon || !st.icon) { const g = guessIcon(st.name); o.querySelectorAll('.wiz-ico').forEach(b => b.classList.toggle('on', b.dataset.ico === (st.icon || g))); } }
      else if (t.dataset.k === 'amount') st.amount = t.value === '' ? null : parseNum(t.value);
      else if (t.dataset.w) { const v = parseNum(t.value); if (t.value === '' || !isFinite(v)) delete st.where[t.dataset.w]; else st.where[t.dataset.w] = v; }
      refreshFb();
    });
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === o) close(null); return; }
      const d = b.dataset;
      if ('close' in d) return close(null);
      if ('next' in d) return next();
      if ('back' in d) { i--; return draw(-1); }
      if ('wdel' in d) {
        if (!delArmed) { delArmed = true; b.textContent = L('⚠️ دوس تاني للتأكيد', '⚠️ Tap again to confirm'); b.classList.add('armed'); return; }
        return close({ action: 'delete' });
      }
      if (d.name) { st.name = d.name; st.icon = ''; return draw(0); }
      if (d.nosit) { noSit = [...new Set([...noSit, d.nosit])]; delete st.where[d.nosit]; deps.setNoSit?.(noSit); return draw(0); }
      if (d.sitback) { noSit = noSit.filter(k => k !== d.sitback); deps.setNoSit?.(noSit); return draw(0); }
      if ('paid' in d) { st.paidTo = d.paid; o.querySelectorAll('[data-paid]').forEach(x => x.classList.toggle('on', x === b)); return refreshFb(); }
      if (d.ico) { st.icon = d.ico; o.querySelectorAll('.wiz-ico').forEach(x => x.classList.toggle('on', x === b)); return; }
      if (d.cur) st.cur = d.cur;
      else if (d.mode) st.mode = d.mode;
      else if ('tag' in d) st.tag = d.tag;
      else return;
      b.parentElement.querySelectorAll('.wiz-opt').forEach(x => x.classList.toggle('on', x === b));
      refreshFb();
    });
    draw(1);
  });
}
