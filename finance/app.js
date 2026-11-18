import { initLang, L, LOC, EN_N } from './i18n.js';
import { sinceOf, cycleInfo,
  allocate, replay, essentialsTotal, spareAmount, lifeMonthly, holdingValue,
  expectedIncome, stableStreak, addMonths, OZ, periodOf, paydayOf,
} from './rules.js';
import { JOKES, GREET, RISK, VIDEO } from './content.js';
import { sfx } from './sfx.js';
import { renderAnalytics } from './analytics.js';

/* ───────────── أدوات صغيرة ───────────── */
const $ = (q, el = document) => el.querySelector(q);
const uid = () => Math.random().toString(36).slice(2, 9);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let LOCK = true; // الأرقام مستخبية لحد ما الرقم السري يتكتب
const fmt = (n, d = 0) => LOCK ? '•••' : (Math.abs(n) < 0.005 ? 0 : n).toLocaleString('en-US', { maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const norm = t => String(t).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
const parseNum = t => parseFloat(norm(t).replace(/[,\s]/g, '').match(/-?\d*\.?\d+/)?.[0] ?? 'x');
const monthName = d => d.toLocaleDateString(LOC(), { month: 'long', year: 'numeric' });

const CUR = {
  AED: { get n() { return L('درهم', 'AED'); }, f: '🇦🇪', s: 'Đ' }, EGP: { get n() { return L('جنيه', 'EGP'); }, f: '🇪🇬', s: 'E£' }, USD: { get n() { return L('دولار', 'USD'); }, f: '🇺🇸', s: '$' },
  EUR: { get n() { return L('يورو', 'EUR'); }, f: '🇪🇺', s: '€' }, SAR: { get n() { return L('ريال', 'SAR'); }, f: '🇸🇦', s: 'SR' }, XAU: { get n() { return L('جرام دهب', 'g gold'); }, f: '🥇' },
};
const MONEY = ['AED', 'EGP', 'USD', 'EUR', 'SAR'];
const B = {
  essentials: { get n() { return L('الأساسيات', 'Essentials'); }, i: '🍞', c: '#fbbf24' },
  growth: { get n() { return L('النمو', 'Growth'); }, i: '📈', c: '#34d399' },
  stability: { get n() { return L('الأمان', 'Safety'); }, i: '🛟', c: '#60a5fa' },
  reward: { get n() { return L('المتعة', 'Fun'); }, i: '🎉', c: '#f472b6' },
  sadaqa: { get n() { return L('الصدقة', 'Sadaqa'); }, i: '🤲', c: '#a78bfa' },
};
const BX = { ...B, sadaqa: { get n() { return L('الصدقة', 'Sadaqa'); }, i: '🤲' } };
const MODE = { get A() { return L('عجز', 'Deficit'); }, get B() { return L('وضع الباقي', 'Remainder mode'); }, get C() { return L('النسب الأصلية', 'Original ratios'); } };
const money = (v, cur = 'AED') => CUR[cur]?.s
  ? `<b dir="ltr">${fmt(v)} ${CUR[cur].s}</b>`
  : `<b dir="ltr">${fmt(v, 2)}</b> ${CUR[cur]?.n ?? cur}`;

/* ───────────── الحالة ───────────── */
const KEY = 'floosy.v1';
// القيم الافتراضية هنا فاضية عن قصد: الملف ده بيتخدّم للعموم، فمفيش فيه أي رقم شخصي ولا رقم سري حقيقي.
// البيانات الحقيقية بتيجي من قاعدة البيانات بعد تسجيل الدخول (أو من استيراد ملف).
const seed = () => ({
  salary: 0, job: null,
  essentials: [
    { id: uid(), icon: '🏠', name: 'الإيجار', amount: 0, tag: 'home' },
    { id: uid(), icon: '💡', name: 'المرافق', amount: 0 },
    { id: uid(), icon: '🍳', name: 'أكل البيت', amount: 0 },
    { id: uid(), icon: '🚇', name: 'المواصلات', amount: 0, tag: 'move' },
    { id: uid(), icon: '📱', name: 'الموبايل', amount: 0 },
  ],
  debt: { name: 'الدين', balance: 0 },
  holdings: [],
  tx: [],
  life: [{ id: uid(), name: 'الأساسيات 50% من الدخل', link: true }],
  spare: [{ id: uid(), name: 'مصاريف 12 شهر', link: true, extra: 0 }],
  fun: [],
  wait: [],
  risk: 1,
  payday: 1, autoSalary: false, autoFrom: null, sound: true,
  sadaqa: 2.5, // % من أي دخل، بتطلع الأول
  pin: '0000', // مؤقت لحد ما البيانات الحقيقية تتحمّل
  cats: { // التصنيف ثم التفصيلة
    income: [{ n: 'Business', subs: [] }, { n: 'تدريس', subs: [] }, { n: 'فريلانس', subs: [] }],
    reward: ['أكل برّه', 'خروجة', 'سفر', 'هدايا', 'هوايات'],
  },
  rates: { AED: 1, USD: 3.6725, EGP: 0.0684, EUR: 4.04, SAR: 0.979, XAU: 450 },
  manual: {},
  ratesAt: 0,
});
// على الموقع (/finance) البيانات في قاعدة البيانات ورا تسجيل الدخول، ومفيش نسخة منها في المتصفح. محليًا: server.py + data.json.
const HOSTED = location.pathname.startsWith('/finance');
const API = HOSTED ? { data: '/api/ideas?finance=data', fx: '/api/ideas?finance=fx' } : { data: '/api/data', fx: '/api/fx' };
const keep = () => { if (!HOSTED) try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
let S;
try { S = { ...seed(), ...(HOSTED ? null : JSON.parse(localStorage.getItem(KEY) || 'null')) }; } catch { S = seed(); }
// الأصل هو data.json اللي في فولدر المشروع (عن طريق server.py). المتصفح نسخة احتياطية بس.
const FILE = { ok: false, t: 0, rev: '', missing: false };
try {
  const r = await fetch(API.data, { cache: 'no-store' });
  const isApi = (r.headers.get('content-type') || '').includes('json');
  if (r.ok && isApi) { const j = await r.json(); if (j && Array.isArray(j.tx)) S = { ...seed(), ...j }; FILE.ok = true; FILE.rev = r.headers.get('X-Rev') || ''; }
  else if (r.status === 404 && isApi) { FILE.ok = true; FILE.missing = true; } // السيرفر شغال والملف لسه ما اتعملش
  else if (r.status === 401 && HOSTED) { location.replace('/admin'); await new Promise(() => {}); } // مش داخل: روح سجّل دخول
} catch {}
const PENDING = 'floosy.pending';
if (HOSTED) try {
  const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); sessionStorage.removeItem(PENDING);
  // نرجّع التعديل بس لو مفيش حد حفظ نسخة أحدث على الموقع في الوقت ده
  if (p && FILE.ok && p.rev === FILE.rev && p.data && Array.isArray(p.data.tx)) { S = { ...seed(), ...p.data }; FILE.resume = true; }
} catch {}
function expired() {
  if (expired.done) return; expired.done = true;
  try { sessionStorage.setItem(PENDING, JSON.stringify({ rev: FILE.rev, data: S })); } catch {}
  location.replace('/admin');
}
function setSaveInfo(ok) {
  $('#saveInfo').textContent = !FILE.ok ? (HOSTED ? L('☁️ لسه ما اتحفظش على الموقع', '☁️ Not saved to the site yet') : L('💾 محفوظ في المتصفح بس (شغّل server.py)', '💾 Saved in the browser only (run server.py)')) : ok ? (HOSTED ? L('☁️ محفوظ على الموقع', '☁️ Saved to the site') : L('💾 محفوظ في data.json', '💾 Saved to data.json')) : L('⚠️ الحفظ في الملف فشل', '⚠️ Saving to the file failed');
}
function pushFile() {
  if (!FILE.ok) return setSaveInfo(false);
  fetch(API.data, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': FILE.rev }, body: JSON.stringify(S) })
    .then(async r => {
      if (r.status === 401 && HOSTED) return expired();
      if (r.status === 409) return adopt(await r.json(), r.headers.get('X-Rev'), true); // نافذة تانية حفظت قبلنا
      if (r.ok) { FILE.rev = r.headers.get('X-Rev') || FILE.rev; FILE.missing = false; }
      setSaveInfo(r.ok);
    }).catch(() => setSaveInfo(false));
}
/** خُد أحدث نسخة من الملف بدل اللي في النافذة دي */
function adopt(j, rev, lost) {
  if (!j || !Array.isArray(j.tx)) return;
  S = { ...seed(), ...j }; FILE.rev = rev || '';
  keep();
  render(); setSaveInfo(true);
  toast(lost ? L('⚠️ البيانات اتغيّرت من نافذة تانية، فحمّلت الأحدث. كرّر آخر تعديل عملته هنا.', '⚠️ The data changed in another window, so I loaded the latest. Redo the last change you made here.') : L('🔄 حمّلت أحدث بيانات من الملف', '🔄 Loaded the latest data from the file'));
}
/** لما ترجع للنافذة: لو الملف اتغيّر من مكان تاني، حمّله */
async function syncFile() {
  if (!FILE.ok || document.hidden) return;
  try {
    const r = await fetch(API.data, { cache: 'no-store' });
    if (r.status === 401 && HOSTED) return expired();
    const rev = r.headers.get('X-Rev') || '';
    if (r.ok && rev && rev !== FILE.rev && !document.activeElement?.classList?.contains('ed')) adopt(await r.json(), rev, false);
  } catch {}
}
// أسعار العملات بتتحفظ في المتصفح بس، عشان تحديثها كل دقيقة ما يكتبش فوق الملف
const saveLocal = () => { keep(); };
const save = () => {
  keep();
  clearTimeout(FILE.t); FILE.t = setTimeout(pushFile, 250);
};
const rate = c => S.rates[c] ?? 1;
const UI = { open: new Set(['v-growth']), goldLive: false, prevTotal: 0 };

/* ───────────── الحسابات المشتقة ───────────── */
function routed(a, R) {
  let g = a.growth, st = a.stability, capped = false;
  if (R.lastSpare > 0 && R.stabilityAED >= R.lastSpare && st > 0) { g += st; st = 0; capped = true; }
  const debt = Math.min(g, R.debt);
  return { ...a, growth: g, stability: st, debt, invest: g - debt, capped };
}
function ctx() {
  const R = replay(S, rate), ym = periodOf(today(), paydayOf(S));
  const cyc = cycleInfo(S, ym), Ec = R.E * cyc.f; // أساسيات الدورة دي (بالأيام لو أول دورة)
  const mo = R.months[ym] || { E: Ec, f: cyc.f, income: 0, gross: 0, sadaqa: 0, sadGiven: 0, essAlloc: 0, essSpent: 0, rewardSpent: 0, items: {}, mode: 'A', alloc: { growth: 0, stability: 0, reward: 0, debt: 0 } };
  const expI = expectedIncome(S, R, ym);
  const planned = mo.income <= 0;
  const sadPct = Math.min(100, Math.max(0, +S.sadaqa || 0)) / 100, sal = +S.salary || 0;
  const planI = planned ? sal * (1 - sadPct) : mo.income;
  return { R, ym, mo, cyc, Ec, expI, planned, planI, sadPct, planGross: planned ? sal : mo.gross, planSad: planned ? sal * sadPct : mo.sadaqa, plan: routed(allocate(planI, Ec), R), exp: routed(allocate(expI, R.E), R) };
}
const snap = c => ({
  spare: S.spare.filter(t => c.R.stabilityAED >= spareAmount(t, c.R.E) - 0.5).length,
  life: lifeState(c).level,
  debtFree: c.R.debt <= 0.5,
});

/* ───────────── اعمل إيه دلوقتي ───────────── */
function todos(c) {
  const { R, mo, ym } = c, t = [];
  const pi = payInfo(c);
  if (pi.due) t.push({ i: '💰', h: L(`يوم القبض جه (${dayName(pi.next)}) — سجّل المرتب`, `Payday is here (${dayName(pi.next)}) — log your salary`), s: `${fmt(pi.amount)} Đ${pi.sf.full ? '' : ' (' + partNote(pi.sf) + ')'}. ${L('دوس يلا وأنا أوزّعه وأقولك كل حتة تروح فين.', "Tap Go and I'll split it and tell you where each part goes.")}`, act: 'salary' });
  for (const tx of S.tx.filter(x => x.type === 'income').slice(-6).reverse()) {
    const r = R.rows[tx.id]; if (!r) continue;
    const k = 1 / r.r, src = L(`من ${esc(tx.note || 'دخل')} · ${tx.date}`, `From ${esc(tx.note || 'income')} · ${tx.date}`);
    [['sad', r.sadaqa, L(`طلّع ${money(r.sadaqa * k, tx.cur)} صدقة`, `Give ${money(r.sadaqa * k, tx.cur)} as sadaqa`), '🤲'],
     ['debt', r.debtPay, L(`حوّل ${money(r.debtPay * k, tx.cur)} لـ${esc(S.debt.name)}`, `Send ${money(r.debtPay * k, tx.cur)} to ${esc(S.debt.name)}`), '💳'],
     ['stab', r.d.stability, L(`حط ${money(r.d.stability * k, tx.cur)} في حساب الأمان`, `Put ${money(r.d.stability * k, tx.cur)} in your safety account`), '🛟'],
     ['inv', r.invest, L(`استثمر ${money(r.invest * k, tx.cur)}`, `Invest ${money(r.invest * k, tx.cur)}`), '📈'],
     ['joy', r.d.reward, L(`حط ${money(r.d.reward * k, tx.cur)} في حصّالة المتعة`, `Put ${money(r.d.reward * k, tx.cur)} in the fun jar`), '🎉'],
    ].forEach(([key, v, h, i]) => { if (v > 0.5 && !tx.done?.[key]) t.push({ i, h, s: src, done: `${tx.id}:${key}` }); });
  }
  const pulled = S.tx.filter(x => x.type === 'expense' && x.bucket === 'stability' && periodOf(x.date, paydayOf(S)) === ym)
    .reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0);
  if (pulled > 0) t.push({ i: '🤝', h: L(`وعد التعويض: رجّع ${money(pulled)} للأمان`, `Payback promise: return ${money(pulled)} to Safety`), s: L('سحبت من الأمان الشهر ده. رجّعهم من أول قبض جاي.', 'You took from Safety this month. Put it back from your next payday.') });
  for (const w of S.wait) {
    const days = Math.floor((Date.now() - new Date(w.date)) / 864e5);
    if (days >= 7) t.push({ i: '⏳', h: L(`عدّى 7 أيام على "${esc(w.name)}" — لسه عايزه؟`, `7 days have passed on "${esc(w.name)}" — still want it?`), s: L('لو آه اشتريه من المتعة، لو لأ امسحه من قايمة الانتظار.', 'If yes, buy it from Fun. If not, remove it from the waiting list.') });
  }
  if (R.rewardAED < -0.5) t.push({ i: '🫙', h: L('حصّالة المتعة فاضية', 'The fun jar is empty'), s: L(`عدّيت بـ ${fmt(-R.rewardAED)} درهم. استنى القبض الجاي ومتسحبش من بند تاني.`, `You overspent by ${fmt(-R.rewardAED)} AED. Wait for the next payday and don't pull from another bucket.`) });
  if (mo.essSpent > c.Ec + 0.5) t.push({ i: '🚨', h: L(`الأساسيات عدّت الميزانية بـ ${money(mo.essSpent - c.Ec)}`, `Essentials went over budget by ${money(mo.essSpent - c.Ec)}`), s: L('راجع البنود وشوف إيه اللي زاد.', 'Review the items and see what went up.') });
  const need = R.E * 2;
  if (c.expI < need - 0.5) t.push({ i: '🚀', h: L(`زوّد دخلك ${money(need - c.expI)} في الشهر`, `Raise your income by ${money(need - c.expI)} a month`), s: L(`عشان الأساسيات (${fmt(R.E)}) تبقى 50% من الدخل. المطلوب ${fmt(need)}.`, `So that Essentials (${fmt(R.E)}) become 50% of your income. You need ${fmt(need)}.`) });
  const nextSpare = S.spare.find(x => R.stabilityAED < spareAmount(x, R.E) - 0.5);
  if (nextSpare) t.push({ i: '🎯', h: L(`فاضل ${money(spareAmount(nextSpare, R.E) - R.stabilityAED)} على محطة "${esc(nextSpare.name)}"`, `${money(spareAmount(nextSpare, R.E) - R.stabilityAED)} left to reach the "${esc(nextSpare.name)}" milestone`), s: L('ده هدف الأمان الجاي.', 'This is your next safety goal.') });
  if (pi.none) t.push({ i: '🏢', h: L('مفيش مرتب متسجل', 'No salary set up'), s: L('التطبيق ماشي على الدخل اللي بتسجّله بس. لو اشتغلت في شركة، سجّل الشغل ويوم القبض.', 'The app runs only on the income you log. If you work at a company, add the job and your payday.'), act: 'pay' });
  else if (!pi.due) t.push({ i: '📅', h: L(`قبضك الجاي ${dayName(pi.next)} بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, `Your next payday is ${dayName(pi.next)}, in ${EN_N(pi.days, 'day')}`), s: `${fmt(pi.amount)} Đ${pi.sf.full ? '' : ' (' + partNote(pi.sf) + ')'} · ${S.autoSalary ? L('هيتسجل ويتوزع أوتوماتيك', 'It will be logged and split automatically') : L('هفكّرك يومها وتسجّله إنت', "I'll remind you that day and you log it yourself")}` });
  if (!t.length) t.push({ i: '😎', h: L('كله تمام، مفيش حاجة مطلوبة دلوقتي', 'All good, nothing to do right now'), s: L('استمتع بيومك.', 'Enjoy your day.') });
  return t;
}

/* ───────────── قطع HTML ───────────── */
const ed = (p, v, { n = false, d = 0, cls = '' } = {}) =>
  `<span class="ed ${n ? 'num' : ''} ${cls}" contenteditable="${LOCK ? 'false' : 'true'}" spellcheck="false" data-p="${p}"${n ? ' data-t="n" dir="ltr"' : ''}>${n ? fmt(v, d) : esc(v)}</span>`;
const bar = (p, c = 'var(--acc)') => `<div class="bar"><i style="width:${(Math.max(0, Math.min(1, p || 0)) * 100).toFixed(1)}%;background:${c}"></i></div>`;
const del = p => `<button class="x" data-del="${p}" title="${L('امسح', 'Delete')}" aria-label="${L('امسح', 'Delete')}">✕</button>`;
const grip = { toString: () => `<span class="grip" draggable="true" data-grip title="${L('اسحب للترتيب', 'Drag to reorder')}">⠿</span>` };
const plural = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
const eta = n => {
  if (!isFinite(n)) return L('محتاج دخل أكتر', 'Needs more income');
  if (n <= 0) return L('وصلت ✅', 'Reached ✅');
  const y = Math.floor(n / 12), m = n % 12;
  return L('بعد ' + [y && plural(y, 'سنة', 'سنتين', 'سنين', 'سنة'), m && plural(m, 'شهر', 'شهرين', 'شهور', 'شهر')].filter(Boolean).join(' و'),
    'in ' + [y && EN_N(y, 'year'), m && EN_N(m, 'month')].filter(Boolean).join(' and '));
};
const card = (id, title, body, cls = '') => `<article class="card glass ${cls}" id="${id}"><h2>${title}</h2>${body}</article>`;

function cardCTA(c) {
  const t = todos(c), [first, ...rest] = t;
  const row = x => `<li class="todo">${x.done ? `<button class="chk" data-done="${x.done}" title="${L('خلصت', 'Done')}" aria-label="${L('خلصت', 'Done')}"></button>` : `<span class="ti">${x.i}</span>`}
    <div><strong>${x.done ? x.i + ' ' : ''}${x.h}</strong><small>${x.s}</small></div>${x.act ? `<button class="btn" data-act="${x.act}">${L('يلا', 'Go')}</button>` : ''}</li>`;
  return card('c-cta', L('🧭 اعمل إيه دلوقتي', '🧭 What to do now'), `
    <div class="hero-cta">${first.done ? `<button class="chk big" data-done="${first.done}" aria-label="${L('خلصت', 'Done')}"></button>` : `<span class="hi">${first.i}</span>`}
      <div><strong>${first.h}</strong><small>${first.s}</small></div>${first.act ? `<button class="btn primary" data-act="${first.act}">${L('يلا', 'Go')}</button>` : ''}</div>
    ${rest.length ? `<ul class="todos">${rest.map(row).join('')}</ul>` : ''}`, 'wide cta');
}

function cardMonth(c) {
  const { R, mo, planned, planI: I } = c, E = c.Ec, p = c.plan;
  const v = planned
    ? { essentials: p.essentials, debt: p.debt, invest: p.invest, stability: p.stability, reward: p.reward }
    : { essentials: mo.essAlloc, debt: mo.alloc.debt, invest: mo.alloc.growth, stability: mo.alloc.stability, reward: mo.alloc.reward };
  const mode = planned ? p.mode : mo.mode, left = I - E;
  const seg = [['essentials', v.essentials], ['growth', v.debt + v.invest], ['stability', v.stability], ['reward', v.reward]];
  const eq = mode === 'A'
    ? [L(`الدخل ${fmt(I)} أقل من الأساسيات ${fmt(E)}`, `Income ${fmt(I)} is less than Essentials ${fmt(E)}`), `${L('العجز', 'Deficit')} = ${fmt(E)} − ${fmt(I)} = ${fmt(E - I)}`]
    : mode === 'B'
      ? [`${L('الباقي', 'Remainder')} = ${fmt(I)} − ${fmt(E)} = ${fmt(left)}`, `${L('النمو', 'Growth')} = ${fmt(left)} × 0.50 = ${fmt(left * .5)}`, `${L('الأمان', 'Safety')} = ${fmt(left)} × 0.30 = ${fmt(left * .3)}`, `${L('المتعة', 'Fun')} = ${fmt(left)} × 0.20 = ${fmt(left * .2)}`]
      : [`${L('الأمان', 'Safety')} = ${fmt(I)} × 0.15 = ${fmt(I * .15)}`, `${L('المتعة', 'Fun')} = ${fmt(I)} × 0.10 = ${fmt(I * .1)}`, `${L('النمو', 'Growth')} = ${fmt(I)} × 0.25 + (${fmt(I * .5)} − ${fmt(E)}) = ${fmt(I * .25 + I * .5 - E)}`];
  const fx = mode === 'A' ? { essentials: L('كل الدخل', 'All income'), growth: '—', stability: '—', reward: '—' }
    : mode === 'B' ? { essentials: L('ثابتة', 'Fixed'), growth: `${fmt(left)} × 50%`, stability: `${fmt(left)} × 30%`, reward: `${fmt(left)} × 20%` }
      : { essentials: L('ثابتة', 'Fixed'), growth: `${fmt(I)} × 25% + ${fmt(I * .5 - E)} ${L('متوفّر', 'saved')}`, stability: `${fmt(I)} × 15%`, reward: `${fmt(I)} × 10%` };
  const why = mode === 'A' ? L('الدخل لسه مش مغطي الأساسيات، فكله رايح لها.', "Your income doesn't cover Essentials yet, so all of it goes there.")
    : mode === 'B' ? L(`الأساسيات ${fmt(E / I * 100)}% من الدخل، أكبر من النص. فالباقي بيتقسم بنفس نسبة 25 : 15 : 10.`, `Essentials are ${fmt(E / I * 100)}% of your income, more than half. So the remainder is split in the same 25 : 15 : 10 ratio.`)
      : L(`الأساسيات ${fmt(E / I * 100)}% من الدخل، يعني النص أو أقل. فالنسب الأصلية شغالة، واللي اتوفر راح للنمو.`, `Essentials are ${fmt(E / I * 100)}% of your income, so half or less. The original ratios apply, and what you saved went to Growth.`);
  return card('c-month', `🗓️ ${L('توزيع', 'Split for')} ${periodLabel(c.ym)} <span class="tag m${mode}">${MODE[mode]}</span>${planned ? `<span class="tag">${L('متوقع', 'Expected')}</span>` : ''}`, `
    <div class="kv"><span>${planned ? (S.job ? L('المرتب المتوقع', 'Expected salary') : L('لسه مفيش دخل الدورة دي. المرتب المتوقع', 'No income yet this cycle. Expected salary')) : L('دخل الشهر لحد دلوقتي', 'Income this month so far')}</span>${planned ? ed('S::salary', S.salary, { n: true }) : `<b dir="ltr">${fmt(I)}</b>`} <small>${L('درهم', 'AED')}</small></div>
    ${c.planSad > 0.005 ? `<p class="note">🤲 ${L('الصدقة', 'Sadaqa')} <b dir="ltr">${fmt(c.planSad)}</b> (${fmt(c.sadPct * 100, 2)}% ${L('من', 'of')} ${fmt(c.planGross)}) ${L('بتطلع الأول. التوزيع اللي تحت على الباقي:', 'comes out first. The split below is on the rest:')} <b dir="ltr">${fmt(I)}</b>.</p>` : ''}
    ${c.cyc.since ? `<p class="note">📆 ${L(`أول دورة ليك: بدأت ${dayName(new Date(c.cyc.since + 'T00:00:00'))}، فالأساسيات محسوبة على ${plural(c.cyc.left, 'يوم', 'يومين', 'أيام', 'يوم')} بس:`, `Your first cycle: it started ${dayName(new Date(c.cyc.since + 'T00:00:00'))}, so Essentials are counted for only ${EN_N(c.cyc.left, 'day')}:`)} <b dir="ltr">${fmt(R.E)} ÷ ${c.cyc.days} × ${c.cyc.left} = ${fmt(E)}</b>. ${L('من الدورة الجاية بتتحسب كاملة.', 'From the next cycle they count in full.')}</p>` : ''}
    <div class="stack">${seg.map(([k, x]) => `<i style="flex:${Math.max(x, 0.0001)};background:${B[k].c}" title="${B[k].n}"></i>`).join('')}</div>
    <div class="buckets">
      ${seg.map(([k, x]) => `<div class="bk" style="--c:${B[k].c}"><span>${B[k].i} ${B[k].n}</span><b dir="ltr">${fmt(x)} <small>Đ</small></b><small>${I ? fmt(x / I * 100, 1) : 0}%</small><em>${fx[k]}</em></div>`).join('')}
    </div>
    <p class="why">${why}</p>
    ${mode === 'A' ? `<div class="chips-c"><span class="chipc bad">${L('عجز', 'Deficit')} ${fmt(E - I)}</span></div>` : `<div class="chips-c"><span class="chipc">${L('الدخل', 'Income')} ${fmt(I)}</span><span class="chipc warn">− ${L('أساسيات', 'Essentials')} ${fmt(E)}</span><span class="chipc good">= ${L('الباقي', 'Remainder')} ${fmt(left)}</span></div>`}
    ${v.debt > 0.5 ? `<p class="note">💳 ${L(`عندك دين، فمن نصيب النمو <b>${fmt(v.debt)}</b> رايحين لـ${esc(S.debt.name)}${v.invest > 0.5 ? ` و<b>${fmt(v.invest)}</b> استثمار` : ''}. فاضل عليه ${fmt(R.debt)}.`, `You have debt, so from the Growth share <b>${fmt(v.debt)}</b> goes to ${esc(S.debt.name)}${v.invest > 0.5 ? ` and <b>${fmt(v.invest)}</b> to investing` : ''}. ${fmt(R.debt)} still owed.`)}</p>` : ''}
    ${p.capped ? `<p class="note">🛟 ${L('صندوق الأمان وصل آخر محطة، فنصيبه بيروح للنمو.', 'The safety fund reached its last milestone, so its share goes to Growth.')}</p>` : ''}`);
}

/** عرض المصاريف: يوم / شهر / سنة، مع تنقّل لقدام وورا */
UI.exp = { mode: 'month', off: 0 };
function expView(c) {
  const { R } = c, pd = paydayOf(S), { mode, off } = UI.exp, first = periodOf(sinceOf(S), pd);
  const aed = x => x.amount * (x.rate || rate(x.cur)), ess = S.tx.filter(x => x.type === 'expense' && x.bucket === 'essentials');
  const shift = (k, n) => { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const fOf = k => k < first ? 0 : cycleInfo(S, k).f;
  const sum = txs => { const items = {}; let paid = 0; for (const x of txs) { paid += aed(x); if (x.item) items[x.item] = (items[x.item] || 0) + aed(x); } return { paid, items }; };
  const endOf = k => new Date(+k.slice(0, 4), +k.slice(5, 7), pd), t0 = new Date(today() + 'T00:00:00');
  if (mode === 'day') {
    const D = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + off), ds = iso(D), k = periodOf(ds, pd);
    const tracked = ds >= sinceOf(S), daysLeft = Math.max(1, Math.round((endOf(k) - D) / 864e5));
    const before = sum(ess.filter(x => periodOf(x.date, pd) === k && x.date < ds)), day = sum(ess.filter(x => x.date === ds)), f = fOf(k);
    const share = e => tracked ? Math.max(0, ((+e.amount || 0) * f - (before.items[e.id] || 0)) / daysLeft) : 0;
    const budget = tracked ? Math.max(0, (R.E * f - before.paid) / daysLeft) : 0;
    const name = D.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' });
    return { mode, label: off === 0 ? `${L('النهارده', 'Today')} · ${name}` : off === -1 ? `${L('إمبارح', 'Yesterday')} · ${name}` : off === 1 ? `${L('بكرة', 'Tomorrow')} · ${name}` : name, budget, ...day, share,
      bT: off === 0 ? L('🎯 أقصى حاجة تصرفها النهارده', '🎯 The most you can spend today') : L('🎯 أقصى مصروف لليوم ده', '🎯 Max spend for this day'), pT: L('اتصرف في اليوم ده', 'Spent on this day'),
      note: tracked ? L(`الحسبة: (ميزانية الدورة <b dir="ltr">${fmt(R.E * f)}</b> − اللي اتصرف قبل اليوم ده <b dir="ltr">${fmt(before.paid)}</b>) ÷ <b>${plural(daysLeft, 'يوم', 'يومين', 'أيام', 'يوم')}</b> فاضلين لحد ${dayName(endOf(k))}.`, `The math: (cycle budget <b dir="ltr">${fmt(R.E * f)}</b> − spent before this day <b dir="ltr">${fmt(before.paid)}</b>) ÷ <b>${EN_N(daysLeft, 'day')}</b> left until ${dayName(endOf(k))}.`) : L('اليوم ده قبل ما تبدأ تسجّل، فمفيش ميزانية ليه.', 'This day is before you started logging, so it has no budget.') };
  }
  if (mode === 'year') {
    const Y = t0.getFullYear() + off, ks = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`).filter(k => k >= first && k <= c.ym);
    const F = ks.reduce((a, k) => a + fOf(k), 0), y = sum(ess.filter(x => periodOf(x.date, pd).startsWith(Y + '-')));
    return { mode, label: L(`سنة ${Y}`, `Year ${Y}`), budget: R.E * F, ...y, share: e => (+e.amount || 0) * F, bT: L('📦 ميزانية السنة لحد دلوقتي', "📦 Year's budget so far"), pT: L('اتدفع في السنة', 'Paid this year'),
      note: ks.length ? L(`محسوبة على <b>${plural(ks.length, 'دورة', 'دورتين', 'دورات', 'دورة')}</b> من أول ما بدأت تسجّل لحد الدورة الحالية. متوسط اللي بيتدفع في الدورة: <b dir="ltr">${fmt(y.paid / ks.length)}</b>.`, `Based on <b>${EN_N(ks.length, 'cycle')}</b>, from when you started logging up to the current cycle. Average paid per cycle: <b dir="ltr">${fmt(y.paid / ks.length)}</b>.`) : L('مفيش دورات متسجلة في السنة دي.', 'No cycles logged in this year.') };
  }
  const k = shift(c.ym, off), f = fOf(k), mth = sum(ess.filter(x => periodOf(x.date, pd) === k)), budget = R.E * f;
  const daysLeft = k === c.ym ? Math.max(1, Math.round((endOf(k) - t0) / 864e5)) : 0, left = budget - mth.paid;
  return { mode, label: `${off === 0 ? L('الشهر ده', 'This month') + ' · ' : ''}${periodLabel(k)}`, budget, ...mth, share: e => (+e.amount || 0) * f, bT: L('📦 ميزانية الشهر', "📦 Month's budget"), pT: L('اتدفع لحد دلوقتي', 'Paid so far'),
    note: f === 0 ? L('الشهر ده قبل ما تبدأ تسجّل.', 'This month is before you started logging.') : daysLeft ? `${L(`فاضل <b>${plural(daysLeft, 'يوم', 'يومين', 'أيام', 'يوم')}</b> لآخر الشهر`, `<b>${EN_N(daysLeft, 'day')}</b> left until the end of the month`)} (${dayName(endOf(k))}). ${left > 0.5 ? L(`يعني تقدر تصرف لحد <b dir="ltr">${fmt(left / daysLeft)} Đ</b> في اليوم.`, `So you can spend up to <b dir="ltr">${fmt(left / daysLeft)} Đ</b> a day.`) : L('الميزانية خلصت، أي مصروف دلوقتي زيادة.', 'The budget is used up; anything you spend now is over.')}${f < 1 ? L(` الميزانية محسوبة على ${plural(cycleInfo(S, k).left, 'يوم', 'يومين', 'أيام', 'يوم')} بس عشان دي أول دورة.`, ` The budget is counted for only ${EN_N(cycleInfo(S, k).left, 'day')} because this is the first cycle.`) : ''}` : L('شهر خلص.', 'Month ended.') };
}
$('#cards').addEventListener('click', e => {
  const b = e.target.closest('[data-ev],[data-en]'); if (!b) return;
  if (b.dataset.ev) UI.exp = { mode: b.dataset.ev, off: 0 };
  else { const n = +b.dataset.en, max = UI.exp.mode === 'day' ? 31 : 0; UI.exp.off = n === 0 ? 0 : Math.min(max, UI.exp.off + n); }
  sfx.tap(); render();
});
function cardEssentials(c) {
  const { R, planI } = c, E = R.E, V = expView(c);
  const share = tag => S.essentials.filter(e => e.tag === tag).reduce((a, e) => a + (+e.amount || 0), 0) / (E || 1);
  const rows = S.essentials.map(e => {
    const sp = V.items[e.id] || 0, bud = V.share(e);
    return `<li class="row" data-row="essentials:${e.id}">${grip}${ed(`essentials:${e.id}:icon`, e.icon, { cls: 'ico' })}
      <div class="grow">${ed(`essentials:${e.id}:name`, e.name)}${bar(sp / (bud || 1), sp > bud + 0.5 ? '#f87171' : B.essentials.c)}<small>${L(`اتصرف ${fmt(sp)} من ${fmt(bud, V.mode === 'day' ? 2 : 0)}`, `Spent ${fmt(sp)} of ${fmt(bud, V.mode === 'day' ? 2 : 0)}`)}${sp > bud + 0.5 ? ` · <b style="color:#f87171">${L(`زيادة ${fmt(sp - bud)}`, `${fmt(sp - bud)} over`)}</b>` : ''}</small></div>
      ${ed(`essentials:${e.id}:amount`, e.amount, { n: true })}${del(`essentials:${e.id}`)}</li>`;
  }).join('');
  const left = V.budget - V.paid, over = left < -0.5;
  const tile = (col, t, v) => `<div class="bk" style="--c:${col}"><span>${t}</span><b dir="ltr">${fmt(v)} <small>Đ</small></b></div>`;
  const viewHead = `
    <div class="switch exp-sw">${[['day', L('يوم', 'Day')], ['month', L('شهر', 'Month')], ['year', L('سنة', 'Year')]].map(([k, n]) => `<button class="${V.mode === k ? 'on' : ''}" data-ev="${k}">${n}</button>`).join('')}</div>
    <div class="exp-nav"><button data-en="-1" aria-label="${L('اللي قبله', 'Previous')}">›</button><b>${V.label}</b><button data-en="1" aria-label="${L('اللي بعده', 'Next')}" ${UI.exp.off >= (V.mode === 'day' ? 31 : 0) ? 'disabled' : ''}>‹</button>${UI.exp.off ? `<button class="pill" data-en="0">${V.mode === 'day' ? L('النهارده', 'Today') : V.mode === 'month' ? L('الشهر ده', 'This month') : L('السنة دي', 'This year')}</button>` : ''}</div>
    <div class="buckets">${tile('#fbbf24', V.bT, V.budget)}${tile('#60a5fa', V.pT, V.paid)}${tile(over ? '#f87171' : '#34d399', over ? L('🚨 زيادة عن الميزانية', '🚨 Over budget') : L('✅ فاضل', '✅ Left'), Math.abs(left))}</div>
    ${bar(V.budget ? V.paid / V.budget : 0, over ? '#f87171' : B.essentials.c)}
    <p class="note">${V.note}</p>`;
  const pct = planI ? E / planI : 0;
  return card('c-ess', L('🍞 الأساسيات <small>(اللي بيأكّلك مش اللي بيفشخرك)</small>', '🍞 Essentials <small>(what feeds you, not what shows off)</small>'), `
    ${viewHead}
    <ul class="list" data-list="essentials">${rows}</ul>
    <button class="add" data-add="essentials">${L('＋ بند جديد', '＋ New item')}</button>
    <div class="sumline"><span>${L('إجمالي الشهر الكامل', 'Full month total')}</span><b dir="ltr">${fmt(E)}</b><span class="tag ${pct > .5 ? 'bad' : 'good'}">${fmt(pct * 100)}% ${L('من الدخل', 'of income')}</span></div>
    ${c.cyc.since ? `<div class="kv"><span>📆 ${L(`نصيب أول دورة (${plural(c.cyc.left, 'يوم', 'يومين', 'أيام', 'يوم')} من ${c.cyc.days})`, `First cycle share (${EN_N(c.cyc.left, 'day')} of ${c.cyc.days})`)}</span><b dir="ltr">${fmt(c.Ec)}</b></div>` : ''}
    <div class="kv"><span>${L('أقل دخل يخلّيها 50%', 'Lowest income that makes them 50%')}</span><b dir="ltr">${fmt(E * 2)}</b> <small>= ${fmt(E)} × 2</small></div>
    <p class="note">🏠 ${L(`السكن ${fmt(share('home') * 100)}% والمواصلات ${fmt(share('move') * 100)}% من الأساسيات. الفيديو بيقول كل واحد يبقى تحت 50%.`, `Housing is ${fmt(share('home') * 100)}% and transport ${fmt(share('move') * 100)}% of Essentials. The video says each should stay under 50%.`)}</p>`);
}

function cardWallets(c) {
  const { R } = c;
  const curs = Object.keys(R.bal).sort((a, b) => MONEY.indexOf(a) - MONEY.indexOf(b));
  const rows = curs.map(cu => {
    const w = R.bal[cu], tot = w.growth + w.stability + w.reward;
    return `<tr><th>${CUR[cu].f} ${CUR[cu].n} <small dir="ltr">${CUR[cu].s}</small></th><td dir="ltr">${fmt(w.growth)}</td><td dir="ltr">${fmt(w.stability)}</td><td dir="ltr">${fmt(w.reward)}</td><td dir="ltr"><b>${fmt(tot)}</b></td><td dir="ltr">${fmt(w.sadaqa || 0)}</td></tr>`;
  }).join('');
  const holds = S.holdings.map(h => `<li class="row" data-row="holdings:${h.id}">${grip}
      <button class="pill" data-cycle="${h.id}" title="${L('غيّر العملة', 'Change currency')}">${CUR[h.cur].f}</button>
      <div class="grow">${ed(`holdings:${h.id}:name`, h.name)}
        <small>${ed(`holdings:${h.id}:amount`, h.amount, { n: true, d: 2 })} ${h.cur === 'XAU' ? `${L('جرام عيار', 'g, karat')} ${ed(`holdings:${h.id}:karat`, h.karat || 24, { n: true })}` : CUR[h.cur].n}</small></div>
      <button class="pill ${h.spare ? 'on' : ''}" data-toggle="${h.id}" title="${L('بيتحسب في أنهي بند', 'Which bucket it counts in')}">${h.spare ? L('🛟 أمان', '🛟 Safety') : L('📈 نمو', '📈 Growth')}</button>
      <b dir="ltr">${fmt(holdingValue(h, rate))}</b>${del(`holdings:${h.id}`)}</li>`).join('');
  const total = R.growthAED + R.stabilityAED + R.rewardAED, ess = c.mo.essAlloc - c.mo.essSpent;
  return card('c-wal', L('👛 المحافظ والعملات', '👛 Wallets & currencies'), `
    <div class="scroll"><table class="tbl"><thead><tr><th>${L('العملة', 'Currency')}</th><th>📈 ${L('نمو', 'Growth')}</th><th>🛟 ${L('أمان', 'Safety')}</th><th>🎉 ${L('متعة', 'Fun')}</th><th>${L('الإجمالي', 'Total')}</th><th>🤲 ${L('صدقة', 'Sadaqa')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>${L('أصول معاك', 'Assets you hold')}</h3>
    <ul class="list" data-list="holdings">${holds}</ul>
    <button class="add" data-add="holdings">${L('＋ أصل (دهب أو عملة)', '＋ Asset (gold or currency)')}</button>
    <div class="sumline"><span>${L('الإجمالي', 'Total')}</span><b dir="ltr">${fmt(total)}</b><small>${L('درهم', 'AED')} ≈ ${fmt(total / rate('EGP'))} ${L('جنيه', 'EGP')} ≈ ${fmt(total / rate('USD'))} ${L('دولار', 'USD')}</small></div>
    <div class="kv debt"><span>💳 ${ed('debt::name', S.debt.name)} ${L('(الباقي)', '(remaining)')}</span>${ed('debt::remaining', R.debt, { n: true })} <small>${L('درهم', 'AED')}</small></div>
    <div class="sumline"><span>${L('الصافي', 'Net')}</span><b dir="ltr" class="${total + ess - R.debt < -0.5 ? 'neg' : ''}">${fmt(total + ess - R.debt)}</b></div>
    <div class="chips-c"><span class="chipc good">+ ${fmt(total)} ${L('في المحافظ', 'in wallets')}</span>${ess > 0.5 ? `<span class="chipc warn">+ ${fmt(ess)} ${L('فاضل من الأساسيات', 'left from Essentials')}</span>` : ''}${R.debt > 0.5 ? `<span class="chipc bad">− ${fmt(R.debt)} ${L('دين', 'debt')}</span>` : ''}</div>
    <h3>${L('الأسعار', 'Rates')} <small>${UI.goldLive ? L('🟢 الدهب لايف كل 5 دقايق', '🟢 Gold live every 5 min') : L('🟡 آخر سعر محفوظ', '🟡 Last saved price')} · ${L('العملات', 'Currencies')} ${UI.fxLive ? '🟢 ' : ''}${esc(S.fxDate || L('محفوظة', 'saved'))} · ${L('دوس على الرقم لو عايز تعدّله', 'tap a number to edit it')}${Object.keys(S.manual).length ? ` · <button class="pill" data-live>${L('رجّع اللايف', 'Back to live')}</button>` : ''}</small></h3>
    <div class="rates"><span>🇦🇪 1 ${L('درهم', 'AED')} = ${ed('rates:EGP:inv', 1 / rate('EGP'), { n: true, d: 2 })} ${L('جنيه', 'EGP')} 🇪🇬</span>${['USD', 'EUR', 'SAR'].map(cu => `<span>1 ${CUR[cu].n} = ${ed(`rates:${cu}:v`, rate(cu), { n: true, d: 4 })} ${L('د', 'AED')}</span>`).join('')}
      <span>🥇 ${L('جرام 24', '24K gram')} = ${ed('rates:XAU:v', rate('XAU'), { n: true, d: 2 })} ${L('د', 'AED')}</span></div>`, 'wide');
}

/** مستويات المعيشة: المستوى بيتعدّى لما دخل الشهر (مرتب + جانبي) يوصل المطلوب 3 شهور ورا بعض */
function lifeState(c) {
  const { R, ym } = c, inc = k => R.months[k]?.income || 0;
  const prev = k => { let [y, m] = k.split('-').map(Number); if (--m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
  const first = Object.keys(R.months).sort()[0] || ym, keys = [];
  for (let k = ym; k >= first && keys.length < 240; k = prev(k)) keys.unshift(k);
  const label = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString(LOC(), { month: 'short' });
  let level = 0;
  const rows = S.life.map((t, i) => {
    const m = lifeMonthly(t, R.E), need = m * 2;
    let run = 0, best = 0;
    for (const k of keys) {
      if (inc(k) >= need - 0.5) { run++; best = Math.max(best, run); }
      else if (k !== ym) run = 0; // الدورة الحالية لسه شغالة، ما تكسرش السلسلة
    }
    const passed = best >= 3;
    if (passed && level === i) level = i + 1;
    const last = [prev(prev(ym)), prev(ym), ym].map(k => ({ label: label(k), income: inc(k), ok: inc(k) >= need - 0.5, cur: k === ym, none: k < first }));
    return { t, i, m, need, run: Math.min(run, 3), passed, last };
  });
  return { rows, level };
}
function cardLife(c) {
  const { rows, level } = lifeState(c), now = c.mo.income;
  const html = rows.map(({ t, i, m, need, run, passed, last }) => {
    const active = i === level, locked = i > level;
    const head = `${L('مصاريف الشهر', 'Monthly expenses')} ${t.link ? `<b dir="ltr">${fmt(m)}</b> ${L('(مربوطة بأساسياتك)', '(linked to your Essentials)')}` : ed(`life:${t.id}:monthly`, m, { n: true })} × 2 = ${L('دخل شهري', 'monthly income of')} <b dir="ltr">${fmt(need)}</b>`;
    const body = passed ? `<small>${L('🏆 عدّيته: الدخل وصل المطلوب 3 شهور ورا بعض', '🏆 Passed: income hit the target 3 months in a row')}</small>`
      : locked ? `<small>${L('🔒 بيتفتح لما تعدّي المستوى اللي قبله', '🔒 Unlocks once you pass the level before it')}</small>`
        : `<small>${L('دخل الشهر ده لحد دلوقتي', 'Income this month so far')} <b dir="ltr">${fmt(now)}</b> ${L('من', 'of')} <b dir="ltr">${fmt(need)}</b>${now < need - 0.5 ? ` · ${L('ناقص', 'short by')} <b dir="ltr">${fmt(need - now)}</b>` : ' ✅'}</small>
          <div class="chips-c">${last.map(x => `<span class="chipc ${x.none ? '' : x.ok ? 'good' : x.cur ? 'warn' : 'bad'}">${x.label}: ${x.none ? '—' : `<b dir="ltr">${fmt(x.income)}</b> ${x.ok ? '✅' : x.cur ? '⏳' : '✗'}`}</span>`).join('')}</div>
          <small>${L('السلسلة:', 'Streak:')} <b>${L(`${run} من 3`, `${run} of 3`)}</b> ${L('شهور ورا بعض', 'months in a row')} ${'🟢'.repeat(run)}${'⚪'.repeat(3 - run)}</small>`;
    return `<li class="row lvl ${passed ? 'ok' : ''} ${locked ? 'locked' : ''}" data-row="life:${t.id}">${grip}<span class="badge">${passed ? '✅' : locked ? '🔒' : i + 1}</span>
      <div class="grow">${ed(`life:${t.id}:name`, t.name)}${bar(passed ? 1 : active ? now / (need || 1) : 0, passed ? '#34d399' : B.essentials.c)}
        <small>${head}</small>${body}</div>${del(`life:${t.id}`)}</li>`;
  }).join('');
  const cur = rows[level];
  return card('c-life', `🎮 ${L('مستوى المعيشة', 'Living level')} <span class="tag good">${L(`المستوى ${level} من ${S.life.length}`, `Level ${level} of ${S.life.length}`)}</span>`, `
    <p class="note">${L(`دخل الشهر = <b>المرتب + أي دخل جانبي</b> (بعد الصدقة). المستوى بيتعدّى لما الدخل ده يبقى ضعف مصاريف المستوى <b>3 شهور ورا بعض</b>، وساعتها بننقل للي بعده.${cur ? ` إنت دلوقتي شغال على: <b>${esc(cur.t.name)}</b>.` : ' 🏆 عدّيت كل المستويات.'}`, `Monthly income = <b>salary + any side income</b> (after Sadaqa). You pass a level when that income is double the level's expenses for <b>3 months in a row</b>, then we move on to the next one.${cur ? ` Right now you're working on: <b>${esc(cur.t.name)}</b>.` : ' 🏆 You passed every level.'}`)}</p>
    <ul class="list" data-list="life">${html}</ul><button class="add" data-add="life">${L('＋ مستوى جديد', '＋ New level')}</button>`);
}

const CC = { AED: '#2dd4bf', EGP: '#fb923c', USD: '#4ade80', EUR: '#60a5fa', SAR: '#a3e635', XAU: '#f5c542' };
/** البند ده متخزّن في إيه بالظبط: كل عملة أو أصل وقيمته بالدرهم */
function inside(k, R) {
  const out = [];
  for (const [cu, w] of Object.entries(R.bal)) {
    if (w[k] > 0.005) out.push({ n: `${CUR[cu].f} ${CUR[cu].n}`, native: `${fmt(w[k])} ${CUR[cu].n}`, aed: w[k] * rate(cu), c: CC[cu] });
  }
  if (k === 'stability' || k === 'growth') for (const h of S.holdings.filter(h => (k === 'stability') === !!h.spare && +h.amount > 0)) {
    out.push({ n: `${CUR[h.cur].f} ${esc(h.name)}`, native: h.cur === 'XAU' ? L(`${fmt(h.amount, 2)} جرام عيار ${h.karat || 24}`, `${fmt(h.amount, 2)} g ${h.karat || 24}K`) : `${fmt(h.amount)} ${CUR[h.cur].n}`, aed: holdingValue(h, rate), c: CC[h.cur] });
  }
  return out;
}
/** معدّل زيادة الأمان في الشهر: من سجلّك الفعلي لو موجود، وإلا من المتوقع */
function stabilityPace(c) {
  const ks = Object.keys(c.R.months).filter(k => c.R.months[k].income > 0).sort().slice(-3);
  if (!ks.length) return { v: c.exp.stability, hist: 0 };
  return { v: ks.reduce((a, k) => a + c.R.months[k].alloc.stability, 0) / ks.length, hist: ks.length };
}
/** تاريخ متوقع لكل محطة أمان: بنمشّي الشهور الجاية بنفس القواعد (المرتب المتوقع + متوسط الدخل الجانبي، والدين بيتسد الأول) */
function spareDates(c) {
  const { R } = c, pd = paydayOf(S), pi = payInfo(c), n0 = new Date(), out = new Map();
  const cycles = Math.max(1, Object.keys(R.months).length);
  const sideAvg = S.tx.filter(x => x.type === 'income' && x.kind !== 'salary').reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0) / cycles;
  let debt = R.debt, stab = R.stabilityAED, P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next);
  const goals = [...new Set(S.spare.map(t => spareAmount(t, R.E)))].filter(a => stab < a - 0.5).sort((a, b) => a - b);
  for (let i = 0; i < 480 && goals.length; i++) {
    const a = allocate((salaryFor(P).amount + sideAvg) * (1 - c.sadPct), R.E);
    debt -= Math.min(a.growth, debt); stab += a.stability;
    while (goals.length && stab >= goals[0] - 0.5) out.set(goals.shift(), new Date(P));
    P = new Date(P.getFullYear(), P.getMonth() + 1, pd);
  }
  return { at: amt => out.get(amt) || null, sideAvg, salary: pi.none ? 0 : +S.salary || 0 };
}
function cardSpare(c) {
  const { R } = c, have = R.stabilityAED, pace = stabilityPace(c), parts = inside('stability', R), sd = spareDates(c);
  const rows = S.spare.map((t, i) => {
    const amt = spareAmount(t, R.E), ok = have >= amt - 0.5, rem = Math.max(0, amt - have), pct = amt ? Math.min(1, have / amt) : 0;
    const dt = ok ? null : sd.at(amt), n = dt ? Math.max(1, (dt.getFullYear() - new Date().getFullYear()) * 12 + dt.getMonth() - new Date().getMonth()) : Infinity;
    const when = ok ? L('وصلت ✅', 'Reached ✅') : dt ? `📅 ${L('المتوقع', 'Expected')} <b>${monthName(dt)}</b> (${eta(n)})` : L(`📅 بالدخل المتوقع (${fmt(sd.salary + sd.sideAvg)} في الشهر) مفيش حاجة بتفضل للأمان. لازم الدخل يعدّي الأساسيات (${fmt(R.E)}) عشان يبان تاريخ.`, `📅 With the expected income (${fmt(sd.salary + sd.sideAvg)} a month) nothing is left over for Safety. Income has to exceed Essentials (${fmt(R.E)}) before a date can show.`);
    return `<li class="row lvl ${ok ? 'ok' : ''}" data-row="spare:${t.id}">${grip}<span class="badge">${ok ? '✅' : i + 1}</span>
      <div class="grow">${ed(`spare:${t.id}:name`, t.name)}${bar(pct, B.stability.c)}
        <small><b dir="ltr">${fmt(pct * 100, 1)}%</b> · ${L('معاك', 'you have')} ${fmt(Math.min(have, amt))} ${L('من', 'of')} <b dir="ltr">${fmt(amt)}</b> · ${ok ? L('خلصت', 'done') : L(`فاضل <b dir="ltr">${fmt(rem)}</b>`, `<b dir="ltr">${fmt(rem)}</b> left`)}</small>
        <small>${when}</small>
        <small>${L('الهدف', 'Target')} = ${t.link ? `<b dir="ltr">${fmt(R.E)}</b>` : ed(`spare:${t.id}:monthly`, t.monthly || 0, { n: true })} × 12 + ${ed(`spare:${t.id}:extra`, t.extra || 0, { n: true })}</small></div>${del(`spare:${t.id}`)}</li>`;
  }).join('');
  const mix = parts.length ? `
    <h3>${L('جوّه الأمان فيه إيه', "What's inside Safety")}</h3>
    <div class="stack">${parts.map(x => `<i style="flex:${Math.max(x.aed, 0.0001)};background:${x.c}" title="${x.n}"></i>`).join('')}</div>
    <ul class="how">${parts.map(x => `<li><span><i class="dot" style="background:${x.c}"></i>${x.n} <small>${x.native}</small></span><b dir="ltr">${fmt(x.aed)} ${L('د', 'AED')} · ${fmt(have ? x.aed / have * 100 : 0, 1)}%</b></li>`).join('')}</ul>` : '';
  return card('c-spare', L('🛟 محطات الأمان <small>(12 شهر لكل محطة)</small>', '🛟 Safety milestones <small>(12 months each)</small>'), `
    <div class="kv"><span>${L('معاك في الأمان', 'You have in Safety')}</span><b dir="ltr">${fmt(have)}</b> <small>${L('درهم', 'AED')}</small> <button class="pill" data-why="stability">${L('ⓘ جاي منين', 'ⓘ Where from')}</button></div>
    <p class="note">${L(`📅 التواريخ محسوبة على الشهور الجاية بنفس القواعد: ${sd.salary ? `مرتب <b dir="ltr">${fmt(sd.salary)}</b>` : 'من غير مرتب'} + متوسط دخل جانبي <b dir="ltr">${fmt(sd.sideAvg)}</b> في الشهر، والدين بيتسد الأول. ${pace.hist ? `في سجلّك الأمان زاد حوالي <b dir="ltr">${fmt(pace.v)}</b> في الشهر.` : ''} بتتحدث مع كل معاملة.`, `📅 Dates are worked out over the coming months using the same rules: ${sd.salary ? `salary <b dir="ltr">${fmt(sd.salary)}</b>` : 'no salary'} + average side income <b dir="ltr">${fmt(sd.sideAvg)}</b> a month, and the debt gets paid off first. ${pace.hist ? `In your history, Safety grew by about <b dir="ltr">${fmt(pace.v)}</b> a month.` : ''} Updates with every transaction.`)}</p>
    ${mix}
    <h3>${L('المحطات', 'Milestones')}</h3>
    <ul class="list" data-list="spare">${rows}</ul><button class="add" data-add="spare">${L('＋ محطة جديدة', '＋ New milestone')}</button>`);
}

/** القبضات الجاية ونصيب المتعة من كل واحد (المرتب المتوقع + متوسط الدخل الجانبي، بنفس القواعد) */
function rewardPath(c, n = 120) {
  const pd = paydayOf(S), pi = payInfo(c), n0 = new Date(), out = [];
  const sideAvg = S.tx.filter(x => x.type === 'income' && x.kind !== 'salary').reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0) / Math.max(1, Object.keys(c.R.months).length);
  let P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next);
  for (let i = 0; i < n; i++) {
    out.push({ t: new Date(P), add: allocate((salaryFor(P).amount + sideAvg) * (1 - c.sadPct), c.R.E).reward });
    P = new Date(P.getFullYear(), P.getMonth() + 1, pd);
  }
  return out;
}
function cardFun(c) {
  const { R, mo, exp } = c, d = new Date(), m = d.getMonth();
  const qEnd = Math.floor(m / 3) * 3 + 2, pi = payInfo(c), t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let n = pi.due ? 1 : 0; // كام قبض لسه هييجي قبل آخر الربع
  if (!pi.none) for (let mm = m; mm <= qEnd; mm++) if (new Date(d.getFullYear(), mm, paydayOf(S)) > t0) n++;
  const jar = Math.max(0, R.rewardAED);
  const qName = monthName(new Date(d.getFullYear(), qEnd, 1));
  const path = rewardPath(c), full = d => d.toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' });
  const qPays = path.filter(x => x.t <= new Date(d.getFullYear(), qEnd + 1, 0)), qAdd = qPays.reduce((a, x) => a + x.add, 0), proj = jar + qAdd;
  const rows = S.fun.map(t => {
    // الميعاد: اللي إنت كاتبه، وإلا أول مرة بعد "كل كام شهر" من يوم ما بدأت
    let when = /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? new Date(t.date + 'T00:00:00') : null;
    if (!when || isNaN(when)) { when = new Date(sinceOf(S) + 'T00:00:00'); do when = new Date(when.getFullYear(), when.getMonth() + (+t.every || 1), when.getDate()); while (when < t0); }
    const dleft = Math.round((when - t0) / 864e5), wName = when.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // هيبقى معاك كام في الميعاد، وإمتى الحصّالة تكمّل التكلفة
    const cost = +t.cost || 0, atDate = jar + path.filter(x => x.t <= when).reduce((a, x) => a + x.add, 0), ok = atDate >= cost - 0.5;
    let cum = jar, reach = jar >= cost - 0.5 ? t0 : null;
    for (const x of path) { if (reach) break; cum += x.add; if (cum >= cost - 0.5) reach = x.t; }
    const plan = ok
      ? `<li class="good"><span>${L('✅ جاهز في الميعاد', '✅ Ready on the date')}</span><b dir="ltr">${atDate - cost > 0.5 ? L(`وهيفضل ${fmt(atDate - cost)} Đ`, `with ${fmt(atDate - cost)} Đ to spare`) : L('بالظبط', 'exactly')}</b></li>`
      : `<li><span>${L('🅰️ تسافر في الميعاد بميزانية', '🅰️ Go on the date with a budget of')}</span><b dir="ltr">${fmt(atDate)} Đ</b></li>
         <li><span>🅱️ ${reach ? L(`تأجّل لحد <b>${full(reach)}</b> وتسافر بالمبلغ كله`, `Postpone to <b>${full(reach)}</b> and go with the full amount`) : L('بالدخل المتوقع الحصّالة مش هتكمّل المبلغ، محتاج دخل أعلى', "With the expected income the jar won't reach the amount; you need a higher income")}</span><b dir="ltr">${reach ? `${fmt(cost)} Đ` : '—'}</b></li>`;
    return `<li class="row" data-row="fun:${t.id}">${grip}<span class="badge">${ok ? '✅' : '✈️'}</span>
      <div class="grow">${ed(`fun:${t.id}:name`, t.name)}${bar(atDate / (cost || 1), ok ? '#34d399' : B.reward.c)}
        <small>${L('كل', 'Every')} ${ed(`fun:${t.id}:every`, t.every, { n: true })} ${L('شهور', 'months')} · ${L('التكلفة', 'Cost')} ${ed(`fun:${t.id}:cost`, t.cost, { n: true })} Đ</small>
        <small>📅 ${L('الميعاد:', 'Date:')} <b>${wName}</b> · ${dleft > 0 ? L(`بعد ${plural(dleft, 'يوم', 'يومين', 'أيام', 'يوم')}`, `in ${EN_N(dleft, 'day')}`) : dleft === 0 ? L('النهارده 🎉', 'Today 🎉') : L(`عدّى من ${plural(-dleft, 'يوم', 'يومين', 'أيام', 'يوم')}`, `${EN_N(-dleft, 'day')} ago`)} · ${L('غيّره:', 'Change it:')} ${ed(`fun:${t.id}:date`, iso(when))}</small></div>${del(`fun:${t.id}`)}
        <ul class="how fun-plan">
          <li class="sum"><span>${L('💰 في الميعاد ده هيبقى معاك في الحصّالة', "💰 On that date you'll have in the jar")}</span><b dir="ltr">${fmt(atDate)} Đ</b></li>
          <li><span>${L(`🏁 الحصّالة هتكمّل ${fmt(cost)} في`, `🏁 The jar reaches ${fmt(cost)} on`)}</span><b>${reach ? (reach <= t0 ? L('دلوقتي ✅', 'Now ✅') : full(reach)) : L('مش باين', 'Not in sight')}</b></li>
          ${plan}</ul></li>`;
  }).join('');
  const waits = S.wait.map(w => {
    const left = 7 - Math.floor((Date.now() - new Date(w.date)) / 864e5);
    return `<li class="row"><span class="badge">⏳</span><div class="grow"><b>${esc(w.name)}</b><small>${money(w.amount, w.cur)} · ${left > 0 ? L(`فاضل ${left} يوم`, `${EN_N(left, 'day')} left`) : L('عدّى الأسبوع، قرّر', 'The week is up, decide')}</small></div>
      <button class="btn" data-wait="buy:${w.id}">${L('اشتريته', 'Bought it')}</button><button class="btn ghost" data-wait="drop:${w.id}">${L('مش عايزه', "Don't want it")}</button></li>`;
  }).join('');
  return card('c-fun', L('🎉 الخروج والسفر <small>(حصّالة المتعة)</small>', '🎉 Outings & travel <small>(Fun jar)</small>'), `
    <div class="kv"><span>${L('في الحصّالة دلوقتي', 'In the jar now')}</span><b dir="ltr">${fmt(R.rewardAED)}</b> <small>${L(`درهم · صرفت الشهر ده ${fmt(mo.rewardSpent)}`, `AED · spent this month: ${fmt(mo.rewardSpent)}`)}</small></div>
    <div class="big-num" style="--c:${B.reward.c}"><small>${L(`أقصى مبلغ تصرفه في آخر الربع (${qName})`, `The most you can spend at the end of the quarter (${qName})`)}</small><b dir="ltr">${fmt(proj)}</b></div>
    <ul class="how"><li><span>${L('معاك في الحصّالة دلوقتي', 'You have in the jar now')}</span><b dir="ltr">${fmt(jar)}</b></li>
      <li><span>${qPays.length ? L(`لسه جاي ${plural(qPays.length, 'قبض واحد', 'قبضين', 'قبضات', 'قبض')} قبل آخر الربع (${qPays.map(x => `${dayName(x.t)}: ${fmt(x.add)}`).join(' · ')})`, `${EN_N(qPays.length, 'payday')} still to come before the quarter ends (${qPays.map(x => `${dayName(x.t)}: ${fmt(x.add)}`).join(' · ')})`) : L('مفيش قبض تاني قبل آخر الربع', 'No more paydays before the quarter ends')}</span><b dir="ltr">+ ${fmt(qAdd)}</b></li>
      <li class="sum"><span>${L('يبقى أقصى حاجة تصرفها', 'So the most you can spend is')}</span><b dir="ltr">${fmt(proj)}</b></li></ul>
    <ul class="list" data-list="fun">${rows}</ul><button class="add" data-add="fun">${L('＋ هدف خروج', '＋ New outing goal')}</button>
    ${waits ? `<h3>${L('⏳ قايمة الـ 7 أيام', '⏳ 7-day list')}</h3><ul class="list">${waits}</ul>` : ''}`);
}

function cardSadaqa(c) {
  const { R, mo } = c;
  const given = S.tx.filter(x => x.type === 'expense' && x.bucket === 'sadaqa').reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0);
  return card('c-sad', L('🤲 الصدقة', '🤲 Sadaqa'), `
    <div class="kv"><span>${L('النسبة من أي دخل', 'Share of any income')}</span>${ed('S::sadaqa', +S.sadaqa || 0, { n: true, d: 2 })} <small>${L('% · بتطلع الأول، وبعدها الباقي يتوزع عادي', '% · comes out first, then the rest is split as usual')}</small></div>
    <div class="buckets">
      <div class="bk" style="--c:#a78bfa"><span>${L('متخصصة ومستنية تطلع', 'Set aside, waiting to be given')}</span><b dir="ltr">${fmt(Math.max(0, R.sadaqaAED))} <small>Đ</small></b></div>
      <div class="bk" style="--c:#34d399"><span>${L('طلّعتها لحد دلوقتي', 'Given so far')}</span><b dir="ltr">${fmt(given)} <small>Đ</small></b></div>
    </div>
    <p class="note">${L(`الدورة دي: اتخصص ${fmt(mo.sadaqa)} وطلع ${fmt(mo.sadGiven)}. لما تطلّعها علّم عليها في "اعمل إيه دلوقتي"، أو سجّلها من "صرفت" ← "صدقة".`, `This cycle: ${fmt(mo.sadaqa)} set aside and ${fmt(mo.sadGiven)} given. When you give it, tick it off in "What to do now", or log it from "Spent" → "Sadaqa".`)}</p>
    <p class="note">${L('📚 صدقة التطوع ملهاش نسبة محددة في الشرع، ومتروكة لحالك وقدرتك. الـ 2.5% هنا نقطة بداية على قد نسبة الزكاة، وتقدر تغيّرها. فلوس الصدقة المتخصصة مش محسوبة في "اللي معاك". والزكاة حاجة تانية (فرض على المدخرات) ومش محسوبة هنا.', `📚 Voluntary sadaqa has no fixed rate in Islamic law; it's left to your situation and means. The 2.5% here is a starting point matching the zakat rate, and you can change it. Money set aside for Sadaqa isn't counted in "What you have". Zakat is a separate thing (an obligation on savings) and isn't calculated here.`)}</p>`);
}
function cardInvest(c) {
  const { R, exp, expI } = c, g = exp.growth;
  let head;
  if (R.debt <= 0.5) head = `<div class="big-num" style="--c:${B.growth.c}"><small>${L('مفيش ديون ✅ تقدر تبدأ من دلوقتي', 'No debt ✅ You can start right now')}</small><b dir="ltr">${fmt(exp.invest)}</b><small>${L('درهم نصيب النمو المتوقع كل شهر', 'AED expected Growth share every month')}</small></div>`;
  else if (g <= 0.5) head = `<div class="big-num" style="--c:#f87171"><small>${L('الاستثمار لسه مش ظاهر', "Investing isn't in sight yet")}</small><b>—</b><small>${L(`الدخل المتوقع (${fmt(expI)}) لازم يعدّي الأساسيات (${fmt(R.E)}) الأول`, `Expected income (${fmt(expI)}) has to exceed Essentials (${fmt(R.E)}) first`)}</small></div>`;
  else {
    const n = Math.ceil(R.debt / g);
    head = `<div class="big-num" style="--c:${B.growth.c}"><small>${L('هتبدأ تستثمر تقريبًا في', "You'll start investing around")}</small><b>${monthName(addMonths(new Date(), n))}</b>
      <small>${L(`باقي الدين ${fmt(R.debt)} ÷ نصيب النمو ${fmt(g)} في الشهر = ${plural(n, 'شهر', 'شهرين', 'شهور', 'شهر')} · بيتحدث مع كل معاملة`, `Remaining debt ${fmt(R.debt)} ÷ Growth share ${fmt(g)} a month = ${EN_N(n, 'month')} · updates with every transaction`)}</small></div>`;
  }
  return card('c-inv', L('📈 الاستثمار (بند النمو)', '📈 Investing (Growth bucket)'), `${head}
    <h3>${L('سلّم المخاطرة من الفيديو', 'The risk ladder from the video')}</h3>
    <input type="range" min="1" max="${RISK.length}" step="1" value="${S.risk}" id="risk" aria-label="${L('مستوى المخاطرة', 'Risk level')}">
    <div class="risk-scale"><span>${L('أهدى', 'Calmer')}</span><span>${L('أخطر', 'Riskier')}</span></div>
    <div id="riskBox"></div>
    <ol class="steps">${VIDEO.growth.map(([h, t]) => `<li><b>${h}</b><small>${t}</small></li>`).join('')}</ol>
    <p class="note">${L('⚠️ ده تلخيص كلام الفيديو مش نصيحة استثمار شخصية. أنا مش مستشار مالي مرخّص، والقرار قرارك.', "⚠️ This is a summary of what the video says, not personal investment advice. I'm not a licensed financial advisor, and the decision is yours.")}</p>`);
}
const riskHTML = () => {
  const r = RISK[S.risk - 1];
  return `<div class="risk"><span class="ri">${r.i}</span><div><b>${S.risk}. ${r.n}</b><small>${r.t}</small></div></div>`;
};

function cardRules() {
  const sec = (k, label) => `<details data-k="v-${k}" ${UI.open.has('v-' + k) ? 'open' : ''}><summary>${B[k].i} ${label}</summary>
    <ol class="steps">${VIDEO[k].map(([h, t]) => `<li><b>${h}</b><small>${t}</small></li>`).join('')}</ol></details>`;
  return card('c-rules', L('📜 قواعد الفيديو', '📜 Rules from the video'), sec('stability', L('الأمان 15%', 'Safety 15%')) + sec('essentials', L('الأساسيات 50%', 'Essentials 50%')) + sec('reward', L('المتعة 10%', 'Fun 10%')));
}

function cardTx(c) {
  const { R } = c;
  const rows = S.tx.slice().reverse().slice(0, 30).map(tx => {
    const r = R.rows[tx.id] || {}, inc = tx.type === 'income';
    const k = 1 / (r.r || 1);
    const sub = inc && r.d
      ? [[r.sadaqa, '🤲'], [r.d.essentials, '🍞'], [r.debtPay, '💳'], [r.invest, '📈'], [r.d.stability, '🛟'], [r.d.reward, '🎉']].filter(([v]) => v > 0.5).map(([v, i]) => `${i} ${fmt(v * k)}`).join(' · ')
      : `${BX[tx.bucket]?.i ?? ''} ${BX[tx.bucket]?.n ?? ''}`;
    return `<li class="row tx ${inc ? 'in' : 'out'}"><span class="badge">${inc ? '⬇️' : '⬆️'}</span>
      <div class="grow">${ed(`tx:${tx.id}:note`, tx.note || (inc ? L('دخل', 'Income') : L('مصروف', 'Expense')))}<small>${tx.date} · ${sub}</small></div>
      <span class="amt">${inc ? '+' : '−'}${ed(`tx:${tx.id}:amount`, tx.amount, { n: true, d: 2 })} <small>${tx.cur}</small></span>${del(`tx:${tx.id}`)}</li>`;
  }).join('');
  return card('c-tx', L('🧾 المعاملات', '🧾 Transactions'), `
    ${rows ? `<ul class="list">${rows}</ul>` : `<p class="note">${L('لسه مفيش معاملات. ابدأ من الشات: "قبضت المرتب".', 'No transactions yet. Start from the chat: "I got my salary".')}</p>`}
    <button class="add danger" data-reset>${L('🗑️ امسح كل البيانات وابدأ من الأول', '🗑️ Delete all data and start over')}</button>`, 'wide');
}

/* ───────────── يوم القبض ───────────── */
const dayName = d => d.toLocaleDateString(LOC(), { day: 'numeric', month: 'long' });
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodLabel(ym) {
  const [y, m] = ym.split('-').map(Number), pd = paydayOf(S);
  if (pd === 1) return monthName(new Date(y, m - 1, 1));
  return `${dayName(new Date(y, m - 1, pd))} – ${dayName(new Date(y, m, pd - 1))}`;
}
/** المرتب المستحق يوم القبض P: كامل، أو بنسبة أيام الشغل لو الشغلانة بدأت في نص المدة */
function salaryFor(P) {
  const full = +S.salary || 0, j = S.job;
  if (!j?.start) return { amount: full, full: true };
  const st = new Date(j.start + 'T00:00:00');
  // اللي بييجي يوم القبض هو مرتب الشهر اللي فات كله (من 1 لآخره)، مش أيام الشهر الحالي
  const [a, b] = [new Date(P.getFullYear(), P.getMonth() - 1, 1), new Date(P.getFullYear(), P.getMonth(), 0)];
  const days = Math.round((b - a) / 864e5) + 1;
  if (st <= a) return { amount: full, full: true };
  if (st > b) return { amount: 0, days, worked: 0 };
  const worked = Math.round((b - st) / 864e5) + 1;
  return { amount: Math.round(full * worked / days), days, worked, from: st, to: b };
}
const workMonth = P => new Date(P.getFullYear(), P.getMonth() - 1, 1).toLocaleDateString(LOC(), { month: 'long' });
/** تفصيل أول مرتب: من إمتى لإمتى، كام يوم، اليوم بكام، والإجمالي */
const payBreak = sf => sf.full ? '' : `<div class="chips-c">
  <span class="chipc">${L(`من ${dayName(sf.from)}`, `From ${dayName(sf.from)}`)}</span><span class="chipc">${L(`لـ ${dayName(sf.to)}`, `To ${dayName(sf.to)}`)}</span>
  <span class="chipc warn">${L(`${plural(sf.worked, 'يوم', 'يومين', 'أيام', 'يوم')} شغل`, `${EN_N(sf.worked, 'day')} worked`)}</span>
  <span class="chipc">${L('اليوم', 'Per day')} = ${fmt(S.salary)} ÷ ${sf.days} = ${fmt(S.salary / sf.days, 2)} Đ</span>
  <span class="chipc good">${L('الإجمالي', 'Total')} = ${sf.worked} × ${fmt(S.salary / sf.days, 2)} = ${fmt(sf.amount)} Đ</span></div>`;
const partNote = sf => sf.full ? '' : L(`أول مرتب: ${plural(sf.worked, 'يوم', 'يومين', 'أيام', 'يوم')} شغل من ${sf.days} (من ${dayName(sf.from)} لـ${dayName(sf.to)})`, `First salary: ${EN_N(sf.worked, 'day')} worked out of ${sf.days} (${dayName(sf.from)} to ${dayName(sf.to)})`);
function payInfo(c) {
  // من غير شغل متسجل مفيش مرتب متوقع ولا يوم قبض
  if (!S.job || !(+S.salary > 0)) return { none: true, got: false, due: false, next: null, days: 0, amount: 0, sf: { amount: 0, full: true }, prev: { sadaqa: 0, essentials: 0, debt: 0, invest: 0, stability: 0, reward: 0 } };
  const pd = paydayOf(S), [y, m] = c.ym.split('-').map(Number), n = new Date();
  const got = S.tx.some(x => x.type === 'income' && x.kind === 'salary' && periodOf(x.date, pd) === c.ym);
  let next = new Date(y, m - 1, pd), due = !got, sf = salaryFor(next);
  if (got || sf.amount <= 0) { // اتقبض خلاص، أو الشغل ما كانش بدأ: استنى القبض اللي بعده
    due = false; next = new Date(y, m, pd); sf = salaryFor(next);
    for (let i = 0; i < 3 && sf.amount <= 0; i++) { next = new Date(next.getFullYear(), next.getMonth() + 1, pd); sf = salaryFor(next); }
  }
  const days = Math.round((next - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
  // المرتب الجاي هيتوزع إزاي
  const I0 = due ? c.mo.income : 0, sal = sf.amount;
  const Ep = due ? c.Ec : c.R.E;
  const a0 = allocate(I0, Ep), a1 = allocate(I0 + sal * (1 - c.sadPct), Ep);
  const g = a1.growth - a0.growth, debt = Math.min(g, c.R.debt);
  const prev = { sadaqa: sal * c.sadPct, essentials: a1.essentials - a0.essentials, debt, invest: g - debt, stability: a1.stability - a0.stability, reward: a1.reward - a0.reward };
  return { got, due, next, days, prev, sf, amount: sal };
}
function cardPay(c) {
  const pi = payInfo(c), p = pi.prev;
  if (pi.none) return card('c-pay', L('📅 القبض الجاي', '📅 Next payday'), `<p class="note">${L('مفيش مرتب متسجل دلوقتي، فكل الحسابات ماشية على الدخل اللي بتسجّله بإيدك (بيزنس، فريلانس، وغيره).', 'No salary is logged right now, so all the math runs on the income you log by hand (business, freelance, and so on).')}</p>
    <button class="btn primary" data-act="pay">${L('🏢 سجّل شغل ومرتب', '🏢 Add a job and salary')}</button>`);
  const when = pi.due ? (pi.days === 0 ? L('النهارده يوم القبض 🎉', 'Today is payday 🎉') : L(`عدّى من ${plural(-pi.days, 'يوم', 'يومين', 'أيام', 'يوم')} ولسه ما اتسجلش`, `${EN_N(-pi.days, 'day')} overdue and not logged yet`)) : L(`بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, `In ${EN_N(pi.days, 'day')}`);
  const parts = [[L('🤲 صدقة', '🤲 Sadaqa'), p.sadaqa], [L('🍞 أساسيات', '🍞 Essentials'), p.essentials], [`💳 ${esc(S.debt.name)}`, p.debt], [L('📈 استثمار', '📈 Investing'), p.invest], [L('🛟 أمان', '🛟 Safety'), p.stability], [L('🎉 متعة', '🎉 Fun'), p.reward]].filter(([, v]) => v > 0.5);
  // حسبة لحد يوم القبض: مصاريف باقية، معاك كام ليها، وبعد المرتب هتبقى فين
  const { R, mo } = c, gross = v => v / (1 - c.sadPct || 1);
  // المصاريف الباقية بتتحسب بالأيام: نصيب اليوم × الأيام اللي فاضلة في الدورة (ومش أكتر من اللي لسه ما اتدفعش)
  const [cy, cm] = c.ym.split('-').map(Number), pd0 = paydayOf(S), nw = new Date();
  const cStart = new Date(cy, cm - 1, pd0), cEnd = new Date(cy, cm, pd0), cDays = Math.round((cEnd - cStart) / 864e5);
  const left = Math.min(cDays, Math.max(0, Math.round((cEnd - new Date(nw.getFullYear(), nw.getMonth(), nw.getDate())) / 864e5)));
  const rest = S.essentials.reduce((t, e) => t + Math.min(Math.max(0, (+e.amount || 0) - (mo.items[e.id] || 0)), (+e.amount || 0) * left / cDays), 0);
  const have = Math.max(0, mo.essAlloc - mo.essSpent), gapNow = Math.max(0, rest - have);
  const after = pi.due ? have + p.essentials : p.essentials, needAfter = pi.due ? rest : R.E, gapAfter = Math.max(0, needAfter - after);
  // فترتين ورا بعض: من النهارده ليوم القبض، وبعدها الدورة اللي المرتب بيغطيها
  const pday = dayName(cEnd), nEnd = dayName(new Date(cEnd.getFullYear(), cEnd.getMonth() + 1, pd0));
  const salNet = pi.amount * (1 - c.sadPct), bal = after - needAfter;
  const row = (l, v, cls = '') => `<li class="${cls}"><span>${l}</span><b dir="ltr">${v}</b></li>`;
  const step = (n, title, sub, rows, ok, res, big, hint) => `<div class="fc ${ok ? 'ok' : 'bad'}">
      <div class="fc-h"><i>${n}</i><div><b>${title}</b><small>${sub}</small></div></div>
      <ul>${rows.join('')}</ul>
      <div class="fc-r"><span>${res}</span><b dir="ltr">${big}</b>${hint ? `<small>${hint}</small>` : ''}</div></div>`;
  const s1 = step(1, L(`من النهارده لحد ${pday}`, `From today until ${pday}`), L(plural(left, 'يوم', 'يومين', 'أيام', 'يوم'), EN_N(left, 'day')),
    [row(L('🍞 مصاريفك في الأيام دي', '🍞 Your expenses for these days'), `${fmt(rest)} Đ`), row(`<small>${L(`${fmt(R.E / cDays, 2)} في اليوم × ${left}`, `${fmt(R.E / cDays, 2)} per day × ${left}`)}</small>`, '', 'sub'), row(L('👛 معاك ليها دلوقتي', '👛 You have for them now'), `− ${fmt(have)} Đ`)],
    gapNow <= 0.5, gapNow > 0.5 ? L('لازم تجمّع على الأقل', 'You need to gather at least') : L('مصاريفك متغطية ✅', 'Your expenses are covered ✅'), gapNow > 0.5 ? `${fmt(gapNow)} Đ` : `+${fmt(have - rest)} Đ`,
    gapNow > 0.5 && c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(gapNow))} Đ قبل الصدقة`, `That means ${fmt(gross(gapNow))} Đ of income before sadaqa`) : '');
  const s2 = pi.due
    ? step(2, L('بعد ما تسجّل المرتب', 'After you log the salary'), L(`لحد ${pday}`, `Until ${pday}`),
      [row(L('💰 المرتب بعد الصدقة', '💰 Salary after sadaqa'), `${fmt(salNet)} Đ`), row(L('👛 + اللي معاك للأساسيات', '👛 + What you have for essentials'), `${fmt(have)} Đ`), row(L('🍞 مصاريف باقي الدورة', '🍞 Expenses for the rest of the cycle'), `− ${fmt(rest)} Đ`)],
      bal >= -0.5, bal >= -0.5 ? L('هيفضل معاك', "You'll have left") : L('لسه محتاج', 'You still need'), `${fmt(Math.abs(bal))} Đ`, bal < -0.5 && c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(-bal))} Đ قبل الصدقة`, `That means ${fmt(gross(-bal))} Đ of income before sadaqa`) : '')
    : step(2, L(`من ${pday} لحد ${nEnd}`, `From ${pday} until ${nEnd}`), L('الشهر الجديد بعد المرتب', 'The new month after the salary'),
      [row(L(`💰 المرتب${pi.sf.full ? '' : ' (أول مرتب، مش كامل)'}`, `💰 Salary${pi.sf.full ? '' : ' (first salary, partial)'}`), `${fmt(pi.amount)} Đ`), ...(p.sadaqa > 0.5 ? [row(L('🤲 الصدقة', '🤲 Sadaqa'), `− ${fmt(p.sadaqa)} Đ`)] : []), row(L('🍞 مصاريف الشهر', "🍞 The month's expenses"), `− ${fmt(R.E)} Đ`)],
      salNet - R.E >= -0.5, salNet - R.E >= -0.5 ? L('هيفضل من المرتب', 'Left over from the salary') : L('المرتب مش مكفّي، محتاج للشهر الجديد', "The salary isn't enough; for the new month you still need"), `${fmt(Math.abs(salNet - R.E))} Đ`,
      salNet - R.E < -0.5 ? (c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(R.E - salNet))} Đ قبل الصدقة`, `That means ${fmt(gross(R.E - salNet))} Đ of income before sadaqa`) : '') : L('ده اللي بيتوزع على النمو والأمان والمتعة', 'This is what gets split across Growth, Safety and Fun'));
  const forecast = `<h3>${L('🧮 حسبتك لحد يوم القبض وبعده', '🧮 Your math until payday and after')}</h3><div class="fcs">${s1}<span class="fc-arrow">↓</span>${s2}</div>`;
  return card('c-pay', L('📅 القبض الجاي', '📅 Next payday'), `
    <div class="big-num" style="--c:${pi.due ? '#fbbf24' : '#a78bfa'}"><small>${when}</small><b>${dayName(pi.next)}</b><small>${L(`ده مرتب شغل شهر ${workMonth(pi.next)}، بينزل في جيبك يوم ${paydayOf(S)}`, `This is the salary for your work in ${workMonth(pi.next)}; it reaches you on day ${paydayOf(S)}`)}</small>
      <small>${L(`بتقبض يوم ${ed('S::payday', paydayOf(S), { n: true })} من كل شهر · المرتب الكامل ${ed('S::salary', S.salary, { n: true })} Đ`, `You get paid on day ${ed('S::payday', paydayOf(S), { n: true })} of every month · Full salary ${ed('S::salary', S.salary, { n: true })} Đ`)}</small></div>
    <div class="kv"><span>🏢 ${S.job?.company ? esc(S.job.company) : L('الشغل لسه مش متسجل', 'No job added yet')}</span>${S.job?.start ? `<small>${L('بدأت', 'Started')} ${dayName(new Date(S.job.start + 'T00:00:00'))}</small>` : ''}<button class="pill" data-act="pay">${S.job ? L('غيّر', 'Change') : L('سجّل شغلك', 'Add your job')}</button></div>
    ${pi.sf.full ? '' : `<h3>${L('⚖️ أول مرتب مش كامل عشان لسه بادئ', '⚖️ Your first salary is partial because you just started')}</h3>${payBreak(pi.sf)}`}
    ${forecast}
    <h3>${L('هيتوزع كده أول ما ييجي', "Here's how it will be split when it arrives")}</h3>
    <div class="pay-prev">${parts.map(([n, v]) => `<span>${n} <b dir="ltr">${fmt(v)}</b></span>`).join('')}</div>
    <div class="kv"><button class="pill ${S.autoSalary ? 'on' : ''}" data-auto>${S.autoSalary ? L('✅ أوتوماتيك', '✅ Automatic') : L('🔔 يدوي', '🔔 Manual')}</button>
      <small>${S.autoSalary ? L('يوم القبض هسجّل المرتب وأوزّعه لوحدي. دوس لو عايز تسجّله بإيدك.', "On payday I'll log the salary and split it myself. Tap if you'd rather log it by hand.") : L('يوم القبض هفكّرك وتسجّله إنت. دوس لو عايزني أسجّله أوتوماتيك.', "On payday I'll remind you and you log it. Tap if you want me to log it automatically.")}</small></div>
    ${pi.due ? `<button class="btn primary" data-act="salary">${L('💰 سجّل المرتب دلوقتي', '💰 Log the salary now')}</button>` : ''}`);
}
async function autoPay() {
  if (!S.autoSalary || autoPay.busy) return;
  const pi = payInfo(ctx());
  if (!pi.due || (S.autoFrom && iso(pi.next) < S.autoFrom)) return; // دورة قبل ما توافق على الأوتوماتيك
  autoPay.busy = true;
  try { await flowIncome('salary', { amount: pi.amount, cur: 'AED' }, { date: iso(pi.next), auto: true }); } finally { autoPay.busy = false; }
}

/* ───────────── وضع العرض: الكل / عملة واحدة ───────────── */
const inBucket = (h, k) => k === 'stability' ? !!h.spare : k === 'growth' ? !h.spare : false;
/** اللي في البند k بالعملة cu: n بالعملة نفسها و aed قيمته بالدرهم */
function held(k, cu, R, essLeft = 0) {
  const hs = S.holdings.filter(h => h.cur === cu && inBucket(h, k));
  const hn = hs.reduce((a, h) => a + (+h.amount || 0), 0), ha = hs.reduce((a, h) => a + holdingValue(h, rate), 0);
  if (cu === 'XAU') return { n: hn, aed: ha };
  const w = k === 'essentials' ? (cu === 'AED' ? essLeft : 0) : (R.bal[cu]?.[k] || 0);
  return { n: w + hn, aed: w * rate(cu) + ha };
}
function viewList(R) {
  const has = cu => cu === 'AED' || Object.values(R.bal[cu] || {}).some(v => Math.abs(v) > 0.005) || S.holdings.some(h => h.cur === cu && +h.amount > 0);
  return ['ALL', ...MONEY.filter(has), ...(has('XAU') ? ['XAU'] : [])];
}
const viewOf = R => viewList(R).includes(S.view) ? S.view : 'ALL';

/* ───────────── أسفل الهيرو: الهدف الجاي + أهم خطوة + 3 أرقام ───────────── */
function heroFoot(c) {
  const { R } = c, t = todos(c)[0], pi = payInfo(c);
  const nx = S.spare.find(x => R.stabilityAED < spareAmount(x, R.E) - 0.5);
  let goal = `<div class="goal" data-go="c-spare"><span>${L('🏆 كل محطات الأمان خلصت', '🏆 All safety milestones done')}</span><span class="pct">100%</span></div>`;
  if (nx) {
    const amt = spareAmount(nx, R.E), pct = R.stabilityAED / amt, dt = spareDates(c).at(amt);
    goal = `<div class="goal" data-go="c-spare" role="button" tabindex="0"><span>${L('🎯 الهدف الجاي:', '🎯 Next goal:')} <b>${esc(nx.name)}</b></span><span class="pct" dir="ltr">${fmt(pct * 100, 1)}%</span>${bar(pct, B.stability.c)}
      <small>${L(`فاضل ${fmt(amt - R.stabilityAED)} Đ`, `${fmt(amt - R.stabilityAED)} Đ left`)}${dt ? ` · ${L('المتوقع', 'Expected')} ${monthName(dt)}` : ''}</small></div>`;
  }
  const ess = c.planI ? c.Ec / c.planI : 0;
  const inv = R.debt <= 0.5 ? L('بدأ ✅', 'Started ✅') : c.exp.growth > 0.5 ? monthName(addMonths(new Date(), Math.ceil(R.debt / c.exp.growth))) : '—';
  const view = viewOf(R), disp = CUR[S.disp]?.s ? S.disp : 'AED';
  const sw = `<div class="switch" role="tablist" aria-label="${L('عملة العرض', 'Display currency')}">${viewList(R).map(v => `<button class="${v === view ? 'on' : ''}" data-view="${v}" dir="${v === 'ALL' || v === 'XAU' ? L('rtl', 'ltr') : 'ltr'}">${v === 'ALL' ? L('الكل', 'All') : v === 'XAU' ? L('🥇 دهب', '🥇 Gold') : `${CUR[v].f} ${CUR[v].s}`}</button>`).join('')}
    ${view === 'ALL' ? `<button class="disp" data-disp title="${L('غيّر العملة اللي الكل بيتحسب بيها', 'Change the currency everything is shown in')}">${L('الكل بـ', 'All in')} <b>${CUR[disp].s}</b> ⇄</button>` : ''}</div>`;
  // الصافي بكل العملات جنب بعض
  const netAED = R.growthAED + R.stabilityAED + R.rewardAED + (c.mo.essAlloc - c.mo.essSpent) - R.debt, ng = netAED < -0.5 ? 'neg' : '';
  const strip = `<div class="eqs"><small>${L(`${R.debt > 0.5 ? 'الصافي' : 'الإجمالي'} بكل عملة`, `${R.debt > 0.5 ? 'Net' : 'Total'} in each currency`)}</small>
    ${['AED', 'EGP', 'USD'].map(cu => `<button class="${ng} ${view === 'ALL' && disp === cu ? 'on' : ''}" data-dset="${cu}" dir="ltr" title="${L(`اعرض الكل بال${CUR[cu].n}`, `Show everything in ${CUR[cu].n}`)}"><b>${fmt(netAED / rate(cu))}</b> ${CUR[cu].s}</button>`).join('')}
    <span class="${ng}" dir="${L('rtl', 'ltr')}" title="${L('الصافي لو اتحوّل كله دهب عيار 24', 'Your net if it were all converted to 24k gold')}">🥇 <b dir="ltr">${fmt(netAED / rate('XAU'), 2)}</b> ${L('جم', 'g')}</span></div>`;
  return `${strip}${sw}${goal}
    <button class="main-cta" ${t.act ? `data-act="${t.act}"` : 'data-go="c-cta"'}><span class="ci">${t.i}</span><span class="ct"><strong>${t.h}</strong><small>${t.s}</small></span><span class="arrow">${L('←', '→')}</span></button>
    <div class="stats">
      <button data-go="c-pay"><small>${L('📅 القبض الجاي', '📅 Next payday')}</small><b>${pi.none ? L('مفيش مرتب', 'No salary') : pi.due ? L('مستحق دلوقتي', 'Due now') : dayName(pi.next)}</b><small>${pi.none ? L('سجّل شغلك لو فيه', 'Add your job if you have one') : pi.due ? L('لسه ما اتسجلش', 'Not logged yet') : L(`بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, `In ${EN_N(pi.days, 'day')}`)}</small></button>
      <button data-go="c-inv"><small>${L('📈 بداية الاستثمار', '📈 Investing starts')}</small><b>${inv}</b><small>${R.debt > 0.5 ? L(`بعد سداد ${fmt(R.debt)} Đ`, `After paying off ${fmt(R.debt)} Đ`) : L('مفيش ديون', 'No debt')}</small></button>
      <button data-go="c-ess" class="${ess > 0.5 ? 'bad' : 'good'}"><small>${L('🍞 الأساسيات', '🍞 Essentials')}</small><b>${fmt(ess * 100)}%</b><small>${L('الهدف 50% أو أقل', 'Target: 50% or less')}</small></button>
    </div>`;
}
$('#foot').addEventListener('click', e => {
  const v = e.target.closest('[data-view],[data-disp],[data-dset]');
  if (v) {
    if (v.dataset.dset) { S.view = 'ALL'; S.disp = v.dataset.dset; }
    else if (v.dataset.view) S.view = v.dataset.view;
    else { const o = ['AED', 'EGP', 'USD']; S.disp = o[(o.indexOf(S.disp || 'AED') + 1) % o.length]; }
    save(); render(); return;
  }
  const b = e.target.closest('[data-act],[data-go]'); if (!b) return;
  if (b.dataset.act) { trigger(b.dataset.act); $('#chat').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  else document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ───────────── التحليلات ───────────── */
function analyticsData(c) {
  if (LOCK) return { locked: true };
  const { R, mo } = c, pd = paydayOf(S), aedOf = x => x.amount * (x.rate || rate(x.cur));
  const keys = Object.keys(R.months).sort();
  const cyc = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString(LOC(), { month: 'short' });
  const cycles = keys.slice(-6).map(k => {
    const m = R.months[k];
    return { label: cyc(k), income: m.income, spent: m.essSpent + m.rewardSpent, saved: m.alloc.debt + m.alloc.stability + m.alloc.growth };
  });
  const net = R.growthAED + R.stabilityAED + R.rewardAED + (mo.essAlloc - mo.essSpent) - R.debt;
  const saved = mo.alloc.debt + mo.alloc.stability + mo.alloc.growth;
  const group = (txs, catOf, subOf) => {
    const map = new Map();
    for (const x of txs) {
      const g = map.get(catOf(x)) || { n: catOf(x), v: 0, subs: new Map() }, v = aedOf(x), sn = subOf(x) || '';
      g.v += v; g.subs.set(sn, (g.subs.get(sn) || 0) + v); map.set(g.n, g);
    }
    return [...map.values()].map(g => ({ n: g.n, v: g.v, subs: [...g.subs].map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v) })).sort((a, b) => b.v - a.v);
  };
  const incomeCats = group(S.tx.filter(x => x.type === 'income').map(x => ({ ...x, amount: x.amount * (1 - Math.min(100, Math.max(0, +x.sad || 0)) / 100) })), x => x.cat || (x.kind === 'salary' ? L('مرتب', 'Salary') : x.note || L('غير مصنّف', 'Uncategorized')), x => x.sub);
  const spendCats = group(S.tx.filter(x => x.type === 'expense' && x.bucket !== 'sadaqa'), x => x.cat || BX[x.bucket]?.n || L('غير مصنّف', 'Uncategorized'),
    x => x.sub || (x.bucket === 'essentials' ? S.essentials.find(e => e.id === x.item)?.name : x.note));

  // الصافي الفعلي عند كل يوم فيه معاملة
  const netAt = txs => {
    const r = replay({ ...S, tx: txs }, rate), last = txs[txs.length - 1], m = last ? r.months[periodOf(last.date, pd)] : null;
    return r.growthAED + r.stabilityAED + r.rewardAED + (m ? m.essAlloc - m.essSpent : 0) - r.debt;
  };
  const sorted = S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)), dates = [...new Set(sorted.map(x => x.date))];
  const T = d => new Date(d + 'T00:00:00').getTime(), n0 = new Date(), today0 = new Date(n0.getFullYear(), n0.getMonth(), n0.getDate()).getTime();
  const actual = [];
  if (dates.length) actual.push({ t: T(dates[0]) - 864e5, v: netAt([]) });
  for (const d of dates) actual.push({ t: T(d), v: netAt(sorted.filter(x => x.date <= d)) });
  if (!actual.length || actual[actual.length - 1].t < today0) actual.push({ t: today0, v: net });

  // التوقع: شهر بشهر بنفس القواعد
  const pi = payInfo(c), lastSpare = R.lastSpare;
  const sideAvg = S.tx.filter(x => x.type === 'income' && x.kind !== 'salary').reduce((a, x) => a + aedOf(x), 0) / Math.max(1, keys.length);
  let debt = R.debt, stab = R.stabilityAED, inv = R.growthAED, P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next), debtDone = debt <= 0.5, firstFull = false;
  const rew = Math.max(0, R.rewardAED), proj = [], events = [];
  const pending = S.spare.map(t => ({ n: t.name, amt: spareAmount(t, R.E) })).filter(t => stab < t.amt - 0.5).sort((a, b) => a.amt - b.amt);
  for (let i = 0; i < 360; i++) {
    const sf = salaryFor(P), t = Math.max(P.getTime(), today0);
    const a = allocate((sf.amount + sideAvg) * (1 - c.sadPct), R.E);
    let g = a.growth, st = a.stability;
    if (lastSpare > 0 && stab >= lastSpare) { g += st; st = 0; }
    const pay = Math.min(g, debt); debt -= pay; inv += g - pay; stab += st;
    if (i === 0 && !pi.none) events.push({ t, i: '💰', h: L(`القبض الجاي: ${fmt(sf.amount)} Đ`, `Next payday: ${fmt(sf.amount)} Đ`), s: sf.full ? L(`مرتب شغل شهر ${workMonth(P)} كامل`, `Full salary for your work in ${workMonth(P)}`) : partNote(sf) });
    else if (i > 0 && !firstFull && sf.full && !pi.sf.full) { firstFull = true; events.push({ t, i: '💵', h: L(`أول مرتب كامل: ${fmt(sf.amount)} Đ`, `First full salary: ${fmt(sf.amount)} Đ`), s: L(`عن شغل شهر ${workMonth(P)}`, `For your work in ${workMonth(P)}`) }); }
    if (!debtDone && debt <= 0.5) { debtDone = true; events.push({ t, i: '💳', h: L(`${esc(S.debt.name)} يخلص`, `${esc(S.debt.name)} paid off`), s: L('ومن بعدها نصيب النمو يبقى استثمار 📈', 'After that, the Growth share goes to investing 📈'), kind: 'win' }); }
    while (pending.length && stab >= pending[0].amt - 0.5) { const m = pending.shift(); events.push({ t, i: '🛟', h: L(`محطة الأمان: ${esc(m.n)}`, `Safety milestone: ${esc(m.n)}`), s: L(`الأمان يوصل ${fmt(m.amt)} Đ`, `Safety reaches ${fmt(m.amt)} Đ`), kind: 'win' }); }
    if (i < 36) proj.push({ t, v: stab + inv + rew - debt });
    P = new Date(P.getFullYear(), P.getMonth() + 1, pd);
  }
  for (const m of pending) events.push({ t: Infinity, far: true, i: '🛟', h: L(`محطة الأمان: ${esc(m.n)}`, `Safety milestone: ${esc(m.n)}`), s: L(`أبعد من 30 سنة بالمعدل الحالي. محتاج دخل أعلى عشان توصل ${fmt(m.amt)} Đ.`, `More than 30 years away at the current rate. You need a higher income to reach ${fmt(m.amt)} Đ.`), kind: 'far' });

  return {
    cycleLabel: periodLabel(c.ym), cycles, incomeCats, spendCats, events,
    kpi: { income: mo.income, spent: mo.essSpent + mo.rewardSpent, saveRate: mo.income ? saved / mo.income : 0, net },
    alloc: [
      { k: 'essentials', n: L('الأساسيات', 'Essentials'), v: mo.essAlloc }, { k: 'growth', n: R.debt > 0.5 ? L('النمو (سداد الدين)', 'Growth (paying off debt)') : L('النمو (استثمار)', 'Growth (investing)'), v: mo.alloc.debt + mo.alloc.growth },
      { k: 'stability', n: L('الأمان', 'Safety'), v: mo.alloc.stability }, { k: 'reward', n: L('المتعة', 'Fun'), v: mo.alloc.reward }
    ],
    net: { actual, proj },
    assume: L(`التوقع ماشي على: ${pi.none ? 'من غير مرتب' : `مرتب ${fmt(S.salary)} Đ`}، ومتوسط دخل جانبي ${fmt(sideAvg)} Đ في الدورة، وصدقة ${fmt(c.sadPct * 100, 2)}%، وأساسيات ${fmt(R.E)} Đ، وإن المتعة بتتصرف كلها. أي معاملة جديدة بتغيّره.`, `The forecast assumes: ${pi.none ? 'no salary' : `a salary of ${fmt(S.salary)} Đ`}, an average side income of ${fmt(sideAvg)} Đ per cycle, sadaqa of ${fmt(c.sadPct * 100, 2)}%, essentials of ${fmt(R.E)} Đ, and that Fun gets fully spent. Any new transaction changes it.`),
  };
}
const AH = {
  fmt, esc, month: monthName,
  short: d => d.toLocaleDateString(LOC(), { month: 'short', year: '2-digit' }),
  day: d => d.toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' }),
};
function renderStats(c) { $('#stats').innerHTML = renderAnalytics(analyticsData(c), AH); }
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('[data-page]'); if (!b) return;
  UI.page = b.dataset.page; document.body.dataset.page = UI.page;
  $('#nav').querySelectorAll('[data-page]').forEach(x => x.classList.toggle('on', x === b));
  $('#stats').hidden = UI.page !== 'stats';
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
});
const tipEl = $('#tip');
document.addEventListener('pointermove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tipEl.hidden = true; return; }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const w = tipEl.offsetWidth;
  tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px';
  tipEl.style.top = Math.max(8, e.clientY - tipEl.offsetHeight - 14) + 'px';
});

