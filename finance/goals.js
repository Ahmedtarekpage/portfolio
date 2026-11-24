// goals.js — الأهداف الكبيرة (عربية، شقة، كورس…): أقدر ولا لأ، وإمتى، وكاش ولا قسط.
//
// كل الأرقام هنا بتتحسب بالكود بنفس قواعد التطبيق (rules.js)، والذكاء الاصطناعي
// بيشرحها ويتناقش فيها بس — عمره ما بيألّف رقم أو تاريخ.
//
// القواعد اللي بنمشي بيها الشهور الجاية:
//   - الدخل = المرتب + متوسط الدخل الجانبي، بيكبر بنسبة الاتجاه (trend) من سجلّك، والصدقة بتطلع الأول.
//   - التوزيع بـ allocate (25/15/50/10)، والدين بيتسد الأول من النمو، والأمان بعد آخر محطة بيروح للنمو.
//   - الشراء كاش بيتدفع من النمو (الاستثمار) بعد ما الدين يخلص — الأمان صندوق طوارئ ومش بيتلمس.
//   - أي التزام شهري (إيجار، قسط، كورس) بيتضاف على الأساسيات، ومسموح بس لما الدخل يبقى
//     ضعف الأساسيات الجديدة 3 شهور ورا بعض (نفس قاعدة مستوى المعيشة).
//   - الأهداف بتتخطط بالترتيب: كل هدف بيبدأ بعد اللي قبله، وفلوسه والتزاماته محسوبة على اللي بعده.
import { allocate, splitIncome } from './rules.js';
import { L } from './i18n.js';

export const HORIZON = 120; // 10 سنين قدام
export const TYPES = ['buy', 'monthly', 'term'];

const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** الالتزام الشهري الصافي للهدف ده في الشهر i لو بدأ في الشهر s (بعد خصم اللي بيستبدله) */
function commitAt(g, s, i, pay) {
  if (s == null || i < s) return 0;
  if (g.type === 'monthly') return (+g.monthly || 0) - (+g.replace || 0);
  if (g.type === 'term') return i < s + (+g.n || 0) ? (+g.monthly || 0) - (+g.replace || 0) : 0;
  // الشرا: القسط (لو تقسيط) + مصاريف التشغيل كل شهر (بنزين، تأمين…) ناقص البند اللي بيستبدله (زي المواصلات)
  const running = (+g.run || 0) - (+g.replace || 0);
  if (g.type === 'buy' && pay === 'inst') return (i < s + (+g.n || 0) ? +g.inst || 0 : 0) + running;
  if (g.type === 'buy') return running;
  return 0;
}
/** الكاش اللي بيطلع مرة واحدة يوم ما الهدف يبدأ */
const cashOut = (g, pay) => g.type !== 'buy' ? (+g.upfront || 0) : pay === 'inst' ? (+g.down || 0) : (+g.price || 0);
const payOf = g => g.type === 'buy' ? (g.pay === 'inst' && +g.inst > 0 ? 'inst' : 'cash') : null;

/**
 * يمشّي الشهور قدام. fixed = أهداف ليها شهر بداية متحدد [{g, s, pay}].
 * بيرجّع صف لكل شهر: الدخل الصافي، الأساسيات بعد الالتزامات، الأمان، النمو، الدين.
 */
export function run(base, fixed, { extra = 0, months = HORIZON } = {}) {
  let debt = base.debt, stab = base.stab, growth = base.growth;
  const out = [];
  for (let i = 0; i < months; i++) {
    const gross = base.gross * Math.pow(1 + base.trend, i) + extra;
    const net = gross * (1 - (debt > 0.5 ? 0 : base.sadFull ?? base.sadPct)); // مفيش صدقة طول ما فيه دين
    const E = base.E + fixed.reduce((a, f) => a + commitAt(f.g, f.s, i, f.pay), 0);
    // نفس قواعد الدخل الحقيقي (splitIncome): وقت الدين الفلوس الحرّة 5% والأمان لحد شهر والباقي للدين
    const a = allocate(net, E), sp = splitIncome({ net, need: E, E, debtOn: debt > 0.5, stab, starter: base.starter ?? E, cap: base.lastSpare });
    let g = sp.growth, st = sp.stability;
    const dp = Math.min(g, debt); debt -= dp;
    growth += g - dp; stab += st;
    for (const f of fixed) if (f.s === i) growth -= cashOut(f.g, f.pay);
    // نصيب كل بند الشهر ده بعد توزيعنا (عشان نعرف الهدف بياكل من أنهي فلوس)
    out.push({ i, net, E, need: E * 2, stab, growth, debt, deficit: a.deficit, toDebt: dp, toStab: st, toInvest: g - dp, toFun: sp.reward, ess: Math.min(net, E) });
  }
  return out;
}

