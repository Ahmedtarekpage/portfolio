import { initLang, L, LOC, EN_N } from './i18n.js';
import { sinceOf, cycleInfo, NEXT_DAYS,
  allocate, replay, essentialsTotal, spareAmount, splitIncome, essNextDays, prepaid, essCycle, SAD_DEBT, SAFE_MONTHS, nextPeriod, essFor, lifeMonthly, holdingValue,
  expectedIncome, sideAverage, AVG_MIN, stableStreak, addMonths, OZ, periodOf, paydayOf, debtList, curOf as cOf, essOf, slice, countries, whereOn, itemFor, sitOn, amtAt, isDynamic, homeOf,
} from './rules.js';
import { JOKES, GREET, RISK, VIDEO } from './content.js';
import { sfx, VOLS, haptic } from './sfx.js';
import { renderAnalytics } from './analytics.js';
import { evaluate, plan, factsFor, run as runGoals } from './goals.js';
import { essWizard } from './ess-wizard.js';
import { xferWizard } from './xfer-wizard.js';
import { renderLog, logCSV, LOG_F } from './logpage.js';

// 🎛 the owner's switches (S.use, behind the PIN). With the AI off nothing in this file reaches Claude:
// every AI call goes through this fetch, which answers "off" itself instead of sending the request.
// The server checks the same switches, so a stale tab cannot spend either.
const _fetch = window.fetch.bind(window);
const AI_CALL = /[?&]finance=(agent|chat|advise|intent)\b/;
const fetch = (u, o) => {
  if (typeof u === 'string' && AI_CALL.test(u) && S?.use?.ai === false) {
    try { toast(L('🤖 الذكاء الاصطناعي مقفول. افتحه من 🎛 فوق.', '🤖 The AI is switched off. Turn it on from 🎛 above.')); } catch {}
    return Promise.resolve(new Response(JSON.stringify({ error: 'ai off', off: true }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
  }
  return _fetch(u, o);
};
// voice.js is its own module: it reads the switch from here
Object.defineProperty(window, 'FLOOSY_USE', { configurable: true, get: () => ({ voice: S?.use?.voice !== false, ai: S?.use?.ai !== false }) });
import { txEditor } from './tx-edit.js';
import { splitWizard } from './split-wizard.js';
import { sharkMode } from './shark-mode.js';
import { ASSETS, KINDS, mixFor, project, chartInvest, investFacts } from './invest.js';

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
  EUR: { get n() { return L('يورو', 'EUR'); }, f: '🇪🇺', s: '€' }, SAR: { get n() { return L('ريال', 'SAR'); }, f: '🇸🇦', s: 'SR' }, XAU: { get n() { return L('جرام دهب', 'g gold'); }, f: '🥇', get s() { return L('جم', 'g'); } },
};
const MONEY = ['AED', 'EGP', 'USD', 'EUR', 'SAR'];
const B = {
  essentials: { get n() { return L('الأساسيات', 'Essentials'); }, i: '🍞', c: '#fbbf24' },
  growth: { get n() { return L('النمو', 'Growth'); }, i: '📈', c: '#34d399' },
  stability: { get n() { return L('الأمان', 'Safety'); }, i: '🛟', c: '#F4EDE0' },
  reward: { get n() { return L('الفلوس الحرّة', 'Fun free money'); }, i: '🎉', c: '#FF6B5B' },
  sadaqa: { get n() { return L('الصدقة', 'Sadaqa'); }, i: '🤲', c: '#94A5CA' },
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
  goals: [], // الأهداف الكبيرة (عربية، شقة، كورس) بالترتيب — شوف goals.js
  wait: [],
  risk: 1,
  payday: 1, autoSalary: false, autoFrom: null, sound: true,
  use: { voice: true, ai: true }, // 🎛 paid services: ElevenLabs voice, Claude
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
  // لو الرد مش بياناتك فعلًا (من غير tx)، ما نعتبرهوش اتحمّل — وإلا البيانات الفاضية كانت ممكن تتحفظ فوق بياناتك (2026-11-20)
  if (r.ok && isApi) { const j = await r.json(); if (j && Array.isArray(j.tx)) { S = { ...seed(), ...j }; FILE.ok = true; FILE.rev = r.headers.get('X-Rev') || ''; } }
  else if (r.status === 404 && isApi) { FILE.ok = true; FILE.missing = true; } // السيرفر شغال والملف لسه ما اتعملش
  else if (r.status === 401 && HOSTED) { location.replace('/admin?next=finance'); await new Promise(() => {}); } // مش داخل: روح سجّل دخول
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
  location.replace('/admin?next=finance');
}
function setSaveInfo(ok) {
  const t = !FILE.ok ? (HOSTED ? L('☁️ لسه ما اتحفظش على الموقع', '☁️ Not saved to the site yet') : L('💾 محفوظ في المتصفح بس (شغّل server.py)', '💾 Saved in the browser only (run server.py)')) : ok ? (HOSTED ? L('☁️ محفوظ على الموقع', '☁️ Saved to the site') : L('💾 محفوظ في data.json', '💾 Saved to data.json')) : L('⚠️ الحفظ في الملف فشل', '⚠️ Saving to the file failed');;
  // قصيرة في الهيدر، والجملة كاملة لما تقف عليها
  const el = $('#saveInfo'); el.title = t; el.textContent = t.replace(/ على الموقع| to the site| في data\.json| to data\.json/, '').replace(/ \(شغّل server\.py\)| \(run server\.py\)/, '')
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
// دخل شهر I قصاد أساسيات E بالقواعد الحقيقية (splitIncome): وقت الدين الفلوس الحرّة 2.5% والأمان لحد شهر والباقي للدين
function routed(a, R, I = a.essentials + a.growth + a.stability + a.reward, E = a.essentials + a.deficit) {
  const sp = splitIncome({ net: I, need: E, E, debtOn: R.debt > 0.5, stab: R.stabilityAED, starter: R.starter, cap: R.lastSpare });
  const debt = Math.min(sp.growth, R.debt);
  return { ...a, essentials: sp.essentials, growth: sp.growth, stability: sp.stability, reward: sp.reward, debt, invest: sp.growth - debt, capped: sp.capped, debtOn: R.debt > 0.5 };
}
/* ───────────── كل دولة لوحدها (2026-11-19) ───────────── */
// السويتش اللي فوق (S.view) بيختار دولة: الكروت كلها بتترسم من نسخة من البيانات فيها الدولة دي بس،
// وعملتها هي الأساس (الأسعار متقسومة على سعرها)، فكل الأرقام بتطلع بعملتها هي.
// التعديلات بتروح للبيانات الحقيقية بالـ id، فالنسخة دي للعرض بس.
const cardView = () => (HOME_COUNTRIES.includes(S.view) ? S.view : 'ALL');
// الحاجات دي متخزّنة بالدرهم (مش بعملة الدولة)، فبتتحوّل للعرض وترجع درهم وقت التعديل
const AED_FIELDS = { spare: ['monthly', 'extra'], life: ['monthly'], fun: ['cost'], goals: ['price', 'down', 'inst', 'monthly', 'replace'], S: ['salary'] };
function viewState(c) {
  // بيظهر حاجات الدولة دي بس (أساسياتها، محفظتها، ديونها، دخلها) بعملتها، بس الحساب نفسه على الكل
  // مع بعض (إنت شخص واحد): replay بيحسب على V.full وبيطلّع نصيب الدولة دي (project في rules.js)
  const r0 = rate(c), F = { ...S }, conv = (arr, ks) => arr.map(t => { const o = { ...t }; for (const k of ks) if (o[k] != null) o[k] = +o[k] / r0; return o; });
  F.rates = Object.fromEntries(Object.entries(S.rates).map(([k, v]) => [k, v / r0]));
  F.tx = S.tx.map(t => ({ ...t, rate: (t.rate || rate(cOf(t))) / r0 }));
  F.salary = (+S.salary || 0) / r0;
  F.spare = conv(S.spare, AED_FIELDS.spare); F.life = conv(S.life, AED_FIELDS.life); F.fun = conv(S.fun, AED_FIELDS.fun); F.goals = conv(S.goals || [], AED_FIELDS.goals);
  const V = slice(F, c);
  if (cOf(S.job || {}) !== c) { V.salary = 0; V.job = null; V.autoSalary = false; } // المرتب بيظهر في دولة الشغل بس
  return V;
}
/** في عرض دولة: أي "درهم/Đ/AED" في الكروت يبقى عملة الدولة (كل الأرقام هناك بعملتها) */
function relabel(root, c) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) if (/Đ|درهم|AED/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Đ/g, CUR[c].s).replace(/درهم/g, CUR[c].n).replace(/\bAED\b/g, c);
}
/** قيمة بند أساسيات بعملة الأساس (درهم في "الكل"، أو عملة الدولة) */
const eVal = e => itemFor(S, e, periodOf(today(), paydayOf(S))) * rate(cOf(e));

/* ───────────── إضافة / تعديل بند أساسيات (خطوة بخطوة، ess-wizard.js) ───────────── */
async function openEss(id) {
  if (LOCK) { // المبالغ بتظهر في الخانات، فلازم الأرقام تكون مفتوحة
    if (pinOk()) setLock(false);
    else if (await askPin(L('اكتب الرقم السري عشان تعدّل الأساسيات 🔐', 'Enter your PIN to edit essentials 🔐'))) { try { sessionStorage.setItem(PIN_OK, '1'); } catch {} setLock(false); }
    else return;
  }
  const item = id ? S.essentials.find(x => x.id === id) : null; if (id && !item) return;
  const pd = paydayOf(S), ym = periodOf(today(), pd), [y, m] = ym.split('-').map(Number);
  const days = Math.round((new Date(y, m, pd) - new Date(y, m - 1, pd)) / 864e5);
  const raw = v => (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const others = (cur, ex) => S.essentials.filter(e => cOf(e) === cur && e.id !== ex);
  const r = await essWizard(item, {
    L, esc, parseNum, CUR, sfx, fmt: raw,
    defaultCur: cardView() !== 'ALL' ? cardView() : here(),
    places, placeName: x => PLACE_N[x] || CUR[x].n,
    preview: it => { const month = itemFor(S, it, ym); return { month, perDay: month / days }; },
    countryTotal: (cur, ex) => others(cur, ex).reduce((a, e) => a + itemFor(S, e, ym), 0),
    toAED: (v, cur) => v * rate(cur),
    // إنت شخص واحد: الـ50% على كل دخلك وكل أساسياتك (البلدين)، بعملة البند
    otherEss: (cur, ex) => S.essentials.filter(e => cOf(e) !== cur && e.id !== ex).reduce((a, e) => a + itemFor(S, e, ym) * rate(cOf(e)), 0) / rate(cur),
    countryIncome: cur => {
      const P = replay(S, rate);
      const past = Object.keys(P.months).filter(k => k < ym && P.months[k].income > 0).sort().slice(-3);
      const aed = past.length ? past.reduce((a, k) => a + P.months[k].income, 0) / past.length : Math.max(P.months[ym]?.income || 0, (+S.salary || 0) * (1 - (+S.sadaqa || 0) / 100));
      return aed / rate(cur);
    },
    noSit: () => S.noSit || [],
    setNoSit: list => { S.noSit = list; save(); },
    cycles: Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 1 + i, 1), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; return { ym: k, label: i === 0 ? `${L('الشهر ده', 'this month')} (${monthName(d)})` : monthName(d) }; }),
    sameName: (n, cur, ex) => others(cur, ex).some(e => String(e.name).trim().toLowerCase() === String(n).trim().toLowerCase()),
    homeShare: (tag, it) => { const all = [...others(it.cur, item?.id), it], t = all.reduce((a, e) => a + itemFor(S, e, ym), 0); return t ? all.filter(e => e.tag === tag).reduce((a, e) => a + itemFor(S, e, ym), 0) / t : 0; },
  });
  if (!r) return;
  const undo = JSON.stringify(S);
  if (r.action === 'delete') {
    S.essentials = S.essentials.filter(x => x.id !== id); save(); render(); sfx.del();
    return toast(L(`🧹 اتمسح "${esc(item.name)}"`, `🧹 Deleted "${esc(item.name)}"`), undo);
  }
  if (item) { for (const k of ['where', 'whereMode', 'tag', 'paidTo']) delete item[k]; Object.assign(item, r.item, { id: item.id }); }
  else S.essentials.push({ ...r.item, id: uid() });
  save(); render(); sfx.ok(); party(['🍞', '✅', '✨']);
  toast(item ? L('💾 اتحفظ التعديل', '💾 Changes saved') : L(`✅ "${esc(r.item.name)}" اتضاف للأساسيات`, `✅ "${esc(r.item.name)}" added to essentials`), undo);
}

/* ───────────── أنا فين (الإمارات / مصر …) ───────────── */
const PLACE_N = { get AED() { return L('الإمارات', 'UAE'); }, get EGP() { return L('مصر', 'Egypt'); }, get USD() { return L('أمريكا', 'USA'); }, get EUR() { return L('أوروبا', 'Europe'); }, get SAR() { return L('السعودية', 'Saudi'); } };
// البلاد اللي بتعيش فيها (صاحب الحساب، 2026-11-19: الإمارات ومصر بس). الدولار وغيره عملات للفلوس، مش بلاد.
const HOME_COUNTRIES = ['AED', 'EGP'];
const places = () => HOME_COUNTRIES;
const here = () => whereOn(S, today());
/** من يوم d: إنت (me) و/أو مراتك (wife) فين. أي حاجة متسجلة بعد d بتتمسح عشان القايمة تفضل بالترتيب. */
/** مواقف مش بتحصل (زي "إنت في مصر ومراتك في الإمارات") — S.noSit = ['EGP+AED'] */
const impossible = (me, w) => (S.noSit || []).includes(`${me}+${w}`);
function setSit(patch, d) {
  const want = { ...sitOn(S, d), ...patch };
  if (impossible(want.me, want.wife)) { // اتنقلت لموقف مش بيحصل: يبقى مراتك معاك (أو إنت معاها)
    if (patch.me) want.wife = want.me; else want.me = want.wife;
  }
  S.stays = (S.stays || []).filter(x => x.from < d);
  const prev = sitOn(S, d);
  if (prev.me !== want.me || prev.wife !== want.wife) S.stays.push({ from: d, where: want.me, wife: want.wife });
}
const moveTo = (w, d) => setSit({ me: w }, d);
const wifeTxt = (w, me) => w === me ? L('👫 معاك', '👫 with you') : `${CUR[w].f} ${L(`في ${PLACE_N[w]}`, `in ${PLACE_N[w]}`)}`;
function sitButtons(sit) {
  return `${places().filter(x => x !== sit.me).map(x => `<button class="pill" data-move="${x}">✈️ ${L(`أنا في ${PLACE_N[x]} من النهارده`, `I'm in ${PLACE_N[x]} from today`)}</button>`).join('')}
    ${places().filter(x => x !== sit.wife && !impossible(sit.me, x)).map(x => `<button class="pill" data-wife="${x}">👩 ${x === sit.me ? L('مراتي معايا', 'My wife is with me') : L(`مراتي في ${PLACE_N[x]}`, `My wife is in ${PLACE_N[x]}`)}</button>`).join('')}`;
}
function whereHTML() {
  const sit = sitOn(S, today()), last = (S.stays || []).filter(x => x.from <= today()).at(-1);
  return `<div class="where2">
    <div class="who"><span class="wchip">📍 ${L('أنا', 'Me')} <b>${CUR[sit.me].f} ${PLACE_N[sit.me]}</b></span><span class="wchip">👩 ${L('مراتي', 'Wife')} <b>${sit.wife === sit.me ? L('👫 معايا', '👫 with me') : `${CUR[sit.wife].f} ${PLACE_N[sit.wife]}`}</b></span>${last ? `<small>${L('من', 'since')} ${dayName(new Date(last.from + 'T00:00:00'))}</small>` : ''}</div>
    <div class="wacts">${sitButtons(sit)}${(S.stays || []).length ? `<button class="pill" data-unmove title="${L('امسح آخر تغيير', 'Remove the last change')}">↩️</button>` : ''}</div></div>`;
}


/** أساسيات الدورة دي لكل دولة (بعملتها) + اللي اتصرف منها */
function essNow() {
  const R = replay(S, rate), ym = periodOf(today(), paydayOf(S)), out = {};
  const by = { AED: R }; // إنت شخص واحد: أساسيات الكل مع بعض
  for (const [c, P] of Object.entries(by)) {
    if (!MONEY.includes(c)) continue;
    const m = P.months[ym];
    out[c] = { E: (m?.E ?? P.E) / rate(c), spent: (m?.essSpent || 0) / rate(c), alloc: m ? { g: (m.alloc.growth + m.alloc.debt) / rate(c), s: m.alloc.stability / rate(c), r: m.alloc.reward / rate(c) } : null };
  }
  return out;
}
/** بعد أي تغيير في المكان: الشهر ده اتغيّر إزاي، والمطلوب منك إيه لآخر الشهر */
async function sitChanged(before, what) {
  const after = essNow(), lines = [];
  const pd = paydayOf(S), ym = periodOf(today(), pd), [y, m] = ym.split('-').map(Number);
  const end = new Date(y, m, pd), n0 = new Date(), daysLeft = Math.max(1, Math.round((end - new Date(n0.getFullYear(), n0.getMonth(), n0.getDate())) / 864e5));
  for (const c of Object.keys(after)) {
    const a = before[c] || { E: 0 }, b = after[c], dE = b.E - a.E;
    if (Math.abs(dE) < 0.5) continue;
    const left = Math.max(0, b.E - b.spent);
    lines.push(L(`${CUR[c].f} أساسيات الشهر ده: <b dir="ltr">${fmt(a.E)} → ${fmt(b.E)} ${CUR[c].s}</b> (${dE > 0 ? '+' : '−'}${fmt(Math.abs(dE))}). فاضل تصرف منها <b dir="ltr">${fmt(left)}</b> لآخر الدورة، يعني حوالي <b dir="ltr">${fmt(left / daysLeft)} ${CUR[c].s}</b> في اليوم (${daysLeft} يوم).`,
      `${CUR[c].f} This month's essentials: <b dir="ltr">${fmt(a.E)} → ${fmt(b.E)} ${CUR[c].s}</b> (${dE > 0 ? '+' : '−'}${fmt(Math.abs(dE))}). You have <b dir="ltr">${fmt(left)}</b> left to spend until the cycle ends, about <b dir="ltr">${fmt(left / daysLeft)} ${CUR[c].s}</b> a day (${daysLeft} days).`));
    if (a.alloc && b.alloc) {
      const dg = b.alloc.g - a.alloc.g, ds = b.alloc.s - a.alloc.s, dr = b.alloc.r - a.alloc.r;
      if (Math.abs(dg) + Math.abs(ds) + Math.abs(dr) > 0.5) lines.push(L(`↳ دخل الشهر ده بال${CUR[c].n} اتوزّع من جديد: 📈 نمو ${dg >= 0 ? '+' : '−'}${fmt(Math.abs(dg))} · 🛟 أمان ${ds >= 0 ? '+' : '−'}${fmt(Math.abs(ds))} · 🎉 فلوس حرّة ${dr >= 0 ? '+' : '−'}${fmt(Math.abs(dr))}. ${dg + ds + dr < 0 ? 'يعني رجّع الفرق ده للأساسيات من محافظ الشهر ده.' : 'الزيادة دي حطّها في البنود دي.'}`,
        `↳ This month's ${CUR[c].n} income was split again: 📈 growth ${dg >= 0 ? '+' : '−'}${fmt(Math.abs(dg))} · 🛟 safety ${ds >= 0 ? '+' : '−'}${fmt(Math.abs(ds))} · 🎉 fun ${dr >= 0 ? '+' : '−'}${fmt(Math.abs(dr))}. ${dg + ds + dr < 0 ? 'So move that difference back to essentials from this month\'s wallets.' : 'Put the extra into those buckets.'}`));
    }
  }
  await bot(`${what}${lines.length ? `<ul class="why-list">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : `<br>${L('الأساسيات ما اتغيّرتش (مفيش بنود 📍 أو 👫 بتتأثر).', 'Essentials did not change (no 📍 or 👫 items are affected).')}`}`);
}
/** غيّر المكان من النهارده (من الكارت أو من سؤال الصبح) واعرض الأثر على الشهر */
async function applySit(patch, d = today()) {
  const before = essNow();
  setSit(patch, d); save(); render(); sfx.ok();
  const sit = sitOn(S, d);
  await sitChanged(before, L(`✈️ من ${dayName(new Date(d + 'T00:00:00'))}: إنت في ${CUR[sit.me].f} ${PLACE_N[sit.me]}، ومراتك ${wifeTxt(sit.wife, sit.me)}.`, `✈️ From ${dayName(new Date(d + 'T00:00:00'))}: you're in ${CUR[sit.me].f} ${PLACE_N[sit.me]}, and your wife is ${wifeTxt(sit.wife, sit.me)}.`));
}

/* ───────────── سؤال كل يوم: إنت فين ومراتك فين ───────────── */
// مكانك من الـGPS بتاع الموبايل، وبيتحسب هنا في المتصفح بحدود تقريبية للدولتين (مفيش حاجة بتتبعت لأي حد).
// لو ما ردّتش، كل حاجة بتفضل زي آخر رد.
const BOX = { AED: [22.5, 26.5, 51.0, 56.6], EGP: [21.9, 31.8, 24.6, 36.95] };
const placeAt = (lat, lon) => Object.keys(BOX).find(k => { const [a, b, c, d] = BOX[k]; return lat >= a && lat <= b && lon >= c && lon <= d; }) || null;
const gps = () => new Promise(res => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p => res(placeAt(p.coords.latitude, p.coords.longitude)), () => res(null), { timeout: 10000, maximumAge: 3600e3 });
});
async function dailyCheck() {
  if (S.lastCheck === today() || !FILE.ok) return;
  S.lastCheck = today(); save();
  const sit = sitOn(S, today()), seen = await gps();
  const moved = seen && seen !== sit.me;
  await bot(`☀️ ${L('صباح الخير! سؤال سريع عشان أحسب الشهر صح:', 'Morning! A quick check so I count this month right:')}<br>
    ${moved ? L(`📍 الموبايل بيقول إنك في <b>${CUR[seen].f} ${PLACE_N[seen]}</b>، بس المسجّل ${CUR[sit.me].f} ${PLACE_N[sit.me]}. اتنقلت؟`, `📍 Your phone says you're in <b>${CUR[seen].f} ${PLACE_N[seen]}</b>, but I have ${CUR[sit.me].f} ${PLACE_N[sit.me]}. Did you move?`)
      : L(`📍 إنت في <b>${CUR[sit.me].f} ${PLACE_N[sit.me]}</b>${seen ? ' (الموبايل بيأكّد)' : ''}. ومراتك <b>${wifeTxt(sit.wife, sit.me)}</b>، لسه كده؟`, `📍 You're in <b>${CUR[sit.me].f} ${PLACE_N[sit.me]}</b>${seen ? ' (your phone agrees)' : ''}. And your wife is <b>${wifeTxt(sit.wife, sit.me)}</b>, still the same?`)}
    <div class="sitbtns">${moved ? `<button class="pill" data-move="${seen}">✅ ${L(`أيوه، أنا في ${PLACE_N[seen]} من النهارده`, `Yes, I'm in ${PLACE_N[seen]} from today`)}</button>` : ''}${sitButtons(sit).replace(moved ? new RegExp(`<button class="pill" data-move="${seen}">[^<]*</button>`) : /^$/, '')}<button class="pill" data-same>👍 ${L('زي ما هو', 'Same as before')}</button></div>
    <small class="note">${L('لو ما ردّتش، بفضل محتفظ بآخر حاجة اتسجّلت.', "If you don't answer, I keep the last answer.")}</small>`);
}


/* ───────────── الديون (قايمة: كارت، قرض، سلفة…) ───────────── */
// البيانات القديمة كان فيها دين واحد S.debt؛ أول ما الصفحة تشتغل بيتنقل لقايمة S.debts.
// ما ينفعش S.debts تبقى في seed(): الدمج {...seed(), ...data} كان هيمسح الدين القديم بقايمة فاضية.
const debts = () => (Array.isArray(S.debts) ? S.debts : (S.debts = debtList(S).map(d => ({ ...d }))));
const DKIND = { card: '💳', loan: '🏦', person: '🤝', other: '🧾' };
const DKIND_N = { get card() { return L('كارت', 'Credit card'); }, get loan() { return L('قرض', 'Loan'); }, get person() { return L('سلفة من حد', 'Personal loan'); }, get other() { return L('تاني', 'Other'); } };
/** الدين اللي بيتسد دلوقتي (أول واحد لسه عليه فلوس) — للرسايل زي "حوّل 500 لـ…" */
function dName() {
  const ds = debts();
  const d = ds.find(x => (UI.R ? dLeft(UI.R, x) : +x.balance) > 0.5) || ds[0];
  return d?.name || L('الدين', 'Debt');
}
/** خلّي الباقي على الدين ده = v (من غير ما نلمس اللي اتسدّد قبل كده) */
/** الباقي على الدين بعملته هو (R بيرجّع بعملة الأساس) */
const dLeft = (R, d) => { const x = R.debts[d.id]; return x?.on ? x.left / rate(cOf(d)) : +d.balance || 0; };
const dm = (d, v) => `<b dir="ltr">${fmt(v)} ${CUR[cOf(d)].s}</b>`;
const dPaid = (R, d) => (R.debts[d.id]?.paid || 0) / rate(cOf(d));
function setDebtLeft(id, v, why = 'correction', note = '') {
  const d = debts().find(x => x.id === id); if (!d) return;
  // من 2026-11-25: تعديل الباقي بيتسجل سطر "تصحيح" في السجل (تقدر تمسحه)، بدل ما يغيّر الرقم الأصلي من غير أثر
  const R0 = replay(S, rate);
  if (R0.debts[d.id]?.on) {
    const diff = v - dLeft(R0, d);
    if (Math.abs(diff) >= 0.005) S.tx.push({ id: uid(), date: today(), type: 'debtadj', debt: d.id, amount: +Math.abs(diff).toFixed(2), cur: cOf(d), rate: rate(cOf(d)), dir: diff < 0 ? -1 : 1, why, note: note || (why === 'correction' ? L(`تصحيح الباقي لـ ${fmt(v, 2)}`, `Corrected what's left to ${fmt(v, 2)}`) : '') });
    return;
  }
  for (let k = 0; k < 6; k++) { // السداد بيتوزّع بالترتيب، فتعديل دين ممكن يحرّك اللي بعده: بنظبط كذا مرة
    const left = dLeft(replay(S, rate), d);
    if (Math.abs(left - v) < 0.5) break;
    d.balance = Math.max(0, (+d.balance || 0) + v - left);
  }
}

/* ───────────── 💳 ربا كارت الائتمان (ENBD وأي كارت) — طلب صاحب الحساب، 2026-11-25 ─────────────
   قواعد ENBD (من الـ Key Facts Statement ودليل الرسوم الرسمي):
   · الربا = النسبة الشهرية × متوسط الرصيد اليومي، لو الكشف ما اتدفعش كله لحد آخر ميعاد
   · الحد الأدنى = الأكبر من 5% أو 100 درهم، واللي اتدفع من يوم الكشف بيتخصم منه؛ لو ما اتدفعش: غرامة 241.50
   قرش بيسأل البيانات الناقصة لوحده، والعدّاد فوق الشات بيعدّ لآخر ميعاد، ولما الميعاد يعدّي من غير ما الكشف
   يتدفع كله بيطلعلك تنبيه: "هيتضاف X ربا على الدين" — ومش بيتضاف غير لما توافق، كسطر في السجل تقدر تمسحه. */
const CARD_DEF = { rate: 3.69, dueDays: 25, minPct: 5, minAmt: 100, lateFee: 241.5 };
const cardCfg = d => ({ ...CARD_DEF, ...(d.card || {}) });
const isCard = d => (d.kind || 'card') === 'card' && !/tabby|tamara|تابي|تمارا/i.test(d.name || ''); // تابي وتمارا (اشتري دلوقتي وادفع بعدين) من غير ربا: زي ما هم
const dOfM = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// آخر ميعاد: لو متسجل "يوم X" (dueDay) = أول يوم X بعد الكشف (ممكن يكون نفس يوم الكشف في الشهر الجاي)، وإلا الكشف + dueDays
const dueOf = (st, c) => {
  let x;
  if (c.dueDay >= 1) { x = dOfM(st.getFullYear(), st.getMonth(), c.dueDay); if (x <= st) x = dOfM(st.getFullYear(), st.getMonth() + 1, c.dueDay); }
  else { x = new Date(st); x.setDate(x.getDate() + c.dueDays); }
  x.setHours(23, 59, 59, 0); return x;
};
const stOf = (c, y, m) => dOfM(y, m, c.stmtDay);
const cycleAt = (c, st) => ({ c, st, due: dueOf(st, c), next: stOf(c, st.getFullYear(), st.getMonth() + 1), key: isoD(st) });
function cardCycle(d, now = new Date()) {
  const c = cardCfg(d); if (!(c.stmtDay >= 1)) return null;
  let st = stOf(c, now.getFullYear(), now.getMonth()); if (st > now) st = stOf(c, now.getFullYear(), now.getMonth() - 1);
  return cycleAt(c, st);
}
const prevCycle = cy => cycleAt(cy.c, stOf(cy.c, cy.st.getFullYear(), cy.st.getMonth() - 1));
// اللي اتدفع للكارت ده بين يومين (من دخل اتوزّع أو سداد مباشر)، بعملة الكارت
function paidBetween(R, d, from, to) {
  const a = isoD(from), b = isoD(to); let s = 0;
  for (const t of S.tx) if (t.date >= a && t.date <= b) s += R.rows[t.id]?.paidTo?.[d.id] || 0;
  return s / rate(cOf(d));
}
// الربا والغرامات والتصحيحات اللي اتضافت على الكارت ده بعد يوم معيّن (عشان رصيد الكشف ما يتحسبش فيه)
const addedAfter = (d, from) => S.tx.filter(t => t.type === 'debtadj' && t.debt === d.id && t.date > isoD(from)).reduce((a, t) => a + (t.dir === -1 ? -1 : 1) * t.amount, 0);
const minDue = (d, bal) => { const c = cardCfg(d); return Math.max(bal * c.minPct / 100, c.minAmt / rate(cOf(d))); };
/** كشف الكارت ده: رصيده، اللي اتدفع من ساعتها، الباقي عشان ما يتحسبش ربا، الحد الأدنى الباقي، والربا المتوقع */
function stmtInfo(R, d, cy, until = new Date()) {
  const left = dLeft(R, d), paidAll = paidBetween(R, d, cy.st, new Date(8.64e15));
  const real = d.card?.bal?.[cy.key]; // رصيد الكشف الحقيقي لو كتبته من البنك
  const bal = real != null ? +real : Math.max(0, left + paidAll - addedAfter(d, cy.st)); // وإلا رصيد يوم الكشف تقريبًا
  const paid = paidBetween(R, d, cy.st, until < cy.due ? until : cy.due);
  const min = minDue(d, bal);
  return { bal, real: real != null, left, paidAll, added: addedAfter(d, cy.st), paid, toFull: Math.max(0, bal - paid), min, minLeft: Math.max(0, min - paid), riba: +(bal * cy.c.rate / 100).toFixed(2) };
}
const cDec = (d, k) => ((S.cardDec ??= {})[d.id] ??= {})[k];
const setDec = (d, k, v) => { ((S.cardDec ??= {})[d.id] ??= {})[k] = v; };
// سطر في السجل: ربا أو غرامة على الكارت (بيزوّد الباقي)
function addCardCharge(d, amount, why, date, note) {
  S.tx.push({ id: uid(), date, type: 'debtadj', debt: d.id, amount: +(+amount).toFixed(2), cur: cOf(d), rate: rate(cOf(d)), dir: 1, why, note });
}

/** 💳 قرش بيسأل بيانات الكارت: النسبة، يوم الكشف، آخر ميعاد */
async function cardSetup(d) {
  const nm = esc(d.name);
  await bot(L(`💳 عشان أحسبلك ربا <b>${nm}</b> بالظبط وأنبّهك قبل ما يتحسب، محتاج 3 حاجات من الكشف أو تطبيق البنك (Cards ← Statements):`, `💳 To work out <b>${nm}</b>'s riba (interest) exactly and warn you before it is charged, I need 3 things from the statement or the bank app (Cards → Statements):`));
  const later = { l: L('⏰ بعدين', '⏰ Later'), v: 'later' };
  const snooze = () => { S.cardSnooze = today(); save(); return bot(L('تمام، هسألك تاني بكرة 👍', 'OK, I will ask again tomorrow 👍')); };
  let a = await ask(L('١) نسبة الربا الشهرية كام؟ (مكتوبة في الكشف: Finance charge per month) — أغلب كروت ENBD لغير المواطنين 3.69%', '1) What is the monthly riba (interest) rate? (on the statement: Finance charge per month) — most ENBD cards for residents are 3.69%'), [{ l: '3.69%', v: '3.69' }, { l: '3.49%', v: '3.49' }, { l: '3.25%', v: '3.25' }, later], true);
  if (a === 'later') return snooze();
  const rateM = parseNum(a); if (!(rateM > 0 && rateM < 10)) return bot(L('النسبة مش واضحة. هسألك تاني لما تفتح فلوسي.', "That rate isn't clear. I'll ask again next time you open Floosy."));
  a = await ask(L('٢) يوم كشف الحساب كام في الشهر؟ (Statement date)', '2) Which day of the month is the statement? (Statement date)'), [1, 5, 6, 10, 15, 20, 25].map(n => ({ l: String(n), v: String(n) })).concat([later]), true);
  if (a === 'later') return snooze();
  const stmtDay = Math.round(parseNum(a)); if (!(stmtDay >= 1 && stmtDay <= 31)) return bot(L('اليوم مش واضح. هسألك تاني.', "That day isn't clear. I'll ask again."));
  const sug = new Date(2026, 0, stmtDay + 25).getDate();
  a = await ask(L(`٣) آخر ميعاد للدفع يوم كام؟ (Payment due date)`, `3) Which day is the payment due? (Payment due date)`), [{ l: L(`📅 نفس يوم الكشف (${stmtDay}) في الشهر الجاي`, `📅 Same day as the statement (${stmtDay}), next month`), v: 'same' }, { l: L(`بعد 25 يوم (يوم ${sug})`, `25 days later (day ${sug})`), v: '25d' }, later], true);
  if (a === 'later') return snooze();
  let dueDays = 25, dueDay = null;
  if (a === 'same') dueDay = stmtDay;
  else if (a !== '25d') { const day = Math.round(parseNum(a)); if (day >= 1 && day <= 31) dueDay = day; }
  d.card = { ...(d.card || {}), rate: rateM, stmtDay, dueDays, dueDay, setAt: today() };
  // الكشوف اللي ميعادها عدّى قبل ما تسجّل: الرقم اللي إنت كاتبه للدين فيها خلاص
  const cy = cardCycle(d); if (cy) { const pv = prevCycle(cy); setDec(d, pv.key, 'setup'); if (new Date() > cy.due) setDec(d, cy.key, 'setup'); }
  save(); render();
  const c2 = cardCycle(d);
  return bot(L(`✅ اتحفظ: ${rateM}% في الشهر · الكشف يوم ${stmtDay} · آخر ميعاد ${isoD(c2.due)}. ⏳ العدّاد فوق الشات بيعدّ للميعاد، ولو جه والكشف ما اتدفعش كله هيطلعلك تنبيه بالربا اللي هيتضاف — ومش هضيف أي حاجة غير لما توافق.`, `✅ Saved: ${rateM}% a month · statement on day ${stmtDay} · due ${isoD(c2.due)}. ⏳ The countdown above the chat counts to the due date; if it comes and the statement isn't paid in full, you get an alert with the riba to be added — and I add nothing unless you agree.`));
}

/** 🔔 تنبيه (نافذة فوق الصفحة): الميعاد عدّى والكشف ما اتدفعش كله ← هيتضاف ربا X (وغرامة لو الحد الأدنى ما اتدفعش) */
function cardAlert(d, cy, info, late) {
  return new Promise(res => {
    const cu = CUR[cOf(d)].s, nm = esc(d.name), fee = late ? cy.c.lateFee / (cOf(d) === 'AED' ? 1 : rate(cOf(d))) : 0;
    const o = document.createElement('div');
    o.className = 'wiz'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = `<div class="wiz-card glass dd card-alert">
      <div class="wiz-top"><b>⏰ ${L(`ميعاد ${nm} عدّى`, `${nm}'s due date passed`)}</b></div>
      <p>${L(`آخر ميعاد كان <bdi dir="ltr">${isoD(cy.due)}</bdi>، والكشف <b>ما اتدفعش كله</b>:`, `The due date was <bdi dir="ltr">${isoD(cy.due)}</bdi> and the statement <b>wasn't paid in full</b>:`)}</p>
      <table class="sw-t"><tr><td>📄 ${L(`رصيد كشف ${cy.key}`, `Statement ${cy.key} balance`)}</td><td dir="ltr">${fmt(info.bal, 2)} ${cu}</td></tr>
        <tr><td>✅ ${L('اتدفع لحد الميعاد', 'Paid by the due date')}</td><td dir="ltr">${fmt(info.paid, 2)}</td></tr>
        <tr><td>❌ ${L('ما اتدفعش', 'Not paid')}</td><td dir="ltr">${fmt(info.toFull, 2)}</td></tr>
        <tr class="ft"><td>📈 ${L(`الربا اللي هيتضاف (${cy.c.rate}% × متوسط الرصيد)`, `Riba to be added (${cy.c.rate}% × average balance)`)}</td><td dir="ltr">+${fmt(info.riba, 2)}</td></tr>
        ${late ? `<tr class="ft"><td>⚠️ ${L(`غرامة تأخير (الحد الأدنى ${fmt(info.min, 2)} ما اتدفعش)`, `Late fee (minimum ${fmt(info.min, 2)} not paid)`)}</td><td dir="ltr">+${fmt(fee, 2)}</td></tr>` : ''}</table>
      <p class="note">${L(`يعني الدين هيزيد <b dir="ltr">${fmt(info.riba + fee, 2)} ${cu}</b>. الرقم الحقيقي بيبان في الكشف الجاي (Finance charges)، ولو مختلف اكتبه.`, `So the debt goes up by <b dir="ltr">${fmt(info.riba + fee, 2)} ${cu}</b>. The real figure shows on the next statement (Finance charges); if it's different, type it.`)}</p>
      <div class="ca-btns"><button type="button" class="btn" data-ca="add">✅ ${L(`أيوه، ضيف ${fmt(info.riba + fee, 2)}`, `Yes, add ${fmt(info.riba + fee, 2)}`)}</button>
        <button type="button" class="pill" data-ca="type">✏️ ${L('الرقم في الكشف مختلف', 'The statement says something else')}</button>
        <button type="button" class="pill" data-ca="paid">🙅 ${L('لأ، دفعت كله (مش متسجل هنا)', "No, I paid it all (not logged here)")}</button>
        <button type="button" class="pill" data-ca="later">⏰ ${L('بعدين', 'Later')}</button></div>
    </div>`;
    document.body.appendChild(o); sfx.err?.(); haptic?.();
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-ca]'); if (!b) return;
      let v = b.dataset.ca, amt = null;
      if (v === 'type') { const t = prompt(L('اكتب الربا + الغرامة اللي في الكشف:', 'Type the riba + fee on the statement:')); if (t == null) return; amt = parseNum(t); if (!(amt >= 0)) return; v = 'add'; }
      o.classList.add('out'); setTimeout(() => o.remove(), 220);
      res({ v, amt, fee });
    });
  });
}

/** 💳 كل كارت: بيانات ناقصة؟ ميعاد عدّى من غير ما الكشف يتدفع كله؟ — بيسأل/ينبّه. بيرجّع true لو سأل */
let cardBusy = false;
async function cardChecks({ chat = true } = {}) {
  if (cardBusy) return false; cardBusy = true;
  let asked = false;
  try {
    for (const d of debts().filter(isCard)) {
      const R = ctx().R, left = dLeft(R, d);
      if (!R.debts[d.id]?.on || left <= 0.5) continue;
      if (!(d.card?.stmtDay >= 1)) { if (chat && S.cardSnooze !== today()) { await cardSetup(d); asked = true; } continue; }
      const cy = cardCycle(d); if (!cy) continue;
      for (const x of [prevCycle(cy), cy]) {
        if (new Date() <= x.due || cDec(d, x.key)) continue;
        const info = stmtInfo(ctx().R, d, x, x.due);
        if (info.toFull <= 0.5) { setDec(d, x.key, 'paid'); save(); continue; } // اتدفع كله: مفيش ربا
        const late = info.paid + 0.5 < info.min;
        // التنبيه فيه أرقام: يستنى لحد ما تفتح القفل بالرقم السري
        if (LOCK) await new Promise(r => { const t = setInterval(() => { if (!LOCK) { clearInterval(t); r(); } }, 400); });
        const r = await cardAlert(d, x, info, late); asked = true;
        if (r.v === 'later') continue;
        if (r.v === 'paid') { setDec(d, x.key, 'paid'); save(); continue; }
        const total = r.amt != null ? r.amt : info.riba + r.fee, nextDay = isoD(new Date(x.due.getTime() + 864e5));
        if (r.amt != null) { if (total > 0) addCardCharge(d, total, 'interest', nextDay, L(`ربا + غرامة كشف ${x.key} (من الكشف)`, `Riba + fee, ${x.key} statement (from the statement)`)); }
        else { addCardCharge(d, info.riba, 'interest', nextDay, L(`ربا كشف ${x.key} (${x.c.rate}% × ${fmt(info.bal, 2)})`, `Riba on the ${x.key} statement (${x.c.rate}% × ${fmt(info.bal, 2)})`)); if (late) addCardCharge(d, r.fee, 'fee', nextDay, L('غرامة تأخير (الحد الأدنى ما اتدفعش)', 'Late fee (minimum not paid)')); }
        setDec(d, x.key, 'added'); save(); render();
        if (chat) await bot(L(`📈 اتضاف <b dir="ltr">${fmt(total, 2)} ${CUR[cOf(d)].s}</b> على ${esc(d.name)}، وهتلاقيه في السجل (تقدر تمسحه لو غلط).`, `📈 Added <b dir="ltr">${fmt(total, 2)} ${CUR[cOf(d)].s}</b> to ${esc(d.name)}; it's in the log (delete it if it's wrong).`));
        else toast(L(`📈 اتضاف ${fmt(total, 2)} على ${esc(d.name)}`, `📈 Added ${fmt(total, 2)} to ${esc(d.name)}`));
      }
    }
  } finally { cardBusy = false; }
  return asked;
}

/* ⏳ العدّاد فوق الشات: أيام · ساعات · دقايق · ثواني لحد آخر ميعاد، وتحته تفاصيل الكشف */
function cardBar() {
  let el = document.getElementById('cardBar');
  if (!el) { const log = document.getElementById('log'); if (!log) return; el = document.createElement('div'); el.id = 'cardBar'; el.className = 'card-bar'; log.parentNode.insertBefore(el, log); }
  const R = UI.R || ctx().R, now = new Date(), rows = [];
  for (const d of debts().filter(isCard)) {
    const left = dLeft(R, d); if (!R.debts[d.id]?.on || left <= 0.5) continue;
    const nm = esc(d.name), cu = CUR[cOf(d)].s;
    if (!(d.card?.stmtDay >= 1)) { rows.push(`<button type="button" class="cb-row cb-setup" data-cardsetup="${d.id}">💳 <b>${nm}</b> · ${L('كمّل بيانات الكارت عشان أعدّلك للربا ›', 'Add the card details so I can count down to the riba ›')}</button>`); continue; }
    const cy = cardCycle(d, now), info = stmtInfo(R, d, cy, now), ms = Math.max(0, cy.due - now);
    if (ms === 0 && !cDec(d, cy.key) && !cardBusy) setTimeout(() => cardChecks({ chat: false }), 0); // الوقت خلص والصفحة مفتوحة: التنبيه يطلع على طول
    const u = (n, w) => `<span class="cd"><b>${String(n).padStart(2, '0')}</b><small>${w}</small></span>`;
    const clock = u(Math.floor(ms / 864e5), L('يوم', 'days')) + u(Math.floor(ms / 36e5) % 24, L('ساعة', 'hrs')) + u(Math.floor(ms / 6e4) % 60, L('دقيقة', 'min')) + u(Math.floor(ms / 1e3) % 60, L('ثانية', 'sec'));
    const ok = info.toFull <= 0.5;
    rows.push(`<div class="cb-row ${!ok && ms < 3 * 864e5 ? 'hot' : ''} ${ok ? 'ok' : ''}" data-cardexplain="${d.id}" title="${L('دوس تشوف كل رقم جه منين', 'Tap to see where each number comes from')}">
      <div class="cb-head"><span>💳 <b>${nm}</b> · ${L('آخر ميعاد', 'Due')} <bdi dir="ltr">${isoD(cy.due)}</bdi></span><button type="button" class="cb-edit" data-cardsetup="${d.id}" title="${L('عدّل بيانات الكارت', 'Edit the card details')}">✏️</button></div>
      <div class="cb-clock">${clock}</div>
      <table class="cb-t"><tr><td>📄 ${L(`رصيد كشف ${cy.key}`, `Statement ${cy.key}`)}</td><td dir="ltr">${fmt(info.bal, 0)} ${cu}</td></tr>
        <tr><td>✅ ${L('اتدفع من يوم الكشف', 'Paid since the statement')}</td><td dir="ltr">${fmt(info.paid, 0)}</td></tr>
        <tr class="${ok ? 'good' : 'warn'}"><td>🎯 ${L('عشان ما يتحسبش ربا ادفع', 'Pay to avoid riba')}</td><td dir="ltr">${ok ? L('✅ اتدفع', '✅ Paid') : fmt(info.toFull, 0)}</td></tr>
        <tr><td>⚠️ ${L(`الحد الأدنى الباقي (من ${fmt(info.min, 0)})`, `Minimum left (of ${fmt(info.min, 0)})`)}</td><td dir="ltr">${info.minLeft <= 0.5 ? L('✅ اتدفع', '✅ Paid') : fmt(info.minLeft, 0)}</td></tr>
        <tr><td>📈 ${L('لو ما دفعتش كله: ربا هيتضاف', 'If not paid in full: riba added')}</td><td dir="ltr">${ok ? '0' : '+' + fmt(info.riba, 0)}</td></tr></table>
      <small class="cb-more">🔎 ${L('دوس على أي رقم تشوف جه منين', 'Tap any number to see where it comes from')} ${info.real ? L('· 📄 رصيد الكشف من البنك', '· 📄 statement balance from the bank') : ''}</small>
    </div>`);
  }
  el.hidden = !rows.length; el.innerHTML = rows.join('');
}
setInterval(() => { try { if (!document.hidden) cardBar(); } catch {} }, 1000);
/** 🔎 كل رقم في عدّاد الكارت جه منين: رصيد الكشف، كل دفعة بتاريخها، الحد الأدنى، والربا، واللي بيحصل لو ما دفعتش */
function cardExplain(id) {
  const d = debts().find(x => x.id === id); if (!d) return;
  const R = ctx().R, cy = cardCycle(d), info = stmtInfo(R, d, cy), cu = CUR[cOf(d)].s, nm = esc(d.name), c = cy.c, r2 = n => fmt(n, 2);
  // كل دفعة للكارت من يوم الكشف: من دخل اتوزّع (حوّل X لـ…) أو سداد مباشر
  const pays = S.tx.filter(t => t.date >= isoD(cy.st) && R.rows[t.id]?.paidTo?.[d.id] > 0.005).map(t => {
    const v = R.rows[t.id].paidTo[d.id] / rate(cOf(d)), auto = t.type === 'income';
    return `<tr><td><bdi dir="ltr">${t.date}</bdi> · ${auto ? `💰 ${L('من دخل', 'from income')}: ${esc(t.note || t.cat || '')} ${t.done?.debt ? '✅' : `<small class="warn">${L('(لسه ما علّمتش إنك حوّلتها)', "(not ticked as sent yet)")}</small>`}` : `💳 ${L('سداد مباشر', 'direct payment')} ${esc(t.note || '')}`}</td><td dir="ltr">${r2(v)}</td></tr>`;
  }).join('');
  const lateRate = (c.rate + 0.5).toFixed(2);
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd card-x">
    <div class="wiz-top"><b>🔎 ${L(`${nm}: كل رقم جه منين`, `${nm}: where each number comes from`)}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    <h4>📄 ${L(`رصيد كشف ${cy.key}`, `Statement ${cy.key} balance`)} = <b dir="ltr">${r2(info.bal)} ${cu}</b></h4>
    ${info.real ? `<p class="note">${L('ده الرقم اللي إنت كتبته من كشف البنك ✅', 'This is the number you typed from the bank statement ✅')}</p><button type="button" class="pill" data-cxbal>✏️ ${L('عدّل رصيد الكشف', 'Edit the statement balance')}</button>` : `<table class="sw-t"><tr><td>${L('الباقي على الكارت دلوقتي', "What's left on the card now")}</td><td dir="ltr">${r2(info.left)}</td></tr>
      <tr><td>+ ${L('اللي اتدفع من يوم الكشف لحد النهارده', 'Paid since the statement until today')}</td><td dir="ltr">${r2(info.paidAll)}</td></tr>
      ${Math.abs(info.added) > 0.005 ? `<tr><td>− ${L('ربا / غرامات / تصحيحات اتضافت بعد الكشف', 'Riba / fees / corrections added after the statement')}</td><td dir="ltr">${r2(info.added)}</td></tr>` : ''}
      <tr class="ft"><td>= ${L('رصيد يوم الكشف (تقريبًا)', 'Balance on statement day (approx.)')}</td><td dir="ltr">${r2(info.bal)}</td></tr></table>
      <p class="note">⚠️ ${L('ده حساب البرنامج. الرقم الحقيقي مكتوب في كشف ENBD (Statement balance) — اكتبه هنا وكل الأرقام تتظبط عليه:', "This is the app's estimate. The real figure is on the ENBD statement (Statement balance) — type it here and everything follows it:")}</p>
      <button type="button" class="pill" data-cxbal>📄 ${L('اكتب رصيد الكشف الحقيقي', 'Type the real statement balance')}</button>`}
    <h4>✅ ${L('اتدفع من يوم الكشف', 'Paid since the statement')} = <b dir="ltr">${r2(info.paid)}</b></h4>
    ${pays ? `<table class="sw-t">${pays}</table>` : `<p class="note">${L('مفيش دفعات متسجلة للكارت من يوم الكشف.', 'No payments to the card logged since the statement.')}</p>`}
    <p class="note">💡 ${L('الدفعات اللي "من دخل" هي اللي البرنامج قالك تحوّلها لـENBD بعد كل دخل (من نصيب النمو)، وبيعتبرها اتدفعت. لو فيه دفعة لسه ما حوّلتهاش فعلًا، الرقم ده أكبر من اللي وصل البنك.', 'Payments "from income" are the ones the app told you to send to ENBD after each income (the Growth share), and it counts them as paid. If one hasn\'t really been sent yet, this number is higher than what reached the bank.')}</p>
    <h4>🎯 ${L('عشان ما يتحسبش ربا', 'To avoid riba')}: ${info.toFull <= 0.5 ? L('✅ اتدفع', '✅ Paid') : `<b dir="ltr">${r2(info.toFull)}</b>`}</h4>
    <p class="note">${L(`رصيد الكشف ${r2(info.bal)} − اللي اتدفع ${r2(info.paid)} = <b dir="ltr">${r2(info.toFull)}</b>. لو الرقم ده اتدفع كله لحد <bdi dir="ltr">${isoD(cy.due)}</bdi> → <b>صفر ربا</b> على الكشف ده.`, `Statement ${r2(info.bal)} − paid ${r2(info.paid)} = <b dir="ltr">${r2(info.toFull)}</b>. Pay it all by <bdi dir="ltr">${isoD(cy.due)}</bdi> → <b>zero riba</b> on this statement.`)}</p>
    <h4>⚠️ ${L('الحد الأدنى', 'Minimum due')}: ${info.minLeft <= 0.5 ? L('✅ اتدفع', '✅ Paid') : `${L('فاضل', 'left')} <b dir="ltr">${r2(info.minLeft)}</b>`}</h4>
    <p class="note">${L(`الحد الأدنى = الأكبر من ${c.minPct}% من رصيد الكشف (${r2(info.bal * c.minPct / 100)}) أو ${c.minAmt} درهم = <b dir="ltr">${r2(info.min)}</b>. اتدفع ${r2(info.paid)}، ${info.minLeft <= 0.5 ? `يعني <b>اتغطّى</b> (${r2(info.paid)} ≥ ${r2(info.min)}) فمفيش غرامة تأخير.` : `يعني فاضل ${r2(info.minLeft)} لازم يتدفع لحد <bdi dir="ltr">${isoD(cy.due)}</bdi>.`}`, `Minimum = the larger of ${c.minPct}% of the statement (${r2(info.bal * c.minPct / 100)}) or AED ${c.minAmt} = <b dir="ltr">${r2(info.min)}</b>. Paid ${r2(info.paid)}, ${info.minLeft <= 0.5 ? `so it's <b>covered</b> (${r2(info.paid)} ≥ ${r2(info.min)}) — no late fee.` : `so ${r2(info.minLeft)} must be paid by <bdi dir="ltr">${isoD(cy.due)}</bdi>.`}`)}</p>
    <div class="cx-warn"><b>❗ ${L('لو الحد الأدنى ما اتدفعش لحد الميعاد:', 'If the minimum is not paid by the due date:')}</b><ul>
      <li>${L(`غرامة تأخير <b>${fmt(c.lateFee, 2)} درهم</b> بتتضاف على الدين`, `A late fee of <b>AED ${fmt(c.lateFee, 2)}</b> is added to the debt`)}</li>
      <li>${L('الربا بيتحسب على الرصيد كله، مش على الباقي بس', 'Riba is charged on the whole balance, not just what is left')}</li>
      <li>${L(`لو اتأخرت مرتين في 6 شهور، النسبة بتزيد 0.5% (من ${c.rate}% لـ ${lateRate}% في الشهر)`, `If you are late twice in 6 months, the rate goes up 0.5% (from ${c.rate}% to ${lateRate}% a month)`)}</li>
      <li>${L('التأخير بيتسجّل في سجلك الائتماني (الاتحاد للمعلومات الائتمانية) وبيأثر على أي قرض أو كارت بعد كده', 'Late payments go on your credit record (Al Etihad Credit Bureau) and affect any future loan or card')}</li></ul></div>
    <h4>📈 ${L('الربا لو ما اتدفعش كله', 'Riba if not paid in full')}: <b dir="ltr">${info.toFull <= 0.5 ? '0' : '+' + r2(info.riba)}</b></h4>
    <p class="note">${L(`${c.rate}% × رصيد الكشف ${r2(info.bal)} = <b dir="ltr">${r2(info.riba)}</b> تقريبًا. البنك بيحسبه بالظبط على <b>متوسط الرصيد اليومي</b> من يوم كل عملية لحد ما تتسدّ، فكل ما تدفع بدري جوّه الشهر بيقلّ. ولو اتدفع الكشف كله لحد الميعاد = صفر.`, `${c.rate}% × statement ${r2(info.bal)} = about <b dir="ltr">${r2(info.riba)}</b>. The bank works it out exactly on the <b>average daily balance</b> from each transaction until it's paid, so paying earlier in the month lowers it. Pay the whole statement by the due date = zero.`)}</p>
  </div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); };
  o.addEventListener('click', e => {
    if (e.target === o || e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-cxbal]')) {
      const t = prompt(L(`رصيد كشف ${cy.key} في تطبيق ENBD (Statement balance) كام؟`, `What is the ${cy.key} statement balance in the ENBD app (Statement balance)?`)); if (t == null) return;
      const v = parseNum(t); if (!(v >= 0)) return toast(L('الرقم مش واضح', "That number isn't clear"));
      ((d.card ??= {}).bal ??= {})[cy.key] = +v.toFixed(2); save(); render(); close(); cardExplain(id); toast(L('📄 اتحفظ رصيد الكشف من البنك', '📄 Saved the statement balance from the bank'));
    }
  });
}
document.addEventListener('click', e => { if (e.target.closest('[data-cardsetup]')) return; const b = e.target.closest('[data-cardexplain]'); if (b) { e.stopPropagation(); cardExplain(b.dataset.cardexplain); } });

document.addEventListener('click', e => { const b = e.target.closest('[data-cardsetup]'); if (!b) return; UI.cardPick = b.dataset.cardsetup; if (atMenu) answer('cardSetup', L('💳 بيانات الكارت', '💳 Card details')); else toast(L('خلّص اللي قرش بيسأله الأول', 'Finish what Shark is asking first')); });

function ctx() {
  if (+S.salaryNat > 0 && S.job?.cur && S.job.cur !== 'AED') S.salary = +S.salaryNat * rate(S.job.cur); // مرتب بالجنيه مثلًا: قيمته بالدرهم ماشية مع السعر
  debts();
  const R = replay(S, rate); UI.R = R;
  const ym = periodOf(today(), paydayOf(S));
  const cyc = cycleInfo(S, ym), Ec = essCycle(S, rate, ym); // أساسيات الدورة دي (أول دورة: كل بند بالأيام أو كامل)
  const mo = R.months[ym] || { E: Ec, f: cyc.f, income: 0, gross: 0, sadaqa: 0, sadGiven: 0, essAlloc: 0, essSpent: 0, rewardSpent: 0, items: {}, mode: 'A', alloc: { growth: 0, stability: 0, reward: 0, debt: 0 } };
  const expI = expectedIncome(S, R, ym);
  const planned = mo.income <= 0;
  // الصدقة بتقف طول ما عليك دين (سداد الدين أولى من صدقة التطوّع)، وترجع لوحدها لما يخلص
  const sadFull = Math.min(100, Math.max(0, +S.sadaqa || 0)) / 100, sadPaused = R.debt > SAD_DEBT && sadFull > 0, sadPct = sadPaused ? 0 : sadFull, sal = +S.salary || 0;
  const planI = planned ? sal * (1 - sadPct) : mo.income;
  const En = essNextDays(S, rate, ym); // أول 10 أيام من الدورة الجاية (وقت الدين الأساسيات بتغطيهم كمان)
  return { R, ym, mo, cyc, Ec, En, expI, planned, planI, sadPct, sadFull, sadPaused, planGross: planned ? sal : mo.gross, planSad: planned ? sal * sadPct : mo.sadaqa, plan: routed(allocate(planI, Ec), R), exp: routed(allocate(expI, R.E), R) };
}
const snap = c => ({
  spare: spareList(c.R).filter(t => c.R.stabilityAED >= t.amt - 0.5).length,
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
     ['debt', r.debtPay, cOf(tx) !== 'AED' ? L(`حوّل ${money(r.debtPay * k, tx.cur)} لدرهم وادفعهم في ${esc(dName())}`, `Convert ${money(r.debtPay * k, tx.cur)} to AED and pay ${esc(dName())}`) : L(`حوّل ${money(r.debtPay * k, tx.cur)} لـ${esc(dName())}`, `Send ${money(r.debtPay * k, tx.cur)} to ${esc(dName())}`), '💳'],
     ['stab', r.d.stability, L(`حط ${money(r.d.stability * k, tx.cur)} في حساب الأمان`, `Put ${money(r.d.stability * k, tx.cur)} in your safety account`), '🛟'],
     ['inv', r.invest, L(`استثمر ${money(r.invest * k, tx.cur)}`, `Invest ${money(r.invest * k, tx.cur)}`), '📈'],
     ['joy', r.d.reward, L(`حط ${money(r.d.reward * k, tx.cur)} في حصّالة الفلوس الحرّة`, `Put ${money(r.d.reward * k, tx.cur)} in the fun jar`), '🎉'],
    ].forEach(([key, v, h, i]) => { if (v > 0.5 && !tx.done?.[key]) t.push({ i, h, s: src, done: `${tx.id}:${key}` }); });
  }
  // الزيادة اللي فوق الأساسيات وقت الدين راحت للكارت: حوّلها فعلًا
  if (mo.toCard > 0.5 && !(S.cardDone || {})[ym]) t.unshift({ i: '💳', h: L(`حوّل ${money(mo.toCard)} من فلوس الأساسيات لـ${esc(dName())}`, `Send ${money(mo.toCard)} from the Essentials money to ${esc(dName())}`), s: L('الأساسيات متغطية (الدورة دي + 10 أيام من الجاية)، فالزيادة بتروح لسداد الكارت.', 'Essentials are covered (this cycle + 10 days of the next), so the extra goes to paying the card.'), done: `card:${ym}` });
  const pulled = S.tx.filter(x => x.type === 'expense' && x.bucket === 'stability' && periodOf(x.date, paydayOf(S)) === ym)
    .reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0);
  if (pulled > 0) t.push({ i: '🤝', h: L(`وعد التعويض: رجّع ${money(pulled)} للأمان`, `Payback promise: return ${money(pulled)} to Safety`), s: L('سحبت من الأمان الشهر ده. رجّعهم من أول قبض جاي.', 'You took from Safety this month. Put it back from your next payday.') });
  for (const w of S.wait) {
    const days = Math.floor((Date.now() - new Date(w.date)) / 864e5);
    if (days >= 7) t.push({ i: '⏳', h: L(`عدّى 7 أيام على "${esc(w.name)}" — لسه عايزه؟`, `7 days have passed on "${esc(w.name)}" — still want it?`), s: L('لو آه اشتريه من الفلوس الحرّة، لو لأ امسحه من قايمة الانتظار.', 'If yes, buy it from Fun free money. If not, remove it from the waiting list.') });
  }
  if (R.rewardAED < -0.5) t.push({ i: '🫙', h: L('حصّالة الفلوس الحرّة فاضية', 'The fun jar is empty'), s: L(`عدّيت بـ ${fmt(-R.rewardAED)} درهم. استنى القبض الجاي ومتسحبش من بند تاني.`, `You overspent by ${fmt(-R.rewardAED)} AED. Wait for the next payday and don't pull from another bucket.`) });
  if (mo.essSpent > c.Ec + 0.5) t.push({ i: '🚨', h: L(`الأساسيات عدّت الميزانية بـ ${money(mo.essSpent - c.Ec)}`, `Essentials went over budget by ${money(mo.essSpent - c.Ec)}`), s: L('راجع البنود وشوف إيه اللي زاد.', 'Review the items and see what went up.') });
  const need = R.E * 2;
  if (c.expI < need - 0.5) t.push({ i: '🚀', h: L(`زوّد دخلك ${money(need - c.expI)} في الشهر`, `Raise your income by ${money(need - c.expI)} a month`), s: L(`عشان الأساسيات (${fmt(R.E)}) تبقى 50% من الدخل. المطلوب ${fmt(need)}.`, `So that Essentials (${fmt(R.E)}) become 50% of your income. You need ${fmt(need)}.`) });
  const nextSpare = spareList(R).find(x => R.stabilityAED < x.amt - 0.5);
  if (nextSpare && R.debt <= 0.5) t.push({ i: '🎯', h: L(`فاضل ${money(nextSpare.amt - R.stabilityAED)} على هدف الأمان "${esc(nextSpare.name)}"`, `${money(nextSpare.amt - R.stabilityAED)} left to reach the Safety target "${esc(nextSpare.name)}"`), s: L('ده هدف الأمان الجاي.', 'This is your next safety goal.') });
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
// 📱 على الموبايل الكروت مقفولة (العنوان بس)، ودوسة على العنوان تفتحها، والتطبيق بيفتكر اللي فتحته (سنيك 2026-11-21). الكمبيوتر مش بيتأثر (CSS جوّه max-width: 560px)
const OPEN = (() => { try { return new Set(JSON.parse(localStorage.getItem('floosy.open') || '["c-cta"]')); } catch { return new Set(['c-cta']); } })();
const card = (id, title, body, cls = '') => `<article class="card glass ${cls} ${OPEN.has(id) ? '' : 'fold'}" id="${id}"><h2 data-fold="${id}">${title}<i class="fold-chev" aria-hidden="true">⌄</i></h2>${body}</article>`;
document.addEventListener('click', e => {
  const h = e.target.closest('[data-fold]'); if (!h || !matchMedia('(max-width: 560px)').matches || e.target.closest('button,a,input,select,[contenteditable="true"]')) return;
  const id = h.dataset.fold, el = document.getElementById(id); if (!el) return;
  // فتح/قفل ناعم: الارتفاع بيتحرك من القديم للجديد في ربع ثانية (ومن غير حركة لو "تقليل الحركة" شغال)
  const h0 = el.offsetHeight, open = el.classList.contains('fold');
  if (open) { el.classList.remove('fold'); OPEN.add(id); } else OPEN.delete(id);
  try { localStorage.setItem('floosy.open', JSON.stringify([...OPEN])); } catch {}
  sfx.tap?.(); haptic();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (open) {
    if (!still) { const h1 = el.offsetHeight; el.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      [...el.children].slice(1).forEach((k, i) => k.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 40 + i * 25, easing: 'ease-out', fill: 'backwards' })); }
    setTimeout(() => el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }), still ? 0 : 120);
  } else if (still) el.classList.add('fold');
  else { const h1 = el.querySelector('h2').offsetHeight + 24; el.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }); setTimeout(() => { el.classList.add('fold'); el.getAnimations().forEach(x => x.cancel()); }, 230); }
});

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
      ? [`${L('الباقي', 'Remainder')} = ${fmt(I)} − ${fmt(E)} = ${fmt(left)}`, `${L('النمو', 'Growth')} = ${fmt(left)} × 0.50 = ${fmt(left * .5)}`, `${L('الأمان', 'Safety')} = ${fmt(left)} × 0.30 = ${fmt(left * .3)}`, `${L('الفلوس الحرّة', 'Fun free money')} = ${fmt(left)} × 0.20 = ${fmt(left * .2)}`]
      : [`${L('الأمان', 'Safety')} = ${fmt(I)} × 0.15 = ${fmt(I * .15)}`, `${L('الفلوس الحرّة', 'Fun free money')} = ${fmt(I)} × 0.10 = ${fmt(I * .1)}`, `${L('النمو', 'Growth')} = ${fmt(I)} × 0.25 + (${fmt(I * .5)} − ${fmt(E)}) = ${fmt(I * .25 + I * .5 - E)}`];
  const fx = mode === 'A' ? { essentials: L('كل الدخل', 'All income'), growth: '—', stability: '—', reward: '—' }
    : mode === 'B' ? { essentials: L('ثابتة', 'Fixed'), growth: `${fmt(left)} × 50%`, stability: `${fmt(left)} × 30%`, reward: `${fmt(left)} × 20%` }
      : { essentials: L('ثابتة', 'Fixed'), growth: `${fmt(I)} × 25% + ${fmt(I * .5 - E)} ${L('متوفّر', 'saved')}`, stability: `${fmt(I)} × 15%`, reward: `${fmt(I)} × 10%` };
  let why = mode === 'A' ? L('الدخل لسه مش مغطي الأساسيات، فكله رايح لها.', "Your income doesn't cover Essentials yet, so all of it goes there.")
    : mode === 'B' ? L(`الأساسيات ${fmt(E / I * 100)}% من الدخل، أكبر من النص. فالباقي بيتقسم بنفس نسبة 25 : 15 : 10.`, `Essentials are ${fmt(E / I * 100)}% of your income, more than half. So the remainder is split in the same 25 : 15 : 10 ratio.`)
      : L(`الأساسيات ${fmt(E / I * 100)}% من الدخل، يعني النص أو أقل. فالنسب الأصلية شغالة، واللي اتوفر راح للنمو.`, `Essentials are ${fmt(E / I * 100)}% of your income, so half or less. The original ratios apply, and what you saved went to Growth.`);
  if (R.debt > 0.5 && mode !== 'A') { // وقت الدين: الفلوس الحرّة 2.5% والأمان لحد شهر أساسيات والباقي كله للدين

    eq.splice(0, eq.length, `${L('الباقي', 'Remainder')} = ${fmt(I)} − ${fmt(E)} = ${fmt(left)}`, `${L('الفلوس الحرّة', 'Fun free money')} = ${fmt(I)} × 2.5% = ${fmt(v.reward)}`,
      `${L('الأمان', 'Safety')} = ${L('0 (نصيبه للدين)', '0 (its share goes to the debt)')}`, `${L('الدين', 'Debt')} = ${L('كل الباقي', 'everything else')} = ${fmt(v.debt + v.invest)}`);
    Object.assign(fx, { growth: L('كل الباقي ← الدين', 'Everything else → debt'), stability: L('صفر ← الدين', 'Zero → debt'), reward: `${fmt(I)} × 2.5%` });
    why = L(`💳 عليك دين: الأساسيات بتتغطى للدورة دي + 10 أيام من الجاية، الفلوس الحرّة 2.5% بس، الأمان صفر، وكل الباقي بيسدّ الدين.`,
      `💳 You have debt: Essentials get covered for this cycle + 10 days of the next, Fun free money gets only 2.5%, Safety gets nothing, and everything else pays off the debt.`);
  }
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
    ${v.debt > 0.5 ? `<p class="note">💳 ${L(`عندك دين، فمن نصيب النمو <b>${fmt(v.debt)}</b> رايحين لـ${esc(dName())}${v.invest > 0.5 ? ` و<b>${fmt(v.invest)}</b> استثمار` : ''}. فاضل عليه ${fmt(R.debt)}.`, `You have debt, so from the Growth share <b>${fmt(v.debt)}</b> goes to ${esc(dName())}${v.invest > 0.5 ? ` and <b>${fmt(v.invest)}</b> to investing` : ''}. ${fmt(R.debt)} still owed.`)}</p>` : ''}
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
    const share = e => tracked ? Math.max(0, (eVal(e) * f - (before.items[e.id] || 0)) / daysLeft) : 0;
    const budget = tracked ? Math.max(0, (R.E * f - before.paid) / daysLeft) : 0;
    const name = D.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' });
    return { mode, label: off === 0 ? `${L('النهارده', 'Today')} · ${name}` : off === -1 ? `${L('إمبارح', 'Yesterday')} · ${name}` : off === 1 ? `${L('بكرة', 'Tomorrow')} · ${name}` : name, budget, ...day, share,
      bT: off === 0 ? L('🎯 أقصى حاجة تصرفها النهارده', '🎯 The most you can spend today') : L('🎯 أقصى مصروف لليوم ده', '🎯 Max spend for this day'), pT: L('اتصرف في اليوم ده', 'Spent on this day'),
      note: tracked ? L(`الحسبة: (ميزانية الدورة <b dir="ltr">${fmt(R.E * f)}</b> − اللي اتصرف قبل اليوم ده <b dir="ltr">${fmt(before.paid)}</b>) ÷ <b>${plural(daysLeft, 'يوم', 'يومين', 'أيام', 'يوم')}</b> فاضلين لحد ${dayName(endOf(k))}.`, `The math: (cycle budget <b dir="ltr">${fmt(R.E * f)}</b> − spent before this day <b dir="ltr">${fmt(before.paid)}</b>) ÷ <b>${EN_N(daysLeft, 'day')}</b> left until ${dayName(endOf(k))}.`) : L('اليوم ده قبل ما تبدأ تسجّل، فمفيش ميزانية ليه.', 'This day is before you started logging, so it has no budget.') };
  }
  if (mode === 'year') {
    const Y = t0.getFullYear() + off, ks = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`).filter(k => k >= first && k <= c.ym);
    const F = ks.reduce((a, k) => a + fOf(k), 0), y = sum(ess.filter(x => periodOf(x.date, pd).startsWith(Y + '-')));
    return { mode, label: L(`سنة ${Y}`, `Year ${Y}`), budget: R.E * F, ...y, share: e => eVal(e) * F, bT: L('📦 ميزانية السنة لحد دلوقتي', "📦 Year's budget so far"), pT: L('اتدفع في السنة', 'Paid this year'),
      note: ks.length ? L(`محسوبة على <b>${plural(ks.length, 'دورة', 'دورتين', 'دورات', 'دورة')}</b> من أول ما بدأت تسجّل لحد الدورة الحالية. متوسط اللي بيتدفع في الدورة: <b dir="ltr">${fmt(y.paid / ks.length)}</b>.`, `Based on <b>${EN_N(ks.length, 'cycle')}</b>, from when you started logging up to the current cycle. Average paid per cycle: <b dir="ltr">${fmt(y.paid / ks.length)}</b>.`) : L('مفيش دورات متسجلة في السنة دي.', 'No cycles logged in this year.') };
  }
  const k = shift(c.ym, off), f = fOf(k), mth = sum(ess.filter(x => periodOf(x.date, pd) === k)), budget = R.E * f;
  const daysLeft = k === c.ym ? Math.max(1, Math.round((endOf(k) - t0) / 864e5)) : 0, left = budget - mth.paid;
  return { mode, label: `${off === 0 ? L('الشهر ده', 'This month') + ' · ' : ''}${periodLabel(k)}`, budget, ...mth, share: e => itemFor(S, e, k) * rate(cOf(e)) * f, bT: L('📦 ميزانية الشهر', "📦 Month's budget"), pT: L('اتدفع لحد دلوقتي', 'Paid so far'),
    note: f === 0 ? L('الشهر ده قبل ما تبدأ تسجّل.', 'This month is before you started logging.') : daysLeft ? `${L(`فاضل <b>${plural(daysLeft, 'يوم', 'يومين', 'أيام', 'يوم')}</b> لآخر الشهر`, `<b>${EN_N(daysLeft, 'day')}</b> left until the end of the month`)} (${dayName(endOf(k))}). ${left > 0.5 ? L(`يعني تقدر تصرف لحد <b dir="ltr">${fmt(left / daysLeft)} Đ</b> في اليوم.`, `So you can spend up to <b dir="ltr">${fmt(left / daysLeft)} Đ</b> a day.`) : L('الميزانية خلصت، أي مصروف دلوقتي زيادة.', 'The budget is used up; anything you spend now is over.')}${f < 1 ? L(` الميزانية محسوبة على ${plural(cycleInfo(S, k).left, 'يوم', 'يومين', 'أيام', 'يوم')} بس عشان دي أول دورة.`, ` The budget is counted for only ${EN_N(cycleInfo(S, k).left, 'day')} because this is the first cycle.`) : ''}` : L('شهر خلص.', 'Month ended.') };
}
$('#cards').addEventListener('click', e => {
  const b = e.target.closest('[data-ev],[data-en]'); if (!b) return;
  if (b.dataset.ev) UI.exp = { mode: b.dataset.ev, off: 0 };
  else { const n = +b.dataset.en, max = UI.exp.mode === 'day' ? 31 : 0; UI.exp.off = n === 0 ? 0 : Math.min(max, UI.exp.off + n); }
  sfx.tap(); render();
});
function countryBanner(cv) {
  const others = places().filter(x => x !== cv);
  return card('c-country', `${CUR[cv].f} ${L(`إنت شايف ${PLACE_N[cv]} (${CUR[cv].n}) بس`, `You're viewing ${PLACE_N[cv]} (${CUR[cv].n}) only`)}`, `
    <p class="note">${L(`هنا حاجات ال${CUR[cv].n} بس: أساسياتها، محفظتها، ديونها ودخلها. بس الحساب نفسه على كله مع بعض (إنت شخص واحد): كل دخلك قصاد أساسيات البلدين، ونصيب النمو كله بيسدّ الدين الأول. عشان تشوف البلدين مع بعض دوس "الكل".`, `Only ${CUR[cv].n} things here: its essentials, wallet, debts and income. The math itself is done on everything together (you're one person): all your income against both countries' essentials, and the whole Growth share pays the debt first. Tap "All" to see both together.`)}</p>
    <div class="chips-c"><button class="pill" data-cview="ALL">🌍 ${L('الكل', 'All')}</button>${others.map(x => `<button class="pill" data-cview="${x}">${CUR[x].f} ${PLACE_N[x]}</button>`).join('')}<button class="pill" data-act="transfer">🔁 ${L('حوّل بين المحافظ', 'Transfer between wallets')}</button></div>`, 'wide');
}

// 🆕 أول دورة (بدأت في نصها): كل بند بيتحسب بالأيام اللي فاضلة ولا كامل؟ (طلب صاحب الحساب، 2026-11-20)
function firstCycleHTML(c) {
  const cyc = c.cyc, ym = c.ym, own = S.since && periodOf(S.since, paydayOf(S)) === ym;
  if (!(cyc?.since && cyc.f < 1) && !own) return '';
  const [yy, mm] = ym.split('-').map(Number), pd = paydayOf(S), dd = d => `${d.getDate()}/${d.getMonth() + 1}`;
  const cs = new Date(yy, mm - 1, pd), ce = new Date(yy, mm, pd - 1), from = new Date((cyc.since || iso(cs)) + 'T00:00:00');
  const rows = S.essentials.map(e => {
    const full = itemFor(S, e, ym) * rate(cOf(e)), pre = prepaid(e, ym), eff = pre ? 0 : full * (e.full1 ? 1 : cyc.f);
    return `<li class="row fc1"><span class="grow"><b>${e.icon || '•'} ${esc(e.name)}</b><small>${pre ? L('مدفوع مقدّم = 0', 'Prepaid = 0') : e.full1 ? L(`كامل: ${fmt(full)}`, `In full: ${fmt(full)}`) : L(`بالأيام: ${fmt(full)} × ${cyc.left}/${cyc.days} = ${fmt(eff)}`, `By days: ${fmt(full)} × ${cyc.left}/${cyc.days} = ${fmt(eff)}`)}</small></span>
      ${pre ? '' : `<span class="seg"><button class="pill ${e.full1 ? '' : 'on'}" data-full1="${e.id}" data-v="0">📆 ${L('بالأيام', 'By days')}</button><button class="pill ${e.full1 ? 'on' : ''}" data-full1="${e.id}" data-v="1">💯 ${L('كامل', 'In full')}</button></span>`}</li>`;
  }).join('');
  return `<details class="fc-box" ${UI.fcBox ? 'open' : ''}><summary><b>🆕 ${L('أول دورة ليك', 'Your first cycle')}</b><span class="fc-sum">${L(`<b dir="ltr">${dd(from)} → ${dd(ce)}</b> · <b>${cyc.left}</b> يوم من ${cyc.days} · أساسيات <b dir="ltr">${fmt(c.Ec)}</b>`, `<b dir="ltr">${dd(from)} → ${dd(ce)}</b> · <b>${cyc.left}</b> of ${cyc.days} days · essentials <b dir="ltr">${fmt(c.Ec)}</b>`)}</span><i class="fc-chev">⌄</i></summary>
    <div class="fc-dates">
      <span>💰 ${L('دورة القبض', 'Pay cycle')}: <b dir="ltr">${dd(cs)} → ${dd(ce)}</b> <small>(${L(`القبض يوم ${pd}، ${cyc.days} يوم`, `payday on the ${pd}th, ${cyc.days} days`)})</small></span>
      <label>📍 ${L('بدأت من', 'Started on')} <input type="date" data-since value="${cyc.since || iso(cs)}" min="${iso(cs)}" max="${iso(ce)}"></label>
      <button type="button" class="pill" data-since-today>📅 ${L('من النهارده', 'From today')}</button>
      <span class="fc-days">${L(`من <b dir="ltr">${dd(from)}</b> لحد <b dir="ltr">${dd(ce)}</b> = <b>${cyc.left}</b> يوم من <b>${cyc.days}</b>`, `From <b dir="ltr">${dd(from)}</b> to <b dir="ltr">${dd(ce)}</b> = <b>${cyc.left}</b> of <b>${cyc.days}</b> days`)}</span>
    </div>
    <p class="note">${L('كل بند بيتحسب بالأيام اللي فاضلة، إلا لو بتدفعه كامل (زي إيجار الشهر كله).', 'Each item counts by the days left, unless you pay it in full (like a whole month of rent).')}</p>
    <details class="fc-items" ${UI.fcOpen ? 'open' : ''}><summary>${L(`📋 البنود: <b>${S.essentials.filter(e => !prepaid(e, ym) && !e.full1).length}</b> بالأيام · <b>${S.essentials.filter(e => !prepaid(e, ym) && e.full1).length}</b> كامل — دوس تغيّر`, `📋 Items: <b>${S.essentials.filter(e => !prepaid(e, ym) && !e.full1).length}</b> by days · <b>${S.essentials.filter(e => !prepaid(e, ym) && e.full1).length}</b> in full — tap to change`)}</summary><ul class="list">${rows}</ul></details>
    <div class="sumline"><span>${L('أساسيات الدورة دي', "This cycle's essentials")}</span><b dir="ltr">${fmt(c.Ec)}</b><small>${L('من الدورة الجاية كله كامل', 'From next cycle everything counts in full')}</small></div></details>`;
}
function cardEssentials(c) {
  const { R, planI } = c, E = R.E, V = expView(c);
  const ymE = periodOf(today(), paydayOf(S)), sitE = sitOn(S, today());
  const essCurs = [...new Set(S.essentials.map(e => cOf(e)))], essF = essCurs.includes(UI.essF) ? UI.essF : '';
  const MODE_T = e => e.where ? (e.whereMode === 'both' ? `👫 ${L('حسب إنت ومراتك فين', 'by you + wife')}` : `📍 ${L('حسب إنت فين', 'by where you are')}`) : `📌 ${L('ثابت', 'fixed')}`;
  const rows = S.essentials.filter(e => !essF || cOf(e) === essF).map(e => {
    const cu = cOf(e), k = 1 / rate(cu); // الصرف والميزانية بعملة البند نفسه
    const sp = (V.items[e.id] || 0) * k, bud = V.share(e) * k, month = itemFor(S, e, ymE), nowAmt = amtAt(e, sitE);
    return `<li class="row ess" data-row="essentials:${e.id}">${grip}
      <button type="button" class="ess-open" data-eedit="${e.id}" aria-label="${L('عدّل', 'Edit')} ${esc(e.name)}">
        <span class="eico">${e.icon || '🧾'}</span>
        <span class="grow"><b class="en">${esc(e.name)}</b>
          <span class="etags"><span class="etag">${CUR[cu].f} ${PLACE_N[cu] || CUR[cu].n}</span><span class="etag">${MODE_T(e)}</span>${e.paidTo && e.paidTo >= ymE ? `<span class="etag paid">✅ ${L('مدفوع لحد', 'paid up to')} ${monthName(new Date(+e.paidTo.slice(0, 4), +e.paidTo.slice(5, 7) - 1, 1))}</span>` : ''}</span>
          ${bar(sp / (bud || 1), sp > bud + 0.5 ? '#f87171' : B.essentials.c)}
          <small>${L(`اتصرف ${fmt(sp)} من ${fmt(bud, V.mode === 'day' ? 2 : 0)}`, `Spent ${fmt(sp)} of ${fmt(bud, V.mode === 'day' ? 2 : 0)}`)}${sp > bud + 0.5 ? ` · <b style="color:#f87171">${L(`زيادة ${fmt(sp - bud)}`, `${fmt(sp - bud)} over`)}</b>` : ''}</small></span>
        <span class="eamt"><b dir="ltr">${fmt(month)}</b><small><span dir="ltr">${CUR[cu].s}</span> · ${L('الشهر ده', 'this month')}</small>${e.where && !(e.paidTo && e.paidTo >= ymE) && Math.abs(nowAmt - month) > 0.5 ? `<small>${L('دلوقتي', 'now')} ${fmt(nowAmt)}/${L('شهر', 'mo')}</small>` : ''}</span>
        <span class="echev" aria-hidden="true">${L('‹', '›')}</span>
      </button><button type="button" class="pill dly ${e.daily ? 'on' : ''}" data-daily="${e.id}" title="${L('ينفع يتقسم على الأيام (لو ما صرفتش يوم، الباقي يزيد على الأيام الجاية)', 'Can be spread over the days (skip a day and the rest grows for the coming days)')}">📆 ${L('يومي', 'Daily')}</button>${del(`essentials:${e.id}`)}</li>`;
  }).join('');
  const left = V.budget - V.paid, over = left < -0.5;
  const tile = (col, t, v) => `<div class="bk" style="--c:${col}"><span>${t}</span><b dir="ltr">${fmt(v)} <small>Đ</small></b></div>`;
  const viewHead = `
    <div class="switch exp-sw">${[['day', L('يوم', 'Day')], ['month', L('شهر', 'Month')], ['year', L('سنة', 'Year')]].map(([k, n]) => `<button class="${V.mode === k ? 'on' : ''}" data-ev="${k}">${n}</button>`).join('')}</div>
    <div class="exp-nav"><button data-en="-1" aria-label="${L('اللي قبله', 'Previous')}">›</button><b>${V.label}</b><button data-en="1" aria-label="${L('اللي بعده', 'Next')}" ${UI.exp.off >= (V.mode === 'day' ? 31 : 0) ? 'disabled' : ''}>‹</button>${UI.exp.off ? `<button class="pill" data-en="0">${V.mode === 'day' ? L('النهارده', 'Today') : V.mode === 'month' ? L('الشهر ده', 'This month') : L('السنة دي', 'This year')}</button>` : ''}</div>
    <div class="buckets">${tile('#fbbf24', V.bT, V.budget)}${tile('#F4EDE0', V.pT, V.paid)}${tile(over ? '#f87171' : '#34d399', over ? L('🚨 زيادة عن الميزانية', '🚨 Over budget') : L('✅ فاضل', '✅ Left'), Math.abs(left))}</div>
    ${bar(V.budget ? V.paid / V.budget : 0, over ? '#f87171' : B.essentials.c)}
    <p class="note">${V.note}</p>`;
  const pct = planI ? E / planI : 0;
  return card('c-ess', L('🍞 الأساسيات <small>(اللي بيأكّلك مش اللي بيفشخرك)</small>', '🍞 Essentials <small>(what feeds you, not what shows off)</small>'), `
    ${whereHTML()}
    ${firstCycleHTML(c)}
    ${viewHead}
    ${essCurs.length > 1 ? `<div class="switch ess-f">${[['', L('🌍 الكل', '🌍 All')], ...essCurs.map(cu => [cu, `${CUR[cu].f} ${PLACE_N[cu] || CUR[cu].n}`])].map(([k, n]) => `<button class="${essF === k ? 'on' : ''}" data-essf="${k}">${n}${k ? ` <small dir="ltr">${fmt(S.essentials.filter(e => cOf(e) === k).reduce((a, e) => a + itemFor(S, e, c.ym), 0))} ${CUR[k].s}</small>` : ''}</button>`).join('')}</div>` : ''}
    <ul class="list" data-list="essentials">${rows}</ul>
    <button class="add" data-add="essentials">${L('＋ بند جديد (خطوة بخطوة)', '＋ New item (step by step)')}</button>
    <div class="sumline"><span>${L('إجمالي الشهر الكامل', 'Full month total')}</span><b dir="ltr">${fmt(E)}</b><span class="tag ${pct > .5 ? 'bad' : 'good'}">${fmt(pct * 100)}% ${L('من الدخل', 'of income')}</span></div>
    ${c.cyc.since ? `<div class="kv"><span>📆 ${L(`نصيب أول دورة (${plural(c.cyc.left, 'يوم', 'يومين', 'أيام', 'يوم')} من ${c.cyc.days})`, `First cycle share (${EN_N(c.cyc.left, 'day')} of ${c.cyc.days})`)}</span><b dir="ltr">${fmt(c.Ec)}</b></div>` : ''}
    <div class="kv"><span>${L('أقل دخل يخلّيها 50%', 'Lowest income that makes them 50%')}</span><b dir="ltr">${fmt(E * 2)}</b> <small>= ${fmt(E)} × 2</small></div>
`);
}

/** الديون جوّه كارت المحافظ: كل دين نوعه واسمه والباقي عليه، وبتتسد بترتيب القايمة */
function cardDebts(R) {
  const cv = cardView(), ds = debts().filter(d => cv === 'ALL' || cOf(d) === cv); // في عرض دولة: ديونها هي بس
  const rows = ds.map(d => {
    const r = { left: dLeft(R, d), paid: dPaid(R, d) }, done = r.left <= 0.5, cu = cOf(d);
    return `<li class="row ${done ? 'ok' : ''}" data-row="debts:${d.id}">${grip}
      <button class="pill" data-dkind="${d.id}" title="${L('غيّر النوع', 'Change type')}">${DKIND[d.kind] || '🧾'} ${DKIND_N[d.kind] || DKIND_N.other}</button>
      <div class="grow">${ed(`debts:${d.id}:name`, d.name)} <button class="pill" data-dcur="${d.id}" title="${L('عملة الدين (دولته)', "The debt's currency (country)")}">${CUR[cu].f} ${CUR[cu].s}</button>
        <small>${done ? L('✅ خلص', '✅ Paid off') : `${L('الباقي', 'Left')} ${ed(`debts:${d.id}:left`, r.left, { n: true })} ${CUR[cu].n}`}${r.paid > 0.5 ? ` · ${L('اتسدّد', 'paid')} ${fmt(r.paid)}` : ''}</small></div>
      <button class="pill" data-debtview="${d.id}">📜 ${L('الحركات', 'Activity')}</button>
      ${done ? '' : `<button class="pill" data-payoff="${d.id}">${L('✅ خلّصته', '✅ Paid it off')}</button>`}${del(`debts:${d.id}`)}</li>`;
  }).join('');
  return `<h3>${L('💳 الديون', '💳 Debts')} <small>${L('بتتسد بالترتيب من نصيب النمو · اسحب ⠿ عشان تغيّر مين الأول · دوس على الرقم تعدّله', 'Paid in order from the Growth share · drag ⠿ to change which goes first · tap a number to edit it')}</small></h3>
    ${rows ? `<ul class="list" data-list="debts">${rows}</ul>` : `<p class="note">${L('مفيش ديون ✅', 'No debt ✅')}</p>`}
    <button class="add" data-add="debts">${L('＋ دين جديد (كارت، قرض، سلفة)', '＋ New debt (card, loan, personal)')}</button>`;
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
    <div class="scroll"><table class="tbl"><thead><tr><th>${L('العملة', 'Currency')}</th><th>📈 ${L('نمو', 'Growth')}</th><th>🛟 ${L('أمان', 'Safety')}</th><th>🎉 ${L('فلوس حرّة', 'Fun free money')}</th><th>${L('الإجمالي', 'Total')}</th><th>🤲 ${L('صدقة', 'Sadaqa')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>${L('أصول معاك', 'Assets you hold')}</h3>
    <ul class="list" data-list="holdings">${holds}</ul>
    <button class="add" data-add="holdings">${L('＋ أصل (دهب أو عملة)', '＋ Asset (gold or currency)')}</button>
    <div class="sumline"><span>${L('الإجمالي', 'Total')}</span><b dir="ltr">${fmt(total)}</b><small>${L('درهم', 'AED')} ≈ ${fmt(total / rate('EGP'))} ${L('جنيه', 'EGP')} ≈ ${fmt(total / rate('USD'))} ${L('دولار', 'USD')}</small></div>
    ${cardDebts(R)}
    <div class="sumline"><span>${L('الصافي', 'Net')}</span><b dir="ltr" class="${total + ess - R.debt < -0.5 ? 'neg' : ''}">${fmt(total + ess - R.debt)}</b></div>
    <div class="chips-c"><span class="chipc good">+ ${fmt(total)} ${L('في المحافظ', 'in wallets')}</span>${ess > 0.5 ? `<span class="chipc warn">+ ${fmt(ess)} ${L('فاضل من الأساسيات', 'left from Essentials')}</span>` : ''}${R.debt > 0.5 ? `<button type="button" class="chipc bad" data-debtview>− ${fmt(R.debt)} ${L('دين', 'debt')} ›</button>` : ''}</div>
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
    // الشهور التلاتة: من أول شهر بدأت فيه (لو لسه ما عدّاش 3 شهور)، وإلا آخر 3 لحد الشهر ده
    const nx = k => { let [y, mm] = k.split('-').map(Number); if (++mm > 12) { mm = 1; y++; } return `${y}-${String(mm).padStart(2, '0')}`; };
    const win = keys.length >= 3 ? [prev(prev(ym)), prev(ym), ym] : [first, nx(first), nx(nx(first))];
    const last = win.map(k => ({ label: label(k), income: inc(k), ok: inc(k) >= need - 0.5, cur: k === ym, none: k < first, soon: k > ym }));
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
      : locked ? `<small>${L('دخل الشهر ده', 'Income this month')} <b dir="ltr">${fmt(now)}</b> ${L('من', 'of')} <b dir="ltr">${fmt(need)}</b> (<b dir="ltr">${fmt(Math.min(100, now / (need || 1) * 100))}%</b>)${now >= need - 0.5 ? ' ✅' : ` · ${L('ناقص', 'short by')} <b dir="ltr">${fmt(need - now)}</b>`}</small>
          <small>${L('🔒 مقفول لحد ما تعدّي المستوى اللي قبله، بس الدخل بيتحسب له من دلوقتي', '🔒 Locked until you pass the level before it, but your income already counts towards it')}</small>`
        : `<small>${L('دخل الشهر ده لحد دلوقتي', 'Income this month so far')} <b dir="ltr">${fmt(now)}</b> ${L('من', 'of')} <b dir="ltr">${fmt(need)}</b> (<b dir="ltr">${fmt(Math.min(100, now / (need || 1) * 100))}%</b>)${now < need - 0.5 ? ` · ${L('ناقص', 'short by')} <b dir="ltr">${fmt(need - now)}</b>` : ' ✅'}</small>
          <div class="chips-c">${last.map(x => `<span class="chipc ${x.none || x.soon ? '' : x.ok ? 'good' : x.cur ? 'warn' : 'bad'}">${x.label}: ${x.soon ? L('⏳ جاي', '⏳ upcoming') : x.none ? '—' : `<b dir="ltr">${fmt(x.income)}</b> ${x.ok ? '✅' : x.cur ? '⏳' : '✗'}`}</span>`).join('')}</div>
          <small>${L('السلسلة:', 'Streak:')} <b>${L(`${run} من 3`, `${run} of 3`)}</b> ${L('شهور ورا بعض', 'months in a row')} ${'🟢'.repeat(run)}${'⚪'.repeat(3 - run)}</small>`;
    return `<li class="row lvl ${passed ? 'ok' : ''} ${locked ? 'locked' : ''}" data-row="life:${t.id}">${grip}<span class="badge">${passed ? '✅' : locked ? '🔒' : i + 1}</span>
      <div class="grow">${ed(`life:${t.id}:name`, t.name)}${bar(passed ? 1 : now / (need || 1), passed ? '#34d399' : locked ? '#949FB8' : B.essentials.c)}
        <small>${head}</small>${body}</div>${del(`life:${t.id}`)}</li>`;
  }).join('');
  const cur = rows[level];
  return card('c-life', `🎮 ${L('مستوى المعيشة', 'Living level')} <span class="tag good">${L(`المستوى ${level} من ${S.life.length}`, `Level ${level} of ${S.life.length}`)}</span>`, `
    <p class="note">${L(`دخل الشهر = <b>المرتب + أي دخل جانبي</b> (بعد الصدقة). المستوى بيتعدّى لما الدخل ده يبقى ضعف مصاريف المستوى <b>3 شهور ورا بعض</b>، وساعتها بننقل للي بعده.${cur ? ` إنت دلوقتي شغال على: <b>${esc(cur.t.name)}</b>.` : ' 🏆 عدّيت كل المستويات.'}`, `Monthly income = <b>salary + any side income</b> (after Sadaqa). You pass a level when that income is double the level's expenses for <b>3 months in a row</b>, then we move on to the next one.${cur ? ` Right now you're working on: <b>${esc(cur.t.name)}</b>.` : ' 🏆 You passed every level.'}`)}</p>
    <ul class="list" data-list="life">${html}</ul><button class="add" data-add="life">${L('＋ مستوى جديد', '＋ New level')}</button>`);
}

const CC = { AED: '#5571AC', EGP: '#fb923c', USD: '#4ade80', EUR: '#F4EDE0', SAR: '#a3e635', XAU: '#f5c542' };
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
// أهداف الأمان أوتوماتيك (طلب صاحب الحساب، 2026-11-20): شهر أساسيات البلدين، و5 شهور × أغلى وضع. بتتحدث مع أي تغيير في البنود
const SIT_N = () => ({ 'AED+AED': L('إنت ومراتك في الإمارات', 'you and your wife in the UAE'), 'AED+EGP': L('إنت في الإمارات ومراتك في مصر', 'you in the UAE, your wife in Egypt'), 'EGP+EGP': L('إنت ومراتك في مصر', 'you and your wife in Egypt') });
const spareList = R => [
  { id: 'm5', name: L(`${SAFE_MONTHS} شهور في أسوأ حالة`, `${SAFE_MONTHS} months, worst case`), amt: R.lastSpare, how: L(`${SAFE_MONTHS} × ${fmt(R.worst.amount)} (أغلى وضع: ${SIT_N()[R.worst.sit]}، بكل البنود كاملة)`, `${SAFE_MONTHS} × ${fmt(R.worst.amount)} (most expensive: ${SIT_N()[R.worst.sit]}, every item in full)`) },
];
/** تاريخ متوقع لكل محطة أمان: بنمشّي الشهور الجاية بنفس القواعد (المرتب المتوقع + متوسط الدخل الجانبي، والدين بيتسد الأول) */
function spareDates(c) {
  const { R } = c, pd = paydayOf(S), pi = payInfo(c), n0 = new Date(), out = new Map();
  const cycles = Math.max(1, Object.keys(R.months).length);
  const sideAvg = sideAverage(S, R, c.ym, rate); // صفر لحد 4 دورات بيانات
  let debt = R.debt, stab = R.stabilityAED, P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next);
  const goals = [...new Set(spareList(R).map(t => t.amt))].filter(a => stab < a - 0.5).sort((a, b) => a - b);
  for (let i = 0; i < 480 && goals.length; i++) {
    const I = salaryFor(P).amount * (1 - (debt > SAD_DEBT ? 0 : c.sadFull)); // المرتب بس (الدخل الجانبي مش مضمون)
    const a = splitIncome({ net: I, need: R.E, E: R.E, debtOn: debt > 0.5, stab, starter: R.starter, cap: R.lastSpare });
    debt -= Math.min(a.growth, debt); stab += a.stability;
    while (goals.length && stab >= goals[0] - 0.5) out.set(goals.shift(), new Date(P));
    P = new Date(P.getFullYear(), P.getMonth() + 1, pd);
  }
  return { at: amt => out.get(amt) || null, sideAvg, salary: pi.none ? 0 : +S.salary || 0 };
}
function cardSpare(c) {
  const { R } = c, have = R.stabilityAED, pace = stabilityPace(c), parts = inside('stability', R), sd = spareDates(c);
  const rows = spareList(R).map((t, i) => {
    const amt = t.amt, ok = have >= amt - 0.5, rem = Math.max(0, amt - have), pct = amt ? Math.min(1, have / amt) : 0;
    const dt = ok ? null : sd.at(amt), n = dt ? Math.max(1, (dt.getFullYear() - new Date().getFullYear()) * 12 + dt.getMonth() - new Date().getMonth()) : Infinity;
    const when = ok ? L('وصلت ✅', 'Reached ✅') : dt ? `📅 ${L('المتوقع', 'Expected')} <b>${monthName(dt)}</b> (${eta(n)})` : L(`📅 بالمرتب المتوقع (${fmt(sd.salary)} في الشهر) مفيش حاجة بتفضل للأمان. لازم الدخل يعدّي الأساسيات (${fmt(R.E)}) عشان يبان تاريخ.`, `📅 With the expected salary (${fmt(sd.salary)} a month) nothing is left over for Safety. Income has to exceed Essentials (${fmt(R.E)}) before a date can show.`);
    return `<li class="row lvl ${ok ? 'ok' : ''} tapme" data-safeview role="button" tabindex="0" title="${L('دوس تشوف اتحسب إزاي', 'Tap to see how it is calculated')}"><span class="badge">${ok ? '✅' : i + 1}</span>
      <div class="grow"><b>${t.name}</b>${bar(pct, B.stability.c)}
        <small><b dir="ltr">${fmt(pct * 100, 1)}%</b> · ${L('معاك', 'you have')} ${fmt(Math.min(have, amt))} ${L('من', 'of')} <b dir="ltr">${fmt(amt)}</b> · ${ok ? L('خلصت', 'done') : L(`فاضل <b dir="ltr">${fmt(rem)}</b>`, `<b dir="ltr">${fmt(rem)}</b> left`)}</small>
        <small>${when}</small>
        <small>${L('الهدف', 'Target')} = ${t.how}</small><small class="tapnote">🧮 ${L('دوس تشوف الحسبة بند بند ›', 'Tap to see the math item by item ›')}</small></div></li>`;
  }).join('');
  const mix = parts.length ? `
    <h3>${L('جوّه الأمان فيه إيه', "What's inside Safety")}</h3>
    <div class="stack">${parts.map(x => `<i style="flex:${Math.max(x.aed, 0.0001)};background:${x.c}" title="${x.n}"></i>`).join('')}</div>
    <ul class="how">${parts.map(x => `<li><span><i class="dot" style="background:${x.c}"></i>${x.n} <small>${x.native}</small></span><b dir="ltr">${fmt(x.aed)} ${L('د', 'AED')} · ${fmt(have ? x.aed / have * 100 : 0, 1)}%</b></li>`).join('')}</ul>` : '';
  return card('c-spare', L('🛟 أهداف الأمان <small>(أوتوماتيك)</small>', '🛟 Safety targets <small>(automatic)</small>'), `
    <div class="kv"><span>${L('معاك في الأمان', 'You have in Safety')}</span><b dir="ltr">${fmt(have)}</b> <small>${L('درهم', 'AED')}</small> <button class="pill" data-why="stability">${L('ⓘ جاي منين', 'ⓘ Where from')}</button></div>
    <p class="note">${L(`📅 التواريخ محسوبة على الشهور الجاية بنفس القواعد: ${sd.salary ? `المرتب بس <b dir="ltr">${fmt(sd.salary)}</b>` : 'من غير مرتب'} (الدخل الجانبي مش مضمون فمش محسوب، وأي دخل جانبي يقرّب التاريخ)، والدين بيتسد الأول. ${pace.hist ? `في سجلّك الأمان زاد حوالي <b dir="ltr">${fmt(pace.v)}</b> في الشهر.` : ''} بتتحدث مع كل معاملة.`, `📅 Dates are worked out over the coming months using the same rules: ${sd.salary ? `salary only <b dir="ltr">${fmt(sd.salary)}</b>` : 'no salary'} (side income isn't guaranteed so it's not counted; any side income brings the date closer), and the debt gets paid off first. ${pace.hist ? `In your history, Safety grew by about <b dir="ltr">${fmt(pace.v)}</b> a month.` : ''} Updates with every transaction.`)}</p>
    ${mix}
    <h3>${L('الأهداف', 'Targets')}</h3>
    <ul class="list">${rows}</ul>
    <p class="note">${L(`💳 وعليك دين: الأمان ما بياخدش حاجة، ونصيبه كله بيروح للدين (الأساسيات ماسكة الدورة دي + 10 أيام).<br>✅ من غير دين: بياخد نصيبه لحد الـ${SAFE_MONTHS} شهور، وبعدها نصيبه بيروح للاستثمار 📈.<br>🔄 الأهداف بتتحسب لوحدها، وبتتغير أول ما تغيّر أي بند في الأساسيات.`, `💳 While in debt: Safety takes nothing, and its whole share goes to the debt (Essentials already hold this cycle + 10 days).<br>✅ Without debt: it takes its share up to ${SAFE_MONTHS} months, then its share goes to investing 📈.<br>🔄 The targets are calculated automatically and change as soon as you change any essentials item.`)}</p>`);
}

/** القبضات الجاية ونصيب الفلوس الحرّة من كل واحد (المرتب المتوقع + متوسط الدخل الجانبي، بنفس القواعد) */
/** القبضات الجاية بالقواعد الحقيقية (splitIncome): المرتب بس (الدخل الجانبي مش مضمون)، الدين بيتسد الأول،
 *  ووقت الدين الفلوس الحرّة 2.5% بس، وبعد ما يخلص نسب الفيديو. كل قبض: { t, gross, sad, ess, add, debtPay, debtAfter } */
function rewardPath(c, n = 120) {
  const pd = paydayOf(S), pi = payInfo(c), n0 = new Date(), out = [], R = c.R;
  let P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next), debt = R.debt, stab = R.stabilityAED;
  for (let i = 0; i < n; i++) {
    const gross = pi.none ? 0 : salaryFor(P).amount, sad = debt > SAD_DEBT ? 0 : gross * c.sadFull, net = gross - sad;
    const sp = splitIncome({ net, need: R.E, E: R.E, debtOn: debt > 0.5, stab, starter: R.starter, cap: R.lastSpare });
    const debtPay = Math.min(sp.growth, debt); debt -= debtPay; stab += sp.stability;
    out.push({ t: new Date(P), gross, sad, ess: sp.essentials, add: sp.reward, debtPay, debtAfter: debt, debtOn: debt + debtPay > 0.5 });
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
  return card('c-fun', L('🎉 الخروج والسفر <small>(حصّالة الفلوس الحرّة)</small>', '🎉 Outings & travel <small>(Fun free money jar)</small>'), `
    <div class="kv"><span>${L('في الحصّالة دلوقتي', 'In the jar now')}</span><b dir="ltr">${fmt(R.rewardAED)}</b> <small>${L(`درهم · صرفت الشهر ده ${fmt(mo.rewardSpent)}`, `AED · spent this month: ${fmt(mo.rewardSpent)}`)}</small></div>
    <div class="big-num" style="--c:${B.reward.c}"><small>${L(`أقصى مبلغ تصرفه في آخر الربع (${qName})`, `The most you can spend at the end of the quarter (${qName})`)}</small><b dir="ltr">${fmt(proj)}</b></div>
    <ul class="how"><li><span>${L('معاك في الحصّالة دلوقتي', 'You have in the jar now')}</span><b dir="ltr">${fmt(jar)}</b></li>
      <li><span>${qPays.length ? L(`لسه جاي ${plural(qPays.length, 'قبض واحد', 'قبضين', 'قبضات', 'قبض')} قبل آخر الربع (${qPays.map(x => `${dayName(x.t)}: ${fmt(x.add)}`).join(' · ')})`, `${EN_N(qPays.length, 'payday')} still to come before the quarter ends (${qPays.map(x => `${dayName(x.t)}: ${fmt(x.add)}`).join(' · ')})`) : L('مفيش قبض تاني قبل آخر الربع', 'No more paydays before the quarter ends')}</span><b dir="ltr">+ ${fmt(qAdd)}</b></li>
      <li class="sum"><span>${L('يبقى أقصى حاجة تصرفها', 'So the most you can spend is')}</span><b dir="ltr">${fmt(proj)}</b></li></ul>
    <details class="fun-why"><summary>🧮 ${L('القبضات الجاية بتزوّد الحصّالة كام؟', 'How much will the coming paydays add to the jar?')}</summary>
      <p class="note">${L(`محسوبة على <b>المرتب بس</b> (الدخل الجانبي مش مضمون فمش داخل). طول ما عليك دين، الفلوس الحرّة <b>2.5%</b> من المرتب والباقي بعد الأساسيات للدين. أول ما الدين يخلص، النسبة بترجع لنسب الفيديو.`, `Based on <b>salary only</b> (side income isn't guaranteed, so it's left out). While you have debt, free money is <b>2.5%</b> of the salary and the rest after Essentials goes to the debt. Once the debt is gone, it goes back to the video's ratios.`)}</p>
      <table class="sw-t"><tr class="hd"><td>${L('القبض', 'Payday')}</td><td>${L('المرتب', 'Salary')}</td><td>🎉</td><td>💳 ${L('الدين بعده', 'Debt after')}</td></tr>
      ${path.slice(0, 8).map(x => `<tr><td>${dayName(x.t)}</td><td dir="ltr">${fmt(x.gross)}</td><td dir="ltr">+${fmt(x.add)}${x.debtOn ? ' <small class="mu">(2.5%)</small>' : ''}</td><td dir="ltr">${fmt(x.debtAfter)}</td></tr>`).join('')}</table>
      ${(() => { const dz = path.find(x => x.debtOn && x.debtAfter <= 0.5); return dz ? `<p class="note">💳 ${L(`الدين متوقع يخلص <b>${full(dz.t)}</b>، وبعدها الحصّالة بتاخد أكتر بكتير.`, `The debt is expected to be gone by <b>${full(dz.t)}</b>, and after that the jar gets a lot more.`)}</p>` : ''; })()}
    </details>
    <ul class="list" data-list="fun">${rows}</ul><button class="add" data-add="fun">${L('＋ هدف خروج', '＋ New outing goal')}</button>
    ${waits ? `<h3>${L('⏳ قايمة الـ 7 أيام', '⏳ 7-day list')}</h3><ul class="list">${waits}</ul>` : ''}`);
}

/* ───────────── الأهداف الكبيرة ───────────── */
/** نقطة البداية لحسابات goals.js: نفس افتراضات تواريخ محطات الأمان (spareDates) */
function goalBase(c) {
  const { R } = c, pi = payInfo(c), n0 = new Date(), pd = paydayOf(S);
  const cycles = Math.max(1, Object.keys(R.months).length);
  const sideAvg = sideAverage(S, R, c.ym, rate); // صفر لحد 4 دورات بيانات
  const P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next);
  const past = Object.keys(R.months).filter(k => k < c.ym && R.months[k].income > 0).sort();
  const hist = past.length >= AVG_MIN ? past.slice(-3).map(k => R.months[k].income) : []; // أقل من 4 شهور بيانات: مفيش تاريخ نعتمد عليه، المرتب بس
  // اتجاه الدخل: آخر 3 شهور قدّام الـ3 اللي قبلهم، محدود بين 0 و2% في الشهر عشان التوقع ما يبقاش أحلام
  let trend = 0;
  if (past.length >= 6) {
    const avg = ks => ks.reduce((a, k) => a + R.months[k].income, 0) / ks.length;
    const a = avg(past.slice(-6, -3)), b = avg(past.slice(-3));
    if (a > 0) trend = Math.min(0.02, Math.max(0, Math.pow(b / a, 1 / 3) - 1));
  }
  return { start: new Date(P.getFullYear(), P.getMonth(), 1), gross: (pi.none ? 0 : +S.salary || 0) + sideAvg, sadPct: c.sadPct, sadFull: c.sadFull, E: R.E, debt: R.debt, stab: R.stabilityAED, growth: R.growthAED, lastSpare: R.lastSpare, starter: R.starter, hist, trend, sideAvg };
}
const GTYPE = { get buy() { return L('🛒 شراء', '🛒 Purchase'); }, get monthly() { return L('🔁 التزام شهري', '🔁 Monthly'); }, get term() { return L('⏱️ التزام لمدة', '⏱️ Fixed term'); } };
const gSum = g => g.type === 'buy'
  ? (g.pay === 'inst' && g.inst > 0 ? L(`مقدّم ${fmt(g.down || 0)} + ${fmt(g.inst)} × ${g.n} شهر`, `${fmt(g.down || 0)} down + ${fmt(g.inst)} × ${g.n} months`) : L(`كاش ${fmt(g.price)}`, `Cash ${fmt(g.price)}`))
  : `${fmt(g.monthly)} ${L('في الشهر', 'a month')}${g.type === 'term' ? L(` × ${g.n} شهر`, ` × ${g.n} months`) : ''}${g.replace ? L(` (بدل ${fmt(g.replace)})`, ` (replacing ${fmt(g.replace)})`) : ''}`;
function cardGoals(c) {
  const list = S.goals || [];
  const p = list.length ? plan(goalBase(c), list) : { res: [] }, base = goalBase(c);
  const rows = p.res.map(({ g, s }, i) => {
    const dt = s == null ? null : new Date(base.start.getFullYear(), base.start.getMonth() + s, 1);
    const when = dt ? `📅 ${L('المتوقع', 'Expected')} <b>${monthName(dt)}</b> (${s === 0 ? L('دلوقتي', 'now') : eta(s)})` : L('📅 بالدخل المتوقع مش هيحصل في 10 سنين. محتاج دخل أكتر أو هدف أصغر.', '📅 With the expected income it will not happen within 10 years. It needs more income or a smaller goal.');
    return `<li class="row lvl ${s === 0 ? 'ok' : ''}" data-row="goals:${g.id}">${grip}<span class="badge">${i + 1}</span>
      <div class="grow">${ed(`goals:${g.id}:name`, g.name)} <small>${GTYPE[g.type] || ''}</small>
        <small>${gSum(g)}</small><small>${when}</small>
        ${g.verdict ? `<small>🧠 ${esc(g.verdict)}</small>` : ''}</div>${del(`goals:${g.id}`)}</li>`;
  }).join('');
  return card('c-goals', L('🧠 الأهداف الكبيرة <small>(بالترتيب)</small>', '🧠 Big goals <small>(in order)</small>'), `
    <p class="note">${L('عربية، شقة، كورس… كل هدف بيبدأ بعد اللي قبله، وفلوسه محسوبة على اللي بعده. اسحب ⠿ عشان تغيّر الترتيب والتواريخ تتحسب تاني.', 'Car, apartment, course… each goal starts after the one before it, and its money is counted against the next. Drag ⠿ to reorder and the dates are worked out again.')}</p>
    ${rows ? `<ul class="list" data-list="goals">${rows}</ul>` : `<p class="note">${L('لسه مفيش أهداف كبيرة.', 'No big goals yet.')}</p>`}
    <button class="add" data-act="goal">${L('＋ هدف كبير جديد (والمجلس يقرر)', '＋ New big goal (the council decides)')}</button>`);
}

function cardSadaqa(c) {
  const { R, mo } = c;
  const given = S.tx.filter(x => x.type === 'expense' && x.bucket === 'sadaqa').reduce((a, x) => a + x.amount * (x.rate || rate(x.cur)), 0);
  return card('c-sad', L('🤲 الصدقة', '🤲 Sadaqa'), `
    <div class="kv"><span>${L('النسبة من أي دخل', 'Share of any income')}</span>${ed('S::sadaqa', +S.sadaqa || 0, { n: true, d: 2 })} <small>${L('% · بتطلع الأول، وبعدها الباقي يتوزع عادي', '% · comes out first, then the rest is split as usual')}</small></div>
    ${c.sadPaused ? `<p class="note">⏸️ ${L(`<b>واقفة دلوقتي لأن عليك دين (${fmt(R.debt)} Đ).</b> سداد الدين أولى من صدقة التطوّع، فمفيش صدقة بتطلع من الدخل لحد ما الدين يخلص، وبعدها ترجع ${fmt(c.sadFull * 100, 2)}% لوحدها.`, `<b>Paused right now because you have debt (${fmt(R.debt)} Đ).</b> Paying a debt comes before voluntary charity, so no sadaqa comes out of income until the debt is paid; then it goes back to ${fmt(c.sadFull * 100, 2)}% by itself.`)}</p>` : ''}
    <div class="buckets">
      <div class="bk" style="--c:#94A5CA"><span>${L('متخصصة ومستنية تطلع', 'Set aside, waiting to be given')}</span><b dir="ltr">${fmt(Math.max(0, R.sadaqaAED))} <small>Đ</small></b></div>
      <div class="bk" style="--c:#34d399"><span>${L('طلّعتها لحد دلوقتي', 'Given so far')}</span><b dir="ltr">${fmt(given)} <small>Đ</small></b></div>
    </div>
    <p class="note">${L(`الدورة دي: اتخصص ${fmt(mo.sadaqa)} وطلع ${fmt(mo.sadGiven)}. لما تطلّعها علّم عليها في "اعمل إيه دلوقتي"، أو سجّلها من "صرفت" ← "صدقة".`, `This cycle: ${fmt(mo.sadaqa)} set aside and ${fmt(mo.sadGiven)} given. When you give it, tick it off in "What to do now", or log it from "Spent" → "Sadaqa".`)}</p>
    <p class="note">${L('📚 صدقة التطوع ملهاش نسبة محددة في الشرع، ومتروكة لحالك وقدرتك. الـ 2.5% هنا نقطة بداية على قد نسبة الزكاة، وتقدر تغيّرها. فلوس الصدقة المتخصصة مش محسوبة في "اللي معاك". والزكاة حاجة تانية (فرض على المدخرات) ومش محسوبة هنا.', `📚 Voluntary sadaqa has no fixed rate in Islamic law; it's left to your situation and means. The 2.5% here is a starting point matching the zakat rate, and you can change it. Money set aside for Sadaqa isn't counted in "What you have". Zakat is a separate thing (an obligation on savings) and isn't calculated here.`)}</p>`);
}
/** خطة الاستثمار من الكتاب: إمتى وفي إيه ومتوقع كام (invest.js) */
function investPlan(c) {
  const base = goalBase(c), list = S.goals || [];
  const fixed = list.length ? plan(base, list).fixed : [], mix = mixFor(S.risk);
  return { base, fixed, mix, p: project(base, fixed, mix) };
}
/** الأصول اللي في النمو (مش الأمان): قيمتها دلوقتي وكسبها عن اللي اتدفع فيها */
const growthHolds = () => S.holdings.filter(h => !h.spare && +h.amount > 0).map(h => {
  const val = holdingValue(h, rate), cost = (+h.cost || 0) * rate(homeOf(h));
  return { h, val, cost, gain: cost > 0 ? val - cost : null };
});
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
  const { mix, p } = investPlan(c), m = p.monthly, at5 = p.at(60), at10 = p.at(120);
  const planBox = m > 0.5 ? `<h3>${L(`🧭 الخطة من الكتاب: ${mix.n}`, `🧭 The plan from the book: ${mix.n}`)}</h3>
    <ul class="alloc">${mix.parts.map(([k, pct]) => `<li><span>${ASSETS[k].i} ${ASSETS[k].n} · ${pct}%</span><b dir="ltr">${fmt(m * pct / 100)}</b></li>`).join('')}</ul>
    <p class="note">${L(`كل شهر حوالي <b>${fmt(m)}</b> درهم يوم القبض، أوتوماتيك ومن غير توقيت سوق.`, `About <b>${fmt(m)}</b> AED every month on payday, automatic, no market timing.`)}</p>
    <div class="buckets">
      <div class="bk" style="--c:#6981B5"><span>${L('بعد 5 سنين حطيت', 'In 5 years you put in')}</span><b dir="ltr">${fmt(at5.put)}</b></div>
      <div class="bk" style="--c:#199e70"><span>${L('ومتوقع تبقى', 'Expected to be')}</span><b dir="ltr">${fmt(at5.mid)}</b><small dir="ltr">${fmt(at5.low)} – ${fmt(at5.high)}</small></div>
      <div class="bk" style="--c:#c98500"><span>${L('بعد 10 سنين', 'In 10 years')}</span><b dir="ltr">${fmt(at10.mid)}</b><small>${L(`من ${fmt(at10.put)} حطيتهم`, `from ${fmt(at10.put)} put in`)}</small></div>
    </div>`
    : `<p class="note">${L('🧭 لسه مفيش مبلغ شهري للاستثمار في الـ10 سنين الجايين بالدخل ده. الأول: الدين يخلص والدخل يعدّي الأساسيات.', '🧭 No monthly amount to invest within the next 10 years at this income yet. First: debt gone and income above essentials.')}</p>`;
  const gh = growthHolds();
  const holds = gh.length ? `<h3>${L('💼 استثماراتك', '💼 Your investments')}</h3><ul class="alloc">${gh.map(({ h, val, cost, gain }) => `<li><span>${KINDS[h.kind]?.i || (h.cur === 'XAU' ? '🥇' : '💼')} ${esc(h.name)}${gain != null ? ` <small class="${gain < 0 ? 'neg' : 'pos'}" dir="ltr">${gain >= 0 ? '+' : '−'}${fmt(Math.abs(gain))} (${fmt(gain / cost * 100, 1)}%)</small>` : ''}</span><b dir="ltr">${fmt(val)}</b></li>`).join('')}</ul>
    <p class="note">${L('القيمة بتتعدّل من كارت المحافظ (دوس على الرقم). الصناديق اكتب قيمتها الحالية، والدهب بالجرامات وسعره لايف.', 'Update a value from the Wallets card (tap the number). For funds type the current value; gold is in grams with a live price.')}</p>` : '';
  return card('c-inv', L('📈 الاستثمار (بند النمو)', '📈 Investing (Growth bucket)'), `${head}
    <div class="chips-c"><button class="pill" data-act="invest">🧭 ${L('أستثمر في إيه؟', 'What should I invest in?')}</button><button class="pill" data-act="invested">💼 ${L('سجّلت استثمار', 'I invested')}</button></div>
    ${planBox}${holds}
    <h3>${L('سلّم المخاطرة من الفيديو', 'The risk ladder from the video')}</h3>
    <input type="range" min="1" max="${RISK.length}" step="1" value="${S.risk}" id="risk" aria-label="${L('مستوى المخاطرة', 'Risk level')}">
    <div class="risk-scale"><span>${L('أهدى', 'Calmer')}</span><span>${L('أخطر', 'Riskier')}</span></div>
    <div id="riskBox"></div>
    <ol class="steps">${VIDEO.growth.map(([h, t]) => `<li><b>${h}</b><small>${t}</small></li>`).join('')}</ol>
    <p class="note">${L('⚠️ ده تلخيص كلام الفيديو وحسبة بافتراضات (أسهم 7% وسندات 3.5% في السنة على المدى الطويل)، مش وعد ولا نصيحة استثمار شخصية. السوق ممكن ينزل 30-50% في سنة. أنا مش مستشار مالي مرخّص، والقرار قرارك.', "⚠️ This summarises the video and uses assumptions (stocks 7% and bonds 3.5% a year over the long run). It's not a promise or personal investment advice. Markets can drop 30-50% in a year. I'm not a licensed financial advisor, and the decision is yours.")}</p>`);
}
const riskHTML = () => {
  const r = RISK[S.risk - 1];
  return `<div class="risk"><span class="ri">${r.i}</span><div><b>${S.risk}. ${r.n}</b><small>${r.t}</small></div></div>`;
};

function cardRules() {
  const sec = (k, label) => `<details data-k="v-${k}" ${UI.open.has('v-' + k) ? 'open' : ''}><summary>${B[k].i} ${label}</summary>
    <ol class="steps">${VIDEO[k].map(([h, t]) => `<li><b>${h}</b><small>${t}</small></li>`).join('')}</ol></details>`;
  return card('c-rules', L('📜 Mark Tilbury 1% Rule', '📜 Mark Tilbury 1% Rule'), `<div class="chips-c"><button type="button" class="pill" data-cated="income">🏷️ ${L('عدّل تصنيفات الدخل', 'Edit income categories')}</button><button type="button" class="pill" data-cated="reward">🏷️ ${L('عدّل تصنيفات الفلوس الحرّة', 'Edit free money categories')}</button></div>` + sec('stability', L('الأمان 15%', 'Safety 15%')) + sec('essentials', L('الأساسيات 50%', 'Essentials 50%')) + sec('reward', L('الفلوس الحرّة 10%', 'Fun free money 10%')));
}

function cardTx(c) {
  const { R } = c;
  const rows = S.tx.slice().reverse().slice(0, 30).map(tx => {
    const r = R.rows[tx.id] || {}, inc = tx.type === 'income';
    if (tx.type === 'transfer') return `<li class="row tx"><span class="badge">🔁</span>
      <div class="grow">${ed(`tx:${tx.id}:note`, tx.note || L('تحويل', 'Transfer'))}<small>${tx.date} · ${B[tx.bucket]?.i ?? ''} ${B[tx.bucket]?.n ?? ''} · ${CUR[cOf(tx)].f} → ${CUR[tx.to]?.f ?? tx.to}</small></div>
      <span class="amt"><b dir="ltr">${fmt(tx.amount, 2)} ${CUR[cOf(tx)].s} → ${fmt(tx.toAmount, 2)} ${CUR[tx.to]?.s ?? ''}</b></span>${del(`tx:${tx.id}`)}</li>`;
    if (tx.type === 'debtadj') return `<li class="row tx ${tx.dir === -1 ? '' : 'out'}"><span class="badge">💳</span>
      <div class="grow">${ed(`tx:${tx.id}:note`, tx.note || ({ interest: L('📈 ربا', '📈 Riba (interest)'), fee: L('⚠️ غرامة', '⚠️ Fee'), correction: L('✏️ تصحيح', '✏️ Correction') }[tx.why] || L('✏️ تعديل', '✏️ Adjustment')))}<small>${tx.date} · ${esc(debts().find(d => d.id === tx.debt)?.name || L('الدين', 'Debt'))} · ${tx.dir === -1 ? L('قلّل الدين', 'lowered the debt') : L('زوّد الدين', 'raised the debt')}</small></div>
      <span class="amt"><b dir="ltr">${tx.dir === -1 ? '−' : '+'}${fmt(tx.amount, 2)} ${CUR[cOf(tx)].s}</b></span>${del(`tx:${tx.id}`)}</li>`;
    if (tx.type === 'debtpay') return `<li class="row tx out"><span class="badge">💳</span>
      <div class="grow">${ed(`tx:${tx.id}:note`, tx.note || L('سداد دين', 'Debt payment'))}<small>${tx.date} · ${B[tx.bucket]?.i ?? ''} ${B[tx.bucket]?.n ?? ''} → 💳</small></div>
      <span class="amt"><b dir="ltr">−${fmt(tx.amount, 2)} ${CUR[cOf(tx)].s}</b></span>${del(`tx:${tx.id}`)}</li>`;
    if (tx.type === 'invest' || tx.type === 'divest') return `<li class="row tx"><span class="badge">💼</span>
      <div class="grow">${ed(`tx:${tx.id}:note`, tx.note || L('استثمار', 'Investment'))}<small>${tx.date} · ${tx.type === 'invest' ? L('📈 من النمو لأصل (استثمار مش مصروف)', '📈 Growth → asset (investing, not spending)') : L('💵 من أصل للنمو', '💵 Asset → Growth')}</small></div>
      <span class="amt"><b dir="ltr">${tx.type === 'invest' ? '→' : '←'} ${fmt(tx.amount, 2)} ${CUR[cOf(tx)].s}</b></span>${del(`tx:${tx.id}`)}</li>`;
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
  // بنفس قواعد المحرّك (splitIncome): وقت الدين الأساسيات بتغطي الدورة + 10 أيام، ومحسوب اللي معاك أو اللي هيترحّل (2026-11-21)
  const sal = sf.amount, debtOn = c.R.debt > 0.5, net = sal * (1 - c.sadPct);
  const carry = Math.max(0, c.mo.essAlloc - Math.max(c.mo.essSpent, c.Ec)); // نفس ترحيل المحرّك للدورة الجاية
  const need = due ? (debtOn ? c.Ec + c.En : c.Ec) - c.mo.essAlloc : (debtOn ? c.R.E + c.En : c.R.E) - carry;
  const sp = splitIncome({ net, need, inc: due ? c.mo.income : 0, E: due ? c.Ec : c.R.E, debtOn, stab: c.R.stabilityAED, starter: c.R.starter, cap: c.R.lastSpare });
  const debt = Math.min(sp.growth, c.R.debt);
  const prev = { sadaqa: sal * c.sadPct, essentials: sp.essentials, debt, invest: sp.growth - debt, stability: sp.stability, reward: sp.reward };
  return { got, due, next, days, prev, sf, amount: sal };
}
function cardPay(c) {
  const pi = payInfo(c), p = pi.prev;
  if (pi.none) return card('c-pay', L('📅 القبض الجاي', '📅 Next payday'), `<p class="note">${L('مفيش مرتب متسجل دلوقتي، فكل الحسابات ماشية على الدخل اللي بتسجّله بإيدك (بيزنس، فريلانس، وغيره).', 'No salary is logged right now, so all the math runs on the income you log by hand (business, freelance, and so on).')}</p>
    <button class="btn primary" data-act="pay">${L('🏢 سجّل شغل ومرتب', '🏢 Add a job and salary')}</button>`);
  const when = pi.due ? (pi.days === 0 ? L('النهارده يوم القبض 🎉', 'Today is payday 🎉') : L(`عدّى من ${plural(-pi.days, 'يوم', 'يومين', 'أيام', 'يوم')} ولسه ما اتسجلش`, `${EN_N(-pi.days, 'day')} overdue and not logged yet`)) : L(`بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, `In ${EN_N(pi.days, 'day')}`);
  const parts = [[L('🤲 صدقة', '🤲 Sadaqa'), p.sadaqa], [L('🍞 أساسيات', '🍞 Essentials'), p.essentials], [`💳 ${esc(dName())}`, p.debt], [L('📈 استثمار', '📈 Investing'), p.invest], [L('🛟 أمان', '🛟 Safety'), p.stability], [L('🎉 فلوس حرّة', '🎉 Fun free money'), p.reward]].filter(([, v]) => v > 0.5);
  // حسبة لحد يوم القبض: مصاريف باقية، معاك كام ليها، وبعد المرتب هتبقى فين
  const { R, mo } = c, gross = v => v / (1 - c.sadPct || 1);
  // المصاريف الباقية بتتحسب بالأيام: نصيب اليوم × الأيام اللي فاضلة في الدورة (ومش أكتر من اللي لسه ما اتدفعش)
  const [cy, cm] = c.ym.split('-').map(Number), pd0 = paydayOf(S), nw = new Date();
  const cStart = new Date(cy, cm - 1, pd0), cEnd = new Date(cy, cm, pd0), cDays = Math.round((cEnd - cStart) / 864e5);
  const left = Math.min(cDays, Math.max(0, Math.round((cEnd - new Date(nw.getFullYear(), nw.getMonth(), nw.getDate())) / 864e5)));
  // كل بند بالدرهم بقيمته في الدورة دي (المكان، والمدفوع مقدّم = 0)؛ البند "💯 كامل" في أول دورة مش بيتقسم بالأيام
  // (قبل كده كان بيجمع بنود الجنيه كأنها درهم، فطلع 7,100 بدل 1,075 — اتصلّح 2026-11-20)
  // الباقي من ميزانية الدورة = ميزانية الدورة − اللي اتصرف (نفس رقم "فاضل" في كارت الأساسيات، ونفس حسبة المحرّك).
  // قبل كده كان بيحسب الشهر الكامل × الأيام الفاضلة، فطلع 1,027 والكارت بيقول 626 (اتصلّح 2026-11-21)
  const rest = Math.max(0, c.Ec - mo.essSpent);
  const have = Math.max(0, mo.essAlloc - mo.essSpent), gapNow = Math.max(0, rest - have);
  const after = pi.due ? have + p.essentials : p.essentials, needAfter = pi.due ? rest : R.E, gapAfter = Math.max(0, needAfter - after);
  // فترتين ورا بعض: من النهارده ليوم القبض، وبعدها الدورة اللي المرتب بيغطيها
  const pday = dayName(cEnd), nEnd = dayName(new Date(cEnd.getFullYear(), cEnd.getMonth() + 1, pd0));
  const salNet = pi.amount * (1 - c.sadPct), bal = after - needAfter;
  // اللي فاضل من الخطوة 1 (احتياطي الـ10 أيام من الدورة الجاية اللي اتحجز وقت الدين) بيدخل الشهر الجديد، مش بيضيع (طلب صاحب الحساب، 2026-11-21)
  const carry = Math.max(0, have - rest), net2 = salNet + carry - R.E;
  const row = (l, v, cls = '') => `<li class="${cls}"><span>${l}</span><b dir="ltr">${v}</b></li>`;
  const step = (n, title, sub, rows, ok, res, big, hint) => `<div class="fc ${ok ? 'ok' : 'bad'}">
      <div class="fc-h"><i>${n}</i><div><b>${title}</b><small>${sub}</small></div></div>
      <ul>${rows.join('')}</ul>
      <div class="fc-r"><span>${res}</span><b dir="ltr">${big}</b>${hint ? `<small>${hint}</small>` : ''}</div></div>`;
  const s1 = step(1, L(`من النهارده لحد ${pday}`, `From today until ${pday}`), L(plural(left, 'يوم', 'يومين', 'أيام', 'يوم'), EN_N(left, 'day')),
    [row(L('🍞 مصاريفك في الأيام دي', '🍞 Your expenses for these days'), `${fmt(rest)} Đ`), row(`<small>${L(`ميزانية الدورة ${fmt(c.Ec)} − اتصرف ${fmt(mo.essSpent)}`, `Cycle budget ${fmt(c.Ec)} − spent ${fmt(mo.essSpent)}`)}</small>`, '', 'sub'), row(L('👛 معاك ليها دلوقتي', '👛 You have for them now'), `− ${fmt(have)} Đ`)],
    gapNow <= 0.5, gapNow > 0.5 ? L('لازم تجمّع على الأقل', 'You need to gather at least') : L('مصاريفك متغطية ✅', 'Your expenses are covered ✅'), gapNow > 0.5 ? `${fmt(gapNow)} Đ` : `+${fmt(have - rest)} Đ`,
    gapNow > 0.5 && c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(gapNow))} Đ قبل الصدقة`, `That means ${fmt(gross(gapNow))} Đ of income before sadaqa`) : '');
  const s2 = pi.due
    ? step(2, L('بعد ما تسجّل المرتب', 'After you log the salary'), L(`لحد ${pday}`, `Until ${pday}`),
      [row(L('💰 المرتب بعد الصدقة', '💰 Salary after sadaqa'), `${fmt(salNet)} Đ`), row(L('👛 + اللي معاك للأساسيات', '👛 + What you have for essentials'), `${fmt(have)} Đ`), row(L('🍞 مصاريف باقي الدورة', '🍞 Expenses for the rest of the cycle'), `− ${fmt(rest)} Đ`)],
      bal >= -0.5, bal >= -0.5 ? L('هيفضل معاك', "You'll have left") : L('لسه محتاج', 'You still need'), `${fmt(Math.abs(bal))} Đ`, bal < -0.5 && c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(-bal))} Đ قبل الصدقة`, `That means ${fmt(gross(-bal))} Đ of income before sadaqa`) : '')
    : step(2, L(`من ${pday} لحد ${nEnd}`, `From ${pday} until ${nEnd}`), L('الشهر الجديد بعد المرتب', 'The new month after the salary'),
      [row(L(`💰 المرتب${pi.sf.full ? '' : ' (أول مرتب، مش كامل)'}`, `💰 Salary${pi.sf.full ? '' : ' (first salary, partial)'}`), `${fmt(pi.amount)} Đ`), ...(p.sadaqa > 0.5 ? [row(L('🤲 الصدقة', '🤲 Sadaqa'), `− ${fmt(p.sadaqa)} Đ`)] : []), ...(carry > 0.5 ? [row(L('👛 + الفاضل من الخطوة 1 (محجوز لأول أيام الشهر)', '👛 + Left from step 1 (set aside for the first days)'), `+ ${fmt(carry)} Đ`)] : []), row(L('🍞 مصاريف الشهر', "🍞 The month's expenses"), `− ${fmt(R.E)} Đ`)],
      net2 >= -0.5, net2 >= -0.5 ? L('هيفضل معاك', "You'll have left") : L('لسه محتاج للشهر الجديد', 'For the new month you still need'), `${fmt(Math.abs(net2))} Đ`,
      net2 < -0.5 ? (c.sadPct > 0 ? L(`يعني دخل ${fmt(gross(-net2))} Đ قبل الصدقة`, `That means ${fmt(gross(-net2))} Đ of income before sadaqa`) : '')
        : R.debt > 0.5 ? (net2 >= c.En - 0.5 ? L(`منهم ${fmt(c.En)} محجوزين لأول 10 أيام من الدورة اللي بعدها، والباقي ${fmt(net2 - c.En)} للدين والفلوس الحرّة`, `${fmt(c.En)} of it is set aside for the first 10 days of the cycle after, and the other ${fmt(net2 - c.En)} goes to the debt and fun money`)
          : L(`وعليك دين، فدول بيتحجزوا لأول 10 أيام من الدورة اللي بعدها (محتاجة ${fmt(c.En)}، ناقص ${fmt(c.En - net2)})، فمفيش حاجة رايحة للدين من المرتب ده`, `You have debt, so this is set aside for the first 10 days of the cycle after (needs ${fmt(c.En)}, ${fmt(c.En - net2)} short), so nothing from this salary goes to the debt`))
        : L('ده اللي بيتوزع على النمو والأمان والفلوس الحرّة', 'This is what gets split across Growth, Safety and Fun free money'));
  const forecast = `<h3>${L('🧮 حسبتك لحد يوم القبض وبعده', '🧮 Your math until payday and after')}</h3><div class="fcs">${s1}<span class="fc-arrow">↓</span>${s2}</div>`;
  return card('c-pay', L('📅 القبض الجاي', '📅 Next payday'), `
    <div class="big-num" style="--c:${pi.due ? '#fbbf24' : '#94A5CA'}"><small>${when}</small><b>${dayName(pi.next)}</b><small>${L(`ده مرتب شغل شهر ${workMonth(pi.next)}، بينزل في جيبك يوم ${paydayOf(S)}`, `This is the salary for your work in ${workMonth(pi.next)}; it reaches you on day ${paydayOf(S)}`)}</small>
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
  const jc = cOf(S.job || {});
  try { await flowIncome('salary', { amount: jc === 'AED' ? pi.amount : Math.round(pi.amount / rate(jc) * 100) / 100, cur: jc }, { date: iso(pi.next), auto: true }); } finally { autoPay.busy = false; }
}

/* ───────────── وضع العرض: الكل / عملة واحدة ───────────── */
const inBucket = (h, k) => k === 'stability' ? !!h.spare : k === 'growth' ? !h.spare : false;
/** اللي في البند k بالعملة cu: n بالعملة نفسها و aed قيمته بالدرهم */
function held(k, cu, R, essLeft = 0) {
  const hs = S.holdings.filter(h => h.cur === cu && inBucket(h, k));
  const hn = hs.reduce((a, h) => a + (+h.amount || 0), 0), ha = hs.reduce((a, h) => a + holdingValue(h, rate), 0);
  if (cu === 'XAU') return { n: hn, aed: ha };
  const w = k === 'essentials' ? (cu === 'AED' || cu === cardView() ? essLeft : 0) : (R.bal[cu]?.[k] || 0);
  return { n: w + hn, aed: w * rate(cu) + ha };
}
function viewList(R) {
  const cs = countries(S); // دولة ليها أساسيات أو ديون أو معاملات بتظهر حتى لو محفظتها فاضية
  const has = cu => cu === 'AED' || cs.includes(cu) || Object.values(R.bal[cu] || {}).some(v => Math.abs(v) > 0.005) || S.holdings.some(h => h.cur === cu && +h.amount > 0);
  return ['ALL', ...places().filter(has), ...(has('XAU') ? ['XAU'] : [])]; // البلاد بس (الدولار بيبان في المحافظ وفي "الكل")
}
const viewOf = R => viewList(R).includes(S.view) ? S.view : 'ALL';

/* ───────────── أسفل الهيرو: الهدف الجاي + أهم خطوة + 3 أرقام ───────────── */
function heroFoot(c) {
  return heroTop(c) + heroRest(c);
}
/** الصافي بكل عملة + سويتش الدول: دايمًا من البيانات كلها */
function heroTop(c) {
  const { R } = c;
  const view = viewOf(R), disp = CUR[S.disp]?.s ? S.disp : 'AED';
  const sw = `<div class="switch" role="tablist" aria-label="${L('عملة العرض', 'Display currency')}">${viewList(R).map(v => `<button class="${v === view ? 'on' : ''}" data-view="${v}" dir="${v === 'ALL' || v === 'XAU' ? L('rtl', 'ltr') : 'ltr'}">${v === 'ALL' ? L('الكل', 'All') : v === 'XAU' ? L('🥇 دهب', '🥇 Gold') : `${CUR[v].f} ${CUR[v].s}`}</button>`).join('')}
    ${view === 'ALL' ? `<button class="disp" data-disp title="${L('غيّر العملة اللي الكل بيتحسب بيها', 'Change the currency everything is shown in')}">${L('الكل بـ', 'All in')} <b>${CUR[disp].s}</b> ⇄</button>` : ''}</div>`;
  // الصافي بكل العملات جنب بعض
  const netAED = R.growthAED + R.stabilityAED + R.rewardAED + (c.mo.essAlloc - c.mo.essSpent) - R.debt, ng = netAED < -0.5 ? 'neg' : '';
  const strip = `<div class="eqs"><small>${L(`${R.debt > 0.5 ? 'الصافي' : 'الإجمالي'} بكل عملة`, `${R.debt > 0.5 ? 'Net' : 'Total'} in each currency`)}</small>
    ${['AED', 'EGP', 'USD'].map(cu => `<button class="${ng} ${view === 'ALL' && disp === cu ? 'on' : ''}" data-dset="${cu}" dir="ltr" title="${L(`اعرض الكل بال${CUR[cu].n}`, `Show everything in ${CUR[cu].n}`)}"><b>${fmt(netAED / rate(cu))}</b> ${CUR[cu].s}</button>`).join('')}
    <span class="${ng}" dir="${L('rtl', 'ltr')}" title="${L('الصافي لو اتحوّل كله دهب عيار 24', 'Your net if it were all converted to 24k gold')}">🥇 <b dir="ltr">${fmt(netAED / rate('XAU'), 2)}</b> ${L('جم', 'g')}</span></div>`;
  const xb = `<button class="xfer-big" data-act="transfer">🔁 ${L('حوّل فلوس بين العملات', 'Transfer money between currencies')}<small>${L('جنيه ⇄ درهم · بالسعر والعمولة', 'EGP ⇄ AED · with the rate and fee')}</small></button>`;
  return strip + sw + xb;
}
/** الهدف الجاي + أهم خطوة + 3 أرقام: من الدولة اللي بتتعرض (أو الكل) */
function heroRest(c) {
  const { R } = c, t = todos(c)[0], pi = payInfo(c);
  const nx = spareList(R).find(x => R.stabilityAED < x.amt - 0.5);
  let goal = `<div class="goal" data-go="c-spare"><span>${L('🏆 كل محطات الأمان خلصت', '🏆 All safety milestones done')}</span><span class="pct">100%</span></div>`;
  if (nx) {
    const amt = nx.amt, pct = R.stabilityAED / amt, dt = spareDates(c).at(amt);
    goal = `<div class="goal" data-go="c-spare" role="button" tabindex="0"><span>${L('🎯 الهدف الجاي:', '🎯 Next goal:')} <b>${esc(nx.name)}</b></span><span class="pct" dir="ltr">${fmt(pct * 100, 1)}%</span>${bar(pct, B.stability.c)}
      <small>${L(`فاضل ${fmt(amt - R.stabilityAED)} Đ`, `${fmt(amt - R.stabilityAED)} Đ left`)}${dt ? ` · ${L('المتوقع', 'Expected')} ${monthName(dt)}` : ''}</small></div>`;
  }
  const ess = c.planI ? c.Ec / c.planI : 0;
  const inv = R.debt <= 0.5 ? L('بدأ ✅', 'Started ✅') : c.exp.growth > 0.5 ? monthName(addMonths(new Date(), Math.ceil(R.debt / c.exp.growth))) : '—';
  return `${goal}
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
  // كل دورة من المعاملات نفسها: توزيع الدخل (من غير اللي اترحّل من دورة قبلها أو اتحوّل)، وكل المصروف (أي بند غير الصدقة)
  const per = k => {
    const o = { income: 0, sad: 0, ess: 0, debt: 0, growth: 0, stability: 0, reward: 0, spent: 0 };
    for (const x of S.tx) {
      if (periodOf(x.date, pd) !== k) continue;
      const r = R.rows[x.id]; if (!r) continue;
      if (x.type === 'income' && r.d) { o.income += r.net; o.sad += r.sadaqa; o.ess += r.d.essentials; o.debt += r.debtPay; o.growth += r.invest; o.stability += r.d.stability; o.reward += r.d.reward; }
      else if (x.type === 'expense' && x.bucket !== 'sadaqa') o.spent += r.aed;
    }
    o.saved = o.debt + o.stability + o.growth; return o;
  };
  const cycles = keys.slice(-6).map(k => { const m = per(k); return { label: cyc(k), income: m.income, spent: m.spent, saved: m.saved }; });
  const cur = per(c.ym), essNow = mo.essAlloc - mo.essSpent;
  const net = R.growthAED + R.stabilityAED + R.rewardAED + essNow - R.debt;
  const saved = cur.saved;
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
  const sideAvg = sideAverage(S, R, c.ym, rate);
  let debt = R.debt, stab = R.stabilityAED, inv = R.growthAED, P = pi.none ? new Date(n0.getFullYear(), n0.getMonth() + 1, pd) : new Date(pi.next), debtDone = debt <= 0.5, firstFull = false;
  const rew = Math.max(0, R.rewardAED), proj = [], events = [];
  const pending = spareList(R).map(t => ({ n: t.name, amt: t.amt })).filter(t => stab < t.amt - 0.5).sort((a, b) => a.amt - b.amt);
  for (let i = 0; i < 360; i++) {
    const sf = salaryFor(P), t = Math.max(P.getTime(), today0);
    const a = splitIncome({ net: sf.amount * (1 - (debt > SAD_DEBT ? 0 : c.sadFull)), // المرتب بس: الدخل الجانبي مش مضمون (زي كارت الفلوس الحرّة)
      need: R.E, E: R.E, debtOn: debt > 0.5, stab, starter: R.starter, cap: lastSpare });
    let g = a.growth, st = a.stability;
    const pay = Math.min(g, debt); debt -= pay; inv += g - pay; stab += st;
    if (i === 0 && !pi.none) events.push({ t, i: '💰', h: L(`القبض الجاي: ${fmt(sf.amount)} Đ`, `Next payday: ${fmt(sf.amount)} Đ`), s: sf.full ? L(`مرتب شغل شهر ${workMonth(P)} كامل`, `Full salary for your work in ${workMonth(P)}`) : partNote(sf) });
    else if (i > 0 && !firstFull && sf.full && !pi.sf.full) { firstFull = true; events.push({ t, i: '💵', h: L(`أول مرتب كامل: ${fmt(sf.amount)} Đ`, `First full salary: ${fmt(sf.amount)} Đ`), s: L(`عن شغل شهر ${workMonth(P)}`, `For your work in ${workMonth(P)}`) }); }
    if (!debtDone && debt <= 0.5) { debtDone = true; events.push({ t, i: '💳', h: L(`${esc(dName())} يخلص`, `${esc(dName())} paid off`), s: L('ومن بعدها نصيب النمو يبقى استثمار 📈', 'After that, the Growth share goes to investing 📈'), kind: 'win' }); }
    while (pending.length && stab >= pending[0].amt - 0.5) { const m = pending.shift(); events.push({ t, i: '🛟', h: L(`محطة الأمان: ${esc(m.n)}`, `Safety milestone: ${esc(m.n)}`), s: L(`الأمان يوصل ${fmt(m.amt)} Đ`, `Safety reaches ${fmt(m.amt)} Đ`), kind: 'win' }); }
    if (i < 36) proj.push({ t, v: stab + inv + rew + essNow - debt }); // الأساسيات اللي معاك ثابتة (كل دورة بتتملى وتتصرف)
    P = new Date(P.getFullYear(), P.getMonth() + 1, pd);
  }
  for (const m of pending) events.push({ t: Infinity, far: true, i: '🛟', h: L(`محطة الأمان: ${esc(m.n)}`, `Safety milestone: ${esc(m.n)}`), s: L(`أبعد من 30 سنة بالمعدل الحالي. محتاج دخل أعلى عشان توصل ${fmt(m.amt)} Đ.`, `More than 30 years away at the current rate. You need a higher income to reach ${fmt(m.amt)} Đ.`), kind: 'far' });

  return {
    cycleLabel: periodLabel(c.ym), cycles, incomeCats, spendCats, events,
    kpi: { income: cur.income, spent: cur.spent, saveRate: cur.income ? saved / cur.income : 0, net },
    alloc: [
      { k: 'essentials', n: L('الأساسيات', 'Essentials'), v: cur.ess },
      { k: 'growth', n: L('💳 سداد الدين', '💳 Debt payoff'), v: cur.debt }, { k: 'growth', n: L('📈 استثمار', '📈 Investing'), v: cur.growth },
      { k: 'stability', n: L('الأمان', 'Safety'), v: cur.stability }, { k: 'reward', n: L('الفلوس الحرّة', 'Fun free money'), v: cur.reward },
      { k: 'sadaqa', n: L('🤲 الصدقة (قبل الصافي)', '🤲 Sadaqa (before net)'), v: cur.sad, out: true },
    ],
    allocNote: (mo.carry > 0.5 || mo.toSafety > 0.5) ? L(`مش محسوب هنا: ${mo.carry > 0.5 ? `${fmt(mo.carry)} اترحّلوا للأساسيات من الدورة اللي فاتت` : ''}${mo.carry > 0.5 && mo.toSafety > 0.5 ? '، و' : ''}${mo.toSafety > 0.5 ? `${fmt(mo.toSafety)} زيادة اتنقلت من الأساسيات للأمان` : ''}. دول مش من دخل الدورة دي.`, `Not counted here: ${mo.carry > 0.5 ? `${fmt(mo.carry)} carried into Essentials from last cycle` : ''}${mo.carry > 0.5 && mo.toSafety > 0.5 ? ', and ' : ''}${mo.toSafety > 0.5 ? `${fmt(mo.toSafety)} surplus moved from Essentials to Safety` : ''}. They're not from this cycle's income.`) : '',
    net: { actual, proj },
    assume: L(`التوقع ماشي على: ${pi.none ? 'من غير مرتب' : `مرتب ${fmt(S.salary)} Đ`} بس (الدخل الجانبي مش مضمون فمش محسوب${sideAvg ? `، ومتوسطه ${fmt(sideAvg)} Đ في الدورة` : ''}؛ أي دخل جانبي يقرّب التواريخ)، وصدقة ${c.sadPaused ? `واقفة وقت الدين، وبترجع ${fmt(c.sadFull * 100, 2)}% بعد ما يخلص` : `${fmt(c.sadFull * 100, 2)}%`}، وأساسيات ${fmt(R.E)} Đ، وإن الفلوس الحرّة بتتصرف كلها. أي معاملة جديدة بتغيّره.`, `The forecast assumes: ${pi.none ? 'no salary' : `a salary of ${fmt(S.salary)} Đ`} only (side income isn't guaranteed so it's not counted${sideAvg ? `; it averages ${fmt(sideAvg)} Đ per cycle` : ''}, and any side income brings the dates closer), sadaqa ${c.sadPaused ? `paused during the debt and back to ${fmt(c.sadFull * 100, 2)}% once it's paid off` : `of ${fmt(c.sadFull * 100, 2)}%`}, essentials of ${fmt(R.E)} Đ, and that Fun free money gets fully spent. Any new transaction changes it.`),
  };
}
const AH = {
  fmt, esc, month: monthName,
  short: d => d.toLocaleDateString(LOC(), { month: 'short', year: '2-digit' }),
  day: d => d.toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' }),
};
function renderStats(c) { $('#stats').innerHTML = renderAnalytics(analyticsData(c), AH); }

/* ───────────── صفحة السجل: كل المعاملات بأسعارها، بفلتر الوقت والنوع والعملة (logpage.js) ───────────── */
UI.logF = LOG_F();
const LH = () => ({
  L, fmt, esc, CUR, B, rate, cOf, today, iso,
  cycleStart: () => { const pd = paydayOf(S); return `${periodOf(today(), pd)}-${String(pd).padStart(2, '0')}`; },
  itemName: id => S.essentials.find(e => e.id === id)?.name || '',
  debtName: id => debts().find(d => d.id === id)?.name || dName(),
  dayLabel: d => AH.day(new Date(d + 'T00:00:00')),
});
// ✏️ تعديل/مسح معاملة من السجل. المسح بالرقم السري زي أي مسح معاملة، والتعديل محتاج الأرقام مفتوحة
async function editTx(id) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  if (LOCK) {
    if (!(await askPin(L('اكتب الرقم السري عشان تعدّل المعاملة 🔐', 'Enter your PIN to edit this transaction 🔐')))) return;
    try { sessionStorage.setItem(PIN_OK, '1'); } catch {} setLock(false);
  }
  sfx.open?.();
  const pr = pairOf(t);
  const r = await txEditor(t, { L, fmt, esc, parseNum, CUR, B, sfx, today, pair: pr && (pr.type === 'debtpay' ? `💳 ${pr.note || L('سداد دين', 'Debt payment')}` : `🔁 ${pr.note || L('تحويل', 'Transfer')}`), pairGold: !!pr && (pr.cur === 'XAU' || !!pr.hold || !!pr.toHold) });
  if (!r) return;
  const undo = JSON.stringify(S);
  if (r.op === 'del') {
    if (!(await askPin(pick(DEL_ASK())))) return;
    dropTx(id); save(); render(); toast(pick(DEL_OK()), undo); sfx.del(); return;
  }
  const changed = Object.keys(r.patch).filter(k => String(r.patch[k] ?? '') !== String(t[k] ?? ''));
  if (!changed.length) return toast(L('ما فيش حاجة اتغيّرت 👌', 'Nothing changed 👌'));
  const oldTo = +t.toAmount;
  const oldAmt = +t.amount;
  Object.assign(t, r.patch); if (!t.fee) delete t.fee;
  if (t.ov && Math.abs(+t.amount - oldAmt) > 0.005) delete t.ov; // المبلغ اتغيّر: التوزيع يرجع للقواعد
  if (pr) { // السطر المربوط: نفس التاريخ، والسداد على قد اللي وصل
    pr.date = t.date;
    if (t.type === 'transfer' && r.patch.toAmount != null && Math.abs(+pr.amount - oldTo) < 0.01) pr.amount = t.toAmount;
    if (t.type === 'transfer' && +pr.amount > +t.toAmount) pr.amount = +t.toAmount;
  }
  save(); render(); toast(L('اتعدّلت ✏️ وكل الحسابات اتظبطت', 'Updated ✏️ and everything was recalculated'), undo); sfx.ok();
}
function renderLogs(c) {
  const keep = document.activeElement?.matches?.('[data-lq]') ? document.activeElement.selectionStart : null;
  $('#logs').innerHTML = renderLog(S.tx, c.R, UI.logF, LH());
  if (keep != null) { const q = $('#logs [data-lq]'); q.focus(); q.setSelectionRange(keep, keep); }
}
$('#logs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.lf) { UI.logF[b.dataset.lf] = b.dataset.v; sfx.select(); return renderLogs(ctx()); }
  if (b.dataset.ladd) { trigger(b.dataset.ladd); if (innerWidth < 900) sayIn.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; } // ➕ جديد: نفس أسئلة الشات
  if (b.dataset.ltx) return editTx(b.dataset.ltx);
  if ('lcsv' in b.dataset) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([logCSV(S.tx, UI.logF, LH())], { type: 'text/csv' }));
    a.download = `floosy-log-${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
$('#logs').addEventListener('input', e => {
  if (e.target.matches('[data-lq]')) { UI.logF.q = e.target.value; clearTimeout(UI.logQT); UI.logQT = setTimeout(() => renderLogs(ctx()), 250); }
});
$('#logs').addEventListener('change', e => {
  if (e.target.dataset.lfd) { UI.logF[e.target.dataset.lfd] = e.target.value; renderLogs(ctx()); }
});
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('[data-page]'); if (!b) return;
  if (b.dataset.page !== UI.page) (b.dataset.page === 'home' ? sfx.back : sfx.page)?.(); // الرجوع للرئيسية بصوت الرجوع
  UI.page = b.dataset.page; document.body.dataset.page = UI.page;
  $('#nav').querySelectorAll('[data-page]').forEach(x => x.classList.toggle('on', x === b));
  $('#stats').hidden = UI.page !== 'stats'; $('#logs').hidden = UI.page !== 'log';
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
/* 🧱 Masonry: كل كارت بياخد قد طوله بالظبط، فالعمود القصير ما يسيبش فراغ تحت (طلب صاحب الحساب، 2026-11-20) */
const MROW = 6, MGAP = 18, masonryOn = () => matchMedia('(min-width: 1181px)').matches;
function packCard(el) {
  if (!masonryOn()) { el.style.gridRowEnd = ''; return; }
  el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((el.getBoundingClientRect().height + MGAP) / MROW))}`;
}
// لما كارت يتفتح أو يتقفل، الكروت التانية بتتحرك لمكانها الجديد بنعومة (FLIP) بدل ما تنط
const reduceMo = matchMedia('(prefers-reduced-motion: reduce)');
const mRO = new ResizeObserver(es => {
  const kids = [...cardsEl.children], before = new Map(kids.map(k => [k, k.getBoundingClientRect()]));
  for (const e of es) packCard(e.target);
  if (reduceMo.matches || !UI.packed) { UI.packed = true; return; }
  for (const k of kids) {
    const a = before.get(k), b = k.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) < 2) continue;
    k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
});
const packAll = () => { cardsEl.classList.toggle('masonry', masonryOn()); for (const el of cardsEl.children) { mRO.observe(el); packCard(el); } };
new MutationObserver(packAll).observe(cardsEl, { childList: true });
addEventListener('resize', () => { clearTimeout(UI.mT); UI.mT = setTimeout(packAll, 120); });
/* ───────────── 🎮 الشكل الجديد (2026-11-20): HUD + غرف + شريط أوامر ─────────────
 * نفس كل الكروت والمميزات، بس متقسمة "غرف" بدل صفحة طويلة: كل مرة غرفة واحدة قدامك،
 * وفوقها 5 مربعات زي اللعبة (الصافي، مصروف النهارده، الدين، القبض، المستوى) كلها بتتداس. */
const ROOMS = () => [
  { k: 'today', i: '🎯', n: L('النهارده', 'Today'), ids: ['c-country', 'c-cta', 'c-pay', 'c-month'] },
  { k: 'ess', i: '🍞', n: L('الأساسيات', 'Essentials'), ids: ['c-ess'] },
  { k: 'wallets', i: '👛', n: L('محافظي', 'Wallets'), ids: ['c-wal', 'c-xfer', 'c-sad'] },
  { k: 'goals', i: '🏆', n: L('أهدافي', 'Goals'), ids: ['c-spare', 'c-life', 'c-goals', 'c-inv'] },
  { k: 'fun', i: '🎉', n: B.reward.n, ids: ['c-fun'] },
  { k: 'more', i: '⚙️', n: L('القواعد', 'Rules'), ids: ['c-rules', 'c-tx'] },
];
try { UI.room = localStorage.getItem('floosy.room') || 'today'; } catch { UI.room = 'today'; }
function setRoom(k, fx = true) {
  if (!$('#rooms')) return;
  UI.room = k; try { localStorage.setItem('floosy.room', k); } catch {}
  cardsEl.dataset.room = k;
  $('#rooms').querySelectorAll('[data-room]').forEach(b => b.classList.toggle('on', b.dataset.room === k));
  if (fx) { cardsEl.classList.remove('enter'); void cardsEl.offsetWidth; cardsEl.classList.add('enter'); sfx.page?.(); }
}
function renderGame(c) {
  if (!$('#hud') || !$('#rooms')) return; // التصميم اللي فيه HUD والغرف اتشال بطلب صاحب الحساب (2026-11-20)
  const R = c.R, rooms = ROOMS();
  // كل كارت ياخد غرفته
  for (const r of rooms) for (const id of r.ids) { const el = document.getElementById(id); if (el) el.dataset.room = r.k; }
  cardsEl.querySelectorAll('.card:not([data-room])').forEach(el => { el.dataset.room = 'more'; });
  const todosN = (() => { try { return todos(c).length; } catch { return 0; } })();
  $('#rooms').innerHTML = rooms.map(r => `<button type="button" data-room="${r.k}" class="${UI.room === r.k ? 'on' : ''}"><span class="ri">${r.i}</span><span>${r.n}</span>${r.k === 'today' && todosN ? `<i class="rb">${todosN}</i>` : ''}</button>`).join('');
  if (!rooms.some(r => r.k === UI.room)) UI.room = 'today';
  cardsEl.dataset.room = UI.room;
  // HUD
  const ess = Math.max(0, c.mo.essAlloc - c.mo.essSpent), have = R.growthAED + R.stabilityAED + R.rewardAED + ess, net = have - R.debt;
  const DP = dailyPlan(c), pi = payInfo(c), paidPct = R.paid + R.debt > 0.5 ? R.paid / (R.paid + R.debt) : 1;
  let lv = { level: 0, rows: [] }; try { lv = lifeState(c); } catch {}
  const cur = lv.rows[lv.level], lvPct = cur ? Math.min(1, c.mo.income / (cur.need || 1)) : 1;
  const tile = (k, ic, label, val, sub, pct, tone) => `<button type="button" class="ht ${tone || ''}" data-hud="${k}"><span class="hi">${ic}</span><span class="hl">${label}</span><b dir="ltr">${val}</b>${pct != null ? `<span class="hb"><i style="width:${(Math.max(0, Math.min(1, pct)) * 100).toFixed(1)}%"></i></span>` : ''}<small>${sub}</small></button>`;
  $('#hud').innerHTML =
    tile('net', '💰', L('الصافي', 'Net'), `${fmt(net)} Đ`, L(`معاك ${fmt(have)}`, `You have ${fmt(have)}`), null, net < -0.5 ? 'bad' : 'good') +
    tile('today', '🗓️', L('النهارده تقدر تصرف', 'Today you can spend'), `${fmt(DP.total, 2)} Đ`, L(`فاضل ${DP.daysLeft} يوم في الدورة`, `${DP.daysLeft} days left in the cycle`), null, 'good') +
    (R.debt > 0.5 ? tile('debt', '💳', L('الدين', 'Debt'), `${fmt(R.debt)} Đ`, L(`اتسدّد ${fmt(paidPct * 100, 1)}%`, `${fmt(paidPct * 100, 1)}% paid`), paidPct, 'bad') : tile('debt', '🏁', L('الدين', 'Debt'), L('خلص ✅', 'Done ✅'), L('مفيش ديون', 'No debt'), 1, 'good')) +
    tile('pay', '📅', L('القبض الجاي', 'Next payday'), pi.none ? '—' : pi.due ? L('النهارده 🎉', 'Today 🎉') : L(`بعد ${pi.days} يوم`, `in ${pi.days} days`), pi.none ? L('مفيش مرتب متسجل', 'No salary logged') : `${dayName(pi.next)} · ${fmt(pi.amount)} Đ`, null, '') +
    tile('level', '🎮', L('المستوى', 'Level'), `${lv.level} / ${S.life.length}`, cur ? L(`${esc(cur.t.name)} · ${fmt(lvPct * 100)}%`, `${esc(cur.t.name)} · ${fmt(lvPct * 100)}%`) : L('🏆 عدّيت كله', '🏆 All passed'), lvPct, '');
  // شريط الأوامر
  if (!$('#dock').childElementCount) $('#dock').innerHTML = [
    ['spend', '💸', L('صرفت', 'Spent')], ['salary', '💰', L('قبضت', 'Paid')], ['side', '🤑', L('دخل', 'Income')], ['transfer', '🔁', L('حوّل', 'Transfer')], ['logpage', '📒', L('السجل', 'Log')],
  ].map(([k, i, n]) => `<button type="button" data-dock="${k}"><span>${i}</span><small>${n}</small></button>`).join('');
}
$('#rooms')?.addEventListener('click', e => { const b = e.target.closest('[data-room]'); if (b) setRoom(b.dataset.room); });
$('#hud')?.addEventListener('click', e => {
  const b = e.target.closest('[data-hud]'); if (!b) return;
  const k = b.dataset.hud; b.classList.remove('tap'); void b.offsetWidth; b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 250);
  if (k === 'net') return haveDetails();
  if (k === 'today') return dailyDetails();
  if (k === 'debt') return debts().length ? debtDetails(null) : setRoom('wallets');
  if (k === 'pay') { setRoom('today'); return $('#c-pay')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (k === 'level') { setRoom('goals'); return $('#c-life')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
$('#dock')?.addEventListener('click', e => {
  const b = e.target.closest('[data-dock]'); if (!b) return;
  b.classList.remove('tap'); void b.offsetWidth; b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 250);
  if (b.dataset.dock === 'logpage') return $('#nav [data-page="log"]')?.click();
  if (UI.page !== 'home') $('#nav [data-page="home"]')?.click();
  trigger(b.dataset.dock);
  if (innerWidth < 900) sayIn.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
let scene = null;
// 📌 لوحة النهارده (سنيك 2026-11-21، للتطبيق على الآيفون): أول حاجة تشوفها — تقدر تصرف كام النهارده، القبض بعد كام يوم، وزرار ＋ صرفت
function renderToday(c) {
  const el = $('#today'); if (!el) return;
  let DP, pi; try { DP = dailyPlan(c); pi = payInfo(c); } catch { el.hidden = true; return; }
  const essLeft = c.mo.essAlloc - c.mo.essSpent;
  el.hidden = false;
  el.innerHTML = `<button type="button" class="td-main" data-dailyview><small>🗓️ ${L('النهارده تقدر تصرف', 'Today you can spend')}</small><b dir="ltr">${fmt(DP.total, 2)} <span>Đ</span></b><small>${L(`فاضل ${plural(DP.daysLeft, 'يوم', 'يومين', 'أيام', 'يوم')} في الدورة`, `${EN_N(DP.daysLeft, 'day')} left in the cycle`)} ›</small></button>
    <div class="td-side">
      <button type="button" class="td-mini" data-today="pay"><span>📅 ${L('القبض', 'Payday')}</span><b>${pi.none ? '—' : pi.due ? L('النهارده 🎉', 'Today 🎉') : L(`بعد ${plural(pi.days, 'يوم', 'يومين', 'أيام', 'يوم')}`, `in ${EN_N(pi.days, 'day')}`)}</b></button>
      <button type="button" class="td-mini ${essLeft < -0.5 ? 'bad' : ''}" data-today="ess"><span>🍞 ${L('فاضل للأساسيات', 'Left for essentials')}</span><b dir="ltr">${fmt(essLeft)} Đ</b></button>
    </div>
    <button type="button" class="td-add" data-quick="spend" aria-label="${L('سجّل مصروف', 'Log an expense')}">＋ <span>${L('صرفت', 'Spent')}</span></button>`;
}
function quickSpend() {
  if (UI.page !== 'home') $('#nav [data-page="home"]')?.click();
  sfx.tap?.(); haptic(); SX.open(); trigger('spend'); // شاشة قرش الكاملة بتفتح على "صرفت على إيه؟"
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-quick="spend"]')) return quickSpend();
  const t = e.target.closest('[data-today]'); if (!t) return;
  const el = $(t.dataset.today === 'pay' ? '#c-pay' : '#c-ess'); if (!el) return;
  if (el.classList.contains('fold')) el.querySelector('[data-fold]')?.click(); else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
{ const fab = document.createElement('button'); fab.type = 'button'; fab.className = 'fab-add'; fab.dataset.quick = 'spend'; fab.textContent = '＋'; fab.setAttribute('aria-label', 'سجّل مصروف'); document.body.append(fab); }

function render() {
  const c = ctx(), { R } = c;
  try { renderToday(c); } catch (e) { console.warn(e); }
  const focusP = document.activeElement?.dataset?.p;
  const cv = cardView();
  let hv = c, restHtml = ''; // hv = حسابات الدولة اللي بتتعرض (أو الكل) للهيرو
  if (cv === 'ALL') cardsEl.innerHTML = cardCTA(c) + cardPay(c) + cardMonth(c) + cardEssentials(c) + cardLife(c) + cardSpare(c) + cardFun(c) + cardGoals(c) + cardSadaqa(c) + cardInvest(c) + cardWallets(c) + cardXfers() + cardRules() + cardTx(c);
  else {
    // عرض دولة: الكروت من نسخة الدولة دي بعملتها، والمحافظ (كل العملات والأسعار) من البيانات كلها
    const real = S; let html;
    try { S = viewState(cv); const v = ctx(); hv = v; restHtml = heroRest(v); html = countryBanner(cv) + cardCTA(v) + cardPay(v) + cardMonth(v) + cardEssentials(v) + cardLife(v) + cardSpare(v) + cardFun(v) + cardGoals(v) + cardSadaqa(v) + cardInvest(v) + '<!--W-->' + cardRules() + cardTx(v); }
    finally { S = real; UI.R = c.R; }
    const [a, b] = html.split('<!--W-->'), t = document.createElement('template');
    t.innerHTML = a + b; relabel(t.content, cv);
    const wal = document.createElement('template'); wal.innerHTML = cardWallets(c) + cardXfers(cv); // بعملاتها الحقيقية (من غير relabel)
    const kids = [...t.content.children], at = kids.findIndex(k => k.id === 'c-rules');
    if (at >= 0) t.content.insertBefore(wal.content, kids[at]); else t.content.append(wal.content);
    cardsEl.replaceChildren(t.content);
  }
  $('#riskBox').innerHTML = riskHTML();
  if (focusP) cardsEl.querySelector(`[data-p="${focusP}"]`)?.focus();

  const total = R.growthAED + R.stabilityAED + R.rewardAED;
  const hR = hv.R, hs = cv === 'ALL' ? 'Đ' : CUR[cv].s; // دين الدولة دي بعملتها
  const debtPill = hR.debt > 0.5 ? `<button type="button" class="pillx bad" data-debtview title="${L('تفاصيل الدين', 'Debt details')}">${L(`دين ${fmt(hR.debt)} ${hs}`, `Debt ${fmt(hR.debt)} ${hs}`)} ›</button>` : `<span class="pillx good">${L('مفيش ديون ✅', 'No debt ✅')}</span>`;
  $('#cycle').textContent = L('دورة ', 'Cycle ') + periodLabel(c.ym);
  if (cv === 'ALL') $('#foot').innerHTML = heroFoot(c);
  else { const t = document.createElement('template'); t.innerHTML = restHtml; relabel(t.content, cv); $('#foot').innerHTML = heroTop(c); $('#foot').append(t.content); }

  const essLeft = c.mo.essAlloc - c.mo.essSpent, hEss = hv.mo.essAlloc - hv.mo.essSpent;
  const vals = { essentials: [essLeft, hv.mo.income > 0 || hv.mo.essAlloc > 0.5 ? (R.debt > 0.5 ? L(`متغطي ${fmt(hv.mo.essAlloc)} من ${fmt(hv.Ec + hv.En)} (الدورة دي + 10 أيام من الجاية)`, `${fmt(hv.mo.essAlloc)} of ${fmt(hv.Ec + hv.En)} covered (this cycle + 10 days of the next)`) : L(`متغطي ${fmt(hv.mo.essAlloc)} من ${fmt(hv.Ec)}`, `${fmt(hv.mo.essAlloc)} of ${fmt(hv.Ec)} covered`)) : L('مستني القبض', 'Waiting for payday')], growth: [R.growthAED, hR.debt > 0.5 ? L('بيسدّ الكارد', 'Paying off the card') : L('استثمار', 'Investing')], stability: [R.stabilityAED, L('صندوق الطوارئ', 'Emergency fund')], reward: [R.rewardAED, L('حصّالة الفلوس الحرّة', 'Fun free money jar')], sadaqa: [Math.max(0, R.sadaqaAED), L('مستنية تطلع', 'Waiting to be given')] };
  for (const k in vals) {
    const el = $(`#labels [data-b="${k}"]`);
    el.querySelector('b').textContent = fmt(vals[k][0]) + ' Đ'; el.querySelector('small').textContent = vals[k][1];
  }
  // وقت الدين: الأساسيات في سطرين — فلوس الدورة دي (بتاريخها) وفلوس أول 10 أيام من الجاية (بتاريخهم)
  if (hv.mo.income > 0 || hv.mo.essAlloc > 0.5) {
    const [yy, mm] = hv.ym.split('-').map(Number), pd = paydayOf(S), sd = d => `${d.getDate()}/${d.getMonth() + 1}`;
    // الصرف بياكل من الدورة دي، بعدين من اللي فوق المطلوب، بعدين من الـ10 أيام الجايين (طلب صاحب الحساب، 2026-11-21 و 11-23)
    const ES = essSplit(hv), nowHave = ES.nowHave, nextHave = ES.nextHave, spNow = ES.spNow, spNext = ES.spNext;
    // كبسولة ملوّنة: الخلفية بتتملا بنسبة الفاضل من المطلوب، فوق التاريخ وتحت الفاضل / المطلوب واللي اتدفع
    // ✅ = متغطي ولسه سليم: سطر الدورة لسه فيه فلوس، وسطر الـ10 أيام ما حدش لمسه
    const line = (ic, from, to, have, need, paid, reserve) => { const left = have - paid, pc = need > 0.5 ? Math.max(0, Math.min(100, left / need * 100)) : 100, ok = have >= need - 0.5 && (reserve ? paid < 0.5 : left > 0.5);
      return `<span class="ess2 ${ok ? 'ok' : pc > 0.5 ? 'part' : 'none'}" style="--p:${pc.toFixed(1)}%" title="${L(`متغطي ${fmt(have)} من ${fmt(need)} · اتدفع ${fmt(paid)} · فاضل ${fmt(left)}`, `${fmt(have)} of ${fmt(need)} covered · paid ${fmt(paid)} · ${fmt(left)} left`)}"><i>${ic} <span dir="ltr">${sd(from)} → ${sd(to)}</span></i><b dir="ltr">${ok ? '✅ ' : ''}${fmt(left)} / ${fmt(need)}${paid > 0.5 ? ` <small>(−${fmt(paid)})</small>` : ''}</b></span>`; };
    const sm = $('#labels [data-b="essentials"] small');
    sm.innerHTML =
      line('📅', hv.cyc?.since ? new Date(hv.cyc.since + 'T00:00:00') : new Date(yy, mm - 1, pd), new Date(yy, mm, pd - 1), nowHave, hv.Ec, spNow) + // أول دورة: من يوم ما بدأت الشغل، والأساسيات بالأيام
      (ES.debtOn ? line('➕', new Date(yy, mm, pd), new Date(yy, mm, pd + 9), nextHave, hv.En, spNext, true) : '') +
      (ES.extra > 0.5 ? `<span class="ess2 extra" title="${L('اتحط أكتر من المطلوب', 'More was put in than needed')}"><i>⬆️ ${L('فوق المطلوب', 'Above what is needed')}</i><b dir="ltr">+${fmt(ES.leftExtra)}${ES.spExtra > 0.5 ? ` <small>(−${fmt(ES.spExtra)})</small>` : ''}</b></span>`
        : ES.short > 0.5 ? `<span class="ess2 none"><i>⬇️ ${L('ناقص عن المطلوب', 'Short of what is needed')}</i><b dir="ltr">−${fmt(ES.short)}</b></span>` : '') +
      `<span class="ess2 sum"><i>${L(`المطلوب ${fmt(ES.need)} · اتدفع ${fmt(ES.spent)}`, `Needed ${fmt(ES.need)} · paid ${fmt(ES.spent)}`)}</i><b dir="ltr">${L(`فاضل ${fmt(ES.left)} من ${fmt(ES.alloc)}`, `${fmt(ES.left)} left of ${fmt(ES.alloc)}`)} ›</b></span>`;
    sm.dataset.essview = '1';
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
      const h = held(k, view, R, view === cv ? hEss : essLeft);
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
  const DP = dailyPlan(c), dailyPill = `<button type="button" class="dlyp" data-dailyview title="${L('دوس تشوف كل بند', 'Tap to see each item')}">🗓️ ${L('النهارده تقدر تصرف', 'Today you can spend')} ${fmt(DP.total, 2)} Đ ›</button>`;
  $('#totalAlt').innerHTML = (view === 'ALL'
    ? (R.debt > 0.5 ? `<button type="button" class="pillx good" data-haveview title="${L('دوس تشوف جاي منين', 'Tap to see where it comes from')}">${L('معاك', 'You have')} ${fmt(shown)} ›</button><button type="button" class="pillx bad" data-debtview title="${L('تفاصيل الدين', 'Debt details')}">${L('دين', 'Debt')} ${fmt(R.debt / rate(disp))} ›</button>` : debtPill)
    : (view === 'AED' ? '' : `<span class="pillx" dir="ltr">≈ ${fmt(shownAED)} Đ</span>`) + debtPill) + dailyPill;
  if (UI.why) showWhy(UI.why);
  if (UI.page === 'stats') renderStats(c);
  if (UI.page === 'log') renderLogs(c);
  const ar = document.querySelector('.agent-role'); if (ar) ar.textContent = L('مستشارك المالي 🤖', 'Your money advisor 🤖');
  renderGame(c);
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
/** في عرض دولة: البند ده بتاع الدولة دي بس وبعملتها (من نسخة الدولة)، وفي "الكل": كله بالدرهم */
function showWhy(k) {
  const cv = cardView();
  if (cv === 'ALL') return whyPanel(k, 'AED');
  const real = S, keepR = UI.R;
  try { S = viewState(cv); whyPanel(k, cv); } finally { S = real; UI.R = keepR; }
}
function whyPanel(k, U0) {
  const U = CUR[U0].s, c = ctx(), { R, mo } = c, el = $('#why'), lines = [];
  let total = 0;
  if (k === 'essentials') {
    if (mo.essNat != null) mo.essAlloc = mo.essNat + mo.essSpent; // بعملة الدولة نفسها، من غير فرق سعر
    total = mo.essAlloc - mo.essSpent;
    lines.push([L(`اتخصص للأساسيات الشهر ده`, `Set aside for Essentials this month`), mo.essAlloc, mo.income > 0 ? L(`من دخل ${fmt(mo.income)} ${U}. الأساسيات بتتغطى الأول لحد ${fmt(c.Ec)}${c.cyc.since ? ` (${plural(c.cyc.left, 'يوم', 'يومين', 'أيام', 'يوم')} من ${c.cyc.days})` : ''}.`, `From ${fmt(mo.income)} ${U} of income. Essentials get covered first, up to ${fmt(c.Ec)}${c.cyc.since ? ` (${EN_N(c.cyc.left, 'day')} of ${c.cyc.days})` : ''}.`) : L('لسه مفيش دخل متسجل الشهر ده، فالرصيد صفر. أول قبض هيغطيها.', 'No income logged this month yet, so the balance is zero. Your first payday will cover it.')]);
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
    if (k === 'growth' && (R.paid > 0.5 || R.debt > 0.5)) lines.push([`💳 ${esc(dName())}`, 0, L(`نصيب النمو بيسدّ الدين الأول: اتدفع ${fmt(R.paid)} وفاضل ${fmt(R.debt)} ${U}. عشان كده رصيد النمو لسه مش بيزيد.`, `Growth's share pays off the debt first: ${fmt(R.paid)} paid, ${fmt(R.debt)} ${U} to go. That's why the Growth balance isn't climbing yet.`)]);
    if (!lines.length) lines.push([L('لسه فاضي', 'Still empty'), 0, L('مفيش حاجة اتحطت في البند ده لحد دلوقتي.', 'Nothing has landed in this bucket yet.')]);
  }
  el.style.setProperty('--c', B[k].c);
  el.innerHTML = `<h3><span>${L(`${B[k].i} ${B[k].n}: الرقم ده جاي منين؟`, `${B[k].i} ${B[k].n}: where does this number come from?`)}</span><button class="x" style="opacity:1" data-close aria-label="${L('اقفل', 'Close')}">✕</button></h3>
    ${total > 0.5 && lines.filter(([, v]) => v > 0.5).length > 1 ? `<div class="stack">${lines.filter(([, v]) => v > 0.5).map(([, v], i) => `<i style="flex:${v};background:${['#f5c542', '#5571AC', '#fb923c', '#F4EDE0', '#a3e635', '#FF6B5B'][i % 6]}"></i>`).join('')}</div>` : ''}
    <ul>${lines.map(([n, v, s]) => `<li>${n}<b>${fmt(v)} ${U}${total > 0.5 && v > 0.5 ? ` · ${fmt(v / total * 100, 1)}%` : ''}</b><small>${s}</small></li>`).join('')}</ul>
    <div class="tot"><span>${L('الإجمالي', 'Total')}</span><span dir="ltr">${fmt(total)} ${U}</span></div>
    ${k !== 'sadaqa' ? `<div class="chips-c"><button class="pill" data-xfer="${k}">🔁 ${L(k !== 'essentials' && k !== 'reward' && debts().some(d => dLeft(R, d) > 0.5) ? 'حوّل لعملة تانية أو سدّ دين' : 'حوّل لعملة تانية', k !== 'essentials' && k !== 'reward' && debts().some(d => dLeft(R, d) > 0.5) ? 'Convert to another currency or pay a debt' : 'Convert to another currency')}</button></div>` : ''}`;
  if (UI.why !== k) sfx.open();
  el.hidden = false; UI.why = k;
}
$('#stage').addEventListener('click', e => {
  const el = $('#why');
  if (e.target.closest('[data-close]')) { el.hidden = true; UI.why = null; return; }
  const xf = e.target.closest('[data-xfer]');
  if (xf) { UI.xfer = { from: S.view === 'XAU' ? 'XAU' : cardView() !== 'ALL' ? cardView() : null, bk: xf.dataset.xfer }; el.hidden = true; UI.why = null; trigger('transfer'); return; }
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
  if (norm(pinIn.value).trim() === String(S.pin || '')) { sfx.ok(); return closePin(true); }
  sfx.err(); $('#pinErr').textContent = HOSTED && FILE.missing ? L('مفيش بيانات على الموقع لسه، فالرقم المؤقت 0000. استورد ملفك من 📥 عشان رقمك يشتغل.', 'There is no data on the site yet, so the temporary PIN is 0000. Import your file with 📥 and your own PIN will work.') : pick(PIN_BAD()); pinIn.value = '';
  const f = $('#pinForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
});
pinEl.addEventListener('click', e => { if (e.target === pinEl || e.target.closest('[data-cancel]')) closePin(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pinEl.hidden) closePin(false); });
function setLock(v) {
  if (v !== LOCK) (v ? sfx.lock : sfx.unlock)();
  LOCK = v; document.body.classList.toggle('locked', v);
  $('#eye').textContent = v ? '🙈' : '👁️';
  render();
}
// بعد ما الرقم السري يتكتب مرة، الإخفاء والإظهار من غير رقم لحد ما التاب يتقفل (طلب صاحب الحساب، 2026-11-19).
// sessionStorage بيتمسح لوحده مع قفل التاب، فأي حد يفتح الصفحة بعدين لازم يكتب الرقم.
const PIN_OK = 'floosy.pinok';
const pinOk = () => { try { return sessionStorage.getItem(PIN_OK) === '1'; } catch { return false; } };
$('#eye').onclick = async () => {
  if (!LOCK) return setLock(true);
  if (pinOk()) return setLock(false);
  if (await askPin(L('الأرقام مستخبية 🙈 اكتب الرقم السري عشان تشوفها', 'The numbers are hiding 🙈 Enter your PIN to see them'))) {
    try { sessionStorage.setItem(PIN_OK, '1'); } catch {}
    setLock(false); toast(L('اتفضل يا باشا 👁️ كله قدامك', 'There you go, boss 👁️ All yours'));
  }
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
  if (el.dataset.t === 'n') {
    v = parseNum(v); if (!isFinite(v) || v < 0) return render();
    // في عرض دولة الأرقام دي بتظهر بعملتها، بس متخزّنة بالدرهم
    if (cardView() !== 'ALL' && AED_FIELDS[coll]?.includes(field)) v *= rate(cardView());
  }
  else if (!v) return render();
  if (coll === 'S') S[field] = v;
  else if (coll === 'debts' && field === 'left') setDebtLeft(id, v);
  else if (coll === 'essentials' && field.startsWith('w_')) { const it = S.essentials.find(x => x.id === id); if (!it?.where) return; it.where[field.slice(2)] = v; }
  else if (coll === 'rates') { if (v <= 0) return render(); S.rates[id] = field === 'inv' ? 1 / v : v; S.manual[id] = true; }
  else { const it = S[coll].find(x => x.id === id); if (!it) return; if (it[field] === v) return; it[field] = v; }
  save(); render(); toast(pick(JOKES.ok)); sfx.edit();
}
const NEW = {
  essentials: () => ({ id: uid(), icon: '🧾', name: 'بند جديد', amount: 0, cur: cardView() === 'ALL' ? 'AED' : cardView() }),
  holdings: () => ({ id: uid(), name: 'دهب', cur: 'XAU', amount: 0, karat: 24, spare: true }),
  life: () => ({ id: uid(), name: 'مستوى جديد', monthly: 0 }),
  spare: () => ({ id: uid(), name: 'محطة جديدة', monthly: 0, extra: 0 }),
  fun: () => ({ id: uid(), name: 'هدف جديد', cost: 0, every: 3 }),
  // بيبدأ يتحسب من النهارده، عشان الدخل اللي فات ما يتحسبش إنه سدّده
  debts: () => ({ id: uid(), name: L('كارت', 'Credit card'), kind: 'card', balance: 0, since: today(), cur: cardView() === 'ALL' ? 'AED' : cardView() }),
};
/* ───────────── 🗓️ مصروف النهارده: البنود اللي بتتقسم يومي (طلب صاحب الحساب، 2026-11-20) ─────────────
 * بند "يومي" (أكل، مواصلات… إنت بتختار): الباقي منه في الدورة ÷ الأيام اللي فاضلة = أقصى حاجة تصرفها النهارده.
 * يوم ما تصرفش فيه، الباقي بيتوزّع على الأيام الجاية فالحد بيزيد. الفواتير وزيها ما ينفعش (إنت اللي بتعلّم). */
/* 🧾 الأساسيات متقسمة (طلب صاحب الحساب، 2026-11-23): المطلوب للدورة دي + (وقت الدين) أول 10 أيام من الجاية،
   واللي اتحط، واللي فوق المطلوب، واللي اتدفع، واللي فاضل. الصرف بياكل من فلوس الدورة دي الأول، بعدين من اللي فوق
   المطلوب، وآخر حاجة من فلوس الـ10 أيام الجاية. */
function essSplit(c) {
  const debtOn = c.R.debt > 0.5, Ec = c.Ec, En = debtOn ? c.En : 0, alloc = Math.max(0, c.mo.essAlloc || 0), spent = Math.max(0, c.mo.essSpent || 0);
  const nowHave = Math.min(alloc, Ec), nextHave = Math.max(0, Math.min(En, alloc - Ec)), extra = Math.max(0, alloc - Ec - En);
  const spExtra = Math.min(extra, Math.max(0, spent - nowHave)), spNext = Math.min(nextHave, Math.max(0, spent - nowHave - extra)), spNow = spent - spExtra - spNext;
  return { debtOn, Ec, En, need: Ec + En, alloc, spent, nowHave, nextHave, extra, spNow, spExtra, spNext,
    leftNow: nowHave - spNow, leftNext: nextHave - spNext, leftExtra: extra - spExtra, left: alloc - spent,
    // الفلوس اللي ينفع تتصرف لحد آخر الدورة: فلوس الدورة دي + اللي فوق المطلوب − اللي اتصرف (سالب = كلت من فلوس الـ10 أيام)
    avail: nowHave + extra - spent, short: Math.max(0, Ec + En - alloc) };
}

/* 🧾 الأساسيات بالتفصيل: جدول المطلوب / اتحط / اتدفع / فاضل لكل جزء، وإزاي الـ10 أيام اتحسبوا */
function essDetails() {
  const c = ctx(), E = essSplit(c), [y, m] = c.ym.split('-').map(Number), pd = paydayOf(S), sd = d => `${d.getDate()}/${d.getMonth() + 1}`;
  const from = c.cyc?.since ? new Date(c.cyc.since + 'T00:00:00') : new Date(y, m - 1, pd), to = new Date(y, m, pd - 1), n1 = new Date(y, m, pd), n10 = new Date(y, m, pd + NEXT_DAYS - 1);
  const np = nextPeriod(c.ym), nTot = essFor(S, rate, np).total, nDays = cycleInfo(S, np).days, DP = dailyPlan(c);
  const row = (ic, name, need, have, paid, left, cls = '') => `<tr class="${cls}"><td>${ic} ${name}</td><td dir="ltr">${need == null ? '—' : fmt(need)}</td><td dir="ltr">${fmt(have)}</td><td dir="ltr">${fmt(paid)}</td><td dir="ltr" class="${left < -0.5 ? 'neg' : ''}">${fmt(left)}</td></tr>`;
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd">
    <div class="wiz-top"><b>🧾 ${L('الأساسيات بالتفصيل', 'Essentials in detail')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    <table class="sw-t ess-t"><thead><tr><th></th><th>${L('المطلوب', 'Needed')}</th><th>${L('اتحط', 'Put in')}</th><th>${L('اتدفع', 'Paid')}</th><th>${L('فاضل', 'Left')}</th></tr></thead><tbody>
      ${row('📅', `${L('الدورة دي', 'This cycle')} <small><bdi dir="ltr">${sd(from)} → ${sd(to)}</bdi></small>`, E.Ec, E.nowHave, E.spNow, E.leftNow)}
      ${E.debtOn ? row('➕', `${L(`أول ${NEXT_DAYS} أيام من الجاية`, `First ${NEXT_DAYS} days of the next`)} <small><bdi dir="ltr">${sd(n1)} → ${sd(n10)}</bdi></small>`, E.En, E.nextHave, E.spNext, E.leftNext) : ''}
      ${E.extra > 0.5 ? row('⬆️', L('فوق المطلوب', 'Above what is needed'), null, E.extra, E.spExtra, E.leftExtra) : ''}
      ${row('Σ', L('المجموع', 'Total'), E.need, E.alloc, E.spent, E.left, 'ft')}
    </tbody></table>
    ${(() => { // 📥 الفلوس دي جت منين: كل حاجة دخلت أو خرجت من الأساسيات الدورة دي (طلب صاحب الحساب، 2026-11-25)
      const R = c.R, rows = R.rows || {}, pd = paydayOf(S), src = [];
      if (c.mo.carry > 0.5) src.push([L('📦 اترحّل من الدورة اللي فاتت', '📦 Carried over from the last cycle'), '', c.mo.carry]);
      for (const t of S.tx) {
        if (periodOf(t.date, pd) !== c.ym) continue;
        const r = rows[t.id]; if (!r) continue;
        if (t.type === 'income' && r.d && r.d.essentials > 0.005) src.push([`💰 ${L('دخل', 'Income')}: ${esc(t.cat || t.note || '')}${r.ov ? ' ✏️ ' + L('(عدّلته بإيدك في شاشة التوزيع)', '(you changed it by hand on the split screen)') : ''}`, t.date, r.d.essentials]);
        if (t.type === 'transfer') {
          if ((t.toBucket || t.bucket) === 'essentials' && t.to !== 'XAU' && r.inAED > 0.005) src.push([`🔁 ${L('تحويل للأساسيات', 'Transfer into Essentials')} (${esc(t.cur || '')} → ${esc(t.to || '')})`, t.date, r.inAED]);
          if (t.bucket === 'essentials' && t.cur !== 'XAU') src.push([`↩️ ${L('تحويل من الأساسيات', 'Transfer out of Essentials')}`, t.date, -r.aed]);
        }
      }
      if (c.mo.toSafety > 0.5) src.push([L('🛟 راح للأمان', '🛟 Moved to Safety'), '', -c.mo.toSafety]);
      if (c.mo.toCard > 0.5) src.push([L('💳 الزيادة راحت لسداد الكارت', '💳 The extra went to paying the card'), '', -c.mo.toCard]);
      const sum = src.reduce((a, x) => a + x[2], 0), gap = E.alloc - sum;
      return `<h4>📥 ${L('الفلوس دي جت منين', 'Where this money came from')}</h4><table class="sw-t ess-src">${src.map(x => `<tr><td>${x[0]}${x[1] ? ` <small><bdi dir="ltr">${x[1]}</bdi></small>` : ''}</td><td dir="ltr" class="${x[2] < 0 ? 'neg' : ''}">${x[2] < 0 ? '−' : '+'}${fmt(Math.abs(x[2]))}</td></tr>`).join('')}
        ${Math.abs(gap) > 0.5 ? `<tr><td>❓ ${L('فرق مش معروف مصدره', 'A difference with no known source')}</td><td dir="ltr">${fmt(gap)}</td></tr>` : ''}
        <tr class="ft"><td>${L('= اللي اتحط في الأساسيات', '= Put into Essentials')}</td><td dir="ltr">${fmt(E.alloc)}</td></tr></table>`;
    })()}
    ${E.short > 0.5 ? `<p class="note bad">⬇️ ${L(`لسه ناقص ${fmt(E.short)} Đ عن المطلوب`, `Still ${fmt(E.short)} Đ short of what is needed`)}</p>` : ''}
    ${E.debtOn ? `<p class="note">➕ ${L(`الـ${NEXT_DAYS} أيام اتحسبوا كده: أساسيات الدورة الجاية ${fmt(nTot)} ÷ ${nDays} يوم × ${NEXT_DAYS} أيام = <b dir="ltr">${fmt(E.En)}</b>`, `The ${NEXT_DAYS} days are worked out as: next cycle's essentials ${fmt(nTot)} ÷ ${nDays} days × ${NEXT_DAYS} days = <b dir="ltr">${fmt(E.En)}</b>`)}</p>` : ''}
    <p class="note">${L('الصرف بياكل من فلوس الدورة دي الأول، بعدين من اللي فوق المطلوب، وآخر حاجة من فلوس الـ10 أيام الجاية.', "Spending comes out of this cycle's money first, then the extra above what is needed, and last the next 10 days' money.")}</p>
    <p class="note"><button type="button" class="pill" data-dailyview>🗓️ ${L(`تقدر تصرف ${fmt(DP.total, 2)} Đ في اليوم`, `You can spend ${fmt(DP.total, 2)} Đ a day`)} ›</button></p>
  </div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); if (e.target.closest('[data-dailyview]')) close(); });
}
document.addEventListener('click', e => { if (e.target.closest('[data-essview]')) { e.stopPropagation(); essDetails(); } });

function dailyPlan(c) {
  const [y, m] = c.ym.split('-').map(Number), pd = paydayOf(S), end = new Date(y, m, pd), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(1, Math.round((end - t0) / 864e5)), cyc = c.cyc, part = cyc?.since && cyc.f < 1, span = part ? cyc.left : cyc.days;
  // أول مرة: البنود اللي واضح إنها بتتصرف يوم بيوم (أكل، مواصلات، معيشة، خروجات) بتتعلّم يومي لوحدها
  if (!S.dailyInit) { S.dailyInit = true; for (const e of S.essentials) if (/أكل|اكل|food|grocer|مواصلات|transport|معيشة|living|خروج|entertain|بقالة|سوبر/i.test(e.name)) e.daily = true; }
  const all = S.essentials.filter(e => !prepaid(e, c.ym)).map(e => {
    const amt = itemFor(S, e, c.ym) * rate(cOf(e)) * (part && !e.full1 ? cyc.f : 1), spent = c.mo.items?.[e.id] || 0, remain = Math.max(0, amt - spent);
    return { id: e.id, icon: e.icon || '🧾', name: e.name, amt, spent, remain, normal: amt / Math.max(1, span), today: remain / daysLeft, daily: !!e.daily };
  }).filter(r => r.amt > 0.005);
  const rows = all.filter(r => r.daily), off = all.filter(r => !r.daily);
  if (S.dailyFun !== false) { const remain = Math.max(0, c.R.rewardAED); rows.push({ id: 'fun', icon: '🎉', name: B.reward.n, amt: remain, spent: 0, remain, normal: null, today: remain / daysLeft, fun: true }); }
  // الحد الأقصى في اليوم من الأساسيات كلها مع بعض (مش كل بند لوحده): الفاضل للدورة دي (ومعاه اللي فوق المطلوب)
  // − الفواتير اللي لسه هتتدفع مرة واحدة، ÷ الأيام الفاضلة. لو سالب: صرفت زيادة، والحد 0 لحد آخر الدورة.
  const sp = essSplit(c), offRemain = off.reduce((a, r) => a + r.remain, 0), pool = sp.avail - offRemain;
  const essDaily = Math.max(0, pool) / daysLeft, funRow = rows.find(r => r.fun), funDaily = funRow ? funRow.today : 0;
  return { rows, off, daysLeft, end: new Date(y, m, pd - 1), sp, offRemain, pool, essDaily, funDaily, over: Math.max(0, -pool),
    itemsTotal: rows.filter(r => !r.fun).reduce((a, r) => a + r.today, 0), total: essDaily + funDaily };
}
function dailyDetails() {
  const c = ctx(), P = dailyPlan(c), o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  const draw = () => {
    const P = dailyPlan(ctx());
    o.innerHTML = `<div class="wiz-card glass dly-card">
      <div class="wiz-top"><b>🗓️ ${L('مصروف النهارده', "Today's spending")}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
      <div class="dly-big"><small>${L('أقصى حاجة تصرفها النهارده', 'The most you can spend today')}</small><b dir="ltr">${fmt(P.total, 2)} Đ</b><small>${L(`فاضل ${P.daysLeft} يوم لحد ${dayName(P.end)} (آخر الدورة)`, `${P.daysLeft} days left until ${dayName(P.end)} (end of the cycle)`)}</small></div>
      <table class="sw-t dly-sum">
        <tr><td>🧾 ${L('فاضل في الأساسيات للدورة دي', 'Left in Essentials for this cycle')}${P.sp.extra > 0.5 ? L(' (ومعاه اللي فوق المطلوب)', ' (with the extra above what is needed)') : ''}</td><td dir="ltr">${fmt(P.sp.avail)}</td></tr>
        ${P.offRemain > 0.5 ? `<tr><td>− ${L('فواتير لسه هتتدفع مرة واحدة', 'Bills still to pay in one go')}</td><td dir="ltr">${fmt(P.offRemain)}</td></tr>` : ''}
        <tr><td>÷ ${L('الأيام الفاضلة', 'Days left')}</td><td dir="ltr">${P.daysLeft}</td></tr>
        <tr class="ft"><td>= ${L('الأساسيات في اليوم', 'Essentials a day')}</td><td dir="ltr">${fmt(P.essDaily, 2)}</td></tr>
        ${P.funDaily > 0.005 ? `<tr><td>+ 🎉 ${B.reward.n} ${L('في اليوم', 'a day')}</td><td dir="ltr">${fmt(P.funDaily, 2)}</td></tr>` : ''}
      </table>
      ${P.over > 0.5 ? `<p class="note bad">⚠️ ${L(`الفاضل مش مكفّي باقي الدورة: ناقص ${fmt(P.over)} Đ — فاضل ${fmt(Math.max(0, P.sp.avail))}${P.offRemain > 0.5 ? ` ولسه عليك فواتير ${fmt(P.offRemain)}` : ''}${P.sp.spNext > 0.5 ? `، و${fmt(P.sp.spNext)} اتاخدوا من فلوس الـ10 أيام الجاية` : ''}. عشان كده أقصى صرف من الأساسيات 0 في اليوم لحد آخر الدورة، والناقص ده محتاج يتغطّى من الدخل الجاي.`, `What's left doesn't cover the rest of the cycle: ${fmt(P.over)} Đ short — ${fmt(Math.max(0, P.sp.avail))} left${P.offRemain > 0.5 ? ` and bills of ${fmt(P.offRemain)} still to pay` : ''}${P.sp.spNext > 0.5 ? `, and ${fmt(P.sp.spNext)} came out of the next 10 days' money` : ''}. So the most from Essentials is 0 a day until the cycle ends, and the gap has to be covered by the next income.`)}</p>`
        : Math.abs(P.essDaily - P.itemsTotal) > 0.5 && P.rows.some(r => !r.fun) ? `<p class="note">${L(`البنود اليومية لوحدها بتقول ${fmt(P.itemsTotal, 2)} في اليوم، بس الحساب الكلي (بعد كل اللي اتصرف${P.sp.extra > 0.5 ? ' واللي فوق المطلوب' : ''}) بيقول ${fmt(P.essDaily, 2)}، وده اللي بيتحسب.`, `The daily items alone say ${fmt(P.itemsTotal, 2)} a day, but the overall sum (after everything spent${P.sp.extra > 0.5 ? ' and the extra above what is needed' : ''}) says ${fmt(P.essDaily, 2)}, and that is what counts.`)}</p>` : ''}
      ${P.rows.length ? `<ul class="list dly-list">${P.rows.map(r => {
        const up = r.normal != null && r.today > r.normal + 0.5, down = r.normal != null && r.today < r.normal - 0.5;
        return `<li class="row"><span class="badge">${r.icon}</span><div class="grow"><b>${esc(r.name)}</b>
          <small>${r.fun ? L(`في الحصّالة ${fmt(r.remain)} ÷ ${P.daysLeft} يوم`, `${fmt(r.remain)} in the jar ÷ ${P.daysLeft} days`) : L(`فاضل ${fmt(r.remain)} من ${fmt(r.amt)} ÷ ${P.daysLeft} يوم`, `${fmt(r.remain)} of ${fmt(r.amt)} left ÷ ${P.daysLeft} days`)}</small>
          ${r.normal != null ? `<small class="${up ? 'pos' : down ? 'neg' : ''}">${L(`العادي ${fmt(r.normal, 1)} في اليوم`, `Normally ${fmt(r.normal, 1)} a day`)}${up ? L(' · ⬆️ وفّرت قبل كده، فالنهارده أكتر', ' · ⬆️ you saved before, so today is more') : down ? L(' · ⬇️ صرفت أكتر قبل كده، فالنهارده أقل', ' · ⬇️ you spent more before, so today is less') : ''}</small>` : ''}</div>
          <span class="amt"><b dir="ltr">${fmt(r.today, 2)}</b><small dir="ltr">${fmt(r.remain, 2)} ÷ ${P.daysLeft}</small></span></li>`;
      }).join('')}</ul>` : `<p class="note">${L('لسه ما اخترتش أي بند يومي. اختار تحت البنود اللي ينفع تتقسم على الأيام.', "You haven't picked any daily items yet. Pick below the items that can be spread over the days.")}</p>`}
      ${P.off.length ? `<h3>🧾 ${L('بنود مش يومي (بتتدفع مرة)', 'Not daily (paid in one go)')}</h3><ul class="list dly-list off">${P.off.map(r => `<li class="row"><span class="badge">${r.icon}</span><div class="grow"><b>${esc(r.name)}</b><small>${L(`فاضل ${fmt(r.remain)} من ${fmt(r.amt)} لحد آخر الدورة · لو يومي هيبقى ${fmt(r.today, 2)} في اليوم`, `${fmt(r.remain)} of ${fmt(r.amt)} left until the cycle ends · as daily it would be ${fmt(r.today, 2)} a day`)}</small></div><button type="button" class="pill" data-dpick="${r.id}">📆 ${L('خلّيه يومي', 'Make daily')}</button></li>`).join('')}</ul>` : ''}
      <h3>⚙️ ${L('أنهي بنود تتقسم يومي؟', 'Which items are spread daily?')}</h3>
      <p class="note">${L('زي الأكل والمواصلات والفلوس الحرّة. الفواتير والإيجار اللي بيتدفع مرة واحدة ما ينفعش.', 'Like food, transport and free money. Bills, and rent that is paid in one go, should not be.')}</p>
      <div class="dly-pick">${S.essentials.filter(e => !prepaid(e, c.ym)).map(e => `<button type="button" class="pill ${e.daily ? 'on' : ''}" data-dpick="${e.id}">${e.icon || '🧾'} ${esc(e.name)}</button>`).join('')}<button type="button" class="pill ${S.dailyFun !== false ? 'on' : ''}" data-dpick="fun">🎉 ${B.reward.n}</button></div>
    </div>`;
  };
  draw(); document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  o.addEventListener('click', e => {
    if (e.target === o || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-dpick]'); if (!b) return;
    const id = b.dataset.dpick;
    if (id === 'fun') S.dailyFun = S.dailyFun === false; else { const it = S.essentials.find(x => x.id === id); if (it) { if (it.daily) delete it.daily; else it.daily = true; } }
    save(); render(); sfx.select(); draw();
  });
}
document.addEventListener('click', e => { if (e.target.closest('[data-dailyview]')) { e.stopPropagation(); dailyDetails(); } });

/* ───────────── 👛 "معاك": كل محفظة فيها كام وجوّاها إيه، والصافي بعد الدين ───────────── */
function haveDetails() {
  const c = ctx(), R = c.R, ess = Math.max(0, c.mo.essAlloc - c.mo.essSpent);
  const parts = [
    { k: 'essentials', v: ess, how: L(`اتحط للأساسيات الدورة دي ${fmt(c.mo.essAlloc)} − اتصرف ${fmt(c.mo.essSpent)}`, `Put into Essentials this cycle ${fmt(c.mo.essAlloc)} − spent ${fmt(c.mo.essSpent)}`) },
    { k: 'growth', v: R.growthAED, how: R.debt > 0.5 ? L('نصيب النمو بيروح للدين، فبيفضل فاضي', "Growth's share goes to the debt, so it stays empty") : L('استثمار', 'Investing') },
    { k: 'stability', v: R.stabilityAED, how: L('صندوق الطوارئ (ومعاه دهب الأمان)', 'Emergency fund (with the safety gold)') },
    { k: 'reward', v: R.rewardAED, how: L('حصّالة الفلوس الحرّة', 'The free money jar') },
  ];
  const tot = parts.reduce((a, x) => a + x.v, 0);
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd">
    <div class="wiz-top"><b>👛 ${L('معاك كام وفين', 'What you have and where')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    <ul class="list dd-list">${parts.map(x => `<li class="row"><span class="badge">${B[x.k].i}</span><div class="grow"><b>${B[x.k].n}</b><small>${x.how}</small>${inside(x.k, R).map(p => `<small>• ${p.n}: ${p.native}</small>`).join('')}</div><span class="amt"><b dir="ltr">${fmt(x.v)} Đ</b><small dir="ltr">${tot ? fmt(x.v / tot * 100, 1) : 0}%</small></span></li>`).join('')}</ul>
    <table class="sw-t"><tr><td>${L('المجموع (من غير الصدقة، دي مش فلوسك)', "Total (without sadaqa, that's not yours)")}</td><td dir="ltr">${parts.map(x => fmt(x.v)).join(' + ')} = <b>${fmt(tot)}</b></td></tr>
      ${R.debt > 0.5 ? `<tr><td>${L('− الدين', '− Debt')}</td><td dir="ltr">${fmt(R.debt)}</td></tr><tr class="ft"><td>${L('الصافي بعد الدين', 'Net after debt')}</td><td dir="ltr">${fmt(tot - R.debt)} Đ</td></tr>` : ''}
      ${R.sadaqaAED > 0.5 ? `<tr><td>🤲 ${L('صدقة مستنية تطلع (مش محسوبة)', 'Sadaqa waiting to be given (not counted)')}</td><td dir="ltr">${fmt(R.sadaqaAED)}</td></tr>` : ''}</table>
  </div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
}
document.addEventListener('click', e => { if (e.target.closest('[data-haveview]')) { e.stopPropagation(); haveDetails(); } });

/* ───────────── 🛟 هدف الأمان اتحسب إزاي: كل بند في كل وضع ← أغلى وضع × 5 (طلب صاحب الحساب، 2026-11-20) ───────────── */
function safeDetails() {
  const R = ctx().R, no = new Set(S.noSit || []), SN = SIT_N();
  const sits = ['AED+AED', 'AED+EGP', 'EGP+EGP'].filter(k => !no.has(k));
  const at = (e, k) => { const [me, wife] = k.split('+'); return amtAt(e, { me, wife }); };
  const tot = k => S.essentials.reduce((a, e) => a + at(e, k) * rate(cOf(e)), 0);
  const worst = R.worst.sit, target = R.lastSpare, have = R.stabilityAED;
  const head = { 'AED+AED': '🇦🇪🇦🇪', 'AED+EGP': '🇦🇪🇪🇬', 'EGP+EGP': '🇪🇬🇪🇬' };
  const cell = (e, k) => { const v = at(e, k), c = cOf(e); return `<td dir="ltr" class="${k === worst ? 'w' : ''}">${fmt(v * rate(c))}${c !== 'AED' && v ? `<small>${fmt(v)} ${CUR[c]?.s || c}</small>` : ''}</td>`; };
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd">
    <div class="wiz-top"><b>🛟 ${L(`هدف الأمان اتحسب إزاي`, 'How the Safety target is calculated')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    <p class="wiz-help">${L(`بنحسب شهر أساسيات كامل في كل وضع ممكن ليك ولمراتك (بكل البنود كاملة، حتى المدفوع مقدّم)، وناخد <b>أغلاهم</b> ونضربه في <b>${SAFE_MONTHS} شهور</b>. كله بالدرهم بسعر النهارده.`, `We price a full month of Essentials in every possible situation for you and your wife (every item in full, even prepaid ones), take the <b>most expensive</b> and multiply it by <b>${SAFE_MONTHS} months</b>. All in AED at today's rate.`)}</p>
    <div class="sd-wrap"><table class="sw-t sd-t">
      <tr class="hd"><td>${L('البند', 'Item')}</td>${sits.map(k => `<td dir="ltr" class="${k === worst ? 'w' : ''}" title="${SN[k]}">${head[k]}</td>`).join('')}</tr>
      ${S.essentials.map(e => `<tr><td>${e.icon || '•'} ${esc(e.name)}</td>${sits.map(k => cell(e, k)).join('')}</tr>`).join('')}
      <tr class="ft"><td>${L('شهر كامل', 'Full month')}</td>${sits.map(k => `<td dir="ltr" class="${k === worst ? 'w' : ''}">${fmt(tot(k))}</td>`).join('')}</tr>
    </table></div>
    <ul class="how sd-legend">${sits.map(k => `<li><span>${head[k]} ${SN[k]}${k === worst ? ` <b>← ${L('الأغلى', 'most expensive')} 🔺</b>` : ''}</span><b dir="ltr">${fmt(tot(k))} Đ</b></li>`).join('')}</ul>
    ${no.size ? `<p class="wiz-note">🚫 ${L('أوضاع مستبعدة (قلت إنها مش هتحصل)', 'Excluded situations (you said they won\'t happen)')}: ${[...no].map(k => SN[k]).join('، ')}</p>` : ''}
    <table class="sw-t"><tr><td>${L('أغلى شهر', 'Most expensive month')}</td><td dir="ltr">${fmt(R.worst.amount)}</td></tr>
      <tr><td>× ${L('عدد الشهور', 'months')}</td><td dir="ltr">${SAFE_MONTHS}</td></tr>
      <tr class="ft"><td>🎯 ${L('هدف الأمان', 'Safety target')}</td><td dir="ltr">${fmt(R.worst.amount)} × ${SAFE_MONTHS} = <b>${fmt(target)}</b> Đ</td></tr>
      <tr><td>${L('معاك في الأمان', 'You have in Safety')}</td><td dir="ltr">${fmt(have)} (${fmt(target ? Math.min(100, have / target * 100) : 0, 1)}%)</td></tr>
      <tr class="ft"><td>${L('فاضل', 'Left')}</td><td dir="ltr">${fmt(target)} − ${fmt(have)} = <b>${fmt(Math.max(0, target - have))}</b> Đ</td></tr></table>
    <p class="wiz-note">${R.debt > 0.5 ? L('💳 دلوقتي عليك دين، فالأمان مش بياخد حاجة لحد ما الدين يخلص، وبعدها بياخد نصيبه لحد الهدف ده.', '💳 You have debt now, so Safety takes nothing until the debt is cleared, then it takes its share up to this target.') : L('✅ الأمان بياخد نصيبه لحد ما يوصل الهدف، وبعدها نصيبه يروح للاستثمار 📈.', '✅ Safety takes its share until it reaches the target, then its share goes to investing 📈.')} ${L('غيّر أي بند في الأساسيات والهدف يتحسب تاني لوحده.', 'Change any essentials item and the target recalculates by itself.')}</p>
  </div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
}
document.addEventListener('click', e => { if (e.target.closest('[data-safeview]') && !e.target.closest('a,input')) safeDetails(); });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-safeview]')) { e.preventDefault(); safeDetails(); } });

/* ───────────── 💳 تفاصيل الدين: حركات الدين بس (طلب صاحب الحساب، 2026-11-20) ───────────── */
function debtDetails(only) {
  const R = ctx().R, ds = debts().filter(d => !only || d.id === only);
  const pc = (x, of) => of > 0 ? `${fmt(x / of * 100, 1)}%` : '—';
  const cards = ds.map(d => {
    const cu = cOf(d), r8 = rate(cu), start = (+d.balance || 0) * r8, left = dLeft(R, d) * r8, paid = Math.max(0, start - left);
    // السجل بالترتيب: اتضاف ← كل سداد (من دخل أو مباشر) والباقي بعده
    const ev = [];
    for (const t of S.tx) {
      const rw = R.rows[t.id], y = rw?.paidTo?.[d.id]; if (!(y > 0.005)) continue;
      if (t.type === 'income') ev.push({ date: t.date, id: t.id, i: '💰', n: L(`نصيب النمو من دخل «${esc(t.note || '')}»`, `Growth share of income “${esc(t.note || '')}”`), s: L(`الدخل ${money(t.amount, cOf(t))} · راح للدين ${pc(y, rw.aed)} منه`, `Income ${money(t.amount, cOf(t))} · ${pc(y, rw.aed)} of it went to the debt`), aed: y });
      else ev.push({ date: t.date, id: t.id, i: t.pair ? '🔁' : '💳', n: esc(t.note || L('سداد مباشر', 'Direct payment')), s: t.pair ? L('من تحويل عملة/دهب', 'from a currency/gold transfer') : L(`من محفظة ${B[t.bucket || 'growth']?.n || ''}`, `from the ${B[t.bucket || 'growth']?.n || ''} wallet`), aed: y });
    }
    ev.sort((a, b) => a.date.localeCompare(b.date) || (S.tx.findIndex(x => x.id === a.id) - S.tx.findIndex(x => x.id === b.id)));
    let bal = start;
    for (const e of ev) { bal -= e.aed; e.after = Math.max(0, bal); }
    const rows = [...ev].reverse().map(e => `<li class="row tx"><span class="badge">${e.i}</span><div class="grow"><b>${e.n}</b><small>${dayName(new Date(e.date + 'T00:00:00'))} · ${e.s}</small>
        <small>${L('الباقي بعده', 'Left after')} <b dir="ltr">${fmt(e.after)}</b> · ${L('اتسدّد لحد هنا', 'paid so far')} <b dir="ltr">${pc(start - e.after, start)}</b></small></div>
        <span class="amt"><b dir="ltr" class="pos">−${fmt(e.aed)}</b><small dir="ltr">${pc(e.aed, start)}</small></span></li>`).join('');
    const added = `<li class="row tx dd-add"><span class="badge">➕</span><div class="grow"><b>${L('الدين اتضاف', 'Debt added')}</b><small>${d.since ? dayName(new Date(d.since + 'T00:00:00')) : L('من الأول', 'From the start')} · ${DKIND_N[d.kind] || ''} · ${CUR[cu].n}</small></div><span class="amt"><b dir="ltr" class="neg">+${fmt(start)}</b><small>100%</small></span></li>`;
    const other = Math.max(0, paid - ev.reduce((a, e) => a + e.aed, 0)); // سداد اتسجّل بتعديل الرقم بإيدك
    return `<div class="dd-card"><b>${DKIND[d.kind] || '🧾'} ${esc(d.name)}</b>${bar(start ? paid / start : 0, '#34d399')}
      <div class="dd-kv"><span>${L('البداية', 'Started at')} <b dir="ltr">${fmt(start)} Đ</b></span><span>${L('اتسدّد', 'Paid')} <b dir="ltr" class="pos">${fmt(paid)} (${pc(paid, start)})</b></span><span>${L('الباقي', 'Left')} <b dir="ltr" class="neg">${fmt(left)} (${pc(left, start)})</b></span></div></div>
      <h3>📜 ${L('سجل الدين', 'Debt log')} <small>(${ev.length} ${L('سداد', 'payments')} · ${L('مجموع', 'total')} <b dir="ltr">${fmt(ev.reduce((a, e) => a + e.aed, 0))} Đ</b>)</small></h3>
      <ul class="list dd-list">${rows}${other > 0.5 ? `<li class="row tx"><span class="badge">✏️</span><div class="grow"><b>${L('اتعدّل بإيدك', 'Edited by hand')}</b><small>${L('الرقم الباقي اتغيّر من كارت الديون', 'The remaining amount was changed from the Debts card')}</small></div><span class="amt"><b dir="ltr" class="pos">−${fmt(other)}</b><small dir="ltr">${pc(other, start)}</small></span></li>` : ''}${added}</ul>`;
  }).join('<hr class="dd-hr">');
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd">
    <div class="wiz-top"><b>💳 ${L('تفاصيل الدين', 'Debt details')}</b>${HOSTED ? `<button type="button" class="pill" data-restoreview>⏪ ${L('رجّع نسخة قبل كده', 'Restore an earlier copy')}</button>` : ''}<button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    ${cards || `<p class="note">${L('مفيش ديون ✅', 'No debt ✅')}</p>`}
  </div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-debtview]'); if (b) { e.stopPropagation(); debtDetails(b.dataset.debtview || null); } });

/* ───────────── ⏪ رجّع نسخة قبل كده (طلب صاحب الحساب، 2026-11-25: "خليت الكارت 0 بالغلط") ─────────────
   السيرفر بيحفظ نسخة كل 10 دقايق (آخر 40). القايمة بتوري وقت كل نسخة ورقم كل دين فيها،
   والرجوع محتاج الرقم السري بتاع فلوسي، والنسخة الحالية بتتحفظ الأول فتقدر ترجع تاني. */
async function restoreView() {
  const o = document.createElement('div');
  o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="wiz-card glass dd"><div class="wiz-top"><b>⏪ ${L('رجّع نسخة قبل كده', 'Restore an earlier copy')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div><p class="note">${L('بيحمّل…', 'Loading…')}</p></div>`;
  document.body.appendChild(o); sfx.open();
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 220); };
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
  let j;
  try { const r = await fetch('/api/ideas?finance=backups', { cache: 'no-store' }); j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); }
  catch (err) { o.querySelector('.note').textContent = L('مقدرتش أجيب النسخ: ', 'Could not load the copies: ') + err.message; return; }
  const when = at => new Date(at).toLocaleString(L('ar-EG', 'en-GB'), { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const dl = x => x.debts.map(d => `${esc(d.name)}: <b dir="ltr">${fmt(d.balance)} ${CUR[d.cur]?.s || d.cur}</b>`).join(' · ') || L('مفيش ديون', 'No debts');
  o.querySelector('.wiz-card').innerHTML = `<div class="wiz-top"><b>⏪ ${L('رجّع نسخة قبل كده', 'Restore an earlier copy')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
    <p class="note">${L('السيرفر بيحفظ نسخة كل 10 دقايق (آخر 40). الرقم جنب كل دين هو رقمه الأصلي في النسخة دي. اختار النسخة اللي قبل الغلطة.', 'The server keeps a copy every 10 minutes (the last 40). The number by each debt is its starting amount in that copy. Pick the copy from just before the mistake.')}</p>
    ${j.now ? `<div class="row rst now"><div class="grow"><b>🟢 ${L('دلوقتي', 'Now')} · ${when(j.now.at)}</b><small>${dl(j.now)} · ${j.now.tx} ${L('معاملة', 'transactions')}</small></div></div>` : ''}
    <ul class="list rst-list">${j.backups.map(b => `<li class="row rst"><div class="grow"><b>${when(b.at)}</b><small>${dl(b)} · ${b.tx} ${L('معاملة', 'transactions')}</small></div><button type="button" class="pill" data-rst="${b.id}">${L('رجّع دي', 'Restore this')}</button></li>`).join('') || `<li class="note">${L('مفيش نسخ لسه', 'No copies yet')}</li>`}</ul>`;
  o.addEventListener('click', async e => {
    const b = e.target.closest('[data-rst]');
    if (b) { // الرجوع بالرقم السري بتاع فلوسي (طلب صاحب الحساب)
      o.querySelectorAll('.rst-pin').forEach(x => x.remove());
      b.closest('li').insertAdjacentHTML('beforeend', `<form class="rst-pin" data-id="${b.dataset.rst}"><input type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="${L('الرقم السري', 'PIN')}" required><button type="submit" class="pill">${L('رجّع', 'Restore')}</button></form>`);
      o.querySelector('.rst-pin input').focus();
    }
  });
  o.addEventListener('submit', async e => {
    const f = e.target.closest('.rst-pin'); if (!f) return;
    e.preventDefault();
    const btn = f.querySelector('button'), pin = f.querySelector('input').value;
    btn.disabled = true;
    try {
      const r = await fetch('/api/ideas?finance=restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +f.dataset.id, pin }) });
      const k = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 403 ? L('الرقم السري غلط', 'Wrong PIN') : (k.error || r.status));
      toast(L('⏪ النسخة رجعت، بيحمّل…', '⏪ Restored, reloading…')); sfx.ok();
      setTimeout(() => location.reload(), 700);
    } catch (err) { btn.disabled = false; f.querySelector('input').value = ''; toast(L('ما رجعتش: ', 'Not restored: ') + err.message); sfx.err(); }
  });
}
document.addEventListener('click', e => { if (e.target.closest('[data-restoreview]')) { e.stopPropagation(); restoreView(); } });

// تاريخ البداية في مربع أول دورة: كل الحسابات (الأيام اللي فاضلة) بتتظبط عليه
document.addEventListener('change', e => {
  if (!e.target.matches?.('[data-since]') || !/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
  S.since = e.target.value; save(); render(); sfx.select();
  toast(L(`📍 البداية بقت ${dayName(new Date(S.since + 'T00:00:00'))}`, `📍 Start date is now ${dayName(new Date(S.since + 'T00:00:00'))}`));
});
document.addEventListener('click', e => { const b = e.target.closest('[data-cated]'); if (b) catEditor(b.dataset.cated); });
let resetArmed = 0;
// مسح معاملة ليها جرامات أو وحدات: نرجّعها للحتة اللي اتاخدت منها أو اتضافت ليها
// التحويل اللي سدّ دين بيتسجّل سطرين (🔁 التحويل + 💳 السداد) وهما عملية واحدة: يتمسحوا مع بعض.
// القديم من غير pair: السداد اللي جه بعد التحويل على طول بنفس اليوم والعملة
function pairOf(t) {
  if (!t) return null;
  if (t.pair) return S.tx.find(x => x.id === t.pair) || null;
  const i = S.tx.indexOf(t);
  if (t.type === 'transfer') { const n = S.tx[i + 1]; return n && n.type === 'debtpay' && !n.pair && n.date === t.date && n.cur === t.to ? n : null; }
  if (t.type === 'debtpay') { const p = S.tx[i - 1]; return p && p.type === 'transfer' && !p.pair && p.date === t.date && p.to === t.cur ? p : null; }
  return null;
}
// يمسح المعاملة (واللي مربوطة بيها) ويرجّع الجرامات/الوحدات
function dropTx(id) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  const both = [t, pairOf(t)].filter(Boolean);
  both.forEach(revertHold);
  S.tx = S.tx.filter(x => !both.includes(x));
}
function revertHold(t) {
  if (!t) return;
  const hh = t.hold && S.holdings.find(x => x.id === t.hold), th = t.toHold && S.holdings.find(x => x.id === t.toHold);
  if (hh && t.type === 'invest') { hh.amount = Math.max(0, +hh.amount - (+t.units || 0)); hh.cost = Math.max(0, (+hh.cost || 0) - t.amount); }
  if (hh && t.type === 'divest') { hh.amount = +hh.amount + (+t.units || 0); hh.cost = (+hh.cost || 0) + (+t.costOut || 0); }
  if (hh && t.type === 'transfer') { hh.amount = +hh.amount + (+t.amount || 0); hh.cost = (+hh.cost || 0) + (+t.costOut || 0); } // مسح بيع دهب: الجرامات ترجع
  if (th && t.type === 'transfer') { th.amount = Math.max(0, +th.amount - (+t.toAmount || 0)); th.cost = Math.max(0, (+th.cost || 0) - (+t.costIn || 0)); } // مسح شراء دهب
}
cardsEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.daily && b.classList.contains('dly')) { const e = S.essentials.find(x => x.id === d.daily); if (e) { if (e.daily) delete e.daily; else e.daily = true; save(); render(); sfx.select(); toast(e.daily ? L(`📆 «${esc(e.name)}» بقى يومي`, `📆 “${esc(e.name)}” is now daily`) : L(`«${esc(e.name)}» مش يومي`, `“${esc(e.name)}” is no longer daily`)); } return; }
  if ('sinceToday' in d) { S.since = today(); save(); render(); sfx.select(); return toast(L(`📅 بدأت من النهارده: ${dayName(new Date())}`, `📅 Started today: ${dayName(new Date())}`)); }
  if (d.essf !== undefined && b.closest('.ess-f')) { UI.essF = d.essf; sfx.select(); return render(); }
  if (d.full1) { const e = S.essentials.find(x => x.id === d.full1); if (e) { if (d.v === '1') e.full1 = true; else delete e.full1; save(); render(); sfx.select(); toast(L(e.full1 ? `💯 «${esc(e.name)}» هيتحسب كامل الدورة دي` : `📆 «${esc(e.name)}» هيتحسب بالأيام الدورة دي`, e.full1 ? `💯 “${esc(e.name)}” counts in full this cycle` : `📆 “${esc(e.name)}” counts by days this cycle`)); } return; }
  if (d.add === 'essentials') return openEss(null);
  if (d.eedit) return openEss(d.eedit);
  if (d.add) {
    const it = NEW[d.add](); S[d.add].push(it); save(); render();
    const el = cardsEl.querySelector(`[data-p="${d.add}:${it.id}:name"]`);
    if (el) { el.focus(); document.getSelection().selectAllChildren(el); }
  } else if (d.del) {
    const [coll, id] = d.del.split(':');
    const go = () => {
      const undo = JSON.stringify(S);
      if (coll === 'tx') dropTx(id); else S[coll] = S[coll].filter(x => x.id !== id); save(); render(); toast(coll === 'tx' ? pick(DEL_OK()) : L('اتمسح 🧹', 'Deleted 🧹'), undo); sfx.del();
    };
    if (coll === 'tx') return askPin(pick(DEL_ASK())).then(ok => ok && go());
    // أي مسح تاني بتأكيد: أول دوسة الزرار بيقول "متأكد؟"، والتانية (خلال 4 ثواني) بتمسح
    if (b.dataset.armed !== '1') {
      cardsEl.querySelectorAll('[data-armed="1"]').forEach(x => { x.dataset.armed = ''; x.classList.remove('armed'); x.textContent = '✕'; });
      b.dataset.armed = '1'; b.classList.add('armed'); b.textContent = L('متأكد؟ 🗑️', 'Sure? 🗑️'); sfx.warn();
      clearTimeout(UI.delT); UI.delT = setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.classList.remove('armed'); b.textContent = '✕'; } }, 4000);
      return;
    }
    go();
  } else if (d.done) {
    const [id, key] = d.done.split(':'), tx = S.tx.find(x => x.id === id);
    if (id === 'card') { (S.cardDone ??= {})[key] = true; save(); render(); toast(pick(JOKES.ok)); party(['💳', '✅', '💪']); sfx.ok(); return; }
    if (key === 'sad') { // علّمت إنك طلّعتها: سجّلها مصروف من بند الصدقة
      const r = ctx().R.rows[id];
      if (r?.sadaqa > 0.005) S.tx.push({ id: uid(), date: today(), type: 'expense', bucket: 'sadaqa', amount: r.sadaqa / r.r, cur: tx.cur, rate: tx.rate, note: L('صدقة', 'Sadaqa') });
    }
    (tx.done ??= {})[key] = true; save(); render(); toast(pick(JOKES.ok)); party(['✅', '👏', '💪']); sfx.ok();
  } else if (d.where) { // 📌 ثابت ← 📍 حسب مكانك ← 👫 حسب مكانك ومكان مراتك ← 📌
    const e = S.essentials.find(x => x.id === d.where);
    if (e.where && e.whereMode === 'both') { delete e.where; delete e.whereMode; toast(L('رجع مبلغ ثابت 📌', 'Back to a fixed amount 📌')); }
    else if (e.where) {
      e.whereMode = 'both';
      for (const me of places()) for (const w of places()) e.where[`${me}+${w}`] ??= e.where[me] ?? +e.amount ?? 0;
      toast(L('👫 اكتب المبلغ لكل موقف (إنت فين ومراتك فين)', '👫 Type the amount for each situation (where you are and where your wife is)'));
    } else {
      // بند بالدرهم: افتراضيًا بيقف لما تكون في مصر. بند بالجنيه: نفس المبلغ في الحالتين لحد ما تعدّله.
      e.where = Object.fromEntries(places().map(x => [x, x === cOf(e) || cOf(e) !== 'AED' ? +e.amount || 0 : 0]));
      toast(L('📍 اكتب المبلغ لكل مكان', '📍 Type the amount for each place'));
    }
    save(); render();
  } else if (d.move) { applySit({ me: d.move });
  } else if (d.wife) { applySit({ wife: d.wife });
  } else if ('unmove' in d) {
    const before = essNow(); S.stays = (S.stays || []).slice(0, -1); save(); render();
    sitChanged(before, L('↩️ اتمسح آخر تغيير في المكان.', '↩️ Removed the last change of place.'));
  } else if (d.cview) { S.view = d.cview; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (d.ecur || d.dcur) { // غيّر دولة البند/الدين (العملة)؛ المبلغ بيفضل نفس الرقم
    const x = d.ecur ? S.essentials.find(y => y.id === d.ecur) : debts().find(y => y.id === d.dcur), o = places();
    x.cur = o[(o.indexOf(cOf(x)) + 1) % o.length]; save(); render();
    toast(L(`بقى بال${CUR[x.cur].n} ${CUR[x.cur].f}`, `Now in ${CUR[x.cur].n} ${CUR[x.cur].f}`));
  } else if (d.dkind) {
    const x = debts().find(y => y.id === d.dkind), ks = Object.keys(DKIND);
    x.kind = ks[(ks.indexOf(x.kind) + 1) % ks.length]; save(); render();
  } else if (d.payoff) {
    const x = debts().find(y => y.id === d.payoff);
    setDebtLeft(d.payoff, 0); save(); render(); party(['💳', '🎉', '✅']); sfx.ok();
    toast(L(`مبروك 🎉 ${x.name} خلص`, `Congrats 🎉 ${x.name} is paid off`));
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
  if (e.target.id === 'risk') { S.risk = +e.target.value; save(); $('#riskBox').innerHTML = riskHTML(); sfx.tick(); clearTimeout(UI.riskT); UI.riskT = setTimeout(render, 350); }
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

// الكروت: ضوء بيمشي ورا الماوس/الصباع + كبسة خفيفة لما تدوس (بدل الميل الـ3D)
cardsEl.addEventListener('pointermove', e => {
  const cd = e.target.closest?.('.card'); if (!cd) return;
  const r = cd.getBoundingClientRect();
  cd.style.setProperty('--mx', `${e.clientX - r.left}px`); cd.style.setProperty('--my', `${e.clientY - r.top}px`);
});
cardsEl.addEventListener('pointerdown', e => {
  const cd = e.target.closest?.('.card'); if (!cd) return;
  const r = cd.getBoundingClientRect();
  cd.style.setProperty('--mx', `${e.clientX - r.left}px`); cd.style.setProperty('--my', `${e.clientY - r.top}px`);
  cd.classList.add('lit'); if (!e.target.closest('.ed, input')) cd.classList.add('pressed');
});
const unpress = () => cardsEl.querySelectorAll('.pressed, .lit').forEach(x => { x.classList.remove('pressed'); setTimeout(() => x.classList.remove('lit'), 400); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => cardsEl.addEventListener(t, unpress));

/* ───────────── الشات ───────────── */
const logEl = $('#log'), chipsEl = $('#chips'), sayIn = $('#sayIn');
let pending = null, atMenu = false;
const BACK = { get l() { return L('↩️ رجوع', '↩️ Back'); }, v: null };
const scrollLog = () => { logEl.scrollTop = logEl.scrollHeight; };
async function bot(html, cls = '') {
  const el = document.createElement('div'); el.className = 'msg bot typing'; el.innerHTML = '<i></i><i></i><i></i>';
  logEl.append(el); scrollLog(); await sleep(380);
  if (UI.greet) { cls += ' greet'; UI.greet = false; } // ترحيب القايمة: في وضع قرش بيظهر سطر صغير تحت الرد
  el.className = 'msg bot ' + cls + (LOCK ? '' : ' priv'); el.innerHTML = html; scrollLog(); sfx.pop();
  if (cls !== 'thinking') logChat('shark', el.innerText);
  const ag = document.getElementById('agent'); if (ag) { ag.classList.remove('talk'); void ag.offsetWidth; ag.classList.add('talk'); clearTimeout(UI.agT); UI.agT = setTimeout(() => ag.classList.remove('talk'), 900); }
  return el;
}
function me(text) {
  const el = document.createElement('div'); el.className = 'msg me' + (LOCK ? '' : ' priv');
  el.textContent = LOCK ? String(text).replace(/[\d٠-٩]/g, '•') : text; // والأرقام مستخبية، اللي بتكتبه بيتغطى
  logEl.append(el); scrollLog(); sfx.send();
  logChat('owner', String(text));
}
/* 🧠 ذاكرة قرش: الشات كله بيتحفظ في قاعدة بياناتك (مش في أي مكان تاني)، عشان الذكاء الاصطناعي يفتكر كل اللي اتكلمنا فيه (2026-11-20) */
const chatQ = [];
function logChat(who, text) {
  const t = String(text || '').replace(/\s+/g, ' ').replace(/🔊/g, '').trim(); if (!t || !HOSTED || location.hostname === '127.0.0.1') return;
  chatQ.push({ who, text: t.slice(0, 3000) }); clearTimeout(UI.chatT); UI.chatT = setTimeout(flushChat, 2500);
}
function flushChat() {
  if (!chatQ.length) return;
  const items = chatQ.splice(0, 50);
  fetch('/api/ideas?finance=chatlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }), keepalive: true }).catch(() => chatQ.unshift(...items));
}
addEventListener('pagehide', flushChat);
// 🦈 وضع قرش: شاشة كاملة فوق الشات نفسه
const SX = sharkMode({ L, esc, sfx, logEl, chipsEl, form: $('#say'), sayIn });
let curOpts = [], curFree = false;
function setChips(opts) {
  curOpts = opts || [];
  chipsEl.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.l; b.onclick = () => answer(o.v, o.l); chipsEl.append(b); });
}
async function ask(q, opts = [], free = false) {
  // سؤال بيقول "اكتب" (اسم الشركة، الهدف…) بياخد أي كلام حتى لو فيه اختيارات تحت
  if (!free && /اكتب|type the|your own words|in your words/i.test(String(q))) free = true;
  await bot(q); setChips(opts); curFree = free; UI.lastQ = String(q).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  const pr = new Promise(res => { pending = res; });
  if (UI.hint && opts.length) autoFill(opts);
  return pr;
}
/* ───────────── 🦈 قرش بيفهم الكلام: أي حاجة مكتوبة مش اختيار بتروح للذكاء الاصطناعي يقرر (طلب صاحب الحساب، 2026-11-20) ─────────────
 * pick = قصدك اختيار من اللي تحت · free = إجابة حرة · reply = سؤال جانبي: يرد ويفضل نفس السؤال · switch = عايز حاجة تانية خالص
 * ai = سؤال فلوس محتاج تفكير · none = مش واضح: يشرح المطلوب. ولو الذكاء الاصطناعي مش متاح، بيرجع للمطابقة العادية. */
const TASKS = () => MENU.map(m => ({ v: m.v, l: m.l }));
async function understand(typed, { mode = 'normal', opts = curOpts, q = UI.lastQ || '', free = curFree } = {}) {
  if (!HOSTED) return null;
  try {
    const r = await fetch('/api/ideas?finance=intent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, opts: opts.map(o => ({ l: o.l, v: o.v == null ? null : String(o.v) })), free, typed, mode, flows: TASKS(), data: aiData(), history: chatHistory().slice(-12), lang: L('ar', 'en') }) });
    if (r.status === 401) { expired(); return null; }
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const optOf = (opts, v) => opts.find(o => (o.v == null ? null : String(o.v)) === v);
// الحاجات اللي بتحفظ أو تمسح أو تأكد: قرش عمره ما يدوسها لوحده
const RISKY = /احفظ|سجّل|سجل|تأكيد|أكّد|اكد|امسح|احذف|ابعت|save|confirm|delete|remove|send|yes|أيوه|ايوه|تمام/i;
// كتبت جملة كاملة ("صرفت 50 على الأكل"): قرش بيملا الخطوات اللي واضحة من كلامك، ويقف عند أول حاجة مش واضحة أو أي حفظ
async function autoFill(opts) {
  const p0 = pending, hint = UI.hint;
  if (++UI.hintN > 4) { UI.hint = null; return; }
  const d = await understand(hint, { mode: 'prefill', opts });
  if (pending !== p0 || UI.hint !== hint) return;
  if (d?.action === 'free' && d.value && isFinite(parseNum(d.value))) return answer(d.value, `🦈 ${d.value}`);
  const o = d?.action === 'pick' ? optOf(opts, d.v) : null;
  if (!o || o.v == null || RISKY.test(o.l) || RISKY.test(String(o.v))) { UI.hint = null; return; }
  answer(o.v, `🦈 ${o.l}`);
}
async function runTask(d, typed) {
  UI.hint = typed; UI.hintN = 0;
  const m = d.amount > 0 ? { amount: d.amount, cur: d.cur || null } : null;
  try {
    if (m && (d.flow === 'salary' || d.flow === 'side')) await flowIncome(d.flow, m);
    else if (m && d.flow === 'spend') await flowSpend(m);
    else if (FLOWS[d.flow]) await FLOWS[d.flow]();
  } finally { UI.hint = null; }
}
// الكلام المكتوب بدل الدوس على اختيار: لو قريب من اختيار نختاره، ولو مش مفهوم نقول "اختار تاني" من غير ما نرجّع من الأول
const bare = t => norm(String(t)).toLowerCase().replace(/[\p{Extended_Pictographic}\uFE0F\u200d]/gu, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
function matchOpt(t, opts) {
  const x = bare(t); if (!x) return null;
  const c = opts.map(o => ({ o, l: bare(o.l), v: bare(o.v) }));
  const exact = c.find(k => k.l === x || k.v === x); if (exact) return exact.o;
  // رقم مكتوب عمره ما يتطابق "تقريبًا" مع زرار: "5088.75" فيها 0 فكانت بتختار زرار "0" وتصفّر الدين (2026-11-25)
  if (/\d/.test(String(t)) && /^[\s\d.,٠-٩٫٬+-]+$/.test(String(t))) return null;
  const near = c.filter(k => k.l && (k.l.includes(x) || x.includes(k.l)));
  return near.length === 1 ? near[0].o : null;
}
function answer(v, label, echo = true) {
  if (!pending) return;
  if (v === null) sfx.back?.(); // رجوع / وقّف / لأ: صوت الرجوع
  if (echo) me(label ?? v); const p = pending; pending = null; atMenu = false; setChips([]); p(v);
}
// لزق قايمة (كذا سطر): خانة الكتابة سطر واحد وكانت هتلزق السطور في بعض، فبنبعتها زي ما هي
sayIn.addEventListener('paste', e => {
  const t = e.clipboardData?.getData('text') || '';
  if (!/\n/.test(t.trim()) || parseList(t).length < 2 || !pending) return;
  e.preventDefault(); answer(t, L(`📋 قايمة (${parseList(t).length} بنود)`, `📋 A list (${parseList(t).length} items)`));
});
logEl.addEventListener('click', e => {
  const b = e.target.closest('[data-move],[data-wife],[data-same]'); if (!b) return;
  b.closest('.sitbtns')?.querySelectorAll('button').forEach(x => { x.disabled = true; });
  if (b.dataset.move) applySit({ me: b.dataset.move });
  else if (b.dataset.wife) applySit({ wife: b.dataset.wife });
  else toast(L('👍 تمام، زي ما هو', '👍 Okay, same as before'));
});
/** كلام شكله سؤال/كلام حر (مش رد على السؤال اللي في الشات): بيروح للذكاء الاصطناعي */
const looksLikeQuestion = t => {
  const w = t.trim().split(/\s+/).length;
  if ([...chipsEl.querySelectorAll('.chip')].some(b => b.textContent.trim() === t.trim())) return false;
  return w >= 10 || (w >= 4 && /[?؟]|\b(should|can|could|how|what|why|when|which|is it|do i|better)\b|أقدر|اقدر|ينفع|إزاي|ازاي|ليه|إمتى|امتى|هل|أعمل|اعمل|المفروض|أحسن|احسن|أفضل|افضل|كام/i.test(t));
};
$('#say').addEventListener('submit', async e => {
  e.preventDefault(); const v = sayIn.value.trim(); if (!v) return; sayIn.value = '';
  // في نص سؤال: لو الكلام قريب من اختيار ناخده على طول، ولو رقم بسيط يبقى إجابة
  if (pending && !atMenu) {
    const m = curOpts.length ? matchOpt(v, curOpts) : null; if (m) return answer(m.v, m.l);
    if (UI.agentAsk) return answer(v, v); // سؤال من قرش نفسه: الكلام يروحله زي ما هو
    const words = v.split(/\s+/).length, num = isFinite(parseNum(v)) && words <= 3;
    if (num || ((curFree || !curOpts.length) && words <= 6 && !looksLikeQuestion(v))) return answer(v, v);
    // غير كده: قرش يفهم قصدك (اختيار / سؤال جانبي / حاجة تانية خالص)
    me(v); const p0 = pending, keep = curOpts, keepFree = curFree;
    setChips([]); const th = await bot('🦈 <i>' + L('بفهم قصدك…', 'Getting what you mean…') + '</i>', 'thinking');
    const d = await understand(v, { opts: keep, free: keepFree });
    th.remove();
    if (pending !== p0) return;
    const back = () => { setChips(keep); curFree = keepFree; };
    if (!d) { // من غير ذكاء اصطناعي: زي الأول
      if (keepFree || !keep.length) return answer(v, v, false);
      if (looksLikeQuestion(v)) { UI.aiNext = v; const p = pending; pending = null; p(null); return; }
      sfx.err?.(); await bot(L(`🤔 مش فاهم «${esc(v)}» هنا. اختار من الاختيارات اللي تحت 👇 (أو اكتب سؤال كامل وأنا أرد عليه)`, `🤔 I didn't get “${esc(v)}” here. Pick one of the options below 👇 (or type a full question and I'll answer it)`)); return back();
    }
    if (d.action === 'pick') { const o = optOf(keep, d.v); if (o) { await bot(L(`👌 فهمتك: <b>${esc(o.l)}</b>`, `👌 Got it: <b>${esc(o.l)}</b>`)); return answer(o.v, o.l, false); } }
    if (d.action === 'free' && (keepFree || !keep.length || isFinite(parseNum(d.value)))) return answer(d.value || v, v, false);
    if (d.action === 'reply' && d.say) { await bot(esc(d.say).replace(/\n/g, '<br>') + `<br><small>${L('↩️ ونرجع لسؤالنا: ', '↩️ Back to our question: ')}${esc(UI.lastQ || '')}</small>`); return back(); }
    if (d.action === 'switch' || d.action === 'ai') {
      if (d.say) await bot(esc(d.say));
      if (d.action === 'switch') UI.task = { ...d, typed: v }; else UI.aiNext = v;
      const p = pending; pending = null; atMenu = false; p(null); return;
    }
    sfx.err?.(); await bot(d.say ? esc(d.say) : L(`🤔 مش واضحلي «${esc(v)}». اختار من اللي تحت 👇`, `🤔 “${esc(v)}” isn't clear to me. Pick from below 👇`)); return back();
  }
  answer(v, v);
});
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
async function askCur(q0) {
  for (let q = q0 || L('بأنهي عملة؟ 💱', 'In which currency? 💱'); ;) {
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
    const c0 = await pickFrom(L('الدخل ده من أنهي نوع؟ 🏷️', 'What kind of income is this? 🏷️'), cs.map(x => x.n), [], 'income'); if (c0 === null) return;
    cat = c0 || 'غير مصنّف';
    let co = cs.find(x => x.n === cat); if (!co) { co = { n: cat, subs: [] }; cs.push(co); }
    const s0 = await pickFrom(L(`أنهي حاجة في ${esc(cat)}؟`, `Which one under ${esc(cat)}?`), co.subs, [{ l: L('من غير تفاصيل', 'No details'), v: '' }], `sub:${cat}`); if (s0 === null) return;
    sub = s0; if (sub && !co.subs.includes(sub)) co.subs.push(sub);
  }
  const m = preset || await askMoney(kind === 'salary' ? L('قبضت كام؟ 💰', 'How much did you get paid? 💰') : L(`جالك كام من ${esc(sub || cat)}؟ 🤑`, `How much came in from ${esc(sub || cat)}? 🤑`), kind === 'salary' ? [...new Set([payInfo(ctx()).amount, +S.salary].filter(v => v > 0).map(v => Math.round(v / rate(cOf(S.job || {})))))] : [500, 1000, 2000], kind === 'salary');
  if (!m) return;
  const cur = m.cur || (kind === 'salary' ? cOf(S.job || {}) : await askCur()); if (!cur) return; // المرتب بعملة الشغل
  const note = kind === 'salary' ? 'المرتب' : (sub ? `${cat} · ${sub}` : cat);
  if (opt.auto) await bot(L(`📅 يوم القبض (${dayName(new Date(opt.date))}) جه، فسجّلت المرتب ووزّعته أوتوماتيك زي ما اتفقنا.`, `📅 Payday (${dayName(new Date(opt.date))}) is here, so I recorded your salary and split it automatically, just like we agreed.`));
  const before = snap(ctx());
  const tx = { id: uid(), date: opt.date || today(), type: 'income', kind, amount: m.amount, cur, rate: rate(cur), Efix: S.essentials.filter(e => cOf(e) === cur && !isDynamic(e)).reduce((a, e) => a + (+e.amount || 0), 0), sad: +S.sadaqa || 0, cat, sub, note, done: {} };
  // قبل التسجيل: شاشة التوزيع خطوة بخطوة (توافق أو تعدّل كل بند)
  if (!opt.auto) {
    const R0 = ctx().R, ym = periodOf(tx.date, paydayOf(S)), nx = nextPeriod(ym), m0 = R0.months[ym];
    S.tx.push(tx); const pv = ctx().R.rows[tx.id]; S.tx.pop();
    // تفاصيل للشاشة: البنود (الدورة دي والجاية)، فلوس الأساسيات جات منين، والديون بالترتيب — كله بالدرهم
    const f0 = cycleInfo(S, ym).f;
    const items = S.essentials.map(e => ({ icon: e.icon, name: e.name, full1: !!e.full1, f: f0, nowEff: itemFor(S, e, ym) * rate(cOf(e)) * (e.full1 ? 1 : f0), now: itemFor(S, e, ym) * rate(cOf(e)), next: itemFor(S, e, nx) * rate(cOf(e)), nowPre: prepaid(e, ym), nextPre: prepaid(e, nx), loc: !!e.where }));
    const held = [];
    if (m0?.carry > 0.5) held.push({ label: L('↩️ اترحّل من الدورة اللي فاتت', '↩️ Carried over from last cycle'), aed: m0.carry });
    for (const t of S.tx) {
      if (periodOf(t.date, paydayOf(S)) !== ym) continue;
      const rw = R0.rows[t.id]; if (!rw) continue;
      if (t.type === 'income' && rw.d?.essentials > 0.005) held.push({ label: `💰 ${esc(t.note || L('دخل', 'Income'))}`, aed: rw.d.essentials, date: t.date });
      if (t.type === 'transfer' && (t.toBucket || t.bucket) === 'essentials') held.push({ label: L('🔁 تحويل للأساسيات', '🔁 Transfer into Essentials'), aed: rw.inAED, date: t.date });
      if (t.type === 'transfer' && t.bucket === 'essentials') held.push({ label: L('🔁 تحويل من الأساسيات', '🔁 Transfer out of Essentials'), aed: -rw.aed, date: t.date });
    }
    if (m0?.toSafety > 0.5) held.push({ label: L('🛟 زيادة راحت للأمان', '🛟 Extra moved to Safety'), aed: -m0.toSafety });
    const dl = debts().map(d => ({ name: d.name, left: dLeft(R0, d) * rate(cOf(d)) })).filter(d => d.left > 0.5);
    const res = await splitWizard({ L, fmt, esc, parseNum, sfx, sym: CUR[cur].s, k: 1 / pv.r, r: pv, debtName: dName(), tx, items, held, debts: dl });
    if (!res) return bot(L('تمام، ما سجّلتش الدخل ده 👍 لما تحب ابدأ تاني.', "Okay, I didn't save that income 👍 Start again whenever you like."));
    if (Object.keys(res.ov).length) tx.ov = res.ov;
  }
  S.tx.push(tx); save(); render();
  const c = ctx(), r = c.R.rows[tx.id], k = 1 / r.r, pct = fmt(r.E / r.incomeAfter * 100);
  const parts = [[L('🤲 الصدقة', '🤲 Sadaqa'), r.sadaqa], [L('🍞 الأساسيات', '🍞 Essentials'), r.d.essentials], [`💳 ${esc(dName())}`, r.debtPay], [L('📈 استثمار', '📈 Investing'), r.invest], [L('🛟 الأمان', '🛟 Safety'), r.d.stability], [L('🎉 الفلوس الحرّة', '🎉 Fun free money'), r.d.reward]].filter(([, v]) => v > 0.5);
  const why = [];
  if (r.sadPaused) why.push(L(`🤲 الصدقة واقفة لأن عليك دين: سداد الدين أولى من صدقة التطوّع. هترجع لوحدها (${fmt(tx.sad, 2)}%) أول ما الدين يخلص.`, `🤲 Sadaqa is paused because you have debt: paying a debt comes before voluntary charity. It comes back by itself (${fmt(tx.sad, 2)}%) as soon as the debt is paid.`));
  if (r.sadaqa > 0.005) why.push(L(`الصدقة (${fmt(tx.sad, 2)}%) بتطلع الأول من أي دخل: ${fmt(r.sadaqa * k)}. والباقي (${fmt(r.net * k)}) هو اللي بيتوزع.`, `Sadaqa (${fmt(tx.sad, 2)}%) comes off the top of any income: ${fmt(r.sadaqa * k)}. The rest (${fmt(r.net * k)}) is what gets split.`));
  // كل الأرقام هنا بعملة الدخل نفسه، بس الحساب على كل دخلك وكل أساسياتك مع بعض (إنت شخص واحد)
  const cn = CUR[cur].n, nv = v => `<b dir="ltr">${fmt(v * k)} ${CUR[cur].s}</b>`, noEss = r.E < 0.5;
  const moTxt = L('دخل الشهر كله (كل العملات)', "this month's total income (all currencies)");
  if (noEss) why.push(L(`مفيش أساسيات خالص، فالدخل ده كله زيادة: 15% أمان، 10% فلوس حرّة، والباقي (75%) نمو.`, `You have no essentials at all, so all of this is extra: 15% Safety, 10% Fun free money, and the rest (75%) Growth.`));
  else {
    if (r.debtOn) why.push(L(`💳 عليك دين، فالقاعدة: الأساسيات تتغطى للدورة دي + 10 أيام من الجاية (${nv(r.target)})، الفلوس الحرّة 2.5% بس من الدخل، الأمان صفر، وكل الباقي للدين.`, `💳 You have debt, so the rule is: Essentials get covered for this cycle + 10 days of the next (${nv(r.target)}), Fun free money gets only 2.5% of income, Safety gets nothing, and everything else goes to the debt.`));
    if (r.moved > 0.5) why.push(L(`🛟 مفيش دين، والأساسيات كان فيها أكتر من الدورة دي، فالزيادة (${nv(r.moved)}) اتنقلت للأمان لوحدها.`, `🛟 No debt, and Essentials held more than this cycle needs, so the extra (${nv(r.moved)}) moved to Safety by itself.`));
    if (r.essCovered) why.push(L(`🍞 أساسياتك في البلدين (${nv(r.E)}) كانت متغطية بفلوس حطّيتها لها (تحويل)، فالدخل ده ${r.d.essentials > 0.5 ? `كمّل الناقص بس (${nv(r.d.essentials)})` : 'ما خدش منها حاجة'}، والباقي اتقسم بنسب الفيديو.`, `🍞 Your essentials in both countries (${nv(r.E)}) were already covered by money you put there (a transfer), so this income ${r.d.essentials > 0.5 ? `only topped up what was missing (${nv(r.d.essentials)})` : 'took nothing for them'}, and the rest was split by the video's percentages.`));
    else if (r.mode === 'A') why.push(L(`${moTxt} (${nv(r.incomeAfter)}) لسه أقل من أساسياتك في البلدين (${nv(r.E)})، فكله رايح لها. ناقص ${nv(r.deficit)}.`, `${moTxt[0].toUpperCase() + moTxt.slice(1)} (${nv(r.incomeAfter)}) is still below your essentials in both countries (${nv(r.E)}), so all of it goes there. Still short by ${nv(r.deficit)}.`));
    if (r.mode === 'B' && !r.debtOn) why.push(L(`أساسياتك في البلدين ${nv(r.E)} = ${pct}% من ${moTxt} (${nv(r.incomeAfter)})، أكبر من النص. فاللي فاضل بيتقسم 50% نمو، 30% أمان، 20% فلوس حرّة.`, `Your essentials in both countries, ${nv(r.E)}, are ${pct}% of ${moTxt} (${nv(r.incomeAfter)}), more than half. So what's left is split 50% Growth, 30% Safety, 20% Fun free money.`));
    if (r.mode === 'C' && !r.debtOn) why.push(L(`أساسياتك في البلدين بقت ${pct}% من ${moTxt} (${nv(r.incomeAfter)})، يعني النص أو أقل. فالنسب الأصلية شغالة (25 / 15 / 10)، واللي اتوفر من الأساسيات راح للنمو.`, `Your essentials in both countries are now ${pct}% of ${moTxt} (${nv(r.incomeAfter)}), so half or less. The original ratios apply (25 / 15 / 10), and whatever you saved on Essentials went to Growth.`));
    if (r.modeBefore !== r.mode && r.incomeAfter > r.aed) why.push(L(`الفلوس دي نقلتك من "${MODE[r.modeBefore]}" لـ"${MODE[r.mode]}" 🎚️`, `This money moved you from "${MODE[r.modeBefore]}" to "${MODE[r.mode]}" 🎚️`));
    if (r.d.essentials < 0.5 && r.mode !== 'A' && !r.essCovered) why.push(L(`أساسياتك متغطية من دخل قبل كده، فمفيش حاجة منهم راحت لها.`, `Your essentials were already covered by earlier income, so none of this went to them.`));
  }
  if (r.debtPay > 0.5) why.push(L(`عندك دين، فنصيب النمو كله بيسدّه الأول، حتى لو الدخل بال${cn}. فاضل ${nv(r.debtAfter)}.`, `You have debt, so the whole Growth share pays it off first, even though this income is in ${cn}. ${nv(r.debtAfter)} left to go.`));
  if (r.debtPay > 0.5 && cur !== 'AED') why.push(L(`🔁 الدين بالدرهم: حوّل ${nv(r.debtPay)} لدرهم وادفعهم في ${esc(dName())}.`, `🔁 The debt is in AED: convert ${nv(r.debtPay)} to AED and pay ${esc(dName())}.`));
  if (r.capped) why.push(L(`الأمان وصل آخر محطة، فنصيبه اتحوّل للنمو.`, `Safety reached its last milestone, so its share moved to Growth.`));
  if (cur !== 'AED') why.push(L(`🇪🇬 إنت شخص واحد: ال${cn} اتحسب مع كل دخلك قصاد أساسيات البلدين. الفلوس نفسها فضلت في محفظة ال${cn} لحد ما تحوّلها. (1 درهم = ${fmt(1 / r.r, 2)} ${cn})`.replace('🇪🇬', CUR[cur].f), `${CUR[cur].f} You're one person: this ${cn} was counted with all your income against both countries' essentials. The money itself stays in your ${cn} wallet until you convert it. (1 AED = ${fmt(1 / r.r, 2)} ${cn})`));
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
const EDIT = '\u0000edit';
async function pickFrom(q, list, extra = [], kind = null) {
  for (;;) {
    const fresh = kind === 'reward' ? cats().reward : kind && kind.startsWith('sub:') ? (cats().income.find(x => x.n === kind.slice(4))?.subs || []) : kind === 'income' ? cats().income.map(x => x.n) : list;
    const v = await ask(`${q} <small>${L('(اختار أو اكتب واحد جديد)', '(pick one or type a new one)')}</small>`, [...fresh.map(l => ({ l, v: l })), ...extra, ...(kind && fresh.length ? [{ l: L('⚙️ عدّل القايمة', '⚙️ Edit the list'), v: EDIT }] : []), BACK], true);
    if (v === EDIT) { await catEditor(kind.startsWith('sub:') ? 'income' : kind); continue; }
    return v === null ? null : String(v).trim();
  }
}
/* 🏷️ محرر التصنيفات: تغيير اسم أو مسح تصنيف (أو تفصيلة) اتكتب غلط — والمعاملات القديمة بتتحدّث بالاسم الجديد */
function catEditor(kind) {
  return new Promise(resolve => {
    const C = cats(), o = document.createElement('div');
    o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    const draw = () => {
      const items = kind === 'reward' ? C.reward.map(n => ({ n, subs: null })) : C.income;
      o.innerHTML = `<div class="wiz-card glass cat-ed">
        <div class="wiz-top"><b>🏷️ ${kind === 'reward' ? L('تصنيفات الفلوس الحرّة', 'Free money categories') : L('تصنيفات الدخل', 'Income categories')}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
        <p class="wiz-help">${L('غيّر الاسم واكتب الصح، أو امسح اللي اتكتب غلط. المعاملات القديمة بتاخد الاسم الجديد لوحدها.', 'Fix a name, or delete one typed by mistake. Old transactions take the new name by themselves.')}</p>
        ${items.map((it, i) => `<div class="row"><input data-cn="${i}" value="${esc(it.n)}"><button type="button" class="pill" data-cdel="${i}" title="${L('امسح', 'Delete')}">🗑️</button></div>
          ${it.subs?.length ? `<div class="subs">${it.subs.map((sb, j) => `<button type="button" class="pill" data-sdel="${i}:${j}" title="${L('امسح التفصيلة', 'Delete this detail')}">${esc(sb)} ✕</button>`).join('')}</div>` : ''}`).join('') || `<p class="note">${L('القايمة فاضية', 'The list is empty')}</p>`}
        <div class="wiz-nav"><span></span><button type="button" class="btn primary" data-done>${L('💾 تمام', '💾 Done')}</button></div></div>`;
    };
    const rename = (from, to) => { for (const t of S.tx) { if (t.cat === from) { t.cat = to; t.note = String(t.note || '').replace(from, to); } } };
    const commit = () => {
      o.querySelectorAll('[data-cn]').forEach(inp => {
        const i = +inp.dataset.cn, nv = inp.value.trim(); if (!nv) return;
        if (kind === 'reward') { const old = C.reward[i]; if (old !== nv) { C.reward[i] = nv; rename(old, nv); } }
        else { const old = C.income[i].n; if (old !== nv) { C.income[i].n = nv; rename(old, nv); } }
      });
    };
    draw(); document.body.appendChild(o); sfx.open();
    const close = () => { commit(); save(); render(); o.classList.add('out'); setTimeout(() => o.remove(), 220); toast(L('🏷️ اتحفظت التصنيفات', '🏷️ Categories saved')); resolve(); };
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === o) close(); return; }
      const d = b.dataset;
      if ('close' in d || 'done' in d) return close();
      if (d.cdel != null) {
        commit(); const i = +d.cdel;
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = L('متأكد؟', 'Sure?'); sfx.warn?.(); return; }
        if (kind === 'reward') C.reward.splice(i, 1); else C.income.splice(i, 1);
        sfx.del(); return draw();
      }
      if (d.sdel) { commit(); const [i, j] = d.sdel.split(':').map(Number); C.income[i].subs.splice(j, 1); sfx.del(); return draw(); }
    });
  });
}
async function flowSpend(preset) {
  // الأول: التصنيف، وبعدين التفصيلة، وبعدين المبلغ
  const where = await ask(L('صرفت على إيه؟ 💸', 'What did you spend on? 💸'), [{ l: L('🍞 أساسيات', '🍞 Essentials'), v: 'essentials' }, { l: L('🎉 فلوس حرّة وخروج', '🎉 Fun free money & outings'), v: 'reward' }, { l: L('🤲 صدقة', '🤲 Sadaqa'), v: 'sadaqa' }, { l: L('🛟 طوارئ من الأمان', '🛟 Emergency from Safety'), v: 'stability' }, BACK]);
  if (where === null) return;
  const bucket = ['essentials', 'reward', 'sadaqa', 'stability'].includes(where) ? where : 'reward';
  const cat = BX[bucket].n;
  let item = null, sub = '';
  if (bucket === 'essentials') {
    const it = await ask(L('أنهي بند في الأساسيات؟', 'Which Essentials item?'), [...S.essentials.map(e => ({ l: `${e.icon} ${e.name}`, v: 'e:' + e.id })), BACK]); if (it === null) return;
    const e = S.essentials.find(e => 'e:' + e.id === it) || S.essentials.find(e => e.name === String(it).trim());
    if (!e) return bot(L('البند ده مش في الأساسيات. ضيفه الأول من كارت الأساسيات، أو سجّله على "فلوس حرّة".', 'That item isn\'t in your Essentials. Add it from the Essentials card first, or log it under "Fun free money".'));
    item = e.id; sub = e.name;
  } else if (bucket === 'reward') {
    const typed = bucket !== where ? String(where).trim() : null; // كتب حاجة بدل ما يختار
    const v = typed ?? await pickFrom(L('أنهي حاجة في الفلوس الحرّة؟', 'Which one under Fun free money?'), cats().reward, [], 'reward'); if (v === null) return;
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
  // ✍️ وصف اختياري بعد التصنيف والمبلغ: كلمتين تفكّرك المصروف ده كان إيه (طلب صاحب الحساب، 2026-11-23).
  // التخطّي دوسة واحدة، والرجوع هنا معناه "من غير وصف" مش إلغاء المصروف.
  const dsc = await ask(L('عايز تكتب وصف للمصروف ده؟ اكتب كلمتين أو تخطّى ✍️', 'Want to describe this expense? Type a few words, or skip ✍️'), [{ l: L('⏭️ تخطّي', '⏭️ Skip'), v: 'skip' }], true);
  const desc = dsc && dsc !== 'skip' ? String(dsc).replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  S.tx.push({ id: uid(), date: today(), type: 'expense', bucket, item, amount: m.amount, cur, rate: rate(cur), cat, sub, note, ...(desc ? { desc } : {}) });
  save(); render();
  const c = ctx();
  let msg;
  if (bucket === 'essentials') {
    const e = S.essentials.find(x => x.id === item), sp = c.mo.items[item] || 0;
    msg = L(`اتسجلت على ${esc(note)}. صرفت منه ${fmt(sp)} من ${fmt(e?.amount || 0)} الشهر ده${sp > (e?.amount || 0) ? ' 🚨 عدّيت الميزانية' : ''}.`, `Logged under ${esc(note)}. You've spent ${fmt(sp)} of ${fmt(e?.amount || 0)} on it this month${sp > (e?.amount || 0) ? ' 🚨 over budget' : ''}.`);
  } else if (bucket === 'reward') {
    msg = c.R.rewardAED >= 0 ? L(`اتخصمت من الفلوس الحرّة. فاضل في الحصّالة ${fmt(c.R.rewardAED)} درهم.`, `Taken out of Fun free money. ${fmt(c.R.rewardAED)} AED left in the jar.`) : L(`🫙 الحصّالة فضيت وعدّيت بـ ${fmt(-c.R.rewardAED)} درهم. القاعدة: تستنى القبض الجاي ومتسحبش من بند تاني.`, `🫙 The jar is empty and you're over by ${fmt(-c.R.rewardAED)} AED. The rule: wait for the next payday and don't dip into another bucket.`);
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
  await bot(L(`اتضاف 🎯 في ${every} شهور بتحوّش للمتعة حوالي ${fmt(can)} درهم، ${can >= cost.amount ? 'يعني الهدف في المتناول 👌' : `يعني ناقص ${fmt(cost.amount - can)}. يا تطوّل المدة يا تزوّد الدخل.`}`, `Added 🎯 In ${EN_N(every, 'month')} you put about ${fmt(can)} AED into Fun free money, ${can >= cost.amount ? 'so the goal is within reach 👌' : `so you're ${fmt(cost.amount - can)} short. Either stretch the timeline or grow your income.`}`));
}


/** رقم من الشات، والصفر مسموح (مقدّم صفر مثلًا) */
async function askNum(q, quick = [], zero = false) {
  for (let prompt = q; ;) {
    const v = await ask(prompt, [...quick.map(o => typeof o === 'object' ? o : { l: LOCK ? '•••' : Number(o).toLocaleString('en-US'), v: String(o) }), BACK]);
    if (v === null) return null;
    const m = parseMoney(v); if (m && (m.amount > 0 || (zero && m.amount === 0))) return m.amount * rate(m.cur || 'AED');
    sfx.err(); prompt = L('مش فاهم الرقم 😅 اكتبه تاني، مثال: 1500 أو 300 جنيه', "I didn't get that number 😅 Type it again, e.g. 1500 or 300 EGP");
  }
}

/* ───────────── الشرح خطوة بخطوة (الأهداف الكبيرة) ───────────── */
/** يقرا النص بصوت (مجاني، من المتصفح نفسه). بيختار صوت عربي، ومصري لو موجود. */
function speak(text) {
  try {
    const ss = window.speechSynthesis; if (!ss) return toast(L('المتصفح ده مش بيقرا بصوت 😅', "This browser can't read aloud 😅"));
    ss.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ' ').trim());
    const ar = L('ar', 'en') === 'ar', vs = ss.getVoices();
    u.voice = (ar ? vs.find(v => /ar-EG/i.test(v.lang)) || vs.find(v => /^ar/i.test(v.lang)) : vs.find(v => /^en/i.test(v.lang))) || null;
    u.lang = u.voice?.lang || (ar ? 'ar-EG' : 'en-US'); u.rate = ar ? 0.95 : 1;
    ss.speak(u);
  } catch {}
}
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('svg,.gkey,.note,.table3d,.crown').forEach(x => x.remove()); return d.textContent; };
const ADV = [['sharia', '🕌'], ['cautious', '🛡️'], ['ambitious', '🚀'], ['rules', '📜'], ['practical', '🔧']];
const table = () => `<div class="table3d"><div class="ring">${ADV.map(([k, e], i) => `<span class="seat" data-seat="${k}" style="--a:${i * (360 / ADV.length)}deg">${e}</span>`).join('')}<i class="top"></i></div></div>`;
/** خطوات بتتعرض واحدة ورا التانية، وزرار "كمّل" بينهم (أو "وريني الكل") */
function stepper() {
  let n = 0, all = false;
  const next = () => all ? sleep(250) : new Promise(res => {
    chipsEl.innerHTML = '';
    [[L('👉 كمّل', '👉 Next'), false], [L('⏩ وريني الكل', '⏩ Show me all')]].forEach(([l, a]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = l;
      b.onclick = () => { if (a !== false) all = true; chipsEl.innerHTML = ''; sfx.send(); res(); }; chipsEl.append(b);
    });
  });
  const open = async (icon, title, html, extra = '', last = false) => {
    if (n++) await next();
    const el = await bot(`<div class="stephead"><span class="stepn">${n}</span>${icon} <b>${title}</b><button class="say" type="button" title="${L('اسمعها', 'Listen')}" aria-label="${L('اسمعها', 'Listen')}">🔊</button></div><div class="stepbody">${html}</div>${extra}`, 'wide step3d' + (last ? ' last' : ''));
    const body = () => el.querySelector('.stepbody');
    el.querySelector('.say').onclick = () => speak(`${title}. ${plain(body().innerHTML)}`);
    return {
      say: h => { body().innerHTML = h; scrollLog(); },
      // المستشار ده بيتكلم: الترابيزة تلف لحد ما يبقى قدامك، وكلامه ينزل تحت
      seat: async (key, h, spoken) => {
        const i = ADV.findIndex(([k]) => k === key), ring = el.querySelector('.ring');
        if (ring && i >= 0) { ring.style.setProperty('--turn', `${-i * 90}deg`); el.querySelectorAll('.seat').forEach(s => s.classList.toggle('on', s.dataset.seat === key)); }
        await sleep(650);
        const p = document.createElement('p'); p.className = 'said'; p.innerHTML = h; p.onclick = () => speak(spoken); p.title = L('دوس عشان تسمعها', 'Tap to listen');
        el.append(p); scrollLog(); sfx.pop();
      },
    };
  };
  return { open, next, step: (i, t, h, extra, last) => open(i, t, h, extra, last), done: () => { chipsEl.innerHTML = ''; } };
}
const STANCE = { now: '✅', wait: '⏳', change: '🔧', no: '❌' };
const gDate = d => d ? `<b>${monthName(d)}</b>` : `<b>${L('مش في 10 سنين', 'not within 10 years')}</b>`;

async function flowGoal() {
  const name = await ask(L('الهدف إيه؟ 🎯 (اكتبه بكلامك)', "What's the goal? 🎯 (in your own words)"), [{ l: L('🚗 عربية', '🚗 Car'), v: L('عربية', 'Car') }, { l: L('🏠 شقة جديدة', '🏠 New apartment'), v: L('شقة جديدة', 'New apartment') }, { l: L('📚 كورس', '📚 Course'), v: L('كورس', 'Course') }, BACK]); if (name === null) return;
  const type = await ask(L('ده نوعه إيه؟', 'What kind is it?'), [
    { l: L('🛒 حاجة بشتريها مرة', '🛒 A one-time buy'), v: 'buy' }, { l: L('🔁 مبلغ كل شهر على طول', '🔁 A monthly cost, ongoing'), v: 'monthly' }, { l: L('⏱️ مبلغ كل شهر لمدة', '⏱️ A monthly cost for a set time'), v: 'term' }, BACK]); if (type === null) return;
  const g = { id: uid(), name: String(name).trim().slice(0, 60), type };
  if (type === 'buy') {
    g.price = await askNum(L('سعرها كاش كام؟ 💰', "What's the cash price? 💰")); if (g.price == null) return;
    const inst = await ask(L('فيه تقسيط؟', 'Is there an instalment plan?'), [{ l: L('💳 آه فيه', '💳 Yes'), v: 'y' }, { l: L('💵 لأ، كاش بس', '💵 No, cash only'), v: 'n' }, BACK]); if (inst === null) return;
    if (inst === 'y') {
      g.down = await askNum(L('المقدّم كام؟', "How much is the down payment?"), [{ l: L('من غير مقدّم', 'No down payment'), v: '0' }], true); if (g.down == null) return;
      g.inst = await askNum(L('القسط الشهري كام؟', "And the monthly instalment?")); if (g.inst == null) return;
      const n = await ask(L('على كام شهر؟', 'Over how many months?'), [12, 24, 36, 48, 60].map(k => ({ l: L(`${k} شهر`, `${k} months`), v: k })).concat(BACK)); if (n === null) return;
      g.n = Math.max(1, Math.round(parseNum(n)) || 12);
      // 🕌 الخطوة صفر: التقسيط ده حلال ولا فيه ربا؟
      const k = await ask(L('التقسيط ده نوعه إيه؟ 🕌', 'What kind of instalment plan is it? 🕌'), [{ l: L('🏦 بنك إسلامي (مرابحة / إجارة)', '🏦 Islamic bank (murabaha / ijara)'), v: 'islamic' }, { l: L('0️⃣ صفر% من غير أي ربا', '0️⃣ 0% with no interest at all'), v: 'zero' }, { l: L('💳 قرض أو كارت بربا', '💳 A loan or card with interest'), v: 'interest' }, { l: L('🤷 مش عارف', "🤷 I don't know"), v: 'unknown' }, BACK]); if (k === null) return;
      g.contract = k;
    }
    // حاجة ليها مصاريف كل شهر (عربية: بنزين وتأمين وصيانة) وممكن تبقى بدل بند في الأساسيات (المواصلات)
    const run0 = await askNum(L('هيبقى ليها مصاريف تشغيل كل شهر؟ (بنزين، تأمين، صيانة…)', 'Will it have monthly running costs? (fuel, insurance, upkeep…)'), [{ l: L('🚫 مفيش', '🚫 None'), v: '0' }], true); if (run0 == null) return;
    g.run = +run0 || 0;
    const items = S.essentials.filter(e => +e.amount > 0);
    const rep = await ask(L('هتبقى بدل حاجة من أساسياتك؟ (زي عربية بدل المواصلات)', 'Will it replace one of your essentials? (like a car instead of transport)'),
      [{ l: L('➕ لأ، زيادة عليهم', '➕ No, on top'), v: '' }, ...items.map(e => ({ l: `${e.icon || ''} ${e.name}${LOCK ? '' : ` (${fmt(eVal(e))})`}`, v: e.id })), BACK]); if (rep === null) return;
    const it = items.find(e => e.id === rep); if (it) { g.replace = eVal(it); g.replaceName = it.name; }
  } else {
    g.monthly = await askNum(L('كام في الشهر؟ 💰', 'How much a month? 💰')); if (g.monthly == null) return;
    if (type === 'term') {
      const n = await ask(L('لمدة كام شهر؟', 'For how many months?'), [3, 6, 12, 24].map(k => ({ l: L(`${k} شهر`, `${k} months`), v: k })).concat(BACK)); if (n === null) return;
      g.n = Math.max(1, Math.round(parseNum(n)) || 6);
    }
    const items = S.essentials.filter(e => +e.amount > 0);
    const rep = await ask(L('ده هيبقى بدل حاجة من أساسياتك؟ (زي شقة جديدة بدل الإيجار الحالي)', 'Does it replace one of your essentials? (like a new apartment instead of the current rent)'),
      [{ l: L('➕ لأ، زيادة عليهم', '➕ No, on top'), v: '' }, ...items.map(e => ({ l: `${e.icon || ''} ${e.name}${LOCK ? '' : ` (${fmt(e.amount)})`}`, v: e.id })), BACK]); if (rep === null) return;
    const it = items.find(e => e.id === rep); if (it) { g.replace = eVal(it); g.replaceName = it.name; }
  }

  // 1) الحساب بالكود — والمجلس بيبدأ يفكّر في الخلفية من دلوقتي، عشان ما تستناش
  const c = ctx(), base = goalBase(c), f = evaluate(base, S.goals || [], g), h = { fmt, loc: LOC() };
  const council = HOSTED ? (async () => {
    const facts = factsFor(base, S.goals || [], g, f, { livingLevel: lifeState(c).level, safetyMilestonesDone: snap(c).spare, safetyMilestones: 2 });
    facts.tasks = TASKS().map(t => ({ key: t.v, label: t.l })); // عشان القرار يخلص بزرار تعمله في فلوسي
    const r = await fetch('/api/ideas?finance=advise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, lang: L('ar', 'en') }) });
    if (r.status === 401) { expired(); throw new Error('expired'); }
    const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d;
  })() : Promise.reject(new Error('local'));
  council.catch(() => {}); // الغلط بيتعرض في خطوته، مش هنا

  // 2) الشرح خطوة بخطوة، بكلام بسيط، وكل خطوة ليها 🔊
  const st = stepper();
  const x = f.ifs[0], typeTalk = { buy: L('حاجة هتشتريها مرة واحدة', 'something you buy once'), monthly: L('مبلغ هتدفعه كل شهر على طول', 'an amount you pay every month, ongoing'), term: L(`مبلغ هتدفعه كل شهر لمدة ${g.n} شهر وبعدين يخلص`, `an amount you pay every month for ${g.n} months, then it ends`) }[type];
  await st.step('🎯', L('خلّيني أفهم إنت عايز إيه', 'Let me understand what you want'),
    L(`إنت عايز <b>${esc(g.name)}</b>. ده ${typeTalk}.${type === 'buy' ? ` سعره كاش ${money(g.price)}${f.inst ? `، أو تقسيط: مقدّم ${money(g.down || 0)} وبعدين ${money(g.inst)} كل شهر لمدة ${g.n} شهر` : ''}.` : ` يعني ${money(g.monthly)} كل شهر${g.replace ? `، بس هيبقى بدل <b>${esc(g.replaceName)}</b> اللي بتدفع فيه ${money(g.replace)}، فالزيادة الحقيقية ${money(g.monthly - g.replace)} بس` : ''}.`}`,
      `You want <b>${esc(g.name)}</b>. It's ${typeTalk}.${type === 'buy' ? ` The cash price is ${money(g.price)}${f.inst ? `, or instalments: ${money(g.down || 0)} down, then ${money(g.inst)} a month for ${g.n} months` : ''}.` : ` That's ${money(g.monthly)} every month${g.replace ? `, but it replaces <b>${esc(g.replaceName)}</b> which costs ${money(g.replace)}, so the real increase is only ${money(g.monthly - g.replace)}` : ''}.`}`));

  if (type === 'buy') {
    await st.step('💰', L('فلوسك دلوقتي', 'Your money right now'),
      L(`معاك في <b>الاستثمار</b> (فلوس النمو، دي الفلوس اللي ينفع تشتري منها) ${money(base.growth)}.${base.debt > 0.5 ? ` وعليك <b>دين</b> ${money(base.debt)}، وده لازم يتسد الأول قبل أي شرا.` : ' ومفيش عليك دين 👌'}<br>وفي <b>الأمان</b> (صندوق الطوارئ) ${money(base.stab)}، بس ده <b>ممنوع نلمسه</b>، ده للمصايب بس.`,
        `You have ${money(base.growth)} in <b>Growth</b> (investing: the money you're allowed to buy with).${base.debt > 0.5 ? ` You also owe ${money(base.debt)} of <b>debt</b>, and that gets paid first, before any purchase.` : ' And you have no debt 👌'}<br>Your <b>Safety</b> (emergency fund) has ${money(base.stab)}, but we <b>never touch it</b>. It's for emergencies only.`));
    await st.step('📏', L('القاعدة اللي بنمشي بيها', 'The rule we follow'),
      L(`الكاش بيطلع من <b>الاستثمار بس</b>، وبعد ما الدين يخلص.${f.inst ? `<br>والتقسيط معناه التزام كل شهر، فبيتحسب زي الأساسيات (المصاريف اللي لازم تدفعها). والقاعدة إن دخلك يبقى <b>ضعف</b> الأساسيات 3 شهور ورا بعض، يعني محتاج ${money(f.inst.needNow)} في الشهر.` : ''}`,
        `Cash comes from <b>Growth only</b>, after the debt is gone.${f.inst ? `<br>Instalments are a monthly commitment, so they count like essentials (the costs you must pay). The rule is your income must be <b>double</b> your essentials for 3 months in a row, so you need ${money(f.inst.needNow)} a month.` : ''}`));
  } else {
    const m = f.monthly;
    await st.step('💰', L('فلوسك دلوقتي', 'Your money right now'),
      L(`دخلك في الشهر (بعد الصدقة) حوالي ${money(m.netNow)}.<br>و<b>الأساسيات</b> (يعني المصاريف اللي لازم تدفعها: الإيجار والأكل والمواصلات) ${money(base.E)}.<br>لو ضفنا ${esc(g.name)} الأساسيات هتبقى ${money(m.newE)}.`,
        `Your monthly income (after sadaqa) is about ${money(m.netNow)}.<br><b>Essentials</b> (the costs you must pay: rent, food, transport) are ${money(base.E)}.<br>Add ${esc(g.name)} and essentials become ${money(m.newE)}.`));
    await st.step('📏', L('القاعدة اللي بنمشي بيها', 'The rule we follow'),
      L(`القاعدة بتقول: دخلك لازم يبقى <b>ضعف الأساسيات</b>، <b>3 شهور ورا بعض</b>، عشان يفضل فيه فلوس للأمان والاستثمار والفلوس الحرّة.<br>يعني محتاج: ${money(m.newE)} × 2 = ${money(m.threshold)} في الشهر.<br>${m.gap > 0 ? `إنت دلوقتي ناقصك ${money(m.gap)}.` : 'وإنت عندك ده ✅'}`,
        `The rule says: your income must be <b>double your essentials</b>, <b>3 months in a row</b>, so there's money left for safety, investing and fun.<br>So you need: ${money(m.newE)} × 2 = ${money(m.threshold)} a month.<br>${m.gap > 0 ? `Right now you're ${money(m.gap)} short.` : 'And you have that ✅'}`));
  }

  // 💸 الفلوس دي هتيجي منين: بعد توزيعنا، مش من الدخل كله
  { const im = f.impact, A = im.before, Bf = im.after, dd = (x, y) => y - x;
    const row = (lbl, a, b) => `<tr><td>${lbl}</td><td dir="ltr">${fmt(a)}</td><td dir="ltr">${fmt(b)}</td><td dir="ltr" class="${dd(a, b) < -0.5 ? 'neg' : dd(a, b) > 0.5 ? 'pos' : ''}">${Math.abs(dd(a, b)) < 0.5 ? '—' : (dd(a, b) > 0 ? '+' : '−') + fmt(Math.abs(dd(a, b)))}</td></tr>`;
    const when = i => i == null ? L('أبعد من 10 سنين', 'beyond 10 years') : monthName(addMonths(base.start, i));
    const tbl = `<table class="sw-t imp"><tr class="hd"><td>${L('شهر عادي', 'A normal month')}</td><td dir="ltr">${L('من غيره', 'Without')}</td><td dir="ltr">${L('بيه', 'With')}</td><td dir="ltr">${L('الفرق', 'Change')}</td></tr>
      ${row(L('💰 الدخل (بعد الصدقة)', '💰 Income (after sadaqa)'), A.net, Bf.net)}${row(L('🍞 الأساسيات', '🍞 Essentials'), A.ess, Bf.ess)}${row(L('💳 للدين', '💳 To debt'), A.toDebt, Bf.toDebt)}${row(L('🛟 للأمان', '🛟 To safety'), A.toStab, Bf.toStab)}${row(L('📈 للاستثمار', '📈 To investing'), A.toInvest, Bf.toInvest)}${row(L('🎉 فلوس حرّة', '🎉 Free money'), A.toFun, Bf.toFun)}</table>`;
    const lines = [];
    if (base.debt > 0.5) lines.push(L(`💳 الدين يخلص <b>${when(im.debtA)}</b> من غيره، و<b>${when(im.debtB)}</b> بيه.`, `💳 Debt is cleared <b>${when(im.debtA)}</b> without it, and <b>${when(im.debtB)}</b> with it.`));
    if (base.lastSpare) lines.push(L(`🛟 الأمان يوصل هدفه <b>${when(im.stabA)}</b> من غيره، و<b>${when(im.stabB)}</b> بيه.`, `🛟 Safety reaches its target <b>${when(im.stabA)}</b> without it, and <b>${when(im.stabB)}</b> with it.`));
    if (Bf.deficit > 0.5) lines.push(L(`❌ بيه هيبقى عندك <b>عجز ${money(Bf.deficit)}</b> كل شهر (الدخل مش مكفّي الأساسيات).`, `❌ With it you'd be <b>${money(Bf.deficit)} short</b> every month (income doesn't cover essentials).`));
    if (im.newDebt) lines.push(L(`🏷️ <b>التصنيف:</b> التقسيط ده <b>دين جديد</b> ${money(im.newDebt)} قصاده حاجة بتملكها (${money(im.asset)})، والعربية بتخسر من قيمتها كل سنة. القسط${g.run ? ' ومصاريف التشغيل' : ''} بيدخلوا <b>الأساسيات</b>.`, `🏷️ <b>Category:</b> these instalments are <b>new debt</b> of ${money(im.newDebt)} with something you own against it (${money(im.asset)}), and a car loses value every year. The instalment${g.run ? ' and running costs' : ''} go into <b>Essentials</b>.`));
    else if (im.commit > 0.5) lines.push(L(`🏷️ <b>التصنيف:</b> ${money(im.commit)} في الشهر بيدخلوا <b>الأساسيات</b>.`, `🏷️ <b>Category:</b> ${money(im.commit)} a month go into <b>Essentials</b>.`));
    if (im.commit > 0.5 || im.newDebt) await st.step('💸', L('الفلوس دي هتيجي منين؟', 'Where would this money come from?'),
      L(`مش بنقارن بدخلك كله: بنشوف <b>بعد توزيعنا</b>. ${money(im.commit)} في الشهر هيدخلوا الأساسيات، فبياكلوا من ${base.debt > 0.5 ? 'سداد الدين الأول' : 'الأمان والاستثمار والفلوس الحرّة'}:`, `We don't compare with your whole income: we look <b>after our split</b>. ${money(im.commit)} a month go into essentials, so they eat into ${base.debt > 0.5 ? 'debt payoff first' : 'safety, investing and free money'}:`) + tbl + `<p>${lines.join('<br>')}</p>`);
  }

  const legend = type === 'buy'
    ? L('الخط <b style="color:#199e70">الأخضر</b> ده فلوس الاستثمار وهي بتكبر شهر ورا شهر. الخط <b style="color:#d95926">البرتقالي</b> هو السعر. النقطة اللي الأخضر يعدّي فيها البرتقالي = اليوم اللي تقدر تشتري فيه كاش. والخط المتقطّع لو زوّدت دخلك.', 'The <b style="color:#199e70">green</b> line is your investing money growing month by month. The <b style="color:#d95926">orange</b> line is the price. Where green crosses orange = the day you can buy in cash. The dashed line is if you add more income.')
    : L('الخط <b style="color:#6981B5">الأزرق</b> ده دخلك المتوقع. الخط <b style="color:#d95926">البرتقالي</b> هو المطلوب (ضعف الأساسيات). أول ما الأزرق يعدّي البرتقالي 3 شهور = تقدر تبدأ. والخط المتقطّع لو زوّدت دخلك.', 'The <b style="color:#6981B5">blue</b> line is your expected income. The <b style="color:#d95926">orange</b> line is what you need (double your essentials). Once blue stays above orange for 3 months = you can start. The dashed line is if you add more income.');
  await st.step('📈', L('بص على الرسم', 'Look at the graph'), legend, `<div class="g3d">${f.chart(h)}</div>`);

  let verdict;
  if (type === 'buy') {
    verdict = L(`💵 <b>كاش:</b> تقدر ${gDate(f.cash.date)}${f.cash.i === 0 ? ' — يعني دلوقتي ✅' : f.cash.i ? ` (${eta(f.cash.i)})` : ''}.`, `💵 <b>Cash:</b> possible ${gDate(f.cash.date)}${f.cash.i === 0 ? ' — that means now ✅' : f.cash.i ? ` (${eta(f.cash.i)})` : ''}.`);
    if (f.inst) verdict += L(`<br>💳 <b>تقسيط:</b> تقدر ${gDate(f.inst.date)}، بس هتدفع ${money(f.inst.total)}، يعني ${money(f.inst.premium)} زيادة عن الكاش (${fmt(f.inst.premiumPct, 1)}%). دي فلوس بتدفعها عشان تستعجل.`, `<br>💳 <b>Instalments:</b> possible ${gDate(f.inst.date)}, but you'd pay ${money(f.inst.total)}, which is ${money(f.inst.premium)} more than cash (${fmt(f.inst.premiumPct, 1)}%). That's what you pay to get it sooner.`);
  } else {
    const m = f.monthly;
    verdict = m.canNow ? L('✅ <b>تقدر تبدأ دلوقتي.</b> دخلك مغطي القاعدة.', '✅ <b>You can start now.</b> Your income covers the rule.')
      : L(`${m.deficitNow ? '❌ لو بدأت دلوقتي هيبقى عندك <b>عجز</b> (يعني الدخل مش مكفي حتى الأساسيات).<br>' : '⏳ <b>مش دلوقتي.</b> '}بالمعدل الحالي تقدر ${gDate(m.date)}${m.i ? ` (${eta(m.i)})` : ''}.${m.maxNow > 0 ? `<br>💡 لو عايز حاجة دلوقتي: اللي ينفع لحد ${money(m.maxNow)} في الشهر.` : ''}`,
        `${m.deficitNow ? '❌ If you start now you\'d have a <b>deficit</b> (income doesn\'t even cover essentials).<br>' : '⏳ <b>Not now.</b> '}At the current pace you can ${gDate(m.date)}${m.i ? ` (${eta(m.i)})` : ''}.${m.maxNow > 0 ? `<br>💡 If you want something now: up to ${money(m.maxNow)} a month works.` : ''}`);
  }
  if (x && x.i !== f.best) verdict += L(`<br>🚀 ولو زوّدت دخلك ${money(x.extra)} في الشهر: ${gDate(x.date)}.`, `<br>🚀 And if you add ${money(x.extra)} a month of income: ${gDate(x.date)}.`);
  if (f.after) verdict += L(`<br>📌 وده مترتّب بعد <b>${esc(f.after)}</b>.`, `<br>📌 It's placed after <b>${esc(f.after)}</b>.`);
  verdict += `<small class="note">${L(`الحساب على دخل ${fmt(base.gross)} في الشهر (${base.sideAvg ? `مرتب + متوسط جانبي ${fmt(base.sideAvg)}` : `المرتب بس، لحد ما يبقى فيه ${AVG_MIN} شهور بيانات للمتوسط`})${base.trend ? `، بيزيد ${fmt(base.trend * 100, 1)}% في الشهر زي سجلّك` : ''}.`, `Worked out from ${fmt(base.gross)} a month (${base.sideAvg ? `salary + average side ${fmt(base.sideAvg)}` : `salary only, until there are ${AVG_MIN} months of data for an average`})${base.trend ? `, growing ${fmt(base.trend * 100, 1)}% a month as in your history` : ''}.`)}</small>`;
  await st.step('🧮', L('الحسبة بتقول إيه', 'What the numbers say'), verdict);

  // 3) المجلس على ترابيزة 3D: كل مستشار يتكلم لوحده، وبعدين الرئيس
  let chair = null;
  if (HOSTED) {
    const wait = await st.open('🧠', L('المجلس بيتناقش', 'The council is talking'), L('4 مستشارين قاعدين على ترابيزة، كل واحد بيبص على الموضوع من ناحية. ثواني…', '4 advisors around a table, each looking at it from one side. A few seconds…'), table());
    let d = null;
    try { d = await council; } catch (e) { console.error(e); }
    if (!d) {
      wait.say(L('😅 المجلس مش متاح دلوقتي (ممكن الحد المجاني خلص أو جوجل زحمة). الحسبة اللي فوق مضبوطة برضه، جرّب المجلس تاني بعد شوية.', '😅 The council is not available right now (the free limit may be used up or Google is busy). The numbers above are still right; try the council again later.'));
    } else {
      chair = d.chair;
      wait.say(L('اسمع كل واحد قال إيه 👇', 'Hear what each one said 👇'));
      for (const [j, a] of d.advisors.entries()) {
        if (j) await st.next(); // اللي قبل الرئيس بيستنى "كمّل" جوّه open
        await wait.seat(a.key, `${STANCE[a.stance] || '•'} <b>${esc(a.name)}</b>: ${esc(a.say)}`, `${a.name}: ${a.say}`);
      }
      if (chair) {
        const sp = chair.steps || {}, SR = [['🕌', L('حلال ولا حرام', 'Halal or haram'), sp.halal], ['🌴', L('الأغنيا المسلمين كانوا هيعملوا إيه', 'What rich Muslims would do'), sp.muslims], ['📜', 'Mark Tilbury 1% Rule', sp.tilbury], ['🧮', L('الأرقام', 'The numbers'), sp.logic]].filter(x => x[2]);
        if (SR.length) await st.step('🪜', L('القرار خطوة بخطوة', 'The decision step by step'), `<ol class="why-list dsteps">${SR.map(([i, h, t]) => `<li>${i} <b>${h}:</b> ${esc(t)}</li>`).join('')}</ol>`);
        await st.step('👑', L('قرار الرئيس', "The chair's decision"),
          `<b>${STANCE[chair.verdict] || ''} ${esc(chair.headline)}</b><br>${esc(chair.why)}${chair.order ? `<br>📌 ${esc(chair.order)}` : ''}${(chair.ifs || []).length ? `<ul class="why-list">${chair.ifs.map(i => `<li>${L('لو', 'If')} ${esc(i.if)} ← ${esc(i.then)}</li>`).join('')}</ul>` : ''}`, '<div class="crown">👑</div>', true);
      }
    }
  }
  st.done();

  // 3) نضيفه؟
  const opts = [];
  if (type === 'buy' && f.inst) opts.push({ l: L('➕ أضيفه كاش', '➕ Add it as cash'), v: 'cash' }, { l: L('➕ أضيفه تقسيط', '➕ Add it as instalments'), v: 'inst' });
  else opts.push({ l: L('➕ أضيفه لأهدافي', '➕ Add it to my goals'), v: 'add' });
  const ctas = (chair?.cta || []).filter(x => FLOWS[x.task]).slice(0, 2);
  ctas.forEach((x, i) => opts.push({ l: '⚡ ' + String(x.label || '').slice(0, 50), v: 'cta:' + i }));
  opts.push({ l: L('🗑️ لأ، سيبك', '🗑️ No, skip it'), v: null });
  const keepIt = await ask(L('أضيفه لأهدافك الكبيرة؟ هيترتب في الآخر وتقدر تسحبه.', 'Add it to your big goals? It goes at the end and you can drag it.'), opts);
  if (!keepIt) return;
  if (String(keepIt).startsWith('cta:')) { const x = ctas[+String(keepIt).slice(4)]; return runTask({ flow: x.task }, ''); }
  if (keepIt === 'inst' || keepIt === 'cash') g.pay = keepIt;
  else if (type === 'buy') g.pay = 'cash';
  if (chair?.headline) g.verdict = String(chair.headline).slice(0, 200);
  g.at = today();
  (S.goals ??= []).push(g); save(); render(); party(['🎯', '🧠', '✨']); sfx.ok();
  await bot(L('اتضاف 🎯 هتلاقيه في كارت <b>الأهداف الكبيرة</b>، والتاريخ بيتحدث مع كل معاملة.', 'Added 🎯 You\'ll find it in the <b>Big goals</b> card, and the date updates with every transaction.'));
}


/* ───────────── الاستثمار: في إيه وإمتى (من الكتاب)، وتسجيله كاستثمار مش مصروف ───────────── */
/** نصيب النمو المتوقع لكل دولة لوحدها (بعملتها)، ولو عليها دين بيروح للدين الأول */
function countryShares(c) {
  // إنت شخص واحد: نصيب نمو واحد من كل الدخل، بيسدّ كل الديون الأول (بالدرهم)
  const R = c.R;
  return ['AED'].map(cur => {
    const P = R, past = Object.keys(P.months).filter(k => k < c.ym && P.months[k].income > 0).sort().slice(-3);
    const inc = past.length ? past.reduce((a, k) => a + P.months[k].income, 0) / past.length : (+S.salary || 0) * (1 - c.sadPct);
    const a = allocate(inc, P.E), debt = R.debt;
    return { cur, growth: a.growth / rate(cur), debt: debt / rate(cur), when: debt > 0.5 && a.growth > 0.5 ? Math.ceil(debt / a.growth) : debt > 0.5 ? null : 0 };
  }).filter(x => x.growth > 0.5 || x.debt > 0.5);
}

async function flowInvest() {
  const c = ctx(), { base, fixed, mix, p } = investPlan(c), h = { fmt, loc: LOC() }, m = p.monthly;
  const shares = countryShares(c), extra = Math.max(500, Math.round(base.gross * 0.1 / 500) * 500), px = project(base, fixed, mix, { extra });
  const start = p.startI == null ? null : new Date(base.start.getFullYear(), base.start.getMonth() + p.startI, 1);
  const council = HOSTED ? (async () => {
    const facts = investFacts(base, p, mix, {
      startMonth: start ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}` : null,
      livesIn: here() === 'EGP' ? 'Egypt' : 'UAE',
      perCountry: shares.map(s => ({ country: s.cur === 'EGP' ? 'Egypt (EGP)' : 'UAE (AED)', growthSharePerMonthAED: Math.round(s.growth * rate(s.cur) / 100) * 100, debtAED: Math.round(s.debt * rate(s.cur) / 100) * 100 })),
      investmentsHeld: growthHolds().map(x => ({ kind: x.h.kind || (x.h.cur === 'XAU' ? 'gold' : 'other'), valueAED: Math.round(x.val / 100) * 100 })),
      ifIncomeUpAED: extra, after10yIfIncomeUp: Math.round(px.at(120).mid / 100) * 100,
    });
    const r = await fetch('/api/ideas?finance=advise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, lang: L('ar', 'en') }) });
    if (r.status === 401) { expired(); throw new Error('expired'); }
    const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d;
  })() : Promise.reject(new Error('local'));
  council.catch(() => {});

  const st = stepper();
  // 1) معاك إيه
  await st.step('💰', L('معاك إيه دلوقتي', 'What you have now'),
    L(`فلوس <b>النمو</b> (دي اللي بتتستثمر) ${money(base.growth)}.${base.debt > 0.5 ? ` وعليك <b>دين</b> ${money(base.debt)}، والكتاب بيقول: الدين يتسد الأول من نصيب النمو، قبل أي استثمار.` : ' ومفيش دين 👌'}<br>و<b>الأمان</b> ${money(base.stab)} ده <b>مش بيتستثمر</b> خالص: يفضل في حساب توفير تقدر تسحبه في يوم.`,
      `Your <b>Growth</b> money (the part that gets invested) is ${money(base.growth)}.${base.debt > 0.5 ? ` You owe ${money(base.debt)} of <b>debt</b>, and the book says debt is paid first from the Growth share, before any investing.` : ' And no debt 👌'}<br>Your <b>Safety</b> ${money(base.stab)} is <b>never invested</b>: it stays in a savings account you can reach within a day.`));
  // 2) إمتى
  const perC = shares.map(s => `<li><span>${CUR[s.cur].f} ${CUR[s.cur].n}</span><b>${s.when === 0 ? L(`من دلوقتي: ${fmt(s.growth)} ${CUR[s.cur].s} في الشهر`, `From now: ${fmt(s.growth)} ${CUR[s.cur].s} a month`) : s.when ? L(`بعد ما دينها يخلص (${monthName(addMonths(new Date(), s.when))})`, `After its debt is paid (${monthName(addMonths(new Date(), s.when))})`) : L('دخلها لسه مش مغطي', 'Its income does not cover it yet')}</b></li>`).join('');
  await st.step('⏰', L('إمتى تبدأ', 'When to start'),
    `${start ? (p.startI === 0 ? L('<b>من الشهر ده ✅</b>', '<b>This month ✅</b>') : L(`<b>${monthName(start)}</b> (${eta(p.startI)})، أول شهر الدين يخلص فيه.`, `<b>${monthName(start)}</b> (${eta(p.startI)}), the first month the debt is gone.`)) : L('بالدخل ده مفيش مبلغ للاستثمار في الـ10 سنين الجايين. الأول زوّد الدخل أو قلّل الأساسيات.', 'At this income there is nothing to invest within 10 years. First raise income or cut essentials.')}
    ${perC ? `<ul class="alloc">${perC}</ul><small class="note">${L('كل دولة لوحدها: نصيب نمو الجنيه بيتستثمر بالجنيه، والدرهم بالدرهم.', 'Each country on its own: EGP growth is invested in EGP, AED in AED.')}</small>` : ''}`);
  if (m > 0.5) {
    // 3) في إيه
    await st.step('🧺', L('تحط في إيه (سلّم الكتاب)', 'What to put it in (the book\'s ladder)'),
      `${L(`كل شهر حوالي <b>${money(m)}</b>، يوم القبض، أوتوماتيك. الخلطة: <b>${mix.n}</b> (من سلّم المخاطرة في الكارت):`, `About <b>${money(m)}</b> a month, on payday, automatic. The mix: <b>${mix.n}</b> (from the risk ladder in the card):`)}
      <ul class="alloc">${mix.parts.map(([k, pct]) => `<li><span>${ASSETS[k].i} ${ASSETS[k].n} · ${pct}%</span><b dir="ltr">${fmt(m * pct / 100)}</b></li>`).join('')}</ul>
      ${L('🧠 وجنب ده: <b>مهارة بتزوّد دخلك</b>. الكتاب بيقول دي أسرع عائد. ومن غير ما تبيع وتشتري كل شوية.', '🧠 And alongside it: <b>a skill that raises your income</b>. The book calls it the fastest return. And no buying and selling all the time.')}`);
    // 4) متوقع كام
    const row = (t, a) => `<li><span>${t}</span><b dir="ltr">${fmt(a.mid)}</b><small dir="ltr">${L('حطيت', 'put in')} ${fmt(a.put)} · ${fmt(a.low)}–${fmt(a.high)}</small></li>`;
    await st.step('📈', L('متوقع يبقى معاك كام', 'What to expect'),
      `${L('الأزرق = اللي حطيته من جيبك. الأخضر = المتوقع بالعائد. المتقطّع = لو السوق وحش أو حلو.', 'Blue = what you put in. Green = expected with returns. Dashed = if markets are bad or good.')}
      <ul class="alloc">${row(L('بعد سنة', 'In 1 year'), p.at(12))}${row(L('بعد 5 سنين', 'In 5 years'), p.at(60))}${row(L('بعد 10 سنين', 'In 10 years'), p.at(120))}</ul>
      <small class="note">${L(`افتراض ${p.ret.toFixed(1)}% في السنة على المدى الطويل، مش وعد. ده استثمار مش مصروف: الفلوس بتتنقل من النمو لأصل، وإجمالي اللي معاك ما بيقلّش.`, `Assumes ${p.ret.toFixed(1)}% a year over the long run, not a promise. This is investing, not spending: money moves from Growth into an asset, and your total does not shrink.`)}</small>`,
      `<div class="g3d">${chartInvest(p, base.start, h)}</div>`);
    // 5) لو… اعمل…
    await st.step('🔀', L('لو… اعمل…', 'If… then…'), `<ul class="why-list">
      <li>${L('لو السوق نزل 30% ← ما تبيعش، كمّل نفس المبلغ كل شهر. ده بيشتري أرخص.', 'If markets drop 30% ← do not sell; keep the same monthly amount. You are buying cheaper.')}</li>
      <li>${L(`لو زوّدت دخلك ${money(extra)} في الشهر ← بعد 10 سنين متوقع ${money(px.at(120).mid)} بدل ${money(p.at(120).mid)}.`, `If you add ${money(extra)} a month of income ← in 10 years expect ${money(px.at(120).mid)} instead of ${money(p.at(120).mid)}.`)}</li>
      <li>${L('لو جالك دين جديد ← نصيب النمو يرجع يسدّه الأول، والاستثمار يستنى.', 'If a new debt comes ← the Growth share goes back to paying it first, investing waits.')}</li>
      <li>${L('لو هدف كبير اتشترى كاش ← بيتخصم من النمو، وده محسوب في الرسم.', 'If a big goal is bought in cash ← it comes out of Growth, and that is already in the graph.')}</li></ul>`);
  }
  // 6) المجلس
  if (HOSTED) {
    const w = await st.open('🧠', L('المجلس بيقترح أماكن', 'The council suggests where'), L('4 مستشارين بيبصّوا على خطتك وعلى الإمارات ومصر. ثواني…', '4 advisors look at your plan, the UAE and Egypt. A few seconds…'), table());
    let d = null; try { d = await council; } catch (e) { console.error(e); }
    if (!d) w.say(L('😅 المجلس مش متاح دلوقتي. الخطة اللي فوق محسوبة بالكود وصحيحة، جرّب المجلس بعد شوية.', '😅 The council is not available right now. The plan above is worked out in code and is right; try the council later.'));
    else {
      w.say(L('اسمع كل واحد قال إيه 👇', 'Hear what each one said 👇'));
      for (const [j, a] of d.advisors.entries()) { if (j) await st.next(); await w.seat(a.key, `${STANCE[a.stance] || '•'} <b>${esc(a.name)}</b>: ${esc(a.say)}`, `${a.name}: ${a.say}`); }
      const ch = d.chair;
      if (ch) await st.step('👑', L('قرار الرئيس', "The chair's decision"),
        `<b>${esc(ch.headline || '')}</b><br>${esc(ch.why || '')}${(ch.picks || []).length ? `<ul class="alloc">${ch.picks.map(x => `<li><span>${esc(x.what)}${x.pct != null ? ` · ${esc(String(x.pct))}%` : ''}</span><small>${esc(x.why || '')}</small></li>`).join('')}</ul>` : ''}${(ch.ifs || []).length ? `<ul class="why-list">${ch.ifs.map(i => `<li>${L('لو', 'If')} ${esc(i.if)} ← ${esc(i.then)}</li>`).join('')}</ul>` : ''}<small class="note">${L('⚠️ أسماء الأماكن اقتراح للتأكد منه، مش نصيحة مرخّصة.', '⚠️ Places named are suggestions to check, not licensed advice.')}</small>`, '<div class="crown">👑</div>', true);
    }
  }
  st.done();
  const go = await ask(L('عايز تسجّل إنك استثمرت؟', 'Want to record an investment?'), [{ l: L('💼 آه سجّل', '💼 Yes, record it'), v: 'y' }, { l: L('👌 لأ، تمام كده', '👌 No, all good'), v: null }]);
  if (go) return flowInvested();
}

async function flowInvested() {
  const R = ctx().R;
  const act = await ask(L('💼 استثمرت (حطيت فلوس) ولا بعت؟', '💼 Did you invest (put money in) or sell?'), [{ l: L('🛒 حطيت فلوس', '🛒 I put money in'), v: 'buy' }, { l: L('💵 بعت أو سحبت', '💵 I sold or took out'), v: 'sell' }, BACK]); if (act === null) return;
  if (act === 'sell') {
    const hs = S.holdings.filter(h => !h.spare && +h.amount > 0);
    if (!hs.length) return bot(L('مفيش استثمارات مسجّلة لسه 🙂', 'No investments recorded yet 🙂'));
    const id = await ask(L('بعت أنهي واحد؟', 'Which one did you sell?'), [...hs.map(h => ({ l: `${KINDS[h.kind]?.i || (h.cur === 'XAU' ? '🥇' : '💼')} ${h.name}`, v: h.id })), BACK]); if (id === null) return;
    const h = S.holdings.find(x => x.id === id), home = homeOf(h);
    let units;
    if (h.cur === 'XAU') { const g = await ask(L(`بعت كام جرام؟ (معاك ${fmt(h.amount, 2)})`, `How many grams? (you have ${fmt(h.amount, 2)})`), [{ l: L('الكل', 'All'), v: String(h.amount) }, BACK]); if (g === null) return; units = Math.min(+h.amount, parseNum(g) || 0); if (!(units > 0)) return bot(L('مش فاهم الرقم 😅', "I didn't get that number 😅")); }
    const got = await askMoney(L(`خدت كام ${CUR[home].n}؟`, `How much ${CUR[home].n} did you get?`)); if (!got) return;
    const amt = got.amount * rate(got.cur || home) / rate(home);
    if (h.cur !== 'XAU') units = Math.min(+h.amount, amt);
    const costOut = (+h.cost || 0) * (units / (+h.amount || 1));
    h.amount = Math.max(0, +h.amount - units); h.cost = Math.max(0, (+h.cost || 0) - costOut);
    S.tx.push({ id: uid(), date: today(), type: 'divest', bucket: 'growth', amount: amt, cur: home, rate: rate(home), hold: h.id, units, costOut, note: `${L('بيع', 'Sold')} ${h.name}` });
    save(); render(); sfx.ok();
    return bot(L(`اتسجّل 💵 ${money(amt * rate(home))} رجعوا لمحفظة النمو بال${CUR[home].n}.${costOut > 0 ? ` ${amt * rate(home) >= costOut * rate(home) ? `كسبت ${money((amt - costOut) * rate(home))} 🎉` : `خسرت ${money((costOut - amt) * rate(home))}`}` : ''}`, `Recorded 💵 ${money(amt * rate(home))} went back to the ${CUR[home].n} Growth wallet.${costOut > 0 ? ` ${amt >= costOut ? `You gained ${money((amt - costOut) * rate(home))} 🎉` : `You lost ${money((costOut - amt) * rate(home))}`}` : ''}`));
  }
  const curs = [...new Set([...HOME_COUNTRIES, ...Object.keys(R.bal)])].filter(x => CUR[x] && x !== 'XAU');
  const cur = curs.length === 1 ? curs[0] : await ask(L('من أنهي محفظة نمو؟', 'From which Growth wallet?'), [...curs.map(x => ({ l: `${CUR[x].f} ${CUR[x].n}${LOCK ? '' : ` (${fmt(R.bal[x]?.growth || 0)})`}`, v: x })), BACK]); if (cur === null) return;
  const kind = await ask(L('استثمرت في إيه؟', 'What did you invest in?'), [...Object.entries(KINDS).map(([k, v]) => ({ l: `${v.i} ${v.n}`, v: k })), BACK]); if (kind === null) return;
  const gold = kind === 'gold';
  const same = S.holdings.filter(h => !h.spare && homeOf(h) === cur && (gold ? h.cur === 'XAU' : h.kind === kind && h.cur === cur));
  let h = null;
  if (same.length) {
    const pickH = await ask(L('أضيفه على واحد موجود ولا جديد؟', 'Add to an existing one or new?'), [...same.map(x => ({ l: `➕ ${x.name}`, v: x.id })), { l: L('🆕 جديد', '🆕 New'), v: 'new' }, BACK]); if (pickH === null) return;
    h = S.holdings.find(x => x.id === pickH) || null;
  }
  let name = h?.name;
  if (!h) { name = await ask(L('اسمه إيه؟ (اسم الصندوق أو البنك مثلًا)', "What's it called? (the fund or bank, say)"), [{ l: KINDS[kind].n, v: KINDS[kind].n }, BACK]); if (name === null) return; }
  const paid = await askMoney(L(`دفعت كام ${CUR[cur].n}؟`, `How much ${CUR[cur].n} did you pay?`)); if (!paid) return;
  const amt = paid.amount * rate(paid.cur || cur) / rate(cur);
  let grams = 0, karat = h?.karat || 24, yld = null;
  if (gold) {
    const g = await ask(L('كام جرام؟', 'How many grams?'), [BACK]); if (g === null) return; grams = parseNum(g) || 0;
    if (!(grams > 0)) return bot(L('مش فاهم الرقم 😅', "I didn't get that number 😅"));
    if (!h) { const k = await ask(L('عيار كام؟', 'Which karat?'), [24, 22, 21, 18].map(n => ({ l: String(n), v: n })).concat(BACK)); if (k === null) return; karat = parseNum(k) || 24; }
  }
  if (kind === 'cert') { const y = await ask(L('العائد كام % في السنة؟', 'What is the yearly rate %?'), [{ l: L('مش عارف', "Don't know"), v: '' }, BACK]); if (y === null) return; yld = parseNum(y) || null; }
  const have = R.bal[cur]?.growth || 0;
  if (amt > have + 0.5) {
    const ok = await ask(L(`⚠️ محفظة النمو بال${CUR[cur].n} فيها ${fmt(have)} بس، وإنت حطيت ${fmt(amt)}. الفرق هيبان بالسالب في النمو. أكمّل؟`, `⚠️ The ${CUR[cur].n} Growth wallet only has ${fmt(have)}, and you put in ${fmt(amt)}. The gap shows as negative Growth. Continue?`), [{ l: L('✅ كمّل', '✅ Continue'), v: 'y' }, BACK]); if (ok === null) return;
  }
  if (!h) { h = { id: uid(), name: String(name).trim().slice(0, 60), kind, cur: gold ? 'XAU' : cur, ...(gold ? { home: cur, karat } : {}), amount: 0, cost: 0, spare: false, at: today() }; S.holdings.push(h); }
  const units = gold ? grams : amt;
  h.amount = (+h.amount || 0) + units; h.cost = (+h.cost || 0) + amt; if (yld) h.yield = yld;
  S.tx.push({ id: uid(), date: today(), type: 'invest', bucket: 'growth', amount: amt, cur, rate: rate(cur), hold: h.id, units, note: `${KINDS[kind].i} ${h.name}` });
  save(); render(); party(['📈', '💼', '✨']); sfx.ok();
  await bot(L(`اتسجّل <b>استثمار</b> مش مصروف 💪 ${money(amt * rate(cur))} اتنقلوا من محفظة النمو لـ<b>${esc(h.name)}</b>. إجمالي اللي معاك زي ما هو، بس بقى شغّال.${gold ? ` (${fmt(grams, 2)} جرام عيار ${karat})` : ''}${yld ? ` العائد ${fmt(yld, 1)}% في السنة.` : ''}`,
    `Recorded as an <b>investment</b>, not spending 💪 ${money(amt * rate(cur))} moved from the Growth wallet into <b>${esc(h.name)}</b>. Your total is the same, but now it works for you.${gold ? ` (${fmt(grams, 2)} g of ${karat}K)` : ''}${yld ? ` Rate ${fmt(yld, 1)}% a year.` : ''}`));
}

async function flowDebt() {
  const R = ctx().R, ds = debts(), open = ds.filter(d => dLeft(R, d) > 0.5);
  const list = open.length ? `<ul class="alloc">${open.map(d => `<li><span>${DKIND[d.kind] || '🧾'} ${esc(d.name)}</span><b dir="ltr">${fmt(dLeft(R, d))} ${CUR[cOf(d)].s}</b></li>`).join('')}</ul>` : L('مفيش عليك ديون دلوقتي ✅', 'You have no debt right now ✅');
  const what = await ask(`${L('💳 ديونك:', '💳 Your debts:')}${list}${L('عايز تعمل إيه؟', 'What do you want to do?')}`, [
    ...(open.length ? [{ l: L('✅ سدّدت دين', '✅ I paid a debt'), v: 'pay' }, { l: L('✏️ عدّل الباقي', '✏️ Change what\'s left'), v: 'edit' }] : []),
    { l: L('➕ دين جديد', '➕ New debt'), v: 'new' }, BACK]); if (what === null) return;
  if (what === 'new') {
    const kind = await ask(L('نوعه إيه؟', 'What kind?'), [...Object.keys(DKIND).map(k => ({ l: `${DKIND[k]} ${DKIND_N[k]}`, v: k })), BACK]); if (kind === null) return;
    const name = await ask(L('سمّيه إيه؟ (مثال: كارت ADCB)', 'What should I call it? (e.g. ADCB card)'), [{ l: DKIND_N[kind], v: DKIND_N[kind] }, BACK]); if (name === null) return;
    const cu = places().includes(cardView()) ? cardView() : await ask(L('في أنهي بلد؟', 'In which country?'), [...places().map(c => ({ l: `${CUR[c].f} ${PLACE_N[c]}`, v: c })), BACK]); if (!cu) return;
    const amt = await askNum(L(`عليك فيه كام (بال${CUR[cu].n})؟`, `How much do you owe on it (in ${CUR[cu].n})?`)); if (amt == null) return;
    // askNum بيحوّل لدرهم؛ الدين متخزّن بعملته
    debts().push({ id: uid(), name: String(name).trim().slice(0, 40) || DKIND_N[kind], kind, balance: amt / rate(cu), since: today(), cur: cu });
    save(); render();
    return bot(L(`اتسجّل 💳 ${esc(String(name))}: <b dir="ltr">${fmt(amt / rate(cu))} ${CUR[cu].s}</b>. من دلوقتي نصيب النمو من أي دخل هيروح يسدّه الأول قبل الاستثمار.`, `Recorded 💳 ${esc(String(name))}: <b dir="ltr">${fmt(amt / rate(cu))} ${CUR[cu].s}</b>. From now on the Growth share of any income goes to paying it before investing.`));
  }
  const id = open.length === 1 ? open[0].id : await ask(L('أنهي دين؟', 'Which debt?'), [...open.map(d => ({ l: `${DKIND[d.kind] || '🧾'} ${d.name}`, v: d.id })), BACK]); if (id === null) return;
  const d = ds.find(x => x.id === id), left = dLeft(R, d), k = 1 / rate(cOf(d)); // askNum بيرجّع درهم
  if (what === 'pay') {
    const all = await ask(L(`${esc(d.name)} فاضل عليه ${dm(d, left)}. سدّدته كله؟`, `${esc(d.name)} has ${dm(d, left)} left. Did you pay all of it?`), [{ l: L('✅ كله', '✅ All of it'), v: 'all' }, { l: L('💵 جزء منه', '💵 Part of it'), v: 'part' }, BACK]); if (all === null) return;
    let v = 0;
    if (all === 'part') { const p = await askNum(L(`دفعت كام (بال${CUR[cOf(d)].n})؟`, `How much did you pay (in ${CUR[cOf(d)].n})?`)); if (p == null) return; v = Math.max(0, left - p * k); }
    // 💳 دفعته منين؟ أي محفظة بعملة الدين (طلب صاحب الحساب، 2026-11-25): الفلوس بتتخصم منها والدين بينزل في نفس المعاملة
    const cu = cOf(d), nat = (left - v) * k, heldIn = b => b === 'essentials' ? essHeld(cu) : Math.max(0, R.bal[cu]?.[b] || 0);
    const wallets = ['essentials', 'growth', 'stability', 'reward'].filter(b => heldIn(b) > 0.5);
    const from = await ask(L(`دفعت ${fmt(nat, 2)} ${CUR[cu].s}. خصمتهم من أنهي محفظة؟ 👛`, `You paid ${fmt(nat, 2)} ${CUR[cu].s}. Which wallet did it come from? 👛`),
      [...wallets.map(b => ({ l: `${B[b].i} ${B[b].n} · ${fmt(heldIn(b))}`, v: b })), { l: L('🏦 من برّه (مش من محفظة)', '🏦 From outside (no wallet)'), v: 'out' }, BACK]); if (from === null) return;
    if (from !== 'out') {
      let amt = nat;
      if (amt > heldIn(from) + 0.5) {
        const c2 = await ask(L(`⚠️ في ${B[from].n} معاك ${fmt(heldIn(from), 2)} بس، أقل من ${fmt(nat, 2)}.`, `⚠️ ${B[from].n} only has ${fmt(heldIn(from), 2)}, less than ${fmt(nat, 2)}.`),
          [{ l: L(`💳 اخصم ${fmt(heldIn(from), 2)} بس`, `💳 Take only ${fmt(heldIn(from), 2)}`), v: 'cap' }, BACK]); if (c2 === null) return;
        amt = heldIn(from);
      }
      if (from === 'essentials') { // الأساسيات: نحذّر لو الدفعة هتاكل من فلوس الأكل والفواتير
        const safe = Math.max(0, essSplit(ctx()).leftExtra) / rate(cu);
        if (amt > safe + 0.5) { const c3 = await ask(L(`⚠️ اللي زيادة في الأساسيات فوق المطلوب ${fmt(safe, 2)} بس. لو خصمت ${fmt(amt, 2)} هتاكل ${fmt(amt - safe, 2)} من فلوس الأكل والفواتير لآخر الدورة + 10 أيام.`, `⚠️ Only ${fmt(safe, 2)} in Essentials is above what's needed. Taking ${fmt(amt, 2)} eats ${fmt(amt - safe, 2)} of food and bills money for the rest of the cycle + 10 days.`),
          [...(safe > 0.5 ? [{ l: L(`✅ اخصم الزيادة بس (${fmt(safe, 2)})`, `✅ Take only the extra (${fmt(safe, 2)})`), v: 'safe' }] : []), { l: L(`⚠️ اخصم ${fmt(amt, 2)} برضه`, `⚠️ Take ${fmt(amt, 2)} anyway`), v: 'all' }, BACK]); if (c3 === null) return;
          if (c3 === 'safe') amt = safe; }
      }
      S.tx.push({ id: uid(), date: today(), type: 'debtpay', bucket: from, amount: +amt.toFixed(2), cur: cu, rate: rate(cu), debt: d.id, note: L(`سداد ${d.name} من ${B[from].n}`, `Paid ${d.name} from ${B[from].n}`) });
      const rest = nat - amt; // الباقي لو اتدفع جزء من برّه
      if (rest > 0.5) setDebtLeft(id, Math.max(0, dLeft(ctx().R, d) - rest * rate(cu)));
      save(); render(); sfx.ok();
      const nl = dLeft(ctx().R, d);
      if (nl <= 0.5) { party(['💳', '🎉', '✅']); return bot(L(`🎉 مبروك! ${esc(d.name)} خلص، واتخصم ${fmt(amt, 2)} ${CUR[cu].s} من ${B[from].i} ${B[from].n}.`, `🎉 Congrats! ${esc(d.name)} is paid off, and ${fmt(amt, 2)} ${CUR[cu].s} came out of ${B[from].i} ${B[from].n}.`)); }
      return bot(L(`✅ اتخصم ${fmt(amt, 2)} ${CUR[cu].s} من ${B[from].i} ${B[from].n} واتسدّ بيهم ${esc(d.name)}. فاضل عليه ${dm(d, nl)}. الدفعة في 📒 السجل.`, `✅ ${fmt(amt, 2)} ${CUR[cu].s} came out of ${B[from].i} ${B[from].n} and paid ${esc(d.name)}. ${dm(d, nl)} still owed. It's in the 📒 log.`));
    }
    setDebtLeft(id, v); save(); render();
    if (v <= 0.5) { party(['💳', '🎉', '✅']); sfx.ok(); return bot(L(`🎉 مبروك! ${esc(d.name)} خلص. ومن دلوقتي نصيب النمو بيروح ${open.length > 1 ? 'للدين اللي بعده' : 'استثمار 📈'}.`, `🎉 Congrats! ${esc(d.name)} is paid off. From now on the Growth share goes ${open.length > 1 ? 'to the next debt' : 'to investing 📈'}.`)); }
    return bot(L(`تمام 👍 ${esc(d.name)} فاضل عليه ${dm(d, v)}.`, `Done 👍 ${esc(d.name)} has ${dm(d, v)} left.`));
  }
  const v0 = await askNum(L(`الباقي الصح على ${esc(d.name)} كام بال${CUR[cOf(d)].n}؟ (اكتب 0 لو خلص)`, `What's really left on ${esc(d.name)} in ${CUR[cOf(d)].n}? (type 0 if it's paid off)`), [{ l: '0', v: '0' }], true); if (v0 == null) return;
  const v = v0 * k;
  // تصفير دين = تأكيد الأول (طلب صاحب الحساب بعد ما ENBD اتصفّر بالغلط)
  if (v <= 0.5 && dLeft(ctx().R, d) > 0.5) {
    const ok = await ask(L(`⚠️ متأكد إن ${esc(d.name)} اتسدّ كله؟ الباقي دلوقتي ${dm(d, dLeft(ctx().R, d))}.`, `⚠️ Sure ${esc(d.name)} is fully paid? Right now ${dm(d, dLeft(ctx().R, d))} is left.`), [{ l: L('✅ أيوه خلص', '✅ Yes, it is paid off'), v: 'yes' }, { l: L('↩️ لأ، رجوع', '↩️ No, go back'), v: 'no' }]);
    if (ok !== 'yes') return bot(L('تمام، ما غيرتش حاجة 👍', "OK, I didn't change anything 👍"));
  }
  setDebtLeft(id, v); save(); render();
  return bot(L(`اتعدّل ✏️ ${esc(d.name)}: الباقي ${dm(d, v)}.`, `Updated ✏️ ${esc(d.name)}: ${dm(d, v)} left.`));
}


/** تحويل بين المحافظ: من بند في عملة لنفس البند في عملة تانية (زي النمو بالجنيه → النمو بالدرهم) */
/** فلوس الأساسيات اللي معاك بعملة cu في الدورة دي (اتخصصت ولسه ما اتصرفتش) */
function essHeld(cu) {
  const m = replay(slice(S, cu), rate).months[periodOf(today(), paydayOf(S))];
  return m ? Math.max(0, m.essNat) : 0;
}
/** سعر التحويل بالشكل اللي الناس بتقوله: "1 درهم = 14.6 جنيه" (الوحدة الأكبر قيمة الأول) */
const fxTxt = (from, to, per) => `<span dir="ltr">${per >= 1 ? `1 ${CUR[from].s} = ${fmt(per, per >= 10 ? 2 : 4)} ${CUR[to].s}` : `1 ${CUR[to].s} = ${fmt(1 / per, 2)} ${CUR[from].s}`}</span>`;

/** التحويل: شاشة منبثقة خطوة بخطوة (xfer-wizard.js) بتأكيد في الآخر، وبعدها رسالة في الشات بالنتيجة */
async function flowTransfer() {
  const R = ctx().R, pre = UI.xfer || {}; UI.xfer = null; // جاي من زرار "حوّل" في بند معيّن
  if (!pre.from && cardView() !== 'ALL') pre.from = cardView(); // في عرض دولة: يبدأ من محفظتها
  const bal = (cu, k) => k === 'essentials' ? essHeld(cu) : (R.bal[cu]?.[k] || 0);
  const golds = S.holdings.filter(h => h.cur === 'XAU' && +h.amount > 0).map(h => ({ id: h.id, name: h.name || L('دهب', 'Gold'), grams: +h.amount, karat: +h.karat || 24, bk: h.spare ? 'stability' : 'growth' }));
  if (!golds.length && !MONEY.some(cu => ['essentials', 'growth', 'stability', 'reward'].some(k => bal(cu, k) > 0.005)))
    return bot(L('مفيش فلوس في أي محفظة لسه تتحوّل 🙂', 'There is no money in any wallet to transfer yet 🙂'));
  const r = await xferWizard({
    L, fmt, esc, parseNum, CUR, B, sfx, money: MONEY, bal, rate, preset: pre, golds,
    debtsIn: cu => debts().filter(d => cOf(d) === cu).map(d => ({ id: d.id, name: d.name, left: dLeft(R, d) / rate(cu) })),
  });
  if (!r) return bot(L('تمام، ما حوّلتش حاجة 👍', "Okay, nothing was transferred 👍"));
  const { from, bk, to, tb, amount: amt, toAmount, fee, mkt: live } = r, payDebt = r.debt ? debts().find(d => d.id === r.debt) : null;
  const tx = { id: uid(), date: today(), type: 'transfer', bucket: bk, amount: amt, cur: from, to, toAmount, rate: r.rate, mkt: live, note: L('تحويل', 'Transfer') };
  if (tb !== bk) tx.toBucket = tb;
  if (fee > 0) tx.fee = fee;
  if (to === 'XAU') tx.toRate = r.toRate;
  // الدهب: الجرامات والتكلفة بتتعدّل على الحتة نفسها (والمسح بيرجّعها، شوف data-del)
  if (from === 'XAU') {
    const h = S.holdings.find(x => x.id === r.hold), g = +h.amount || 0, out = g ? (+h.cost || 0) * amt / g : 0;
    h.amount = Math.max(0, g - amt); h.cost = Math.max(0, (+h.cost || 0) - out); tx.hold = h.id; tx.costOut = out; tx.note = L(`بيع دهب (${h.name || 'دهب'})`, `Sold gold (${h.name || 'gold'})`);
  }
  if (to === 'XAU') {
    let h = r.toHold && S.holdings.find(x => x.id === r.toHold);
    if (!h) { h = { id: uid(), name: L('دهب', 'Gold'), kind: 'gold', cur: 'XAU', home: HOME_COUNTRIES.includes(from) ? from : 'AED', amount: 0, karat: r.toKarat || 24, spare: tb === 'stability', cost: 0, at: today() }; S.holdings.push(h); }
    const paid = amt * rate(from) / rate(homeOf(h));
    h.amount = (+h.amount || 0) + toAmount; h.cost = (+h.cost || 0) + paid; tx.toHold = h.id; tx.costIn = paid; tx.note = L(`شراء دهب (${h.name})`, `Bought gold (${h.name})`);
  }
  S.tx.push(tx);
  if (payDebt) tx.pair = uid();
  if (payDebt) S.tx.push({ id: tx.pair, pair: tx.id, date: today(), type: 'debtpay', bucket: tb, amount: Math.min(toAmount, dLeft(R, payDebt) / rate(to)), cur: to, rate: rate(to), debt: payDebt.id, note: L(`سداد ${payDebt.name}`, `Paid ${payDebt.name}`) });
  save(); render(); sfx.ok(); party(['🔁', '💸', '✅']);
  const mk = rate(from) / rate(to), lost = live - toAmount, pct = live > 0 ? lost / live * 100 : 0, got = toAmount / amt;
  const cost = lost < -0.005
    ? L(`🎉 سعرك ${fxTxt(from, to, got)} أحسن من السوق (${fxTxt(from, to, mk)}) بـ <b dir="ltr">${fmt(-lost, 2)} ${CUR[to].s}</b>.`, `🎉 Your rate ${fxTxt(from, to, got)} beat the market (${fxTxt(from, to, mk)}) by <b dir="ltr">${fmt(-lost, 2)} ${CUR[to].s}</b>.`)
    : lost > 0.005
    ? L(`💸 السعر اللي خدته ${fxTxt(from, to, got)} (السوق ${fxTxt(from, to, mk)})${fee > 0 ? ` + عمولة ${fmt(fee, 2)} ${CUR[to].s}` : ''}.<br>يعني التحويل كلّفك <b dir="ltr">${fmt(lost, 2)} ${CUR[to].s}</b> (${fmt(pct, 1)}%) عن سعر السوق.`, `💸 Your rate was ${fxTxt(from, to, got)} (market ${fxTxt(from, to, mk)})${fee > 0 ? ` + a ${fmt(fee, 2)} ${CUR[to].s} fee` : ''}.<br>So the transfer cost you <b dir="ltr">${fmt(lost, 2)} ${CUR[to].s}</b> (${fmt(pct, 1)}%) vs the market rate.`)
    : L('✅ من غير عمولة ولا فرق سعر.', '✅ No fee and no rate difference.');
  const log = L('📒 اتسجّل في <b>سجل التحويلات</b>.', '📒 Saved in the <b>Transfers log</b>.');
  toast(L('🔁 اتحوّل واتسجّل ✅', '🔁 Transferred and saved ✅'));
  if (payDebt) {
    const left = dLeft(ctx().R, payDebt);
    if (left <= 0.5) party(['💳', '🎉', '✅']);
    return bot(L(`🔁 حوّلت ${fmt(amt, 2)} ${CUR[from].s} ← وصل ${fmt(toAmount, 2)} ${CUR[to].s} واتسدّ بيهم <b>${esc(payDebt.name)}</b>.<br>${cost}<br>${left <= 0.5 ? '🎉 الدين خلص!' : `💳 فاضل عليه ${fmt(left / rate(to))} ${CUR[to].s}.`}<br>${log}`,
      `🔁 You sent ${fmt(amt, 2)} ${CUR[from].s} → ${fmt(toAmount, 2)} ${CUR[to].s} arrived and paid <b>${esc(payDebt.name)}</b>.<br>${cost}<br>${left <= 0.5 ? '🎉 The debt is paid off!' : `💳 ${fmt(left / rate(to))} ${CUR[to].s} still owed.`}<br>${log}`));
  }
  await bot(L(`اتحوّل 🔁 ${fmt(amt, 2)} ${CUR[from].s} من ${B[bk].i} ${B[bk].n} ${CUR[from].f} ← ${fmt(toAmount, 2)} ${CUR[to].s} في ${B[tb].i} ${B[tb].n} ${CUR[to].f}<br>${cost}<br>${log}`,
    `Transferred 🔁 ${fmt(amt, 2)} ${CUR[from].s} from ${B[bk].i} ${B[bk].n} ${CUR[from].f} → ${fmt(toAmount, 2)} ${CUR[to].s} into ${B[tb].i} ${B[tb].n} ${CUR[to].f}<br>${cost}<br>${log}`));
}

/* ───────────── سجل التحويلات: كل تحويل بين العملات، السعر اللي خدته والعمولة ───────────── */
function cardXfers(cv = 'ALL') {
  const list = S.tx.filter(t => t.type === 'transfer' && (cv === 'ALL' || cOf(t) === cv || t.to === cv)).sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return '';
  let lostAED = 0;
  const rows = list.map(t => {
    const from = cOf(t), tb = t.toBucket || t.bucket, got = (+t.toAmount || 0) / (+t.amount || 1);
    const mkt = t.mkt != null ? +t.mkt : null, lost = mkt != null ? mkt - (+t.toAmount || 0) : null;
    if (lost > 0) lostAED += lost * rate(t.to);
    return `<li class="row tx"><span class="badge">🔁</span>
      <div class="grow"><b>${CUR[from].f} ${B[t.bucket]?.i ?? ''} ${B[t.bucket]?.n ?? ''} → ${CUR[t.to]?.f ?? ''} ${B[tb]?.i ?? ''} ${B[tb]?.n ?? ''}</b>
        <small>${t.date} · ${L('السعر', 'Rate')} <span dir="ltr">${fxTxt(from, t.to, got)}</span>${mkt != null ? ` · ${L('السوق', 'Market')} <span dir="ltr">${fxTxt(from, t.to, mkt / t.amount)}</span>` : ''}</small>
        ${lost != null ? `<small>${lost > 0.005 ? `💸 ${L('اتخصم', 'Lost')} <b dir="ltr">${fmt(lost, 2)} ${CUR[t.to].s}</b> (${fmt(lost / mkt * 100, 1)}%)${t.fee ? ` · ${L('منهم عمولة', 'of which fee')} ${fmt(t.fee, 2)}` : ''}` : `✅ ${L('من غير عمولة', 'No fee')}`}</small>` : ''}</div>
      <span class="amt"><b dir="ltr" class="neg">−${fmt(t.amount, 2)} ${CUR[from].s}</b><b dir="ltr" class="pos">+${fmt(t.toAmount, 2)} ${CUR[t.to]?.s ?? ''}</b></span></li>`;
  }).join('');
  return card('c-xfer', L('🔁 سجل التحويلات', '🔁 Transfers log'), `
    <p class="note">${L(`كل فلوس طلعت من عملة ودخلت عملة تانية. ${lostAED > 0.5 ? `مجموع اللي راح في العمولات وفرق السعر: <b dir="ltr">${fmt(lostAED)} Đ</b>.` : ''}`, `Every bit of money that left one currency and arrived in another. ${lostAED > 0.5 ? `Total lost to fees and rate differences: <b dir="ltr">${fmt(lostAED)} Đ</b>.` : ''}`)}</p>
    <ul class="list xfers">${rows}</ul>
    <div class="chips-c"><button class="pill" data-act="transfer">🔁 ${L('تحويل جديد', 'New transfer')}</button></div>`, 'wide');
}

async function flowWhere() {
  const w = here();
  const to = await ask(L(`📍 إنت دلوقتي في ${CUR[w].f} ${PLACE_N[w]}. رايح فين؟`, `📍 You're now in ${CUR[w].f} ${PLACE_N[w]}. Where to?`), [...places().filter(x => x !== w).map(x => ({ l: `✈️ ${CUR[x].f} ${PLACE_N[x]}`, v: x })), BACK]); if (to === null) return;
  let d;
  for (let q = L('من إمتى؟', 'From when?'); ;) {
    const v = await ask(q, [{ l: L('النهارده', 'Today'), v: 'النهارده' }, { l: L('بكرة', 'Tomorrow'), v: iso(new Date(Date.now() + 864e5)) }, BACK]); if (v === null) return;
    d = parseDay(v); if (d) break;
    sfx.err(); q = L('مش فاهم التاريخ 😅 اكتبه كده: 25/11', "I couldn't read that date 😅 Type it like this: 25/11");
  }
  const before = essNow(); moveTo(to, d); save(); render();
  await sitChanged(before, L(`✈️ اتسجّل: من ${dayName(new Date(d + 'T00:00:00'))} إنت في ${CUR[to].f} ${PLACE_N[to]}.`, `✈️ Saved: from ${dayName(new Date(d + 'T00:00:00'))} you're in ${CUR[to].f} ${PLACE_N[to]}.`));
  if (!S.essentials.some(e => e.where)) await bot(L('💡 لو فيه بند بيتغيّر حسب مكانك أو مكان مراتك (زي المعيشة أو الخروج)، دوس 📌 جنبه في كارت الأساسيات.', '💡 If an item changes with where you or your wife are (like living costs or outings), tap 📌 next to it in the Essentials card.'));
}

/** قايمة متلزقة في الشات: كل سطر "اسم: مبلغ عملة" */
function parseList(t) {
  const out = [];
  for (const raw of String(t).split(/\r?\n/)) {
    const line = raw.replace(/^[\s\-*•·]*(\[[ xX✓]?\])?\s*/, '').trim(); if (!line) continue;
    const nums = [...norm(line).matchAll(/\d[\d,]*(\.\d+)?/g)]; if (!nums.length) continue;
    const n = nums[nums.length - 1], amount = parseFloat(n[0].replace(/,/g, ''));
    const name = norm(line).slice(0, n.index).replace(/[:：\-–=]+\s*$/, '').trim() || line;
    if (amount > 0) out.push({ name: name.slice(0, 40), amount, cur: curOf(line) });
  }
  return out;
}
const ICON = [[/rent|ايجار|إيجار|سكن/i, '🏠'], [/bill|فاتور|كهرب|مياه|غاز/i, '💡'], [/internet|wifi|نت/i, '🌐'], [/mobile|phone|موبايل|تليفون/i, '📱'], [/mainten|صيان/i, '🛠️'], [/entertain|ترفيه|خروج/i, '🎬'], [/living|معيش|أكل|اكل|food|grocer/i, '🛒'], [/insur|تأمين|امين|amin/i, '🛡️'], [/car|transport|مواصلات|بنزين/i, '🚗'], [/school|مدرس|تعليم/i, '🎓']];
async function flowPasteList(list) {
  const guess = list.find(x => x.cur)?.cur || (cardView() !== 'ALL' ? cardView() : 'AED');
  const cu = await ask(L(`لقيت ${list.length} بنود 📋 أضيفهم لأساسيات أنهي بلد؟<ul class="alloc">${list.map(x => `<li><span>${esc(x.name)}</span><b dir="ltr">${fmt(x.amount)}${x.cur ? ' ' + CUR[x.cur].s : ''}</b></li>`).join('')}</ul>`, `I found ${list.length} items 📋 Add them to which country's essentials?<ul class="alloc">${list.map(x => `<li><span>${esc(x.name)}</span><b dir="ltr">${fmt(x.amount)}${x.cur ? ' ' + CUR[x.cur].s : ''}</b></li>`).join('')}</ul>`),
    [{ l: `${CUR[guess].f} ${PLACE_N[guess] || CUR[guess].n} (${CUR[guess].s})`, v: guess }, ...places().filter(x => x !== guess).map(x => ({ l: `${CUR[x].f} ${PLACE_N[x] || CUR[x].n} (${CUR[x].s})`, v: x })), BACK]); if (cu === null) return;
  let added = 0, updated = 0;
  for (const x of list) {
    const same = S.essentials.find(e => cOf(e) === cu && String(e.name).trim().toLowerCase() === x.name.toLowerCase());
    if (same) { if (same.where) same.where[cu] = x.amount; else same.amount = x.amount; updated++; continue; }
    S.essentials.push({ id: uid(), icon: ICON.find(([r]) => r.test(x.name))?.[1] || '🧾', name: x.name, amount: x.amount, cur: cu }); added++;
  }
  save(); render(); sfx.ok();
  const tot = S.essentials.filter(e => cOf(e) === cu).reduce((a, e) => a + (+e.amount || 0), 0);
  await bot(L(`✅ ${added ? `اتضاف ${added}` : ''}${added && updated ? ' و' : ''}${updated ? `اتحدّث ${updated}` : ''} في أساسيات ${CUR[cu].f} ${PLACE_N[cu] || CUR[cu].n}. الإجمالي ${fmt(tot)} ${CUR[cu].s} في الشهر.<br>💡 لو بند بيتغيّر حسب إنت فين (زي المعيشة 4000 وإنت برّه و8000 وإنت هناك)، دوس 📍 جنبه في كارت الأساسيات واكتب المبلغين.`,
    `✅ ${added ? `Added ${added}` : ''}${added && updated ? ' and ' : ''}${updated ? `updated ${updated}` : ''} in ${CUR[cu].f} ${PLACE_N[cu] || CUR[cu].n} essentials. Total ${fmt(tot)} ${CUR[cu].s} a month.<br>💡 If an item changes with where you are (like living costs: 4000 while away, 8000 while there), tap 📍 next to it in the Essentials card and type both amounts.`));
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
  // الأول العملة وبعدين الرقم (طلب صاحب الحساب، 2026-11-20)
  const scur = await askCur(L('المرتب بأنهي عملة؟ 💱', 'Which currency is the salary in? 💱')); if (!scur) return;
  const prevNat = cOf(S.job || {}) === scur ? (+S.salaryNat || (S.salary ? S.salary / rate(scur) : 0)) : 0;
  const m0 = await askMoney(L(`والمرتب الكامل في الشهر كام ${CUR[scur].f} ${CUR[scur].n}؟ 💰`, `And what's the full monthly salary in ${CUR[scur].n}? 💰`), prevNat > 0 ? [Math.round(prevNat)] : [], true); if (!m0) return;
  const m = { amount: m0.amount, cur: m0.cur || scur };
  const a = await ask(L('ويوم القبض تحب أعمل إيه؟', 'And on payday, what should I do?'), [{ l: L('✅ سجّله ووزّعه أوتوماتيك', '✅ Record and split it automatically'), v: 'auto' }, { l: L('🔔 فكّرني وأنا أسجّله', '🔔 Remind me and I\'ll record it'), v: 'man' }, BACK]); if (a === null) return;
  S.job = { company: String(co).trim(), start, covers, cur: m.cur };
  S.payday = day; S.salaryNat = m.amount; S.salary = m.amount * rate(m.cur); // S.salary بالدرهم للحسابات، و salaryNat بعملة المرتب S.autoSalary = a === 'auto'; S.autoFrom = S.autoSalary ? today() : null;
  save(); render();
  const pi = payInfo(ctx()), p = pi.prev;
  const parts = [[L('🤲 الصدقة', '🤲 Sadaqa'), p.sadaqa], [L('🍞 الأساسيات', '🍞 Essentials'), p.essentials], [`💳 ${esc(dName())}`, p.debt], [L('📈 استثمار', '📈 Investing'), p.invest], [L('🛟 الأمان', '🛟 Safety'), p.stability], [L('🎉 الفلوس الحرّة', '🎉 Fun free money'), p.reward]].filter(([, v]) => v > 0.5);
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
  { get l() { return L('🧠 هدف كبير جديد', '🧠 New big goal'); }, v: 'goal' }, { get l() { return L('💳 الديون', '💳 Debts'); }, v: 'debt' }, { get l() { return L('🔁 تحويل', '🔁 Transfer'); }, v: 'transfer' }, { get l() { return L('📍 أنا فين', '📍 Where am I'); }, v: 'where' },
  { get l() { return L('🧭 أستثمر في إيه؟', '🧭 What to invest in?'); }, v: 'invest' }, { get l() { return L('💼 سجّلت استثمار', '💼 I invested'); }, v: 'invested' },
];
const FLOWS = { cardSetup: async () => { const d = debts().filter(isCard).find(x => x.id === UI.cardPick) || debts().filter(isCard).find(x => !(x.card?.stmtDay >= 1)) || debts().filter(isCard)[0]; UI.cardPick = null; if (d) await cardSetup(d); }, salary: () => flowIncome('salary'), side: () => flowIncome('side'), spend: () => flowSpend(), gold: flowGold, fun: flowFun, cta: flowCTA, pay: flowPay, goal: flowGoal, debt: flowDebt, transfer: flowTransfer, where: flowWhere, invest: flowInvest, invested: flowInvested };
/* ───────────── اسأل أي حاجة: أي كلام مش أمر بيروح لـ Gemini مع ملخص بياناتك والشات ───────────── */
/** ملخص البيانات للذكاء الاصطناعي: من غير الرقم السري، وآخر 15 معاملة بس */
function aiData() {
  const c = ctx(), R = c.R, r0 = v => Math.round(+v || 0), sit = sitOn(S, today());
  const wallets = {};
  for (const cu of countries(S).filter(x => CUR[x])) {
    const w = R.bal[cu] || {};
    wallets[cu] = { growth: r0(w.growth), safety: r0(w.stability), fun: r0(w.reward), sadaqaWaiting: r0(w.sadaqa) };
  }
  return {
    today: today(), currentCycle: c.ym, aedPer: { EGP: +rate('EGP').toFixed(4), USD: +rate('USD').toFixed(4), gold24Gram: r0(rate('XAU')) },
    salary: S.job ? { amount: +S.salary || 0, cur: cOf(S.job), payday: paydayOf(S) } : null, sadaqaPct: +S.sadaqa || 0,
    where: { me: sit.me === 'EGP' ? 'Egypt' : 'UAE', wife: sit.wife === 'EGP' ? 'Egypt' : 'UAE' },
    totalsAED: { growth: r0(R.growthAED), safety: r0(R.stabilityAED), fun: r0(R.rewardAED), debt: r0(R.debt), essentialsThisMonth: r0(c.Ec), expectedMonthlyIncome: r0(c.expI), expectedIncomeBasis: Object.keys(R.months).filter(k => k < c.ym && R.months[k].income > 0).length >= AVG_MIN ? `average of the last ${AVG_MIN} cycles` : `salary only (less than ${AVG_MIN} cycles of data, so side income is not averaged; use this number, never add side income to it)` },
    walletsInOwnCurrency: wallets,
    thisCycle: { income: r0(c.mo.income), essentialsCovered: r0(c.mo.essAlloc), essentialsSpent: r0(c.mo.essSpent), funSpent: r0(c.mo.rewardSpent), mode: c.mo.mode },
    lastCycles: Object.keys(R.months).sort().slice(-6).map(k => { const m = R.months[k]; return { cycle: k, incomeAED: r0(m.income), essentialsSpentAED: r0(m.essSpent), funSpentAED: r0(m.rewardSpent), mode: m.mode }; }),
    essentials: S.essentials.map(e => ({ name: e.name, cur: cOf(e), thisMonth: r0(itemFor(S, e, c.ym)), ...(e.where ? { bySituation: Object.fromEntries(['AED+AED', 'AED+EGP', 'EGP+EGP'].map(k => { const [me, wife] = k.split('+'); return [k, r0(amtAt(e, { me, wife }))]; })) } : {}), daily: !!e.daily, ...(e.where ? { dependsOnLocation: true } : {}), ...(e.paidTo ? { prepaidUntil: e.paidTo } : {}) })),
    debts: debts().map(d => ({ name: d.name, kind: d.kind, cur: cOf(d), left: r0(dLeft(R, d)) })).filter(d => d.left > 0),
    assets: S.holdings.filter(h => +h.amount > 0).map(h => ({ name: h.name, kind: h.kind || (h.cur === 'XAU' ? 'gold' : 'cash'), bucket: h.spare ? 'safety' : 'growth', valueAED: r0(holdingValue(h, rate)), ...(h.cost ? { paidAED: r0(h.cost * rate(homeOf(h))) } : {}) })),
    safetyMilestones: spareList(R).map(t => ({ name: t.name, targetAED: r0(t.amt), reached: R.stabilityAED >= t.amt - 0.5 })),
    bigGoals: (S.goals || []).map(g => ({ name: g.name, type: g.type, price: g.price, down: g.down, instalment: g.inst, months: g.n, monthly: g.monthly, pay: g.pay })),
    funGoals: S.fun.map(f => ({ name: f.name, costAED: r0(f.cost), everyMonths: f.every })),
    recentTransactions: S.tx.slice(-15).map(t => ({ date: t.date, type: t.type, bucket: t.bucket, amount: r0(t.amount), cur: cOf(t), ...(t.to ? { to: t.to, toAmount: r0(t.toAmount) } : {}), note: String(t.note || '').slice(0, 40) })),
  };
}
const chatHistory = () => [...logEl.querySelectorAll('.msg:not(.typing)')].slice(-30)
  .map(el => ({ who: el.classList.contains('me') ? 'owner' : 'floosy', text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 600) })).filter(x => x.text);

async function flowMoney(m) {
  const w = await ask(L(`${fmt(m.amount)} دول إيه؟`, `What's this ${fmt(m.amount)}?`), [{ l: L('🤑 دخل جانبي', '🤑 Side income'), v: 'side' }, { l: L('💰 مرتب', '💰 Salary'), v: 'salary' }, { l: L('💸 مصروف', '💸 Expense'), v: 'spend' }, BACK]);
  if (w === 'spend') await flowSpend(m); else if (w === 'side' || w === 'salary') await flowIncome(w, m);
}
/* ───────────── 🦈 قرش الـ Agent (Claude): بيفكر بأرقامك وذاكرة الشات، وبيستخدم أدوات بتشتغل هنا في الصفحة ─────────────
 * الأدوات: محاكاة هدف بمحرك فلوسي نفسه، مقارنة بدائل، قراية المعاملات، واقتراح زرار (إنت اللي بتدوسه). مفيش أداة بتحفظ أو تصرف حاجة. */
function goalFromTool(x) {
  const n = v => Math.max(0, +v || 0);
  const g = { id: 'sim', name: String(x.name || L('هدف', 'Goal')).slice(0, 60), type: ['buy', 'monthly', 'term'].includes(x.type) ? x.type : 'buy' };
  if (g.type === 'buy') { g.price = n(x.price); if (n(x.instalment) > 0) { g.down = n(x.down); g.inst = n(x.instalment); g.n = Math.max(1, Math.round(n(x.months)) || 12); g.pay = 'inst'; } else g.pay = 'cash'; }
  else { g.monthly = n(x.monthly); if (g.type === 'term') g.n = Math.max(1, Math.round(n(x.months)) || 6); }
  g.run = n(x.running);
  if (x.contract) g.contract = x.contract;
  if (x.replaces) { const q = bare(x.replaces), e = S.essentials.find(e => bare(e.name).includes(q) || q.includes(bare(e.name))); if (e) { g.replace = eVal(e); g.replaceName = e.name; } }
  return g;
}
function simGoal(x) {
  const c = ctx(), base = goalBase(c), g = goalFromTool(x), f = evaluate(base, S.goals || [], g);
  return factsFor(base, S.goals || [], g, f, { livingLevel: lifeState(c).level, replacesFound: g.replaceName || null });
}
/** 👫 لو مكانك أو مكان مراتك اتغيّر (مثلًا مراتك جت الإمارات): كل بند بيتغيّر قد إيه، ده بيأثر على الدين والأمان إزاي، وإيه الناقص */
function simSituation(x) {
  const c = ctx(), sitNow = sitOn(S, today()), to = { me: x.me === 'EGP' ? 'EGP' : x.me === 'AED' ? 'AED' : sitNow.me, wife: x.wife === 'EGP' ? 'EGP' : x.wife === 'AED' ? 'AED' : sitNow.wife };
  const r0 = v => Math.round(+v || 0), key = s => `${s.me}+${s.wife}`;
  const items = S.essentials.map(e => {
    const a = amtAt(e, sitNow) * rate(cOf(e)), b = amtAt(e, to) * rate(cOf(e));
    const hasRule = !!e.where, known = !e.where || e.where[key(to)] != null || (e.whereMode !== 'both' && e.where[to.me] != null);
    return { item: e.name, cur: cOf(e), nowAED: r0(a), thenAED: r0(b), change: r0(b - a), dependsOnLocation: hasRule, amountKnownForNewSituation: known };
  });
  const Enow = items.reduce((t, i) => t + i.nowAED, 0), Ethen = items.reduce((t, i) => t + i.thenAED, 0);
  const base = goalBase(c), fixed = plan(base, S.goals || []).fixed, A = runGoals(base, fixed), Bb = runGoals({ ...base, E: base.E - Enow + Ethen }, fixed);
  const first = (rows, ok) => { const r = rows.find(ok); return r ? monthName(addMonths(base.start, r.i)) : 'beyond 10 years'; };
  const k = Math.min(2, A.length - 1), pick = r => ({ income: r0(r.net), essentials: r0(r.E), toDebt: r0(r.toDebt), toSafety: r0(r.toStab), toInvest: r0(r.toInvest), freeMoney: r0(r.toFun), deficit: r0(Math.max(0, r.E - r.net)) });
  return { from: sitNow, to, startDate: x.from || null, items, essentialsMonthNowAED: r0(Enow), essentialsMonthThenAED: r0(Ethen), monthlyChange: r0(Ethen - Enow),
    normalMonth: { now: pick(A[k]), then: pick(Bb[k]) }, debtFree: { now: base.debt > 0.5 ? first(A, r => r.debt <= 0.5) : 'no debt', then: base.debt > 0.5 ? first(Bb, r => r.debt <= 0.5) : 'no debt' },
    safetyTarget: { now: first(A, r => r.stab >= base.lastSpare - 0.5), then: first(Bb, r => r.stab >= base.lastSpare - 0.5) },
    missing: items.filter(i => !i.amountKnownForNewSituation).map(i => i.item), note: 'items that do not depend on location keep the same amount; ask him only about items in missing, or new items the move adds (e.g. bigger flat, her phone line, her transport), then re-run with that in mind' };
}
/** 🧾 عاداتك في الصرف من معاملاتك الحقيقية */
function spendSummary(n) {
  const c = ctx(), pd = paydayOf(S), keys = Object.keys(c.R.months).sort().slice(-n), ex = S.tx.filter(t => t.type === 'expense' && keys.includes(periodOf(t.date, pd)));
  const aed = t => (+t.amount) * (t.rate || rate(cOf(t))), r0 = v => Math.round(v), sum = (arr) => r0(arr.reduce((a, t) => a + aed(t), 0));
  const byMonth = keys.map(k => { const m = ex.filter(t => periodOf(t.date, pd) === k); return { cycle: k, total: sum(m), essentials: sum(m.filter(t => t.bucket === 'essentials')), freeMoney: sum(m.filter(t => t.bucket === 'reward')), sadaqa: sum(m.filter(t => t.bucket === 'sadaqa')), emergency: sum(m.filter(t => t.bucket === 'stability')), count: m.length }; });
  const grp = new Map(); for (const t of ex) { const k = `${t.cat || t.bucket} › ${t.sub || t.note || ''}`; const g = grp.get(k) || { what: k, aed: 0, times: 0 }; g.aed += aed(t); g.times++; grp.set(k, g); }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], wd = days.map(d => ({ day: d, aed: 0, times: 0 }));
  for (const t of ex) { const w = wd[new Date(t.date + 'T00:00:00').getDay()]; w.aed += aed(t); w.times++; }
  const small = ex.filter(t => aed(t) < 25);
  const overItems = S.essentials.map(e => ({ item: e.name, budget: r0(eVal(e)), spent: r0(c.mo.items[e.id] || 0) })).filter(x => x.spent > x.budget + 0.5);
  return { cycles: keys, byMonth, top: [...grp.values()].sort((a, b) => b.aed - a.aed).slice(0, 12).map(g => ({ ...g, aed: r0(g.aed) })), weekdays: wd.map(w => ({ ...w, aed: r0(w.aed) })),
    smallBuys: { count: small.length, aed: sum(small) }, freeMoneyJarNow: r0(c.R.rewardAED), essentialsOverBudgetThisCycle: overItems, waitList7Days: (S.wait || []).length, dataNote: keys.length < 3 ? 'little history yet, say so' : '' };
}
/** 📈 محرك الاستثمار (قواعد الفيديو) */
function investProj(x) {
  const c = ctx(), base = goalBase(c), fixed = plan(base, S.goals || []).fixed, mix = mixFor(Math.min(6, Math.max(1, +x.risk || 3)));
  const p = project(base, fixed, mix, { extra: Math.max(0, +x.extraMonthly || 0) }), r0 = v => Math.round(+v || 0), at = m => { const a = p.at(m); return { invested: r0(a.put), low: r0(a.low), mid: r0(a.mid), high: r0(a.high) }; };
  return { startsIn: p.startI == null ? 'not within 10 years at the current pace' : monthName(addMonths(base.start, p.startI)), monthlyInvest: r0(p.monthly), mix: { name: mix.n, parts: mix.parts.map(([k, pc]) => ({ asset: ASSETS[k].n, pct: pc, expectedPct: ASSETS[k].ret })) }, expectedReturnPctYear: p.ret, after1y: at(12), after3y: at(36), after5y: at(60), after10y: at(120), note: 'video mix includes conventional bonds (interest): apply the Islamic screen' };
}
/** 🦈 قرش بيسأل سؤال جوّه تفكيره ويستنى ردك */
async function agentAsk(x) {
  UI.agentAsk = true;
  try { const v = await ask('🦈 ' + esc(x.question || ''), [...(x.options || []).slice(0, 6).map(o => ({ l: String(o), v: String(o) })), { l: L('↩️ وقّف', '↩️ Stop'), v: null }], true); return v == null ? { stopped: true } : { answer: String(v) }; }
  finally { UI.agentAsk = false; }
}
async function confirmBtn(q) { const v = await ask(q, [{ l: L('✅ أيوه، نفّذ', '✅ Yes, do it'), v: 'y' }, { l: L('✏️ لأ', '✏️ No'), v: null }]); return v === 'y'; }
async function agentRecord(x) {
  const bucket = ['essentials', 'reward', 'sadaqa', 'stability'].includes(x.bucket) ? x.bucket : 'reward', cur = CUR[x.cur] ? x.cur : 'AED', amount = +x.amount;
  if (!(amount > 0)) return { error: 'amount must be > 0' };
  let item = null, sub = String(x.note || '').slice(0, 60);
  if (bucket === 'essentials') { const q = bare(x.item || x.note || ''), e = S.essentials.find(e => bare(e.name).includes(q) || q.includes(bare(e.name))); if (!e) return { error: 'essentials item not found', items: S.essentials.map(e => e.name) }; item = e.id; sub = e.name; }
  const c = ctx(), have = bucket === 'reward' ? c.R.rewardAED : bucket === 'sadaqa' ? c.R.sadaqaAED : bucket === 'stability' ? c.R.stabilityAED : (c.mo.essAlloc - c.mo.essSpent);
  if (!await confirmBtn(L(`أسجّل <b>${fmt(amount)} ${CUR[cur].s}</b> على <b>${esc(sub)}</b> من ${B[bucket]?.i || ''} <b>${BX[bucket]?.n || bucket}</b>؟ (فيها دلوقتي ${fmt(have)} درهم)`, `Record <b>${fmt(amount)} ${CUR[cur].s}</b> for <b>${esc(sub)}</b> from ${B[bucket]?.i || ''} <b>${BX[bucket]?.n || bucket}</b>? (it has ${fmt(have)} AED now)`))) return { saved: false, owner: 'declined' };
  S.tx.push({ id: uid(), date: today(), type: 'expense', bucket, item, amount, cur, rate: rate(cur), cat: BX[bucket].n, sub, note: sub }); save(); render(); sfx.spend?.();
  const a = ctx(); return { saved: true, pocketAfterAED: Math.round(bucket === 'reward' ? a.R.rewardAED : bucket === 'sadaqa' ? a.R.sadaqaAED : bucket === 'stability' ? a.R.stabilityAED : a.mo.essAlloc - a.mo.essSpent) };
}
async function agentGoal(x) {
  const g = goalFromTool(x); g.id = uid(); if (x.pay === 'cash' && g.type === 'buy') { g.pay = 'cash'; delete g.inst; }
  if (!await confirmBtn(L(`أضيف <b>${esc(g.name)}</b> لأهدافك الكبيرة؟`, `Add <b>${esc(g.name)}</b> to your big goals?`))) return { saved: false, owner: 'declined' };
  g.at = today(); (S.goals ??= []).push(g); save(); render(); party(['🎯', '🦈']); return { saved: true };
}
async function agentCouncil(x) {
  const c = ctx(), base = goalBase(c), g = goalFromTool(x), f = evaluate(base, S.goals || [], g);
  const facts = factsFor(base, S.goals || [], g, f, { livingLevel: lifeState(c).level }); facts.tasks = TASKS().map(t => ({ key: t.v, label: t.l }));
  const r = await fetch('/api/ideas?finance=advise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, lang: L('ar', 'en') }) });
  const d = await r.json().catch(() => null); if (!r.ok || !d) return { error: 'council unavailable' };
  return { advisors: (d.advisors || []).map(a => ({ who: a.name, stance: a.stance, said: a.say })), chair: d.chair };
}
function runTool(name, x, props) {
  try {
    if (name === 'simulate_goal') return simGoal(x);
    if (name === 'compare_goals') return (x.options || []).slice(0, 4).map(o => ({ option: o.name || o.type, ...simGoal(o) }));
    if (name === 'list_transactions') {
      const q = x.text ? bare(x.text) : '';
      return S.tx.filter(t => (!x.from || t.date >= x.from) && (!x.to || t.date <= x.to) && (!x.type || t.type === x.type) && (!q || bare(`${t.cat || ''} ${t.sub || ''} ${t.note || ''}`).includes(q)))
        .slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, Math.min(100, x.limit || 40))
        .map(t => ({ date: t.date, type: t.type, bucket: t.bucket, amount: Math.round(+t.amount * 100) / 100, cur: cOf(t), aed: Math.round((+t.amount) * (t.rate || rate(cOf(t)))), cat: t.cat, sub: t.sub, note: String(t.note || '').slice(0, 60) }));
    }
    if (name === 'simulate_situation') return simSituation(x);
    if (name === 'spending_summary') return spendSummary(Math.min(12, Math.max(1, +x.months || 3)));
    if (name === 'invest_projection') return investProj(x);
    if (name === 'request_feature') { (S.featureReqs ??= []).push({ id: uid(), at: today(), title: String(x.title || '').slice(0, 120), what: String(x.what || '').slice(0, 2000), why: String(x.why || '').slice(0, 600) }); save(); return { saved: true, note: 'Saved in the app as a feature request for the developer assistant (Claude Code). It is not built yet.' }; }
    if (name === 'show_chart') { if (!Array.isArray(x.labels) || !Array.isArray(x.series)) return { error: 'bad chart' }; (props.charts ||= []).push(x); return { shown: true }; }
    if (name === 'propose_action') { if (!FLOWS[x.task]) return { error: 'unknown task' }; props.push({ task: x.task, label: String(x.label || '').slice(0, 60), amount: +x.amount || null, cur: x.cur || null }); return { shown: true }; }
    return { error: 'unknown tool' };
  } catch (e) { console.error(e); return { error: String(e.message || e) }; }
}
const TOOL_SAY = { simulate_goal: L('🧮 بحسب الهدف بمحرك فلوسي…', '🧮 Running the goal through Floosy\'s engine…'), compare_goals: L('⚖️ بقارن البدائل…', '⚖️ Comparing the options…'), list_transactions: L('📒 بقرا معاملاتك…', '📒 Reading your transactions…'), propose_action: L('⚡ بجهزلك زرار…', '⚡ Preparing a button for you…'), spending_summary: L('🧾 بحلّل عاداتك في الصرف…', '🧾 Analysing your spending habits…'), invest_projection: L('📈 بحسب الاستثمار…', '📈 Working out the investing…'), ask_council: L('🧠 المجلس بيتناقش (حوالي 20 ثانية)…', '🧠 The council is discussing (about 20 s)…'), record_expense: L('🧾 بجهز التسجيل…', '🧾 Preparing the entry…'), add_goal: L('🎯 بجهز الهدف…', '🎯 Preparing the goal…'), request_feature: L('🛠️ بكتب طلب التطوير…', '🛠️ Writing the feature request…'), ask_user: '…', simulate_situation: L('👫 بحسب الوضع الجديد…', '👫 Working out the new situation…'), point_to: L('👆 هوريك في الصفحة…', '👆 Showing you on the page…'), show_chart: L('📊 برسملك…', '📊 Drawing it for you…') };
/** 📊 رسم متحرك جوّه رد قرش: أعمدة بتطلع أو خطوط بتترسم، بأرقام من الأدوات بس */
function agentChart(c) {
  const COL = ['#6981B5', '#d95926', '#199e70', '#D55E51'], W = 560, H = 230, Lp = 56, R = 10, T = 16, Bm = 42, pw = W - Lp - R, ph = H - T - Bm;
  const labels = c.labels.slice(0, 24).map(String), ser = c.series.slice(0, 4).map(x => ({ name: String(x.name || ''), v: labels.map((_, i) => +x.values?.[i] || 0) }));
  const all = ser.flatMap(x => x.v), lo = Math.min(0, ...all), hiRaw = Math.max(0, ...all), step = 10 ** Math.floor(Math.log10(Math.max(1, hiRaw - lo))), hi = Math.ceil(hiRaw / step) * step || 1;
  const y = v => T + ph - (v - lo) / (hi - lo || 1) * ph, y0 = y(0);
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${Lp}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.09)"/><text x="${Lp - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${fmt(v)}</text>`).join('');
  const band = pw / labels.length, xl = labels.map((l, i) => `<text x="${Lp + band * i + band / 2}" y="${H - 22}" text-anchor="middle" class="ax">${esc(l.length > 12 ? l.slice(0, 11) + '…' : l)}</text>`).join('');
  let marks = '';
  if (c.type === 'line') {
    const x = i => Lp + (labels.length < 2 ? pw / 2 : i / (labels.length - 1) * pw);
    marks = ser.map((s, k) => `<path class="ln" style="--d:${k * 0.25}s" d="${s.v.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${COL[k]}" stroke-width="2.6" stroke-linejoin="round" pathLength="1"/>`
      + s.v.map((v, i) => `<circle class="pt" style="--d:${0.6 + k * 0.25 + i * 0.03}s" cx="${x(i)}" cy="${y(v)}" r="4" fill="${COL[k]}" stroke="#0b1020" stroke-width="2"><title>${esc(s.name)} · ${esc(labels[i])}: ${fmt(v)}</title></circle>`).join('')).join('');
  } else {
    const n = ser.length, bw = Math.min(34, (band - 10) / n);
    marks = ser.map((s, k) => s.v.map((v, i) => { const x0 = Lp + band * i + (band - bw * n) / 2 + bw * k, top = Math.min(y(v), y0), h = Math.max(1, Math.abs(y(v) - y0));
      return `<g class="br" style="--d:${i * 0.08 + k * 0.05}s;transform-origin:${x0 + bw / 2}px ${y0}px"><rect x="${x0 + 1}" y="${top}" width="${bw - 2}" height="${h}" rx="4" fill="${COL[k]}"><title>${esc(s.name)} · ${esc(labels[i])}: ${fmt(v)}</title></rect><text x="${x0 + bw / 2}" y="${top - 5}" text-anchor="middle" class="ax val">${fmt(v)}</text></g>`; }).join('')).join('');
  }
  const key = ser.length > 1 || ser[0].name ? `<div class="ach-key">${ser.map((s, k) => `<span><i style="background:${COL[k]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<figure class="ach"><figcaption>📊 ${esc(c.title || '')}${c.unit ? ` <small>(${esc(c.unit)})</small>` : ''}</figcaption><svg viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${esc(c.title || '')}">${grid}${lo < 0 ? `<line x1="${Lp}" x2="${W - R}" y1="${y0}" y2="${y0}" stroke="rgba(255,255,255,.35)"/>` : ''}${marks}${xl}</svg>${key}</figure>`;
}
async function flowAgent(text) {
  if (!HOSTED) return flowAI(text);
  const th = await bot('🦈 <i>' + L('بفكّر بأرقامك وكل كلامنا اللي فات…', 'Thinking with your numbers and everything we discussed…') + '</i>', 'thinking');
  const props = []; let msgs = null, d = null; flushChat();
  try {
    for (let i = 0; i < 24; i++) {
      const body = msgs ? { messages: msgs, lang: L('ar', 'en') } : { start: text, messages: [{ role: 'user', content: text }], data: { ...aiData(), tasks: TASKS(), videoRules: Object.fromEntries(['growth', 'stability', 'essentials', 'reward'].filter(k => VIDEO[k]).map(k => [k, VIDEO[k].map(([h, t]) => `${h}: ${t}`)])), pockets: { essentials: 'needs (rent, food, transport)', reward: 'free money jar for wants/outings', stability: 'safety/emergency only', growth: 'debt payoff then investing', sadaqa: 'sadaqa set aside' }, recentChat: chatHistory().slice(-20) }, lang: L('ar', 'en') };
      SX.work(true, text); // وضع قرش: يلف على بياناتك في الصفحة وهو بيفكّر
      const r = await fetch('/api/ideas?finance=agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).finally(() => SX.workDone());
      if (r.status === 401) { th.remove(); expired(); return; }
      if (r.status === 503) { th.remove(); return flowAI(text); } // لسه مفيش مفتاح Claude: Gemini زي الأول
      d = await r.json(); if (!r.ok) throw new Error(d.error || r.status);
      if (!msgs) msgs = [d.first];
      msgs.push({ role: 'assistant', content: d.content });
      if (d.content?.some(b => b.type === 'server_tool_use')) th.innerHTML = '🦈 <i>' + L('🔎 بدوّر على النت (قرآن، سنة، مصادر)…', '🔎 Searching the web (Quran, Sunnah, sources)…') + '</i>';
      if (d.stop_reason === 'pause_turn') continue;
      if (d.stop_reason !== 'tool_use') break;
      const results = [];
      for (const b of d.content.filter(b => b.type === 'tool_use')) {
        th.innerHTML = '🦈 <i>' + (TOOL_SAY[b.name] || '…') + '</i>';
        const I = b.input || {};
        const VISIT = { list_transactions: ['transactions', L('بقرا معاملاتك', 'Reading your transactions')], spending_summary: ['transactions', L('بحلّل صرفك', 'Analysing your spending')], simulate_goal: ['goals', L('بحسب الهدف', 'Working out the goal')], compare_goals: ['goals', L('بقارن البدائل', 'Comparing options')], invest_projection: ['invest', L('بقرا الاستثمار', 'Reading investing')], simulate_situation: ['essentials', L('بقرا الأساسيات في كل وضع', 'Reading essentials in each situation')], record_expense: ['fun', L('بجهز التسجيل', 'Preparing the entry')], add_goal: ['goals', L('بجهز الهدف', 'Preparing the goal')] }[b.name];
        if (VISIT) await SX.visit(VISIT[0], VISIT[1]);
        const out = b.name === 'point_to' ? await SX.point(I.place, I.note) : b.name === 'ask_user' ? (th.remove(), await agentAsk(I)) : b.name === 'record_expense' ? await agentRecord(I) : b.name === 'add_goal' ? await agentGoal(I) : b.name === 'ask_council' ? await agentCouncil(I) : runTool(b.name, I, props);
        if (!th.isConnected) { logEl.append(th); scrollLog(); }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
      }
      msgs.push({ role: 'user', content: results });
    }
  } catch (e) {
    console.error(e); th.remove();
    return bot(L('😅 قرش مش متاح دلوقتي. جرّب كمان شوية.', '😅 Shark is not available right now. Try again in a bit.'));
  }
  th.remove();
  const answerText = d?.stop_reason === 'refusal' ? L('😅 مقدرتش أرد على ده. جرّب تسأله بشكل تاني.', "😅 I couldn't answer that. Try asking it differently.")
    : (d?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || L('🤔 مفيش رد.', '🤔 No reply.');
  const el = await bot(`${esc(answerText).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')} <button class="say" type="button" title="${L('اسمعها', 'Listen')}" aria-label="${L('اسمعها', 'Listen')}">🔊</button>`, 'wide');
  el.querySelector('.say').onclick = () => speak(answerText);
  for (const ch of (props.charts || []).slice(0, 2)) { el.insertAdjacentHTML('beforeend', agentChart(ch)); scrollLog(); requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.ach:not(.go)').forEach(x => x.classList.add('go')))); }
  if (!props.length) return;
  UI.greet = true; // في وضع قرش السؤال ده سطر صغير تحت الرد، مش بدله
  const q = await ask(L('تحب نعملها دلوقتي؟ 👇', 'Want to do it now? 👇'), [...props.map((p, i) => ({ l: '⚡ ' + p.label, v: 'do:' + i })), { l: L('👌 لأ، خلاص', '👌 No, that\'s all'), v: null }], true);
  if (q && String(q).startsWith('do:')) { const p = props[+String(q).slice(3)]; if (p) return runTask({ flow: p.task, amount: p.amount, cur: p.cur }, text); }
  else if (q) return flowAgent(String(q));
}
async function flowAI(text) {
  if (!HOSTED) return bot(L('الذكاء الاصطناعي شغّال على الموقع بس 🙂', 'The AI only works on the live site 🙂'));
  const history = chatHistory();
  const el = await bot(L('🧠 بفكّر في كلامك بأرقامك…', '🧠 Thinking it through with your numbers…'));
  let d;
  try {
    const r = await fetch('/api/ideas?finance=chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history, data: { ...aiData(), tasks: TASKS() }, lang: L('ar', 'en') }) });
    if (r.status === 401) { expired(); return; }
    d = await r.json(); if (!r.ok) throw new Error(d.error || r.status);
  } catch (e) {
    console.error(e);
    el.innerHTML = L('😅 الذكاء الاصطناعي مش متاح دلوقتي (ممكن الحد المجاني خلص). جرّب بعد شوية.', '😅 The AI is not available right now (the free limit may be used up). Try again later.');
    return;
  }
  el.classList.add('wide');
  el.innerHTML = `${esc(d.answer).replace(/\n/g, '<br>')} <button class="say" type="button" title="${L('اسمعها', 'Listen')}" aria-label="${L('اسمعها', 'Listen')}">🔊</button>`;
  el.querySelector('.say').onclick = () => speak(d.answer);
  scrollLog(); sfx.pop();
  const dos = (d.do || []).map(k => MENU.find(m => m.v === k)).filter(Boolean);
  if (!d.next?.length && !dos.length) return;
  const q = await ask(L('تحب نعمل حاجة؟ اختار، أو اكتب سؤالك', 'Want to do something? Pick one, or type your question'), [...dos.map(m => ({ l: '⚡ ' + m.l, v: m.v })), ...(d.next || []).map(x => ({ l: x, v: 'ai:' + x })), { l: L('👌 خلاص كده', '👌 That\'s all'), v: null }], true);
  if (!q) return;
  const t = String(q).startsWith('ai:') ? String(q).slice(3) : String(q);
  if (FLOWS[t]) return FLOWS[t]();
  const m = parseMoney(t); if (m && m.amount > 0 && t.trim().split(/\s+/).length <= 3) return flowMoney(m);
  return flowAI(t);
}

async function menu() {
  let q = L('أهلًا يا أحمد 👋 أنا <b>قرش</b> 🦈، الـ <b>Agent</b> المالي بتاعك في فلوسي. قولّي حصل إيه وأنا أوزّع وأقولك تعمل إيه.', 'Hey Ahmed 👋 I\'m <b>Shark</b> 🦈, your personal money <b>agent</b> in Floosy. Tell me what happened and I\'ll split it up and tell you what to do.') + (S.job ? '' : L('<br>📅 لسه ما قلتليش على شغلك ويوم القبض. دوس <b>يوم القبض</b> عشان أحسبلك مرتبك الجاي صح.', '<br>📅 You haven\'t told me about your job and payday yet. Tap <b>Payday</b> so I can work out your next salary properly.'));
  for (; ;) {
    if (UI.task) { const d = UI.task; UI.task = null; try { await runTask(d, d.typed); } catch (err) { console.error(err); } q = pick(GREET); continue; }
    if (UI.aiNext) { const t = UI.aiNext; UI.aiNext = null; try { await flowAgent(t); } catch (err) { console.error(err); } q = pick(GREET); continue; }
    // 💳 مرة كل ما تفتح فلوسي: بيانات الكارت الناقصة، وربا كشف ميعاده عدّى، وغرامة تأخير — قرش بيسأل لوحده
    if (!UI.cardChecked) { UI.cardChecked = true; try { if (await cardChecks()) { q = pick(GREET); continue; } } catch (err) { console.error(err); } }
    UI.greet = true; const p = ask(q, MENU); atMenu = true;
    const a = await p;
    try {
      if (FLOWS[a]) await FLOWS[a]();
      else if (a && parseList(a).length >= 2) await flowPasteList(parseList(a));
      else {
        const m = a && parseMoney(a), words = String(a || '').trim().split(/\s+/).length;
        if (m && m.amount > 0 && words <= 3) {
          await flowMoney(m);
        } else if (a && String(a).trim().length > 1) { // أي كلام تاني: قرش يفهم إنت عايز إيه (مهمة ولا سؤال)
          const t = String(a).trim(), th = await bot('🦈 <i>' + L('بفهم قصدك…', 'Getting what you mean…') + '</i>', 'thinking');
          const d = await understand(t, { opts: MENU, q: '', free: true }); th.remove();
          if (d?.action === 'pick' && FLOWS[d.v]) { UI.hint = t; UI.hintN = 0; try { await FLOWS[d.v](); } finally { UI.hint = null; } }
          else if (d?.action === 'switch') { if (d.say) await bot(esc(d.say)); await runTask(d, t); }
          else if (d?.action === 'reply' && d.say) await bot(esc(d.say).replace(/\n/g, '<br>'));
          else await flowAgent(t);
        }
        else await bot(L('اختار من الزراير، أو اكتب رقم زي "2000" أو "500 جنيه" 🙂', 'Pick one of the buttons, or type a number like "2000" or "500 EGP" 🙂'));
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
  // 📈 أسعار السوق كبلاطات واضحة: الرقم، الوحدة، ووقت آخر تحديث ولايف ولا لأ (طلب صاحب الحساب، 2026-11-25)
  const at = S.ratesAt ? new Date(S.ratesAt).toLocaleTimeString(L('ar-EG', 'en-GB'), { hour: 'numeric', minute: '2-digit' }) : '';
  const mf = (n, d) => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }); // أسعار السوق مش سر: بتبان حتى والأرقام مقفولة
  const tile = (ic, name, val, unit, live, tip) => `<span class="mk ${live ? 'live' : ''}" title="${tip}"><i>${ic}</i><span><small>${name}</small><b dir="ltr">${val}</b><em>${unit}</em></span></span>`;
  info.innerHTML = ok ? [
      tile('🥇', L('دهب 24', 'Gold 24k'), mf(rate('XAU'), 1), L('درهم / جرام', 'AED / gram'), UI.goldLive, L('سعر جرام الدهب عيار 24 بالدرهم', 'Price of one gram of 24k gold in AED')),
      tile('💱', L('1 درهم', '1 AED'), mf(1 / rate('EGP'), 2), L('جنيه', 'EGP'), UI.fxLive, L('الدرهم بكام جنيه', 'How many EGP one AED buys')),
      tile('💵', L('1 دولار', '1 USD'), mf(rate('USD'), 2), L('درهم', 'AED'), UI.fxLive, L('الدولار بكام درهم', 'How many AED one USD costs')),
    ].join('') + `<small class="mk-at">${UI.fxLive || UI.goldLive ? L('🟢 لايف', '🟢 Live') : L('🟡 آخر سعر', '🟡 Last price')}${at ? ' · ' + at : ''}</small>`
    : `<span class="mk-off">${L('🔴 مفيش نت، شغال بآخر أسعار محفوظة', '🔴 No internet, running on the last saved prices')}</span>`;
  if (!document.activeElement?.classList?.contains('ed')) render();
}

/* ───────────── تشغيل ───────────── */
// الصوت: 🔈 واطي ← 🔉 وسط ← 🔊 عالي ← 🔇 مقفول (بيتحفظ مع البيانات)
const VOL_ORDER = ['low', 'mid', 'high', 'off'];
const applySound = () => { const v = S.sound === false ? 'off' : (S.vol || 'mid'); sfx.on = v !== 'off'; sfx.gain = VOLS[v] || 1; return v; };
applySound();
const muteBtn = $('#mute');
const paintMute = () => {
  const v = applySound(), ic = { low: '🔈', mid: '🔉', high: '🔊', off: '🔇' }[v];
  muteBtn.textContent = ic;
  muteBtn.title = muteBtn.ariaLabel = L({ low: 'الصوت: واطي', mid: 'الصوت: وسط', high: 'الصوت: عالي', off: 'الصوت: مقفول' }[v], { low: 'Sound: low', mid: 'Sound: medium', high: 'Sound: high', off: 'Sound: off' }[v]);
};
muteBtn.onclick = () => {
  const v = VOL_ORDER[(VOL_ORDER.indexOf(S.sound === false ? 'off' : (S.vol || 'mid')) + 1) % 4];
  if (v === 'off') S.sound = false; else { S.sound = true; S.vol = v; }
  save(); paintMute(); if (sfx.on) sfx.select();
  toast(muteBtn.title);
};
paintMute();
// 🎛 التحكم: تلات مفاتيح ورا الرقم السري. الصوت مجاني؛ صوت قرش (ElevenLabs) والذكاء الاصطناعي (Claude) بفلوس
const ctlBox = $('#ctlBox');
const paintCtl = () => {
  $('#ctlSound').checked = S.sound !== false; $('#ctlVoice').checked = S.use?.voice !== false; $('#ctlAi').checked = S.use?.ai !== false;
  $('#ctlTitle').textContent = L('🎛 التحكم', '🎛 Controls');
  $('#ctlSoundL').textContent = L('🔊 أصوات الموقع', '🔊 Site sounds'); $('#ctlSoundS').textContent = L('نقرات وتنبيهات، مجانًا', 'clicks and alerts, free');
  $('#ctlVoiceL').textContent = L('🗣 صوت قرش وكتابة كلامك', '🗣 Shark\'s voice and voice typing'); $('#ctlVoiceS').textContent = L('ElevenLabs، بفلوس', 'ElevenLabs, paid');
  $('#ctlAiL').textContent = L('🤖 الذكاء الاصطناعي', '🤖 The AI'); $('#ctlAiS').textContent = L('Claude، بفلوس', 'Claude, paid');
  $('#ctlNote').textContent = L('المقفول مش بيتنادى خالص، لا من الصفحة ولا من السيرفر. بيتحفظ مع بياناتك.', 'What is off is not called at all, by the page or by the server. Saved with your data.');
  ctlBox.querySelector('[data-ctlclose]').textContent = L('تمام', 'Done');
};
$('#ctl').onclick = async () => {
  if (!(await askPin(L('اكتب الرقم السري عشان تغيّر التحكم 🎛', 'Enter your PIN to change the controls 🎛')))) return;
  paintCtl(); ctlBox.hidden = false;
};
ctlBox.addEventListener('change', () => {
  S.use = { voice: $('#ctlVoice').checked, ai: $('#ctlAi').checked };
  if ($('#ctlSound').checked) { S.sound = true; S.vol = S.vol || 'mid'; } else S.sound = false;
  save(); paintMute(); if (sfx.on) sfx.select();
});
ctlBox.addEventListener('click', e => { if (e.target === ctlBox || e.target.closest('[data-ctlclose]')) ctlBox.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ctlBox.hidden) ctlBox.hidden = true; });
// صوت لكل ضغطة في الموقع كله. الزرار اللي ليه صوت مخصوص (حفظ، مسح، تحويل…) بيشغّله هو، والعام ما يشتغلش فوقه
const CLICK_SND = el =>
  el.matches('[data-page]') ? 'page'
  : el.matches('[data-close], .wiz-x, [data-cancel]') ? 'close'
  : el.matches('[data-back]') ? 'back'
  : el.matches('[data-next]') ? 'step'
  : el.matches('summary') ? (el.parentElement?.open ? 'back' : 'step')
  : el.matches('input[type=checkbox], input[type=radio], [role=switch]') ? (el.checked ? 'on' : 'off')
  : el.matches('[data-view], [data-cview], [data-dset], [data-lf], [data-bk], [data-tb], [data-to], [data-from], [data-gh], [data-tgh], [data-tk], [data-debt], .wiz-opt, .wiz-chip, .pill, .switch button, #chips button') ? 'select'
  : 'click';
document.addEventListener('click', e => {
  const el = e.target.closest('button, summary, a, .lbl, input[type=checkbox], input[type=radio], [role=button], [role=switch]');
  if (!el || el.id === 'mute' || el.disabled) return;
  const t0 = performance.now(), kind = CLICK_SND(el);
  setTimeout(() => { if (sfx.last < t0) sfx[kind]?.(); }, 0);
}, true);
// الرقم السري: تكّة خفيفة مع كل رقم
pinIn.addEventListener('input', () => sfx.key());

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
    S = { ...seed(), ...j }; sfx.on = S.sound !== false; save(); render(); $('#first')?.remove();
    toast(L('اتستوردت البيانات ✅', 'Data imported ✅')); sfx.ok();
  } catch { toast(L('الملف ده مش ملف بيانات فلوسي 😅', 'That file is not a Floosy data file 😅')); sfx.err(); }
};
// أول مرة على الموقع: مفيش بيانات ولا رقم سري حقيقي لسه، فبنقولها بوضوح بدل ما الرقم السري يتقال عليه غلط
function firstRun() {
  const o = document.createElement('div'); o.className = 'pin'; o.id = 'first';
  o.innerHTML = `<form class="glass"><b>${L('👋 بياناتك لسه مش على الموقع', '👋 Your data is not on the site yet')}</b>
    <small>${L('النسخة دي فاضية، عشان كده رقمك السري مش شغال هنا. استورد ملف <b dir="ltr">data.json</b> من فولدر floosy على جهازك، وكل حاجة (ورقمك السري) هتتنقل.', 'This copy is empty, which is why your PIN does not work here. Import <b dir="ltr">data.json</b> from the floosy folder on your computer and everything (your PIN included) moves over.')}</small>
    <div class="pin-btns"><button class="btn primary" type="button" data-imp>${L('📥 استورد ملفي', '📥 Import my file')}</button><button class="btn ghost" type="button" data-skip>${L('ابدأ من الصفر', 'Start empty')}</button></div>
    <small data-note hidden>${L('هتبدأ فاضي. الرقم السري المؤقت: 0000', 'You will start empty. Temporary PIN: 0000')}</small></form>`;
  o.addEventListener('submit', e => e.preventDefault());
  o.addEventListener('click', e => {
    if (e.target.closest('[data-imp]')) $('#impFile').click();
    else if (e.target.closest('[data-skip]')) { const n = o.querySelector('[data-note]'); if (n.hidden) { n.hidden = false; } else o.remove(); }
  });
  document.body.appendChild(o);
}
if (HOSTED && FILE.missing) firstRun();
document.addEventListener('visibilitychange', syncFile); window.addEventListener('focus', syncFile); setInterval(syncFile, 20000);
menu();
setTimeout(() => dailyCheck().catch(() => {}), 1500);
loadRates(); setInterval(loadRates, 60 * 1000);
setTimeout(autoPay, 2500); setInterval(autoPay, 30 * 60 * 1000);
setTimeout(() => document.body.classList.remove('first'), 1600);
import('./scene.js').then(m => {
  const view = $('#view');
  scene = m.initScene($('#gl'), view, (k, x, y, s) => {
    const el = $(`#labels [data-b="${k}"]`), half = el.offsetWidth / 2 + 6;
    x = Math.max(half, Math.min(view.clientWidth - half, x)); // ما تخرجش برّه الكارت
    y = Math.max(0, Math.min(view.clientHeight - el.offsetHeight - 8, y)); // ولا تنزل تحت حدّه (الأساسيات بسطرين التواريخ كانت بتعدّي على اللي تحته في الموبايل)
    el.style.transform = `translate(-50%,0) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
  });
  render();
}).catch(err => { console.warn('3D مش شغال', err); document.body.classList.add('no3d'); });

// اللغة: عربي يمين لشمال / إنجليزي شمال ليمين
initLang(() => { sfx.select(); buildLabels(); setSaveInfo(true); render(); loadRates(); if (atMenu) setChips(MENU); });
// أول دورة: افتكر القايمة مفتوحة ولا مقفولة بعد أي تحديث
document.addEventListener('toggle', e => { const t = e.target; if (t.classList?.contains('fc-items')) UI.fcOpen = t.open; if (t.classList?.contains('fc-box')) UI.fcBox = t.open; }, true);
