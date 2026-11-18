// rules.js — قواعد 25 / 15 / 50 / 10 (حسابات بس، من غير واجهة)
export const OZ = 31.1034768;

export const essentialsTotal = s => s.essentials.reduce((a, e) => a + (+e.amount || 0), 0);

/** توزيع دخل الشهر I على أساسيات E. كله بالدرهم. */
export function allocate(I, E) {
  if (I <= E) return { essentials: I, growth: 0, stability: 0, reward: 0, mode: 'A', deficit: E - I };
  const left = I - E;
  if (E / I > 0.5) {
    return { essentials: E, growth: left * 0.5, stability: left * 0.3, reward: left * 0.2, mode: 'B', deficit: 0 };
  }
  return { essentials: E, stability: I * 0.15, reward: I * 0.10, growth: I * 0.25 + (I * 0.5 - E), mode: 'C', deficit: 0 };
}

export const spareAmount = (t, E) => (t.link ? E : (+t.monthly || 0)) * 12 + (+t.extra || 0);
export const lifeMonthly = (t, E) => (t.link ? E : (+t.monthly || 0));

export const holdingValue = (h, rate) =>
  (+h.amount || 0) * rate(h.cur) * (h.cur === 'XAU' ? (+h.karat || 24) / 24 : 1);

export const ymOf = d => d.slice(0, 7);

/** مفتاح دورة القبض: الدورة بتبدأ يوم القبض. تاريخ قبل يوم القبض يتبع دورة الشهر اللي فات. */
export function periodOf(d, payday = 1) {
  let y = +d.slice(0, 4), m = +d.slice(5, 7);
  if (+d.slice(8, 10) < payday) { m--; if (m < 1) { m = 12; y--; } }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export const paydayOf = s => Math.min(28, Math.max(1, Math.round(+s.payday) || 1));

const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** يوم ما بدأت تمشي على النظام: s.since لو متحدد، وإلا أول معاملة، وإلا النهارده. */
export const sinceOf = s => s.since || s.tx.reduce((a, t) => (!a || t.date < a ? t.date : a), '') || isoDay(new Date());
/** أول دورة بتتحسب بالأيام: لو بدأت في نص الدورة، أساسياتها = نصيب اليوم × الأيام اللي فاضلة فيها. */
export function cycleInfo(s, period) {
  const pd = paydayOf(s), [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, pd), end = new Date(y, m, pd), days = Math.round((end - start) / 864e5);
  const since = sinceOf(s);
  if (periodOf(since, pd) !== period) return { days, left: days, f: 1, since: null };
  const left = Math.min(days, Math.max(1, Math.round((end - new Date(since + 'T00:00:00')) / 864e5)));
  return { days, left, f: left / days, since: left < days ? since : null };
}

/** يعيد تشغيل كل المعاملات بالترتيب ويطلع الأرصدة والتوزيعات. rate(cur) = كام درهم للوحدة. */
export function replay(s, rate) {
  const E = essentialsTotal(s);
  const bal = {};
  const wallet = c => (bal[c] ??= { growth: 0, stability: 0, reward: 0, sadaqa: 0 });
  wallet('AED');
  const months = {};
  const month = ym => (months[ym] ??= {
    income: 0, gross: 0, sadaqa: 0, sadGiven: 0, essAlloc: 0, essSpent: 0, rewardSpent: 0, items: {}, mode: 'A', E: E * cycleInfo(s, ym).f, f: cycleInfo(s, ym).f,
    alloc: { growth: 0, stability: 0, reward: 0, debt: 0 },
  });
  const spareHold = s.holdings.filter(h => h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  const lastSpare = Math.max(0, ...s.spare.map(t => spareAmount(t, E)));
  const stabAED = () => Object.entries(bal).reduce((a, [c, w]) => a + w.stability * rate(c), 0) + spareHold;

  let debt = +s.debt.balance || 0;
  const rows = {};
  const sorted = s.tx.map((t, i) => [t, i]).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]);

  for (const [tx] of sorted) {
    const mo = month(periodOf(tx.date, paydayOf(s)));
    const r = tx.rate || rate(tx.cur);
    const aed = tx.amount * r;
    if (tx.type === 'income') {
      const Etx = (tx.E ?? E) * mo.f;
      const before = allocate(mo.income, Etx);
      // الصدقة بتطلع الأول من أي دخل، والتوزيع بيتم على الباقي
      const sad = aed * Math.min(100, Math.max(0, +tx.sad || 0)) / 100, net = aed - sad;
      const after = allocate(mo.income + net, Etx);
      const d = {
        essentials: after.essentials - before.essentials,
        growth: after.growth - before.growth,
        stability: after.stability - before.stability,
        reward: after.reward - before.reward,
      };
      let capped = false;
      if (lastSpare > 0 && d.stability > 0 && stabAED() >= lastSpare) {
        d.growth += d.stability; d.stability = 0; capped = true;
      }
      const debtPay = Math.min(d.growth, debt);
      debt -= debtPay;
      const invest = d.growth - debtPay;
      const w = wallet(tx.cur);
      w.growth += invest / r; w.stability += d.stability / r; w.reward += d.reward / r; w.sadaqa += sad / r;
      mo.income += net; mo.gross += aed; mo.sadaqa += sad; mo.essAlloc += d.essentials; mo.mode = after.mode; mo.E = Etx;
      mo.alloc.growth += invest; mo.alloc.debt += debtPay; mo.alloc.stability += d.stability; mo.alloc.reward += d.reward;
      rows[tx.id] = {
        aed, net, sadaqa: sad, r, d, debtPay, invest, capped, mode: after.mode, modeBefore: before.mode,
        incomeAfter: mo.income, E: Etx, debtAfter: debt, deficit: after.deficit,
      };
    } else {
      if (tx.bucket === 'essentials') {
        mo.essSpent += aed;
        if (tx.item) mo.items[tx.item] = (mo.items[tx.item] || 0) + aed;
      } else {
        wallet(tx.cur)[tx.bucket] -= tx.amount;
        if (tx.bucket === 'reward') mo.rewardSpent += aed;
        if (tx.bucket === 'sadaqa') mo.sadGiven += aed;
      }
      rows[tx.id] = { aed, r };
    }
  }

  const sum = k => Object.entries(bal).reduce((a, [c, w]) => a + w[k] * rate(c), 0);
  const holdGrowth = s.holdings.filter(h => !h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  return {
    E, bal, months, rows, debt, paid: (+s.debt.balance || 0) - debt, lastSpare, spareHold, holdGrowth,
    sadaqaAED: sum('sadaqa'),
    growthAED: sum('growth') + holdGrowth, stabilityAED: sum('stability') + spareHold, rewardAED: sum('reward'),
  };
}

/** الدخل الشهري المتوقع: متوسط آخر 3 شهور كاملة، ولو مفيش يبقى المرتب أو دخل الشهر الحالي. */
export function expectedIncome(s, R, ym) {
  const past = Object.keys(R.months).filter(k => k < ym && R.months[k].income > 0).sort().slice(-3);
  if (past.length) return past.reduce((a, k) => a + R.months[k].income, 0) / past.length;
  return Math.max(+s.salary || 0, R.months[ym]?.income || 0);
}

/** عدد الشهور اللي الدخل فيها ورا بعض >= المطلوب (قاعدة "ثابت = 3 شهور"). */
export function stableStreak(R, ym, need) {
  let n = 0;
  for (const k of Object.keys(R.months).filter(k => k <= ym).sort().reverse()) {
    if (R.months[k].income >= need) n++; else break;
  }
  return n;
}

export function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  return d;
}