/** هل الدخل كان ضعف الأساسيات (بعد الالتزام p) 3 شهور ورا بعض لحد الشهر i؟ الشهور اللي فاتت من السجل الحقيقي. */
function streakOk(base, rows, i, extraE) {
  for (let k = i - 2; k <= i; k++) {
    const need = 2 * ((k >= 0 ? rows[k].E : base.E) + extraE);
    const net = k >= 0 ? rows[k].net : base.hist[base.hist.length + k];
    if (net == null || net < need - 0.5) return false;
  }
  return true;
}

/** أول شهر الهدف ده ينفع يبدأ فيه، بعد الأهداف الثابتة، ومن غير ما يبدأ قبل after */
function earliest(base, fixed, g, pay, after, opt) {
  const rows = run(base, fixed, opt);
  const p = commitAt(g, 0, 0, pay); // الالتزام الشهري الصافي اللي هيتضاف
  const cash = cashOut(g, pay);
  for (let i = Math.max(0, after); i < rows.length; i++) {
    const r = rows[i];
    if (cash > 0 && (r.debt > 0.5 || r.growth < cash - 0.5)) continue;
    if (p > 0 && !streakOk(base, rows, i, p)) continue;
    // التزام من غير كاش: لازم الدخل يغطي الأساسيات الجديدة كمان (مش عجز)
    return i;
  }
  return null;
}

/** يخطط كل الأهداف بالترتيب. بيرجّع لكل هدف شهر البداية (أو null = مش هيحصل في 10 سنين). */
export function plan(base, goals, opt = {}) {
  const fixed = [], res = [];
  let after = 0;
  for (const g of goals) {
    const pay = payOf(g);
    const s = earliest(base, fixed, g, pay, after, opt);
    res.push({ g, s, pay });
    if (s == null) continue; // اللي مش هيحصل ما بيعطّلش اللي بعده
    fixed.push({ g, s, pay }); after = s;
  }
  return { res, fixed, rows: run(base, fixed, opt) };
}

/**
 * أثر الهدف لو بدأ دلوقتي على الفلوس بعد توزيعنا (مش على الدخل كله): الالتزام الشهري بيدخل الأساسيات،
 * فبياكل من نصيب الدين، وبعد الدين من الأمان والاستثمار والفلوس الحرّة. (طلب صاحب الحساب، 2026-11-20)
 */
export function impact(base, fixed, goal, pay) {
  const n = HORIZON, a = run(base, fixed, { months: n }), b = run(base, [...fixed, { g: goal, s: 0, pay }], { months: n });
  const first = (rows, ok) => { const r = rows.find(ok); return r ? r.i : null; };
  const k = Math.min(2, n - 1); // شهر عادي (بعد أول قبض كامل)
  const pick = r => ({ net: r.net, ess: r.E, toDebt: r.toDebt, toStab: r.toStab, toInvest: r.toInvest, toFun: r.toFun, deficit: Math.max(0, r.E - r.net) });
  const debtA = base.debt > 0.5 ? first(a, r => r.debt <= 0.5) : 0, debtB = base.debt > 0.5 ? first(b, r => r.debt <= 0.5) : 0;
  const cap = base.lastSpare || 0;
  const stabA = cap ? first(a, r => r.stab >= cap - 0.5) : null, stabB = cap ? first(b, r => r.stab >= cap - 0.5) : null;
  const commit = commitAt(goal, 0, k, pay);
  // تقسيط = دين جديد قصاده حاجة بتملكها (العربية بتخسر من قيمتها مع الوقت)
  const newDebt = goal.type === 'buy' && pay === 'inst' ? (+goal.inst || 0) * (+goal.n || 0) : 0;
  return { k, before: pick(a[k]), after: pick(b[k]), commit, debtA, debtB, stabA, stabB, newDebt, asset: goal.type === 'buy' ? +goal.price || 0 : 0 };
}