/* ───────────── الرسم ───────────── */
const cardsEl = $('#cards');
let scene = null;
function render() {
  const c = ctx(), { R } = c;
  const focusP = document.activeElement?.dataset?.p;
  cardsEl.innerHTML = cardCTA(c) + cardPay(c) + cardMonth(c) + cardEssentials(c) + cardLife(c) + cardSpare(c) + cardFun(c) + cardSadaqa(c) + cardInvest(c) + cardWallets(c) + cardRules() + cardTx(c);
  $('#riskBox').innerHTML = riskHTML();
  if (focusP) cardsEl.querySelector(`[data-p="${focusP}"]`)?.focus();

  const total = R.growthAED + R.stabilityAED + R.rewardAED;
  const debtPill = `<span class="pillx ${R.debt > 0.5 ? 'bad' : 'good'}">${R.debt > 0.5 ? L(`دين ${fmt(R.debt)} Đ`, `Debt ${fmt(R.debt)} Đ`) : L('مفيش ديون ✅', 'No debt ✅')}</span>`;
  $('#cycle').textContent = L('دورة ', 'Cycle ') + periodLabel(c.ym);
  $('#foot').innerHTML = heroFoot(c);

  const essLeft = c.mo.essAlloc - c.mo.essSpent;
  const vals = { essentials: [essLeft, c.mo.income > 0 ? L(`متغطي ${fmt(c.mo.essAlloc)} من ${fmt(c.Ec)}`, `${fmt(c.mo.essAlloc)} of ${fmt(c.Ec)} covered`) : L('مستني القبض', 'Waiting for payday')], growth: [R.growthAED, R.debt > 0.5 ? L('بيسدّ الكارد', 'Paying off the card') : L('استثمار', 'Investing')], stability: [R.stabilityAED, L('صندوق الطوارئ', 'Emergency fund')], reward: [R.rewardAED, L('حصّالة المتعة', 'Fun jar')], sadaqa: [Math.max(0, R.sadaqaAED), L('مستنية تطلع', 'Waiting to be given')] };
  for (const k in vals) {
    const el = $(`#labels [data-b="${k}"]`);
    el.querySelector('b').textContent = fmt(vals[k][0]) + ' Đ'; el.querySelector('small').textContent = vals[k][1];
  }
  // كل محفظة فيها عملات إيه
  const wal = {};
  for (const k of Object.keys(B)) {
    const parts = [], curs = [];
    if (k === 'essentials') { if (essLeft > 0.5) { curs.push('AED'); parts.push(`${fmt(essLeft)} Đ`); } }
    else for (const cu of MONEY) { const a = R.bal[cu]?.[k] || 0; if (a > 0.005) { curs.push(cu); parts.push(`${fmt(a)} ${CUR[cu].s}`); } }
    let gold = false;
    if (k === 'stability' || k === 'growth') for (const h of S.holdings.filter(h => (k === 'stability') === !!h.spare && +h.amount > 0)) {
      if (h.cur === 'XAU') { gold = true; parts.push(`🥇 ${fmt(h.amount, 2)} ${L('جم', 'g')}`); }
      else { if (!curs.includes(h.cur)) curs.push(h.cur); parts.push(`${fmt(h.amount)} ${CUR[h.cur].s}`); }
    }
    wal[k] = { curs, gold };
    $(`#labels [data-b="${k}"] em`).textContent = parts.join(' · ') || L('فاضية', 'Empty');
  }
  // وضع العرض في الهيرو: الكل بعملة واحدة، أو عملة واحدة بس بقيمتها الأصلية
  const view = viewOf(R), disp = CUR[S.disp]?.s ? S.disp : 'AED';
  let shown = 0, shownAED = 0;
  for (const k in vals) {
    const el = $(`#labels [data-b="${k}"]`), b = el.querySelector('b'), em = el.querySelector('em');
    if (view === 'ALL') {
      const v = vals[k][0] / rate(disp);
      b.textContent = `${fmt(v)} ${CUR[disp].s}`;
      if (k !== 'sadaqa') shown += v; // فلوس الصدقة مش بتاعتك
    } else {
      const h = held(k, view, R, essLeft);
      b.textContent = view === 'XAU' ? `${fmt(h.n, 2)} ${L('جم', 'g')}` : `${fmt(h.n)} ${CUR[view].s}`;
      em.textContent = h.n <= 0.005 ? L('فاضية', 'Empty') : view === 'AED' ? '' : `≈ ${fmt(h.aed)} Đ`;
      if (k !== 'sadaqa') { shown += h.n; shownAED += h.aed; }
    }
  }
  // الصافي = كل اللي معاك − الدين (ممكن يطلع بالسالب)
  const net = view === 'ALL' ? shown - R.debt / rate(disp) : shown;
  countUp($('#total'), UI.prevTotal, net); UI.prevTotal = net;
  $('#total').parentElement.classList.toggle('neg', net < -0.5);
  $('#stage .sym').textContent = view === 'ALL' ? CUR[disp].s : view === 'XAU' ? L('جم', 'g') : CUR[view].s;
  $('#stage .total small').textContent = view === 'ALL' ? (R.debt > 0.5 ? L('الصافي بعد الدين', 'Net after debt') : L('إجمالي اللي معاك', 'Total you have')) : L(`اللي معاك ${view === 'XAU' ? 'دهب' : 'بال' + CUR[view].n} بس`, `Only what you hold in ${view === 'XAU' ? 'gold' : CUR[view].n}`);
  const allAED = R.growthAED + R.stabilityAED + R.rewardAED + essLeft - R.debt;
  const approx = `<span class="pillx" dir="ltr">≈ ${disp === 'AED' ? fmt(allAED / rate('EGP')) + ' E£' : fmt(allAED) + ' Đ'}</span>`;
  $('#totalAlt').innerHTML = view === 'ALL'
    ? (R.debt > 0.5 ? `<span class="pillx good">${L('معاك', 'You have')} ${fmt(shown)}</span><span class="pillx bad">${L('دين', 'Debt')} ${fmt(R.debt / rate(disp))}</span>` : debtPill)
    : (view === 'AED' ? '' : `<span class="pillx" dir="ltr">≈ ${fmt(shownAED)} Đ</span>`) + debtPill;
  if (UI.why) showWhy(UI.why);
  if (UI.page === 'stats') renderStats(c);
  const p = c.plan, tot = c.planI || 1;
  for (const k in wal) wal[k].share = p[k] / tot;
  scene?.setWallets(wal);
}
function countUp(el, from, to) {
  const t0 = performance.now(), dur = 700;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const buildLabels = () => { $('#labels').innerHTML = Object.entries(B).map(([k, b]) => `<div class="lbl" data-b="${k}" style="--c:${b.c}" title="${L('دوس تشوف الرقم جاي منين', 'Tap to see where this number comes from')}"><span>${b.i} ${b.n} ⓘ</span><b dir="ltr">0</b><em></em><small></small></div>`).join(''); };
buildLabels();

/* ───────────── تفاصيل البند (دوس على الكوكب) ───────────── */
const conv = (amt, cu) => cu === 'AED' ? '' : rate(cu) < 1
  ? `${fmt(amt)} ${CUR[cu].n} ÷ ${fmt(1 / rate(cu), 2)} (1 ${L('درهم', 'AED')} = ${fmt(1 / rate(cu), 2)} ${CUR[cu].n})`
  : `${fmt(amt)} ${CUR[cu].n} × ${fmt(rate(cu), 4)} (1 ${CUR[cu].n} = ${fmt(rate(cu), 4)} ${L('درهم', 'AED')})`;
function showWhy(k) {
  const c = ctx(), { R, mo } = c, el = $('#why'), lines = [];
  let total = 0;
  if (k === 'essentials') {
    total = mo.essAlloc - mo.essSpent;
    lines.push([L(`اتخصص للأساسيات الشهر ده`, `Set aside for Essentials this month`), mo.essAlloc, mo.income > 0 ? L(`من دخل ${fmt(mo.income)} درهم. الأساسيات بتتغطى الأول لحد ${fmt(c.Ec)}${c.cyc.since ? ` (${plural(c.cyc.left, 'يوم', 'يومين', 'أيام', 'يوم')} من ${c.cyc.days})` : ''}.`, `From ${fmt(mo.income)} AED of income. Essentials get covered first, up to ${fmt(c.Ec)}${c.cyc.since ? ` (${EN_N(c.cyc.left, 'day')} of ${c.cyc.days})` : ''}.`) : L('لسه مفيش دخل متسجل الشهر ده، فالرصيد صفر. أول قبض هيغطيها.', 'No income logged this month yet, so the balance is zero. Your first payday will cover it.')]);
    lines.push([L('اتصرف منها', 'Spent from it'), -mo.essSpent, L('مجموع المصاريف اللي سجلتها على بنود الأساسيات.', 'Everything you logged against your Essentials items.')]);
  } else {
    for (const [cu, w] of Object.entries(R.bal)) {
      if (Math.abs(w[k]) < 0.005) continue;
      const aed = w[k] * rate(cu); total += aed;
      lines.push([L(`${CUR[cu].f} محفظة ال${CUR[cu].n}`, `${CUR[cu].f} ${CUR[cu].n} wallet`), aed, cu === 'AED' ? L('من توزيع الدخل ناقص اللي اتصرف.', 'Your income split, minus what you spent.') : conv(w[k], cu)]);
    }
    for (const h of S.holdings.filter(h => inBucket(h, k))) {
      const val = holdingValue(h, rate); total += val;
      if (h.cur === 'XAU') {
        const src = S.manual.XAU ? L('سعر الجرام إنت كاتبه بإيدك.', 'You typed the gram price yourself.')
          : S.goldUsd ? L(`سعر الجرام = ${fmt(S.goldUsd, 2)} $ للأونصة × ${fmt(rate('USD'), 4)} درهم ÷ 31.1035 جرام = ${fmt(rate('XAU'), 2)} درهم.`, `Gram price = $${fmt(S.goldUsd, 2)} per ounce × ${fmt(rate('USD'), 4)} AED ÷ 31.1035 g = ${fmt(rate('XAU'), 2)} AED.`) : L('آخر سعر محفوظ.', 'Last saved price.');
        lines.push([`🥇 ${esc(h.name)}`, val, L(`${fmt(h.amount, 2)} جرام × ${fmt(rate('XAU'), 2)} درهم × (عيار ${h.karat || 24} ÷ 24). ${src}`, `${fmt(h.amount, 2)} g × ${fmt(rate('XAU'), 2)} AED × (${h.karat || 24}K ÷ 24). ${src}`)]);
      } else lines.push([`${CUR[h.cur].f} ${esc(h.name)}`, val, conv(h.amount, h.cur) || L('رصيد بالدرهم.', 'Balance in AED.')]);
    }
    if (k === 'growth' && (R.paid > 0.5 || R.debt > 0.5)) lines.push([`💳 ${esc(S.debt.name)}`, 0, L(`نصيب النمو بيسدّ الدين الأول: اتدفع ${fmt(R.paid)} وفاضل ${fmt(R.debt)} درهم. عشان كده رصيد النمو لسه مش بيزيد.`, `Growth's share pays off the debt first: ${fmt(R.paid)} paid, ${fmt(R.debt)} AED to go. That's why the Growth balance isn't climbing yet.`)]);
    if (!lines.length) lines.push([L('لسه فاضي', 'Still empty'), 0, L('مفيش حاجة اتحطت في البند ده لحد دلوقتي.', 'Nothing has landed in this bucket yet.')]);
  }
  el.style.setProperty('--c', B[k].c);
  el.innerHTML = `<h3><span>${L(`${B[k].i} ${B[k].n}: الرقم ده جاي منين؟`, `${B[k].i} ${B[k].n}: where does this number come from?`)}</span><button class="x" style="opacity:1" data-close aria-label="${L('اقفل', 'Close')}">✕</button></h3>
    ${total > 0.5 && lines.filter(([, v]) => v > 0.5).length > 1 ? `<div class="stack">${lines.filter(([, v]) => v > 0.5).map(([, v], i) => `<i style="flex:${v};background:${['#f5c542', '#2dd4bf', '#fb923c', '#60a5fa', '#a3e635', '#f472b6'][i % 6]}"></i>`).join('')}</div>` : ''}
    <ul>${lines.map(([n, v, s]) => `<li>${n}<b>${fmt(v)} ${L('د', 'AED')}${total > 0.5 && v > 0.5 ? ` · ${fmt(v / total * 100, 1)}%` : ''}</b><small>${s}</small></li>`).join('')}</ul>
    <div class="tot"><span>${L('الإجمالي', 'Total')}</span><span dir="ltr">${fmt(total)} ${L('درهم', 'AED')}</span></div>`;
  if (UI.why !== k) sfx.open();
  el.hidden = false; UI.why = k;
}
$('#stage').addEventListener('click', e => {
  const el = $('#why');
  if (e.target.closest('[data-close]')) { el.hidden = true; UI.why = null; return; }
  if (e.target.closest('#why')) return;
  const k = e.target.closest('.lbl')?.dataset.b || (e.target.id === 'gl' && scene?.pick(e.clientX, e.clientY));
  if (k) showWhy(k); else { el.hidden = true; UI.why = null; }
});

/* ───────────── الرقم السري: إظهار الأرقام + تأكيد المسح ───────────── */
const DEL_ASK = () => L([
  'عايز تمسح؟ 🤨 اثبت إنك صاحب الفلوس واكتب الرقم السري',
  'على فين يا معلّم؟ 🕵️ المسح بالرقم السري بس',
  'بتهرب من مصروف؟ 😏 الرقم السري الأول',
  'المسح ده مش لعبة 😤 هات الرقم السري',
  'لو حد غيرك اللي بيمسح مش هيعدّي 😂 الرقم السري لو سمحت',
], [
  'Deleting, are we? 🤨 Prove the money is yours: enter the PIN',
  'Not so fast, boss 🕵️ Deleting takes the PIN',
  'Running from an expense? 😏 PIN first',
  'Deleting is no game 😤 Hand over the PIN',
  "If that's not really you, you're not getting through 😂 PIN, please",
]);
const PIN_BAD = () => L(['غلط يا حرامي 😂 جرّب تاني', 'لأ يا عم مش ده 🙅 ركّز', 'الرقم ده بتاع الجيران 😅', 'إيدك تقيلة النهارده 🫠 تاني'],
  ['Wrong, you little thief 😂 Try again', 'Nope, not that one 🙅 Focus', "That's the neighbours' PIN 😅", 'Clumsy fingers today 🫠 Once more']);
const DEL_OK = () => L(['اتمسحت وكأنها ما حصلتش 🧹😎', 'راحت في الوبا 💨', 'تمام، سرّك في بير 🤫'],
  ['Gone, like it never happened 🧹😎', 'Vanished into thin air 💨', 'Done. Your secret is safe with me 🤫']);
const pinEl = $('#pin'), pinIn = $('#pinIn');
let pinRes = null;
function askPin(msg) {
  $('#pinMsg').textContent = msg; $('#pinErr').textContent = ''; pinIn.value = '';
  pinEl.hidden = false; pinIn.focus();
  return new Promise(res => { pinRes = res; });
}
function closePin(ok) { pinEl.hidden = true; pinIn.value = ''; const r = pinRes; pinRes = null; r?.(ok); }
$('#pinForm').addEventListener('submit', e => {
  e.preventDefault();
  if (norm(pinIn.value).trim() === String(S.pin || '')) { sfx.ok(); window.Snap?.ok('pin'); return closePin(true); }
  window.Snap?.fail('pin'); // على الموقع: تاني غلطة بتتسجل في سجل الأمان ومعاها صورة لو الكاميرا مسموحة
  sfx.err(); $('#pinErr').textContent = pick(PIN_BAD()); pinIn.value = '';
  const f = $('#pinForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
});
pinEl.addEventListener('click', e => { if (e.target === pinEl || e.target.closest('[data-cancel]')) closePin(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pinEl.hidden) closePin(false); });
function setLock(v) {
  LOCK = v; document.body.classList.toggle('locked', v);
  $('#eye').textContent = v ? '🙈' : '👁️';
  render();
}
$('#eye').onclick = async () => {
  if (!LOCK) return setLock(true);
  if (await askPin(L('الأرقام مستخبية 🙈 اكتب الرقم السري عشان تشوفها', 'The numbers are hiding 🙈 Enter your PIN to see them'))) { setLock(false); toast(L('اتفضل يا باشا 👁️ كله قدامك', 'There you go, boss 👁️ All yours')); }
};

/* ───────────── توست + احتفال ───────────── */
let toastT;
function toast(html, undo) {
  const el = $('#toast');
  el.innerHTML = html + (undo ? ` <button class="btn" id="undo">${L('تراجع', 'Undo')}</button>` : '');
  el.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2200);
  if (undo) $('#undo').onclick = () => { S = JSON.parse(undo); save(); render(); el.classList.remove('show'); };
}
function party(emojis = ['💸', '🪙', '💰', '✨']) {
  const fx = $('#fx');
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.textContent = pick(emojis);
    s.style.cssText = `left:${10 + Math.random() * 80}%;animation-delay:${Math.random() * 0.5}s;font-size:${18 + Math.random() * 22}px;--dx:${(Math.random() - .5) * 160}px`;
    fx.append(s); setTimeout(() => s.remove(), 2600);
  }
}

