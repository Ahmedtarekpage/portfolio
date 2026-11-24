// invest.js — "أستثمر في إيه، وإمتى، ومتوقع يبقى معايا كام؟" بقواعد الفيديو (الكتاب بتاعنا).
//
// كل الأرقام بتتحسب هنا بالكود، والمجلس (الذكاء الاصطناعي) بيشرح ويقترح أماكن بس:
//   - إمتى: نصيب النمو بيسدّ الدين الأول، فالاستثمار بيبدأ أول شهر الدين يخلص فيه (run في goals.js).
//   - في إيه: سلّم الفيديو — صناديق مؤشرات الأول (أمريكي 60 + عالمي 30 + سندات 10)، والأهدى 80/20،
//     وأي حاجة أخطر (أسهم منفردة، كريبتو) مبلغ صغير تستحمل تخسره بس. الأمان عمره ما بيتستثمر.
//   - متوقع إيه: افتراضات عائد سنوي طويلة المدى (مش وعد): أسهم 7% وسندات 3.5%، ونطاق ±3%.
//     السوق ممكن ينزل 30-50% في سنة، فالرقم ده متوسط على سنين طويلة.
import { run, HORIZON, lineChart } from './goals.js';
import { L } from './i18n.js';

export const ASSETS = {
  us: { i: '🇺🇸', ret: 7, get n() { return L('صندوق مؤشر أمريكي (زي S&P 500)', 'US index fund (like the S&P 500)'); } },
  world: { i: '🌍', ret: 7, get n() { return L('صندوق مؤشر عالمي (كل الدول)', 'Global index fund (all countries)'); } },
  bonds: { i: '🧾', ret: 3.5, get n() { return L('صندوق سندات (الهادي)', 'Bond fund (the calm part)'); } },
  play: { i: '🎲', ret: 7, get n() { return L('أسهم منفردة أو بديلة (للتجربة بس)', 'Single stocks or alternatives (to play with only)'); } },
};

/** الخلطة حسب سلّم المخاطرة اللي في الكارت (1 أهدى … 6 أخطر) */
export function mixFor(risk = 1) {
  if (risk <= 2) return { k: 'calm', get n() { return L('الأهدى (80/20)', 'Calmer (80/20)'); }, parts: [['us', 50], ['world', 30], ['bonds', 20]] };
  if (risk <= 4) return { k: 'video', get n() { return L('خلطة الفيديو (90/10)', "The video's mix (90/10)"); }, parts: [['us', 60], ['world', 30], ['bonds', 10]] };
  return { k: 'bold', get n() { return L('هجومي + مبلغ صغير للتجربة', 'Aggressive + a small amount to play with'); }, parts: [['us', 55], ['world', 30], ['bonds', 10], ['play', 5]] };
}
export const mixReturn = mix => mix.parts.reduce((a, [k, p]) => a + ASSETS[k].ret * p / 100, 0);

/**
 * يمشّي الشهور قدام بنفس قواعد التطبيق (run)، وفوقهم العائد.
 * base = goalBase(c)، fixed = الأهداف الكبيرة اللي ليها شهر (الشراء الكاش بيطلع من النمو).
 * بيرجّع: شهر البداية، المبلغ الشهري، وقيمة المحفظة بتلات سيناريوهات.
 */