/** رقم "حلو" لأقرب 500 لفوق */
const roundUp = v => Math.max(500, Math.ceil(v / 500) * 500);

/**
 * يقيّم هدف جديد بعد الأهداف الموجودة: كل الحقائق اللي الشات والمجلس والرسم محتاجينها.
 * goal بيتحط في الآخر (ترتيبه بعد كل الموجود).
 */
export function evaluate(base, existing, goal) {
  const pre = plan(base, existing);
  const fixed = pre.fixed, after = fixed.length ? fixed[fixed.length - 1].s : 0;
  const date = i => i == null ? null : addM(base.start, i);
  const f = { type: goal.type, start: base.start, after: fixed.length ? fixed[fixed.length - 1].g.name : null };

  if (goal.type === 'buy') {
    const cash = earliest(base, fixed, goal, 'cash', after);
    f.cash = { i: cash, date: date(cash) };
    if (+goal.inst > 0) {
      const inst = earliest(base, fixed, goal, 'inst', after);
      const total = (+goal.down || 0) + goal.inst * (+goal.n || 0);
      f.inst = { i: inst, date: date(inst), total, premium: total - goal.price, premiumPct: goal.price ? (total / goal.price - 1) * 100 : 0, needNow: 2 * (base.E + goal.inst) };
    }
    // لو زوّدت دخلك X، الكاش يقرّب لإمتى؟
    const x = roundUp(base.gross * 0.15);
    const cx = earliest(base, fixed, goal, 'cash', after, { extra: x });
    f.ifs = [{ extra: x, i: cx, date: date(cx) }];
    const pickPay = f.inst && f.inst.i != null && (f.cash.i == null || f.inst.i < f.cash.i) ? 'inst' : 'cash';
    f.best = pickPay === 'inst' ? f.inst.i : f.cash.i;
    f.chart = chartBuy(base, fixed, goal, f, x);
  } else {
    const p = (+goal.monthly || 0) - (+goal.replace || 0);
    const s = earliest(base, fixed, goal, null, after);
    const rows = run(base, fixed);
    const Enow = rows[0].E, newE = Enow + p, need = 2 * newE, netNow = rows[Math.min(2, rows.length - 1)].net; // الدخل المتوقع في شهر عادي (المرتب، أو متوسط 4 شهور)
    f.monthly = { i: s, date: date(s), threshold: need, newE, netNow, gap: Math.max(0, need - netNow), canNow: s === 0, maxNow: Math.max(0, netNow / 2 - Enow + (+goal.replace || 0)), deficitNow: netNow < newE };
    f.best = s;
    // لو جالك دخل زيادة قد الفرق (ومحسوب على الإجمالي قبل الصدقة)، تبدأ إمتى؟
    const x = roundUp(f.monthly.gap / (1 - (base.debt > 0.5 ? 0 : base.sadFull ?? base.sadPct)));
    const sx = f.monthly.gap > 0 ? earliest(base, fixed, goal, null, after, { extra: x }) : s;
    f.ifs = [{ extra: x, i: sx, date: date(sx) }];
    f.chart = chartMonthly(base, fixed, goal, f, x);
  }
  f.impact = impact(base, fixed, goal, goal.type === 'buy' ? (f.inst ? 'inst' : 'cash') : null); // فيه تقسيط: الأثر بالقسط (ده اللي بيفكر فيه)
  f.date = date(f.best);
  return f;
}