/* ───────────── تعديل / إضافة / مسح / سحب ───────────── */
function commit(el) {
  const [coll, id, field] = el.dataset.p.split(':');
  let v = el.textContent.trim();
  if (el.dataset.t === 'n') { v = parseNum(v); if (!isFinite(v) || v < 0) return render(); }
  else if (!v) return render();
  if (coll === 'S') S[field] = v;
  else if (coll === 'debt') { if (field === 'remaining') S.debt.balance = v + ctx().R.paid; else S.debt.name = v; }
  else if (coll === 'rates') { if (v <= 0) return render(); S.rates[id] = field === 'inv' ? 1 / v : v; S.manual[id] = true; }
  else { const it = S[coll].find(x => x.id === id); if (!it) return; if (it[field] === v) return; it[field] = v; }
  save(); render(); toast(pick(JOKES.ok)); sfx.edit();
}
const NEW = {
  essentials: () => ({ id: uid(), icon: '🧾', name: 'بند جديد', amount: 0 }),
  holdings: () => ({ id: uid(), name: 'دهب', cur: 'XAU', amount: 0, karat: 24, spare: true }),
  life: () => ({ id: uid(), name: 'مستوى جديد', monthly: 0 }),
  spare: () => ({ id: uid(), name: 'محطة جديدة', monthly: 0, extra: 0 }),
  fun: () => ({ id: uid(), name: 'هدف جديد', cost: 0, every: 3 }),
};
let resetArmed = 0;
cardsEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.add) {
    const it = NEW[d.add](); S[d.add].push(it); save(); render();
    const el = cardsEl.querySelector(`[data-p="${d.add}:${it.id}:name"]`);
    if (el) { el.focus(); document.getSelection().selectAllChildren(el); }
  } else if (d.del) {
    const [coll, id] = d.del.split(':');
    const go = () => {
      const undo = JSON.stringify(S);
      S[coll] = S[coll].filter(x => x.id !== id); save(); render(); toast(coll === 'tx' ? pick(DEL_OK()) : L('اتمسح 🧹', 'Deleted 🧹'), undo); sfx.del();
    };
    if (coll === 'tx') askPin(pick(DEL_ASK())).then(ok => ok && go()); else go();
  } else if (d.done) {
    const [id, key] = d.done.split(':'), tx = S.tx.find(x => x.id === id);
    if (key === 'sad') { // علّمت إنك طلّعتها: سجّلها مصروف من بند الصدقة
      const r = ctx().R.rows[id];
      if (r?.sadaqa > 0.005) S.tx.push({ id: uid(), date: today(), type: 'expense', bucket: 'sadaqa', amount: r.sadaqa / r.r, cur: tx.cur, rate: tx.rate, note: L('صدقة', 'Sadaqa') });
    }
    (tx.done ??= {})[key] = true; save(); render(); toast(pick(JOKES.ok)); party(['✅', '👏', '💪']); sfx.ok();
  } else if (d.toggle) {
    const h = S.holdings.find(x => x.id === d.toggle); h.spare = !h.spare; save(); render();
  } else if (d.cycle) {
    const h = S.holdings.find(x => x.id === d.cycle), all = ['XAU', ...MONEY];
    h.cur = all[(all.indexOf(h.cur) + 1) % all.length]; save(); render();
  } else if (d.wait) {
    const [what, id] = d.wait.split(':'), w = S.wait.find(x => x.id === id);
    S.wait = S.wait.filter(x => x.id !== id);
    if (what === 'buy') S.tx.push({ id: uid(), date: today(), type: 'expense', bucket: 'reward', amount: w.amount, cur: w.cur, rate: rate(w.cur), note: w.name });
    save(); render(); toast(what === 'buy' ? L('مبروك عليك 🛍️', 'Enjoy it 🛍️') : L('قرار جامد 💪 وفّرت فلوسك', 'Strong move 💪 You kept your money'));
  } else if ('live' in d) { S.manual = {}; save(); loadRates(); toast(L('رجعنا للأسعار اللايف 🟢', 'Back to live prices 🟢')); }
  else if (d.why) { showWhy(d.why); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if ('auto' in d) {
    S.autoSalary = !S.autoSalary; S.autoFrom = S.autoSalary ? today() : null; save(); render();
    toast(S.autoSalary ? L('تمام، هسجّل المرتب أوتوماتيك يوم القبض ✅', "Okay, I'll record the salary automatically on payday ✅") : L('تمام، هفكّرك وتسجّله إنت 🔔', "Okay, I'll remind you and you record it 🔔")); sfx.ok();
  }
  else if (d.act) trigger(d.act);
  else if ('reset' in d) {
    askPin(L('هتمسح كل حاجة وتبدأ من الصفر؟ 😱 اكتب الرقم السري لو قلبك جامد', 'Wipe everything and start from zero? 😱 Enter the PIN if you dare')).then(ok => {
      if (!ok) return;
      const keep = { rates: S.rates, pin: S.pin };
      S = { ...seed(), ...keep }; save(); render(); toast(L('رجعنا من الأول 🔄 صفحة بيضا', 'Fresh start 🔄 Clean slate')); sfx.del();
    });
  }
});
cardsEl.addEventListener('focusin', e => { if (e.target.classList?.contains('ed')) e.target.dataset.old = e.target.textContent; });
cardsEl.addEventListener('focusout', e => {
  const t = e.target; if (!t.classList?.contains('ed') || t.dataset.old === t.textContent) return;
  const next = e.relatedTarget?.dataset?.p;
  commit(t);
  if (next) cardsEl.querySelector(`[data-p="${next}"]`)?.focus();
});
cardsEl.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('ed')) return;
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') { e.target.textContent = e.target.dataset.old; e.target.blur(); }
});
cardsEl.addEventListener('input', e => {
  if (e.target.id === 'risk') { S.risk = +e.target.value; save(); $('#riskBox').innerHTML = riskHTML(); sfx.tick(); }
});
cardsEl.addEventListener('toggle', e => {
  const k = e.target.dataset?.k; if (k) e.target.open ? UI.open.add(k) : UI.open.delete(k);
}, true);