export function project(base, fixed, mix, { months = HORIZON, extra = 0 } = {}) {
  const rows = run(base, fixed, { months, extra });
  const r = mixReturn(mix), rates = [r - 3, r, r + 3].map(a => Math.pow(1 + a / 100, 1 / 12) - 1);
  const v = rates.map(() => base.growth), val = rates.map(() => []), put = [];
  let prev = base.growth, paid = base.growth, startI = null;
  rows.forEach((row, i) => {
    const add = row.growth - prev; prev = row.growth; // بالسالب لو هدف اتشترى كاش في الشهر ده
    if (startI == null && row.debt <= 0.5 && add > 0.5) startI = i;
    paid += add; put.push(paid);
    rates.forEach((m, k) => { v[k] = Math.max(0, v[k] * (1 + m) + add); val[k].push(v[k]); });
  });
  const adds = startI == null ? [] : rows.slice(startI, startI + 12).map((row, j) => row.growth - (startI + j ? rows[startI + j - 1].growth : base.growth));
  const monthly = adds.length ? adds.reduce((a, x) => a + x, 0) / adds.length : 0;
  const at = n => { const i = Math.min(months, n) - 1; return { put: put[i], low: val[0][i], mid: val[1][i], high: val[2][i] }; };
  return { rows, startI, monthly, put, low: val[0], mid: val[1], high: val[2], ret: r, at, months };
}

/** الرسم: اللي حطيته (أزرق) والقيمة المتوقعة (أخضر) ونطاقها (متقطّع) */
export function chartInvest(p, start, h, n = Math.min(p.months, 120)) {
  const marks = [];
  if (p.startI != null) marks.push({ i: p.startI, y: p.mid[p.startI], c: '#199e70', label: L('البداية', 'Start') });
  if (n >= 60) marks.push({ i: 59, y: p.mid[59], c: '#c98500', label: L('5 سنين', '5 years') });
  return lineChart({
    n, start, h, marks,
    lines: [
      { v: p.put.slice(0, n), c: '#6981B5', label: L('اللي حطيته من جيبك', 'What you put in') },
      { v: p.mid.slice(0, n), c: '#199e70', label: L(`المتوقع (${p.ret.toFixed(1)}% في السنة)`, `Expected (${p.ret.toFixed(1)}% a year)`) },
      { v: p.low.slice(0, n), c: '#d95926', dash: true, label: L('لو السوق وحش', 'If markets are bad') },
      { v: p.high.slice(0, n), c: '#A3B2D2', dash: true, label: L('لو السوق حلو', 'If markets are good') },
    ],
  });
}

/** أنواع الأصول اللي ينفع تسجّل إنك اشتريتها (استثمار، مش مصروف) */
export const KINDS = {
  fund: { i: '📊', get n() { return L('صندوق مؤشر', 'Index fund'); } },
  gold: { i: '🥇', get n() { return L('دهب', 'Gold'); } },
  cert: { i: '🏦', get n() { return L('شهادة أو وديعة', 'Certificate or deposit'); } },
  stock: { i: '📈', get n() { return L('أسهم', 'Stocks'); } },
  property: { i: '🏢', get n() { return L('عقار', 'Property'); } },
  alt: { i: '🎲', get n() { return L('كريبتو أو بديل', 'Crypto or alternative'); } },
  other: { i: '💼', get n() { return L('حاجة تانية', 'Something else'); } },
};

/** ملخص بالأرقام المقرّبة بس للمجلس — من غير معاملات ولا أسماء */
export function investFacts(base, p, mix, extra) {
  const r = v => Math.round(v / 100) * 100;
  return {
    goal: 'investing plan', kind: 'invest',
    monthsFromNowUntilInvestingStarts: p.startI, debtNowAED: r(base.debt), safetyFundAED: r(base.stab), growthMoneyNowAED: r(base.growth),
    monthlyInvestAED: r(p.monthly), essentialsAED: r(base.E), incomeAED: r(base.gross),
    riskMix: mix.parts.map(([k, pct]) => `${k} ${pct}%`).join(', '), assumedReturnPerYear: `${p.ret.toFixed(1)}% (range ±3%)`,
    after5y: { putIn: r(p.at(60).put), expected: r(p.at(60).mid), bad: r(p.at(60).low), good: r(p.at(60).high) },
    after10y: { putIn: r(p.at(120).put), expected: r(p.at(120).mid), bad: r(p.at(120).low), good: r(p.at(120).high) },
    ...extra,
  };
}