/* ───────────── الرسم ───────────── */
const C = { blue: '#6981B5', blueSoft: '#A3B2D2', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#D55E51' };
const GRID = 'rgba(255,255,255,.09)';
const nice = max => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

/** خطوط على محور الشهور. lines: [{v:[...], c, dash, label}], marks: [{i, label, c}] */
export function lineChart({ n, lines, marks, start, h }) {
  const W = 640, H = 260, Lp = 70, R = 12, T = 24, B = 40, pw = W - Lp - R, ph = H - T - B;
  const all = lines.flatMap(l => l.v).filter(v => isFinite(v));
  const lo = Math.min(0, ...all), hi = nice(Math.max(1, ...all) * 1.05);
  const x = i => Lp + (n <= 1 ? 0 : i / (n - 1) * pw), y = v => T + ph - (v - lo) / (hi - lo || 1) * ph;
  const ticks = [lo, lo + (hi - lo) / 2, hi].map(v => `<line x1="${Lp}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/><text x="${Lp - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${h.fmt(v)}</text>`).join('');
  const step = Math.max(1, Math.round(n / 6));
  const xt = Array.from({ length: n }, (_, i) => i).filter(i => i % step === 0).map(i => `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="ax">${addM(start, i).toLocaleDateString(h.loc, { month: 'short', year: '2-digit' })}</text>`).join('');
  const path = v => v.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('');
  const ls = lines.map(l => `<path d="${path(l.v)}" fill="none" stroke="${l.c}" stroke-width="2.2" ${l.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round"/>`).join('');
  const ms = marks.filter(m => m.i != null && m.i < n).map(m => `<g data-tip="${m.tip || m.label}"><line x1="${x(m.i)}" x2="${x(m.i)}" y1="${T}" y2="${T + ph}" stroke="${m.c}" stroke-dasharray="2 4"/><circle cx="${x(m.i)}" cy="${y(m.y)}" r="6" fill="${m.c}" stroke="#0b1020" stroke-width="2"/><text x="${Math.min(W - R - 4, Math.max(Lp + 4, x(m.i)))}" y="${T - 6}" text-anchor="middle" class="ax" fill="${m.c}">${m.label}</text></g>`).join('');
  const key = `<div class="gkey">${lines.map(l => `<span><i style="background:${l.c};${l.dash ? 'opacity:.7' : ''}"></i>${l.label}</span>`).join('')}</div>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="gchart" role="img">${ticks}${xt}${ls}${ms}</svg>${key}`;
}
const span = (i, min = 18) => Math.min(HORIZON, Math.max(min, (i ?? 36) + 9));

function chartBuy(base, fixed, goal, f, extra) {
  return h => {
    const n = span(Math.max(f.cash.i ?? 0, f.ifs[0].i ?? 0, f.inst?.i ?? 0), 24);
    const rows = run(base, fixed, { months: n }), rx = run(base, fixed, { months: n, extra });
    const lines = [
      { v: rows.map(r => r.growth), c: C.aqua, label: L('النمو/الاستثمار المتاح للشراء', 'Growth money available to buy') },
      { v: rx.map(r => r.growth), c: C.blueSoft, dash: true, label: L(`لو زوّدت دخلك ${h.fmt(extra)} في الشهر`, `If you add ${h.fmt(extra)} a month`) },
      { v: rows.map(() => +goal.price), c: C.orange, label: L(`سعر الكاش ${h.fmt(goal.price)}`, `Cash price ${h.fmt(goal.price)}`) },
    ];
    if (f.inst) lines.push({ v: rows.map(() => +goal.down || 0), c: C.yellow, dash: true, label: L(`المقدّم ${h.fmt(goal.down || 0)}`, `Down payment ${h.fmt(goal.down || 0)}`) });
    const marks = [{ i: f.cash.i, y: +goal.price, c: C.orange, label: L('كاش', 'Cash') }, { i: f.ifs[0].i, y: +goal.price, c: C.blueSoft, label: L('لو زوّدت', 'If more') }];
    if (f.inst) marks.push({ i: f.inst.i, y: +goal.down || 0, c: C.yellow, label: L('قسط', 'Instalments') });
    return lineChart({ n, lines, marks, start: base.start, h });
  };
}
function chartMonthly(base, fixed, goal, f, extra) {
  return h => {
    const n = span(Math.max(f.monthly.i ?? 0, f.ifs[0].i ?? 0), 18);
    const rows = run(base, fixed, { months: n }), rx = run(base, fixed, { months: n, extra });
    const p = (+goal.monthly || 0) - (+goal.replace || 0);
    const lines = [
      { v: rows.map(r => r.net), c: C.blue, label: L('دخلك المتوقع (بعد الصدقة)', 'Your expected income (after sadaqa)') },
      { v: rx.map(r => r.net), c: C.blueSoft, dash: true, label: L(`لو زوّدت ${h.fmt(extra)} في الشهر`, `If you add ${h.fmt(extra)} a month`) },
      { v: rows.map(r => 2 * (r.E + p)), c: C.orange, label: L('المطلوب: ضعف الأساسيات الجديدة', 'Needed: 2× the new essentials') },
      { v: rows.map(r => r.E + p), c: C.magenta, dash: true, label: L('أقل حد (من غير عجز)', 'Bare minimum (no deficit)') },
    ];
    const marks = [{ i: f.monthly.i, y: f.monthly.threshold, c: C.orange, label: L('تقدر من هنا', 'You can from here') }];
    if (f.ifs[0].i !== f.monthly.i) marks.push({ i: f.ifs[0].i, y: f.monthly.threshold, c: C.blueSoft, label: L('لو زوّدت', 'If more') });
    return lineChart({ n, lines, marks, start: base.start, h });
  };
}

/** الحقائق المختصرة اللي بتروح للمجلس (أرقام مقرّبة، من غير أي معاملة) */
export function factsFor(base, existing, goal, f, extra) {
  const r = v => Math.round(+v || 0), d = x => x ? ym(x) : null;
  const out = {
    goal: { name: goal.name, type: goal.type, price: r(goal.price), down: r(goal.down), instMonthly: r(goal.inst), months: r(goal.n), monthly: r(goal.monthly), replaces: r(goal.replace), running: r(goal.run), contract: goal.contract || null, note: goal.note || '' },
    today: ym(new Date()),
    you: { ...extra, monthlyIncomeAfterSadaqa: r(f.impact.before.net), incomeBasis: base.sideAvg ? 'salary + 4-month side income average' : 'salary only (under 4 months of data)', expectedGrossMonthly: r(base.gross), essentials: r(base.E), debt: r(base.debt), safety: r(base.stab), safetyFullTarget: r(base.lastSpare), growthInvested: r(base.growth), incomeTrendPctPerMonth: +(base.trend * 100).toFixed(2), sadaqaPct: +(base.sadPct * 100).toFixed(1) },
    queueBefore: existing.map(g => ({ name: g.name, type: g.type })),
    placedAfter: f.after,
  };
  if (f.cash) out.cash = { possibleFrom: d(f.cash.date), monthsAway: f.cash.i };
  if (f.inst) out.instalments = { possibleFrom: d(f.inst.date), monthsAway: f.inst.i, totalPaid: r(f.inst.total), extraCostVsCash: r(f.inst.premium), extraCostPct: +f.inst.premiumPct.toFixed(1), incomeNeededForInstalment: r(f.inst.needNow) };
  if (f.monthly) out.commitment = { possibleFrom: d(f.monthly.date), monthsAway: f.monthly.i, newEssentials: r(f.monthly.newE), incomeNeeded2x: r(f.monthly.threshold), incomeNow: r(f.monthly.netNow), gap: r(f.monthly.gap), canNow: f.monthly.canNow, maxMonthlyAffordableNow: r(f.monthly.maxNow), wouldCauseDeficitNow: f.monthly.deficitNow };
  const im = f.impact, D = i => i == null ? null : ym(addM(base.start, i)), rr = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));
  out.impactIfStartedNow = { note: 'monthly money AFTER the app split, in a normal month, without vs with this goal. The commitment is added to essentials, so it is taken from debt payoff (while in debt), then safety/investing/fun.',
    monthlyCommitment: r(im.commit), without: rr(im.before), with: rr(im.after), debtFreeWithout: D(im.debtA), debtFreeWith: D(im.debtB), safetyTargetWithout: D(im.stabA), safetyTargetWith: D(im.stabB),
    ...(im.newDebt ? { instalmentsAreNewDebt: r(im.newDebt), assetValue: r(im.asset) } : {}) };
  out.ifMoreIncome = f.ifs.map(x => ({ extraGrossPerMonth: r(x.extra), possibleFrom: d(x.date), monthsAway: x.i }));
  return out;
}