let drag = null;
cardsEl.addEventListener('dragstart', e => {
  const g = e.target.closest?.('[data-grip]'); if (!g) return;
  const row = g.closest('[data-row]'); drag = row.dataset.row;
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag);
  try { e.dataTransfer.setDragImage(row, 24, 24); } catch {}
  row.classList.add('dragging');
});
cardsEl.addEventListener('dragover', e => {
  const row = e.target.closest?.('[data-row]');
  if (!drag || !row || row.dataset.row.split(':')[0] !== drag.split(':')[0]) return;
  e.preventDefault();
  cardsEl.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  row.classList.add('over');
});
cardsEl.addEventListener('drop', e => {
  const row = e.target.closest?.('[data-row]'); if (!drag || !row) return;
  e.preventDefault();
  const [coll, from] = drag.split(':'), to = row.dataset.row.split(':')[1], a = S[coll];
  const i = a.findIndex(x => x.id === from), j = a.findIndex(x => x.id === to);
  if (i >= 0 && j >= 0 && i !== j) { a.splice(j, 0, a.splice(i, 1)[0]); save(); toast(pick(JOKES.ok)); sfx.drop(); }
  drag = null; render();
});
cardsEl.addEventListener('dragend', () => { drag = null; cardsEl.querySelectorAll('.over,.dragging').forEach(x => x.classList.remove('over', 'dragging')); });

// ميل 3D خفيف للكروت
cardsEl.addEventListener('pointermove', e => {
  const cd = e.target.closest?.('.card'); if (!cd || cd.contains(document.activeElement)) return;
  const r = cd.getBoundingClientRect();
  cd.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 5 + 'deg');
  cd.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 4 + 'deg');
});
cardsEl.addEventListener('pointerout', e => {
  const cd = e.target.closest?.('.card'); if (cd && !cd.contains(e.relatedTarget)) { cd.style.setProperty('--rx', '0deg'); cd.style.setProperty('--ry', '0deg'); }
});

/* ───────────── الشات ───────────── */
const logEl = $('#log'), chipsEl = $('#chips'), sayIn = $('#sayIn');
let pending = null, atMenu = false;
const BACK = { get l() { return L('↩️ رجوع', '↩️ Back'); }, v: null };
const scrollLog = () => { logEl.scrollTop = logEl.scrollHeight; };
async function bot(html, cls = '') {
  const el = document.createElement('div'); el.className = 'msg bot typing'; el.innerHTML = '<i></i><i></i><i></i>';
  logEl.append(el); scrollLog(); await sleep(380);
  el.className = 'msg bot ' + cls + (LOCK ? '' : ' priv'); el.innerHTML = html; scrollLog(); sfx.pop();
}
function me(text) {
  const el = document.createElement('div'); el.className = 'msg me' + (LOCK ? '' : ' priv');
  el.textContent = LOCK ? String(text).replace(/[\d٠-٩]/g, '•') : text; // والأرقام مستخبية، اللي بتكتبه بيتغطى
  logEl.append(el); scrollLog(); sfx.send();
}
function setChips(opts) {
  chipsEl.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.l; b.onclick = () => answer(o.v, o.l); chipsEl.append(b); });
}
async function ask(q, opts = []) { await bot(q); setChips(opts); return new Promise(res => { pending = res; }); }
function answer(v, label) {
  if (!pending) return;
  me(label ?? v); const p = pending; pending = null; atMenu = false; setChips([]); p(v);
}
$('#say').addEventListener('submit', e => { e.preventDefault(); const v = sayIn.value.trim(); if (!v) return; sayIn.value = ''; answer(v, v); });
function trigger(v) {
  if (atMenu) { answer(v, MENU.find(m => m.v === v)?.l ?? v); sayIn.focus(); }
  else toast(L('خلّص السؤال اللي في الشات الأول 😄', 'Finish the question in the chat first 😄'));
}

function curOf(t) {
  const low = norm(t).toLowerCase();
  if (CUR[t]) return t;
  if (/aed|dirham|dhs|درهم|دراهم/.test(low)) return 'AED';
  if (/egp|pound|egyptian|جنيه|جنية|مصري/.test(low)) return 'EGP';
  if (/usd|\$|dollar|buck|دولار/.test(low)) return 'USD';
  if (/eur|euro|يورو|€/.test(low)) return 'EUR';
  if (/sar|riyal|saudi|ريال|سعودي/.test(low)) return 'SAR';
  return null;
}
function parseMoney(t) { const amount = parseNum(t); return isFinite(amount) ? { amount, cur: curOf(String(t)) } : null; }
async function askMoney(q, quick = [], secret = false) {
  for (let prompt = q; ;) {
    const v = await ask(prompt, [...quick.map(n => ({ l: LOCK ? (secret ? L('🙈 المبلغ المتوقع', '🙈 Expected amount') : Number(n).toLocaleString('en-US')) : fmt(n), v: String(n) })), BACK]);
    if (v === null) return null;
    const m = parseMoney(v); if (m && m.amount > 0) return m;
    sfx.err(); prompt = L('مش فاهم الرقم 😅 اكتبه تاني، مثال: 1500 أو 300 جنيه', "I didn't get that number 😅 Type it again, e.g. 1500 or 300 EGP");
  }
}
async function askCur() {
  for (let q = L('بأنهي عملة؟ 💱', 'In which currency? 💱'); ;) {
    const v = await ask(q, [...MONEY.map(c => ({ l: `${CUR[c].f} ${CUR[c].n}`, v: c })), BACK]);
    if (v === null) return null;
    const c = curOf(v); if (c) return c;
    q = L('مش عارف العملة دي 🤔 اختار من دول', "I don't know that currency 🤔 Pick one of these");
  }
}

function celebrate(before, after) {
  const wins = [];
  if (!before.debtFree && after.debtFree) wins.push(L('💳 الكارد خلص! من هنا ورايح نصيب النمو استثمار', "💳 The card is paid off! From now on, Growth's share goes into investing"));
  if (after.spare > before.spare) wins.push(L(`🛟 وصلت محطة الأمان رقم ${after.spare}`, `🛟 You reached Safety milestone #${after.spare}`));
  if (after.life > before.life) wins.push(L(`🎮 اتفتح مستوى المعيشة رقم ${after.life}`, `🎮 Living level #${after.life} unlocked`));
  if (wins.length) { sfx.win(); party(['🎉', '🏆', '🥳', '🎊']); bot(`<b>${wins.join('<br>')}</b><br>${pick(JOKES.win)}`, 'win'); }
}

async function flowIncome(kind, preset, opt = {}) {
  // الأول: التصنيف، وبعدين التفصيلة، وبعدين المبلغ
  let cat = 'مرتب', sub = S.job?.company || '';
  if (kind === 'side') {
    const cs = cats().income;
    const c0 = await pickFrom(L('الدخل ده من أنهي نوع؟ 🏷️', 'What kind of income is this? 🏷️'), cs.map(x => x.n)); if (c0 === null) return;
    cat = c0 || 'غير مصنّف';
    let co = cs.find(x => x.n === cat); if (!co) { co = { n: cat, subs: [] }; cs.push(co); }
    const s0 = await pickFrom(L(`أنهي حاجة في ${esc(cat)}؟`, `Which one under ${esc(cat)}?`), co.subs, [{ l: L('من غير تفاصيل', 'No details'), v: '' }]); if (s0 === null) return;
    sub = s0; if (sub && !co.subs.includes(sub)) co.subs.push(sub);
  }
  const m = preset || await askMoney(kind === 'salary' ? L('قبضت كام؟ 💰', 'How much did you get paid? 💰') : L(`جالك كام من ${esc(sub || cat)}؟ 🤑`, `How much came in from ${esc(sub || cat)}? 🤑`), kind === 'salary' ? [...new Set([payInfo(ctx()).amount, +S.salary].filter(v => v > 0))] : [500, 1000, 2000], kind === 'salary');
  if (!m) return;
  const cur = m.cur || (kind === 'salary' ? 'AED' : await askCur()); if (!cur) return;
  const note = kind === 'salary' ? 'المرتب' : (sub ? `${cat} · ${sub}` : cat);
  if (opt.auto) await bot(L(`📅 يوم القبض (${dayName(new Date(opt.date))}) جه، فسجّلت المرتب ووزّعته أوتوماتيك زي ما اتفقنا.`, `📅 Payday (${dayName(new Date(opt.date))}) is here, so I recorded your salary and split it automatically, just like we agreed.`));
  const before = snap(ctx());
  const tx = { id: uid(), date: opt.date || today(), type: 'income', kind, amount: m.amount, cur, rate: rate(cur), E: essentialsTotal(S), sad: +S.sadaqa || 0, cat, sub, note, done: {} };
  S.tx.push(tx); save(); render();
  const c = ctx(), r = c.R.rows[tx.id], k = 1 / r.r, pct = fmt(r.E / r.incomeAfter * 100);
  const parts = [[L('🤲 الصدقة', '🤲 Sadaqa'), r.sadaqa], [L('🍞 الأساسيات', '🍞 Essentials'), r.d.essentials], [`💳 ${esc(S.debt.name)}`, r.debtPay], [L('📈 استثمار', '📈 Investing'), r.invest], [L('🛟 الأمان', '🛟 Safety'), r.d.stability], [L('🎉 المتعة', '🎉 Fun'), r.d.reward]].filter(([, v]) => v > 0.5);
  const why = [];
  if (r.sadaqa > 0.005) why.push(L(`الصدقة (${fmt(tx.sad, 2)}%) بتطلع الأول من أي دخل: ${fmt(r.sadaqa * k)}. والباقي (${fmt(r.net * k)}) هو اللي بيتوزع.`, `Sadaqa (${fmt(tx.sad, 2)}%) comes off the top of any income: ${fmt(r.sadaqa * k)}. The rest (${fmt(r.net * k)}) is what gets split.`));
  if (r.mode === 'A') why.push(L(`دخل الشهر (${fmt(r.incomeAfter)}) لسه أقل من الأساسيات (${fmt(r.E)})، فكله رايح لها. ناقص ${fmt(r.deficit)}.`, `This month's income (${fmt(r.incomeAfter)}) is still below your Essentials (${fmt(r.E)}), so all of it goes there. Still short by ${fmt(r.deficit)}.`));
  if (r.mode === 'B') why.push(L(`الأساسيات ${fmt(r.E)} = ${pct}% من دخل الشهر (${fmt(r.incomeAfter)})، أكبر من النص. فاللي فاضل بيتقسم 50% نمو، 30% أمان، 20% متعة.`, `Essentials are ${fmt(r.E)} = ${pct}% of this month's income (${fmt(r.incomeAfter)}), more than half. So what's left is split 50% Growth, 30% Safety, 20% Fun.`));
  if (r.mode === 'C') why.push(L(`الأساسيات بقت ${pct}% من دخل الشهر (${fmt(r.incomeAfter)})، يعني النص أو أقل. فالنسب الأصلية شغالة (25 / 15 / 10)، واللي اتوفر من الأساسيات راح للنمو.`, `Essentials are now ${pct}% of this month's income (${fmt(r.incomeAfter)}), so half or less. The original ratios apply (25 / 15 / 10), and whatever you saved on Essentials went to Growth.`));
  if (r.modeBefore !== r.mode && r.incomeAfter > r.aed) why.push(L(`الفلوس دي نقلتك من "${MODE[r.modeBefore]}" لـ"${MODE[r.mode]}" 🎚️`, `This money moved you from "${MODE[r.modeBefore]}" to "${MODE[r.mode]}" 🎚️`));
  if (r.d.essentials < 0.5 && r.mode !== 'A') why.push(L('الأساسيات متغطية من دخل قبل كده، فمفيش حاجة منهم راحت لها.', 'Essentials were already covered by earlier income, so none of this went to them.'));
  if (r.debtPay > 0.5) why.push(L(`عندك دين، فنصيب النمو بيسدّه الأول. فاضل عليه ${fmt(r.debtAfter)} درهم.`, `You have debt, so the Growth share pays it off first. ${fmt(r.debtAfter)} AED left to go.`));
  if (r.capped) why.push(L('صندوق الأمان وصل آخر محطة، فنصيبه اتحوّل للنمو.', 'The Safety fund reached its last milestone, so its share moved to Growth.'));
  if (cur !== 'AED') why.push(L(`الحساب اتعمل بالدرهم (${r.r < 1 ? `1 درهم = ${fmt(1 / r.r, 2)} ${CUR[cur].n}` : `1 ${CUR[cur].n} = ${fmt(r.r, 4)} درهم`}) والتوزيع فضل بالـ${CUR[cur].n} في محفظته.`, `The math was done in AED (${r.r < 1 ? `1 AED = ${fmt(1 / r.r, 2)} ${CUR[cur].n}` : `1 ${CUR[cur].n} = ${fmt(r.r, 4)} AED`}), and the split stays in ${CUR[cur].n} in its own wallet.`));
  await bot(`${L(`${money(m.amount, cur)} اتوزعوا كده:`, `${money(m.amount, cur)} got split like this:`)}
    <ul class="alloc">${parts.map(([n, v]) => `<li><span>${n}</span><b dir="ltr">${fmt(v * k)}</b></li>`).join('')}</ul>
    <b>${L('ليه؟', 'Why?')}</b><ul class="why-list">${why.map(w => `<li>${w}</li>`).join('')}</ul>`);
  await bot(pick(JOKES.income), 'joke');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  scene?.burst({ essentials: r.d.essentials, growth: r.d.growth, stability: r.d.stability, reward: r.d.reward, sadaqa: r.sadaqa });
  party(); sfx.coins();
  celebrate(before, snap(c));
}

function cats() { // تأكد إن قوايم التصنيفات موجودة حتى لو البيانات قديمة
  const d = seed().cats; S.cats ??= d; S.cats.income ??= d.income; S.cats.reward ??= d.reward; return S.cats;
}
/** اختيار من قايمة، أو كتابة واحد جديد */
async function pickFrom(q, list, extra = []) {
  const v = await ask(`${q} <small>${L('(اختار أو اكتب واحد جديد)', '(pick one or type a new one)')}</small>`, [...list.map(l => ({ l, v: l })), ...extra, BACK]);
  return v === null ? null : String(v).trim();
}
async function flowSpend(preset) {
  // الأول: التصنيف، وبعدين التفصيلة، وبعدين المبلغ
  const where = await ask(L('صرفت على إيه؟ 💸', 'What did you spend on? 💸'), [{ l: L('🍞 أساسيات', '🍞 Essentials'), v: 'essentials' }, { l: L('🎉 متعة وخروج', '🎉 Fun & outings'), v: 'reward' }, { l: L('🤲 صدقة', '🤲 Sadaqa'), v: 'sadaqa' }, { l: L('🛟 طوارئ من الأمان', '🛟 Emergency from Safety'), v: 'stability' }, BACK]);
  if (where === null) return;
  const bucket = ['essentials', 'reward', 'sadaqa', 'stability'].includes(where) ? where : 'reward';
  const cat = BX[bucket].n;
  let item = null, sub = '';
  if (bucket === 'essentials') {
    const it = await ask(L('أنهي بند في الأساسيات؟', 'Which Essentials item?'), [...S.essentials.map(e => ({ l: `${e.icon} ${e.name}`, v: 'e:' + e.id })), BACK]); if (it === null) return;
    const e = S.essentials.find(e => 'e:' + e.id === it) || S.essentials.find(e => e.name === String(it).trim());
    if (!e) return bot(L('البند ده مش في الأساسيات. ضيفه الأول من كارت الأساسيات، أو سجّله على "متعة".', 'That item isn\'t in your Essentials. Add it from the Essentials card first, or log it under "Fun".'));
    item = e.id; sub = e.name;
  } else if (bucket === 'reward') {
    const typed = bucket !== where ? String(where).trim() : null; // كتب حاجة بدل ما يختار
    const v = typed ?? await pickFrom(L('أنهي حاجة في المتعة؟', 'Which one under Fun?'), cats().reward); if (v === null) return;
    sub = v; if (sub && !cats().reward.includes(sub)) cats().reward.push(sub);
  } else if (bucket === 'stability') sub = 'طوارئ';
  const note = sub || cat;
  const m = preset || await askMoney(L(`صرفت كام على ${esc(note)}؟`, `How much did you spend on ${bucket === 'stability' ? 'the emergency' : bucket === 'sadaqa' ? 'sadaqa' : esc(note)}?`), [20, 50, 100]); if (!m) return;
  const cur = m.cur || 'AED';
  const aed = m.amount * rate(cur);
  if (bucket === 'reward') {
    const jar = ctx().R.rewardAED;
    if (aed >= Math.max(100, jar * 0.4)) {
      const imp = await ask(L('لحظة 🤔 ده شراء مفاجئ ولا كنت مخطط له؟', 'Hold on 🤔 was this an impulse buy, or did you plan it?'), [{ l: L('⚡ مفاجئ', '⚡ Impulse'), v: 'y' }, { l: L('📝 مخطط له', '📝 Planned'), v: 'n' }]);
      if (imp === 'y') {
        const w = await ask(L('قاعدة الـ 7 أيام ⏳ استنى أسبوع، ولو لسه عايزه اشتريه. هتعمل إيه؟', 'The 7-day rule ⏳ Wait a week, and if you still want it, buy it. What will it be?'), [{ l: L('⏳ هستنى', '⏳ I\'ll wait'), v: 'w' }, { l: L('🛍️ اشتريته خلاص', '🛍️ Already bought it'), v: 'b' }]);
        if (w === 'w') {
          S.wait.push({ id: uid(), name: note, amount: m.amount, cur, date: today() }); save(); render();
          return bot(L('جدع 👏 حطيتها في قايمة الـ 7 أيام وهفكّرك لما الأسبوع يعدّي.', 'Nice one 👏 It\'s on the 7-day list and I\'ll remind you when the week is up.'));
        }
      }
    }
  }
  S.tx.push({ id: uid(), date: today(), type: 'expense', bucket, item, amount: m.amount, cur, rate: rate(cur), cat, sub, note });
  save(); render();
  const c = ctx();
  let msg;
  if (bucket === 'essentials') {
    const e = S.essentials.find(x => x.id === item), sp = c.mo.items[item] || 0;
    msg = L(`اتسجلت على ${esc(note)}. صرفت منه ${fmt(sp)} من ${fmt(e?.amount || 0)} الشهر ده${sp > (e?.amount || 0) ? ' 🚨 عدّيت الميزانية' : ''}.`, `Logged under ${esc(note)}. You've spent ${fmt(sp)} of ${fmt(e?.amount || 0)} on it this month${sp > (e?.amount || 0) ? ' 🚨 over budget' : ''}.`);
  } else if (bucket === 'reward') {
    msg = c.R.rewardAED >= 0 ? L(`اتخصمت من المتعة. فاضل في الحصّالة ${fmt(c.R.rewardAED)} درهم.`, `Taken out of Fun. ${fmt(c.R.rewardAED)} AED left in the jar.`) : L(`🫙 الحصّالة فضيت وعدّيت بـ ${fmt(-c.R.rewardAED)} درهم. القاعدة: تستنى القبض الجاي ومتسحبش من بند تاني.`, `🫙 The jar is empty and you're over by ${fmt(-c.R.rewardAED)} AED. The rule: wait for the next payday and don't dip into another bucket.`);
  } else if (bucket === 'sadaqa') {
    msg = c.R.sadaqaAED >= -0.5 ? L(`اتسجلت صدقة 🤲 فاضل في بند الصدقة ${fmt(Math.max(0, c.R.sadaqaAED))} درهم.`, `Sadaqa logged 🤲 ${fmt(Math.max(0, c.R.sadaqaAED))} AED left in the Sadaqa bucket.`) : L(`اتسجلت صدقة 🤲 وزيادة ${fmt(-c.R.sadaqaAED)} درهم عن اللي كان متخصص. ربنا يزيدك.`, `Sadaqa logged 🤲 that's ${fmt(-c.R.sadaqaAED)} AED more than was set aside. May you be given even more.`);
  } else msg = L(`اتسحبت من الأمان. 🤝 وعد التعويض: رجّع ${fmt(aed)} درهم من أول قبض جاي.`, `Taken out of Safety. 🤝 Payback promise: put ${fmt(aed)} AED back from your next payday.`);
  sfx.spend();
  await bot(msg); await bot(bucket === 'sadaqa' ? L('ربنا يتقبّل منك 🤍', 'May it be accepted from you 🤍') : pick(JOKES.spend), 'joke');
}

async function flowGold() {
  let h = S.holdings.find(x => x.cur === 'XAU');
  const g = await askMoney(L(`معاك كام جرام دهب دلوقتي؟ 🥇${h ? ` (مسجّل ${fmt(h.amount, 2)})` : ''}`, `How many grams of gold do you have now? 🥇${h ? ` (${fmt(h.amount, 2)} on record)` : ''}`), [5, 10, 20]); if (!g) return;
  const k = await ask(L('عيار كام؟', 'Which karat?'), [24, 22, 21, 18].map(n => ({ l: String(n), v: n })).concat(BACK)); if (k === null) return;
  if (!h) { h = NEW.holdings(); S.holdings.push(h); }
  h.amount = g.amount; h.karat = parseNum(k) || 24; save(); render();
  await bot(L(`${fmt(g.amount, 2)} جرام عيار ${h.karat} = ${money(holdingValue(h, rate))} بسعر النهارده (${fmt(rate('XAU'), 2)} د للجرام 24). محسوب ${h.spare ? 'ضمن الأمان 🛟' : 'ضمن النمو 📈'}، وتقدر تغيّره من كارت المحافظ.`, `${fmt(g.amount, 2)} g of ${h.karat} karat = ${money(holdingValue(h, rate))} at today's price (${fmt(rate('XAU'), 2)} AED per gram of 24 karat). Counted ${h.spare ? 'under Safety 🛟' : 'under Growth 📈'}, and you can change that from the Wallets card.`));
  await bot(pick(JOKES.ok), 'joke');
}

async function flowFun() {
  const name = await ask(L('اسم الهدف إيه؟ ✈️', 'What\'s the goal called? ✈️'), [{ l: L('سفرية', 'Trip'), v: L('سفرية', 'Trip') }, { l: L('خروجة كبيرة', 'Big outing'), v: L('خروجة كبيرة', 'Big outing') }, { l: L('هدية', 'Gift'), v: L('هدية', 'Gift') }, BACK]); if (name === null) return;
  const cost = await askMoney(L('هيكلّف كام تقريبًا؟', 'Roughly how much will it cost?'), [500, 1500, 3000]); if (!cost) return;
  const ev = await ask(L('كل كام شهر؟', 'Every how many months?'), [1, 3, 6, 12].map(n => ({ l: L(`كل ${n}`, `Every ${n}`), v: n })).concat(BACK)); if (ev === null) return;
  const every = Math.max(1, Math.round(parseNum(ev)) || 3);
  S.fun.push({ id: uid(), name: String(name), cost: cost.amount * rate(cost.cur || 'AED'), every }); save(); render();
  const can = ctx().exp.reward * every;
  await bot(L(`اتضاف 🎯 في ${every} شهور بتحوّش للمتعة حوالي ${fmt(can)} درهم، ${can >= cost.amount ? 'يعني الهدف في المتناول 👌' : `يعني ناقص ${fmt(cost.amount - can)}. يا تطوّل المدة يا تزوّد الدخل.`}`, `Added 🎯 In ${EN_N(every, 'month')} you put about ${fmt(can)} AED into Fun, ${can >= cost.amount ? 'so the goal is within reach 👌' : `so you're ${fmt(cost.amount - can)} short. Either stretch the timeline or grow your income.`}`));
}

async function flowCTA() {
  const t = todos(ctx());
  await bot(`<b>${L('المطلوب منك دلوقتي:', 'What you need to do now:')}</b><ol class="why-list">${t.slice(0, 6).map(x => `<li>${x.i} ${x.h}<br><small>${x.s}</small></li>`).join('')}</ol>`);
}

function parseDay(t) { // "النهارده" / "18" / "18/11" / "2026-11-18"
  const n = new Date(), x = norm(String(t)).trim();
  if (/النهارده|النهاردة|today|\bnow\b/i.test(x)) return today();
  if (/امبارح|إمبارح|yesterday/i.test(x)) return iso(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1));
  let m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(new Date(+m[1], +m[2] - 1, +m[3]));
  m = x.match(/^(\d{1,2})(?:[\/\-.](\d{1,2}))?(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const d = new Date(m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : n.getFullYear(), m[2] ? +m[2] - 1 : n.getMonth(), +m[1]);
  return isNaN(d) ? null : iso(d);
}
async function flowPay() {
  const co = await ask(L('بتشتغل في شركة إيه؟ 🏢 (اكتب الاسم)', 'Which company do you work for? 🏢 (type the name)'), [...(S.job?.company ? [{ l: S.job.company, v: S.job.company }] : []), { l: L('تخطّي', 'Skip'), v: '' }, BACK]); if (co === null) return;
  const isNew = await ask(L('دي شغلانة جديدة ولا شغال فيها من قبل كده؟', 'Is this a new job, or have you been there a while?'), [{ l: L('🆕 جديدة', '🆕 New'), v: 'new' }, { l: L('👍 شغال فيها من زمان', '👍 Been there a while'), v: 'old' }, BACK]); if (isNew === null) return;
  let start = null, covers = 'prev';
  if (isNew === 'new') {
    for (let q = L('بدأت إمتى؟ 📆 (مثال: 18/11)', 'When did you start? 📆 (e.g. 18/11)'); ;) {
      const v = await ask(q, [{ l: L('النهارده', 'Today'), v: 'النهارده' }, { l: L('إمبارح', 'Yesterday'), v: 'إمبارح' }, BACK]); if (v === null) return;
      start = parseDay(v); if (start) break;
      sfx.err(); q = L('مش فاهم التاريخ 😅 اكتبه كده: 18/11', 'I couldn\'t read that date 😅 Type it like this: 18/11');
    }
  }
  const d = await ask(L('بتقبض يوم كام في الشهر؟ 📅', 'Which day of the month do you get paid? 📅'), [1, 5, 25, 28].map(n => ({ l: L(`يوم ${n}`, `Day ${n}`), v: n })).concat(BACK)); if (d === null) return;
  const day = Math.min(28, Math.max(1, Math.round(parseNum(d)) || 5));
  const m = await askMoney(L('والمرتب الكامل في الشهر كام؟ 💰', 'And what\'s the full monthly salary? 💰'), [S.salary], true); if (!m) return;
  const a = await ask(L('ويوم القبض تحب أعمل إيه؟', 'And on payday, what should I do?'), [{ l: L('✅ سجّله ووزّعه أوتوماتيك', '✅ Record and split it automatically'), v: 'auto' }, { l: L('🔔 فكّرني وأنا أسجّله', '🔔 Remind me and I\'ll record it'), v: 'man' }, BACK]); if (a === null) return;
  S.job = { company: String(co).trim(), start, covers };
  S.payday = day; S.salary = m.amount * rate(m.cur || 'AED'); S.autoSalary = a === 'auto'; S.autoFrom = S.autoSalary ? today() : null;
  save(); render();
  const pi = payInfo(ctx()), p = pi.prev;
  const parts = [[L('🤲 الصدقة', '🤲 Sadaqa'), p.sadaqa], [L('🍞 الأساسيات', '🍞 Essentials'), p.essentials], [`💳 ${esc(S.debt.name)}`, p.debt], [L('📈 استثمار', '📈 Investing'), p.invest], [L('🛟 الأمان', '🛟 Safety'), p.stability], [L('🎉 المتعة', '🎉 Fun'), p.reward]].filter(([, v]) => v > 0.5);
  await bot(`${L('اتظبط 📅 قبضك الجاي', 'All set 📅 Your next payday is')} <b>${dayName(pi.next)}</b>${pi.due ? L(' (مستحق دلوقتي)', ' (due now)') : L(` بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, ` in ${EN_N(pi.days, 'day')}`)}${L(`، والمبلغ ${money(pi.amount)}. ده مرتب شغل شهر ${workMonth(pi.next)} كله، بس بينزل يوم ${paydayOf(S)}.`, `, and the amount is ${money(pi.amount)}. That's the salary for all of ${workMonth(pi.next)}'s work, but it lands on day ${paydayOf(S)}.`)}
    ${pi.sf.full ? '' : L(`<br>⚖️ مش المرتب الكامل عشان لسه بادئ:${payBreak(pi.sf)}والمرتبات اللي بعده هتبقى ${fmt(S.salary)} كاملة.`, `<br>⚖️ Not the full salary because you just started:${payBreak(pi.sf)}The salaries after that will be the full ${fmt(S.salary)}.`)}
    <ul class="alloc">${parts.map(([n, v]) => `<li><span>${n}</span><b dir="ltr">${fmt(v)}</b></li>`).join('')}</ul>
    ${S.autoSalary ? L('يومها هسجّله وأوزّعه لوحدي ✅', 'That day I\'ll record and split it on my own ✅') : L('يومها هفكّرك، وإنت تدوس "قبضت المرتب" 🔔', 'That day I\'ll remind you, and you tap "Got my salary" 🔔')}`);
  if (!pi.sf.full && p.essentials < ctx().R.E - 0.5) await bot(L(`⚠️ خد بالك: أول مرتب (${fmt(pi.amount)}) أقل من أساسياتك (${fmt(ctx().R.E)}). محتاج تغطي الفرق ${fmt(ctx().R.E - pi.amount)} من دخل جانبي أو من الأمان.`, `⚠️ Heads up: your first salary (${fmt(pi.amount)}) is less than your Essentials (${fmt(ctx().R.E)}). You'll need to cover the ${fmt(ctx().R.E - pi.amount)} gap from side income or from Safety.`));
  if (pi.due && S.autoSalary) await bot(L('القبض الحالي مستحق من قبل ما تفعّل الأوتوماتيك، فسجّله إنت المرة دي من زرار "قبضت المرتب".', 'The current payday was already due before you turned on automatic, so record this one yourself with the "Got my salary" button.'));
}

const MENU = [
  { get l() { return L('💰 قبضت المرتب', '💰 Got my salary'); }, v: 'salary' }, { get l() { return L('🤑 جالي دخل جانبي', '🤑 Got side income'); }, v: 'side' }, { get l() { return L('💸 صرفت', '💸 I spent'); }, v: 'spend' },
  { get l() { return L('🥇 الدهب', '🥇 Gold'); }, v: 'gold' }, { get l() { return L('🎯 هدف خروج', '🎯 Outing goal'); }, v: 'fun' }, { get l() { return L('📅 يوم القبض', '📅 Payday'); }, v: 'pay' }, { get l() { return L('🧭 أعمل إيه دلوقتي؟', '🧭 What should I do now?'); }, v: 'cta' },
];
const FLOWS = { salary: () => flowIncome('salary'), side: () => flowIncome('side'), spend: () => flowSpend(), gold: flowGold, fun: flowFun, cta: flowCTA, pay: flowPay };
async function menu() {
  let q = L('أهلًا يا أحمد 👋 أنا فلوسي. قولّي حصل إيه وأنا أوزّع وأقولك تعمل إيه.', 'Hey Ahmed 👋 I\'m Floosy. Tell me what happened and I\'ll split it up and tell you what to do.') + (S.job ? '' : L('<br>📅 لسه ما قلتليش على شغلك ويوم القبض. دوس <b>يوم القبض</b> عشان أحسبلك مرتبك الجاي صح.', '<br>📅 You haven\'t told me about your job and payday yet. Tap <b>Payday</b> so I can work out your next salary properly.'));
  for (; ;) {
    const p = ask(q, MENU); atMenu = true;
    const a = await p;
    try {
      if (FLOWS[a]) await FLOWS[a]();
      else {
        const m = a && parseMoney(a);
        if (m && m.amount > 0) {
          const w = await ask(L(`${fmt(m.amount)} دول إيه؟`, `What's this ${fmt(m.amount)}?`), [{ l: L('🤑 دخل جانبي', '🤑 Side income'), v: 'side' }, { l: L('💰 مرتب', '💰 Salary'), v: 'salary' }, { l: L('💸 مصروف', '💸 Expense'), v: 'spend' }, BACK]);
          if (w === 'spend') await flowSpend(m); else if (w === 'side' || w === 'salary') await flowIncome(w, m);
        } else await bot(L('اختار من الزراير، أو اكتب رقم زي "2000" أو "500 جنيه" 🙂', 'Pick one of the buttons, or type a number like "2000" or "500 EGP" 🙂'));
      }
    } catch (err) { console.error(err); await bot(L('حصلت لخبطة صغيرة 😅 جرّب تاني.', 'Small hiccup 😅 Try again.')); }
    q = pick(GREET);
  }
}

/* ───────────── الأسعار اللايف ───────────── */
async function loadRates() {
  const info = $('#rateInfo');
  let ok = false;
  let live = false;
  try { // لايف من السوق عن طريق السيرفر المحلي (بيتحدث كل دقيقة)
    const j = await (await fetch(API.fx, { cache: 'no-store' })).json();
    if (!(j.aed > 0 && j.egp > 0)) throw 0;
    const set = (c, v) => { if (v > 0 && !S.manual[c]) S.rates[c] = v; };
    set('USD', j.aed); set('EGP', j.aed / j.egp); if (j.eurusd) set('EUR', j.eurusd * j.aed); if (j.sar) set('SAR', j.aed / j.sar);
    S.fxDate = L('لايف ', 'Live ') + new Date(j.time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    UI.fxLive = live = ok = true;
  } catch { UI.fxLive = false; }
  if (!live) try { // احتياطي: بيتحدث مرة كل يوم
    const j = await (await fetch('https://open.er-api.com/v6/latest/AED', { cache: 'no-store' })).json();
    if (j.result !== 'success') throw 0;
    for (const c of ['USD', 'EGP', 'EUR', 'SAR']) if (j.rates[c] && !S.manual[c]) S.rates[c] = 1 / j.rates[c];
    S.fxDate = L('بتاريخ ', 'As of ') + new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10); ok = true;
  } catch {
    for (const u of ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aed.json', 'https://latest.currency-api.pages.dev/v1/currencies/aed.json']) {
      try {
        const j = await (await fetch(u, { cache: 'no-store' })).json(), a = j.aed;
        for (const c of ['USD', 'EGP', 'EUR', 'SAR']) if (a[c.toLowerCase()] && !S.manual[c]) S.rates[c] = 1 / a[c.toLowerCase()];
        if (a.xau && !S.manual.XAU) S.rates.XAU = 1 / a.xau / OZ;
        S.fxDate = L('بتاريخ ', 'As of ') + j.date; ok = true; break;
      } catch {}
    }
  }
  try {
    const g = await (await fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' })).json();
    if (g.price > 0) { S.goldUsd = g.price; UI.goldLive = !S.manual.XAU; ok = true; if (!S.manual.XAU) S.rates.XAU = g.price * S.rates.USD / OZ; }
  } catch { UI.goldLive = false; }
  if (ok) { S.ratesAt = Date.now(); saveLocal(); }
  info.textContent = ok
    ? L(`${UI.goldLive ? '🟢' : '🟡'} دهب 24: ${fmt(rate('XAU'), 1)} د/جم · 1 درهم = ${fmt(1 / rate('EGP'), 2)} جنيه`, `${UI.goldLive ? '🟢' : '🟡'} Gold 24k: ${fmt(rate('XAU'), 1)} AED/g · 1 AED = ${fmt(1 / rate('EGP'), 2)} EGP`)
    : L('🔴 مفيش نت، شغال بآخر أسعار محفوظة', '🔴 No internet, running on the last saved prices');
  if (!document.activeElement?.classList?.contains('ed')) render();
}

/* ───────────── تشغيل ───────────── */
sfx.on = S.sound !== false;
const muteBtn = $('#mute');
const paintMute = () => { muteBtn.textContent = sfx.on ? '🔊' : '🔇'; };
muteBtn.onclick = () => { sfx.on = !sfx.on; S.sound = sfx.on; save(); paintMute(); sfx.ok(); };
paintMute();
document.addEventListener('click', e => { if (e.target.closest('button, summary, .lbl') && e.target.id !== 'mute') sfx.tap(); }, true);

document.body.classList.add('locked');
render();
if (HOSTED && FILE.missing) $('#saveInfo').textContent = L('☁️ لسه مفيش بيانات على الموقع', '☁️ No data on the site yet'); // أول مرة على الموقع: ما نحفظش بيانات فاضية، استنى الاستيراد أو أول معاملة
else if (FILE.missing || !FILE.ok || FILE.resume) pushFile(); else setSaveInfo(true);
// استيراد وتصدير البيانات كملف (عشان تنقل data.json بين الجهاز والموقع)
$('#exp').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `floosy-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#imp').onclick = async () => {
  if (S.tx.length && !(await askPin(L('الاستيراد هيبدّل كل البيانات اللي هنا بالملف. اكتب الرقم السري لو متأكد 🔐', 'Importing replaces everything here with the file. Enter your PIN if you are sure 🔐')))) return;
  $('#impFile').click();
};
$('#impFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || !Array.isArray(j.tx) || !Array.isArray(j.essentials)) throw new Error('shape');
    S = { ...seed(), ...j }; sfx.on = S.sound !== false; save(); render();
    toast(L('اتستوردت البيانات ✅', 'Data imported ✅')); sfx.ok();
  } catch { toast(L('الملف ده مش ملف بيانات فلوسي 😅', 'That file is not a Floosy data file 😅')); sfx.err(); }
};
if (HOSTED && FILE.missing) toast(L('أول مرة هنا 👋 دوس 📥 فوق عشان تستورد data.json من جهازك', 'First time here 👋 Press 📥 above to import data.json from your computer'));
document.addEventListener('visibilitychange', syncFile); window.addEventListener('focus', syncFile); setInterval(syncFile, 20000);
menu();
loadRates(); setInterval(loadRates, 60 * 1000);
setTimeout(autoPay, 2500); setInterval(autoPay, 30 * 60 * 1000);
setTimeout(() => document.body.classList.remove('first'), 1600);
import('./scene.js').then(m => {
  const view = $('#view');
  scene = m.initScene($('#gl'), view, (k, x, y, s) => {
    const el = $(`#labels [data-b="${k}"]`), half = el.offsetWidth / 2 + 6;
    x = Math.max(half, Math.min(view.clientWidth - half, x)); // ما تخرجش برّه الكارت
    el.style.transform = `translate(-50%,0) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
  });
  render();
}).catch(err => { console.warn('3D مش شغال', err); document.body.classList.add('no3d'); });

// اللغة: عربي يمين لشمال / إنجليزي شمال ليمين
initLang(() => { sfx.tap(); buildLabels(); setSaveInfo(true); render(); loadRates(); if (atMenu) setChips(MENU); });
