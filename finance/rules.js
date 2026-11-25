// rules.js — قواعد 25 / 15 / 50 / 10 (حسابات بس، من غير واجهة)
export const OZ = 31.1034768;

/** كل بند/دين/معاملة ليه عملة (cur)؛ القديم من غير عملة يبقى درهم. */
export const curOf = x => (x && x.cur) || 'AED';
/** الأساسيات بالدرهم (أو بأي عملة أساس لو rate متغيّرة)، كل بند بعملته. */
export const essentialsTotal = (s, rate = () => 1) => s.essentials.reduce((a, e) => a + (+e.amount || 0) * rate(curOf(e)), 0);
/** أساسيات عملة واحدة، بعملتها نفسها */
export const essOf = (s, c) => s.essentials.filter(e => curOf(e) === c).reduce((a, e) => a + (+e.amount || 0), 0);
/*
 * أنا فين (2026-11-19): s.stays = [{ from: 'YYYY-MM-DD', where: 'AED' | 'EGP' … }] بالترتيب.
 * بند أساسيات ممكن يبقى ليه مبلغ حسب مكانك: e.where = { AED: 4000, EGP: 8000 } (بعملة البند).
 * أساسيات الدورة = الثابت + متوسط البنود المتغيرة على أيام الدورة (لو اتنقلت في نص الشهر، الأيام بتتقسم).
 */
/** إنت ومراتك فين يوم d. كل "stay" فيه where (إنت) و wife (لو اتسجّل؛ غير كده زي اللي قبله). */
export function sitOn(s, d) {
  let me = s.home || 'AED', wife = s.wifeHome || 'EGP'; // صاحب الحساب في الإمارات ومراته في مصر لحد ما يتسجل غير كده
  for (const st of s.stays || []) if (st.from <= d) { me = st.where || me; if (st.wife) wife = st.wife; }
  return { me, wife };
}
export const whereOn = (s, d) => sitOn(s, d).me;
/** من الدورة دي الأساسيات بتتحسب حسب المكان (قبلها: زي ما اتسجلت وقتها) */
export const LOCATION_FROM = '2026-11-19';
/** مبلغ البند في موقف معيّن: 👫 (حسب إنت ومراتك "AED+EGP") ← 📍 (حسب إنت بس) ← الثابت */
export function amtAt(e, sit) {
  const fixed = +e.amount || 0;
  if (!e.where) return fixed;
  const both = e.whereMode === 'both' ? e.where[`${sit.me}+${sit.wife}`] : undefined;
  return +(both ?? e.where[sit.me] ?? fixed);
}
/** البند ده مدفوع مقدّم لحد دورة paidTo ('YYYY-MM')؟ ساعتها بيتحسب 0 في الدورات دي. */
export const prepaid = (e, ym) => !!e.paidTo && ym <= e.paidTo;
/** بند بيتحسب كل دورة لوحده (حسب المكان، أو ليه دفع مقدّم) — مش جزء من الثابت اللي بيتسجّل مع الدخل */
export const isDynamic = e => !!(e.where || e.paidTo);
/** أساسيات دورة ym بعملة الأساس: { fixed, dyn, total } (رخيصة: من غير كاش عشان التعديلات تبان على طول) */
export function essFor(s, rate, ym) {
  let fixed = 0, dyn = 0;
  const loc = [];
  for (const e of s.essentials) {
    if (prepaid(e, ym)) continue; // مدفوع مقدّم: الدورة دي مش عليه حاجة
    if (e.where) loc.push(e); else if (e.paidTo) dyn += (+e.amount || 0) * rate(curOf(e)); else fixed += (+e.amount || 0) * rate(curOf(e));
  }
  if (loc.length) {
    const pd = paydayOf(s), [y, m] = ym.split('-').map(Number);
    const start = new Date(y, m - 1, pd), days = Math.round((new Date(y, m, pd) - start) / 864e5);
    for (let i = 0; i < days; i++) {
      const sit = sitOn(s, isoDay(new Date(y, m - 1, pd + i)));
      for (const e of loc) dyn += amtAt(e, sit) * rate(curOf(e));
    }
    dyn /= days;
  }
  return { fixed, dyn, total: fixed + dyn };
}
/** أساسيات دورة ym بعد حساب أول دورة بالأيام: كل بند بالأيام اللي فاضلة، إلا البنود اللي
 *  اتعلّم عليها full1 (بتتدفع كاملة حتى لو بدأت في نص الدورة، زي إيجار مدفوع للشهر كله) — طلب صاحب الحساب، 2026-11-20 */
export function essCycle(s, rate, ym) {
  const f = cycleInfo(s, ym).f, all = essFor(s, rate, ym).total;
  if (f >= 1) return all;
  const full = essFor({ ...s, essentials: s.essentials.filter(e => e.full1) }, rate, ym).total;
  return full + (all - full) * f;
}
/** مبلغ بند واحد في دورة ym (بعملته)، بعد حساب أيام كل مكان */
export function itemFor(s, e, ym) {
  if (prepaid(e, ym)) return 0;
  if (!e.where) return +e.amount || 0;
  const pd = paydayOf(s), [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, pd), days = Math.round((new Date(y, m, pd) - start) / 864e5);
  let t = 0;
  for (let i = 0; i < days; i++) t += amtAt(e, sitOn(s, isoDay(new Date(y, m - 1, pd + i))));
  return t / days;
}

/** الدهب بيتبع دولة (home)، والباقي بيتبع عملته */
export const homeOf = h => (h.cur === 'XAU' ? h.home || 'AED' : h.cur);

/** توزيع دخل الشهر I على أساسيات E. كله بالدرهم. */
export function allocate(I, E) {
  if (I <= E) return { essentials: I, growth: 0, stability: 0, reward: 0, mode: 'A', deficit: E - I };
  const left = I - E;
  if (E / I > 0.5) {
    return { essentials: E, growth: left * 0.5, stability: left * 0.3, reward: left * 0.2, mode: 'B', deficit: 0 };
  }
  return { essentials: E, stability: I * 0.15, reward: I * 0.10, growth: I * 0.25 + (I * 0.5 - E), mode: 'C', deficit: 0 };
}

/*
 * قواعد صاحب الحساب (2026-11-20):
 *  💳 لو عليك دين: الصدقة واقفة (لو الدين > 100 درهم)، الأساسيات تغطي الدورة دي + 10 أيام من الجاية، الفلوس الحرّة 2.5% من الدخل
 *     (من اللي فاضل بعد الأساسيات بس)، الأمان صفر، وكل الباقي للدين.
 *  ✅ من غير دين: الأساسيات الدورة دي بس، والباقي بنسب الفيديو، والأمان لحد 5 شهور × أغلى وضع، وبعدها نصيبه للاستثمار.
 */
export const SAD_DEBT = 100;   // الصدقة بتقف بس لو الدين أكبر من كده (درهم)
export const FUN_DEBT = 0.025; // نصيب الفلوس الحرّة من الدخل وقت الدين (طلب صاحب الحساب، 2026-11-20: 2.5%)
export const SAFE_MONTHS = 5;
export const NEXT_DAYS = 10;   // وقت الدين: الأساسيات بتغطي كام يوم من الدورة الجاية
/** أساسيات أول NEXT_DAYS يوم من الدورة اللي بعد ym (بالدرهم) */
export const essNextDays = (s, rate, ym) => { const n = nextPeriod(ym); return essFor(s, rate, n).total * Math.min(1, NEXT_DAYS / cycleInfo(s, n).days); };  // هدف الأمان من غير دين: كام شهر من أغلى وضع
/** الدورة اللي بعد ym */
export const nextPeriod = ym => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
/** أغلى شهر أساسيات (بالدرهم) من كل أوضاع إنت ومراتك الممكنة، بالقيمة الكاملة (حتى المدفوع مقدّم) */
export function worstMonth(s, rate) {
  const no = new Set(s.noSit || []), sits = ['AED+AED', 'AED+EGP', 'EGP+EGP'].filter(k => !no.has(k));
  let best = { amount: 0, sit: sits[0] || 'AED+AED' };
  for (const k of sits) {
    const [me, wife] = k.split('+'), amount = s.essentials.reduce((a, e) => a + amtAt(e, { me, wife }) * rate(curOf(e)), 0);
    if (amount > best.amount) best = { amount, sit: k };
  }
  return best;
}
/**
 * تقسيم دخل واحد (كله بالدرهم): need = الناقص في الأساسيات، inc = دخل الدورة قبله، E = أساسيات الدورة،
 * debtOn = عليك دين، stab = اللي في الأمان، starter = شهر أساسيات (هدف الأمان وقت الدين)، cap = هدف الأمان من غير دين.
 */
export function splitIncome({ net, need, inc = 0, E, debtOn, stab = 0, starter = 0, cap = 0 }) {
  const essentials = Math.min(net, Math.max(0, need)), rest = net - essentials;
  const at = Math.max(inc, E), b = allocate(at, E), a = allocate(at + rest, E);
  let growth = a.growth - b.growth, stability = a.stability - b.stability, reward = a.reward - b.reward, capped = false;
  const video = { growth, stability, reward, mode: allocate(at + rest, E).mode }; // نصيب كل بند بنسب الفيديو (قبل قواعد الدين)
  if (debtOn) {
    reward = Math.min(rest, net * FUN_DEBT);
    stability = 0; // وقت الدين الأمان صفر ونصيبه للدين: الأساسيات ماسكة الدورة دي + 10 أيام (طلب صاحب الحساب، 2026-11-20)
    growth = rest - reward - stability;
  } else if (cap > 0 && stab >= cap - 0.5 && stability > 0) { growth += stability; stability = 0; capped = true; }
  return { essentials, growth, stability, reward, capped, video, rest };
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

/** الديون كقايمة (كارت، قرض، سلفة…). البيانات القديمة كان فيها دين واحد في s.debt. */
export function debtList(s) {
  if (Array.isArray(s.debts)) return s.debts;
  return s.debt && +s.debt.balance > 0 ? [{ id: 'd0', name: s.debt.name || 'الدين', kind: 'card', balance: +s.debt.balance }] : [];
}

/*
 * إنت شخص واحد (طلب صاحب الحساب، 2026-11-19، بدل "كل دولة لوحدها"): دخل كل العملات بيتجمع
 * قصاد أساسيات البلدين مع بعض، ولو فيه دين نصيب النمو كله بيروح للدين الأول، أيًا كانت عملة الدخل.
 * الفلوس نفسها بتفضل في محفظة عملتها (الجنيه في محفظة الجنيه) لحد ما تحوّلها بمعاملة "transfer".
 */
/** الدول اللي ليها أي حاجة في البيانات */
export function countries(s) {
  const set = new Set();
  s.essentials.forEach(e => set.add(curOf(e))); debtList(s).forEach(d => set.add(curOf(d)));
  s.holdings.forEach(h => set.add(homeOf(h)));
  s.tx.forEach(t => { set.add(curOf(t)); if (t.to) set.add(t.to); });
  set.delete('XAU');
  return set.size ? [...set] : ['AED'];
}
/** نسخة من البيانات فيها دولة واحدة بس (نفس العناصر، مش نسخ منها) — للعرض بس: replay بيحسب على
 *  الكل (full) وبعدين بيطلّع نصيب الدولة دي بس (project) */
export function slice(s, c) {
  return {
    ...s, only: c, full: s,
    since: sinceOf(s),
    essentials: s.essentials.filter(e => curOf(e) === c),
    debts: debtList(s).filter(d => curOf(d) === c),
    holdings: s.holdings.filter(h => homeOf(h) === c),
    tx: s.tx.filter(t => curOf(t) === c || t.to === c),
  };
}

/** يعيد تشغيل كل المعاملات بالترتيب ويطلع الأرصدة والتوزيعات. rate(cur) = كام درهم للوحدة.
 *  الحساب على كل البيانات مرة واحدة (إنت شخص واحد)؛ s.only لنسخة دولة واحدة لو حد طلبها. */
export function replay(s, rate) {
  if (s.full && s.only) return project(replayOne(s.full, rate, null), s, rate);
  return replayOne(s, rate, null);
}

/** نصيب دولة واحدة (v = slice) من الحساب المجمّع R: محفظتها، أساسياتها، ديونها، ودخلها هي بس */
function project(R, v, rate) {
  const c = v.only, pd = paydayOf(v);
  const w = R.bal[c] || { growth: 0, stability: 0, reward: 0, sadaqa: 0 };
  const spareHold = v.holdings.filter(h => h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  const holdGrowth = v.holdings.filter(h => !h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  const ids = new Set(v.debts.map(d => d.id));
  const debts = Object.fromEntries(Object.entries(R.debts).filter(([id]) => ids.has(id)));
  const debt = Object.values(debts).reduce((a, d) => a + (d.on ? d.left : 0), 0);
  const months = {};
  for (const [ym, m] of Object.entries(R.months)) months[ym] = {
    income: 0, gross: 0, sadaqa: 0, sadGiven: 0, essAlloc: 0, essSpent: 0, rewardSpent: 0, items: {}, mode: m.mode,
    essNat: 0, // فلوس الأساسيات اللي معاك بعملة الدولة نفسها (من غير فرق سعر من يوم الدخل)
    E: essCycle(v, rate, ym), f: m.f, alloc: { growth: 0, stability: 0, reward: 0, debt: 0 },
  };
  for (const t of v.tx) {
    const r = R.rows[t.id], mo = months[periodOf(t.date, pd)];
    if (!r || !mo) continue;
    if (t.type === 'transfer') { // تحويل من/لأساسيات الدولة دي
      if (curOf(t) === c && t.bucket === 'essentials') { mo.essAlloc -= r.aed; mo.essNat -= +t.amount || 0; }
      if (t.to === c && (t.toBucket || t.bucket) === 'essentials') { mo.essAlloc += r.inAED; mo.essNat += +t.toAmount || 0; }
      continue;
    }
    if (curOf(t) !== c) continue;
    if (t.type === 'income') {
      mo.income += r.net; mo.gross += r.aed; mo.sadaqa += r.sadaqa; mo.essAlloc += r.d.essentials; mo.essNat += r.d.essentials / r.r;
      mo.alloc.growth += r.invest; mo.alloc.debt += r.debtPay; mo.alloc.stability += r.d.stability; mo.alloc.reward += r.d.reward;
    } else if (t.type === 'debtpay' && t.bucket === 'essentials') { // سداد دين من الأساسيات: بيطلع من فلوسها زي التحويل
      mo.essAlloc -= r.aed; mo.essNat -= +t.amount || 0;
    } else if (!['transfer', 'debtpay', 'debtadj', 'invest', 'divest', 'essout'].includes(t.type)) {
      if (t.bucket === 'essentials') { mo.essSpent += r.aed; mo.essNat -= +t.amount || 0; if (t.item) mo.items[t.item] = (mo.items[t.item] || 0) + r.aed; }
      else if (t.bucket === 'reward') mo.rewardSpent += r.aed;
      else if (t.bucket === 'sadaqa') mo.sadGiven += r.aed;
    }
  }
  // الترحيل بعملة الدولة: اللي فاضل فوق أساسيات الدورة بيكمّل في اللي بعدها
  let prev = null;
  for (const ym of Object.keys(months).sort()) {
    const m = months[ym];
    if (prev) { const cn = Math.max(0, prev.essNat - prev.E / rate(c)); m.essNat += cn; m.essAlloc += cn * rate(c); m.carry = cn * rate(c); }
    prev = m;
  }
  for (const mv of R.moves || []) if (mv.cur === c && months[mv.ym]) {
    const m = months[mv.ym]; m.essNat -= mv.nat; m.essAlloc -= mv.aed;
    if (mv.kind === 'spread') { m.alloc.debt += mv.debtPay; m.alloc.growth += mv.invest; m.alloc.stability += mv.stability; m.alloc.reward += mv.reward; m.spread = (m.spread || 0) + mv.aed; }
    else { m.alloc.stability += mv.aed; m.toSafety = (m.toSafety || 0) + mv.aed; }
  }
  return {
    E: essFor(v, rate, periodOf(isoDay(new Date()), pd)).total, bal: { [c]: w }, months, rows: R.rows, debt, debts,
    paid: Object.values(debts).reduce((a, d) => a + d.paid, 0), lastSpare: R.lastSpare, starter: R.starter, worst: R.worst, spareHold, holdGrowth, all: R,
    sadaqaAED: w.sadaqa * rate(c), growthAED: w.growth * rate(c) + holdGrowth, stabilityAED: w.stability * rate(c) + spareHold, rewardAED: w.reward * rate(c),
  };
}

function replayOne(s, rate, home) {
  const nowYm = periodOf(isoDay(new Date()), paydayOf(s));
  const E = essFor(s, rate, nowYm).total; // أساسيات الدورة الحالية (حسب مكانك)
  const bal = {};
  const wallet = c => (bal[c] ??= { growth: 0, stability: 0, reward: 0, sadaqa: 0 });
  wallet('AED'); // كل محفظة بتفضل ظاهرة حتى لو مفيش دخل فيها (عندها أساسيات أو ديون أو أصول)
  if (home) wallet(home); else countries(s).forEach(wallet);
  const months = {};
  // اللي فاضل في الأساسيات آخر الدورة (اتحط للدورة الجاية وقت الدين) بيترحّل لبداية الدورة الجديدة
  // essCur: فلوس الأساسيات بعملتها (الجنيه جنيه والدرهم درهم)، عشان لما زيادة تتنقل للأمان تتنقل من العملة الصح
  let lastMo = null;
  const essCur = {}, moves = [];
  const essAED = () => Object.entries(essCur).reduce((a, [c, v]) => a + v * rate(c), 0);
  // من غير دين: أي فلوس في الأساسيات فوق أساسيات الدورة دي بتتنقل للأمان (طلب صاحب الحساب، 2026-11-20)
  const toSafety = (mo, ym, amt, date) => {
    if (!(amt > 0.5)) return 0;
    let left = amt;
    for (const c of Object.keys(essCur).sort((a, b) => essCur[b] * rate(b) - essCur[a] * rate(a))) {
      if (left <= 0.005) break;
      const x = Math.min(left, Math.max(0, essCur[c] * rate(c)));
      if (x <= 0.005) continue;
      essCur[c] -= x / rate(c); wallet(c).stability += x / rate(c); left -= x;
      moves.push({ ym, date, cur: c, aed: x, nat: x / rate(c) });
    }
    const done = amt - left; mo.essAlloc -= done; mo.toSafety = (mo.toSafety || 0) + done; mo.alloc.stability += done;
    return done;
  };
  const month = (ym, date) => {
    if (months[ym]) return months[ym];
    const carry = lastMo ? Math.max(0, lastMo.essAlloc - lastMo.E) : 0;
    // فلوس الأساسيات اللي معاك بتقل بأساسيات الدورة اللي خلصت (اتصرفت)، بنفس نسبة كل عملة
    const tot = essAED(), keep = tot > 0.005 ? Math.min(1, carry / tot) : 0;
    for (const c of Object.keys(essCur)) essCur[c] *= keep;
    lastMo = months[ym] = {
      income: 0, gross: 0, sadaqa: 0, sadGiven: 0, essAlloc: carry, carry, essSpent: 0, rewardSpent: 0, items: {}, mode: 'A', E: essCycle(s, rate, ym), f: cycleInfo(s, ym).f,
      alloc: { growth: 0, stability: 0, reward: 0, debt: 0 },
    };
    if (debt <= 0.5) toSafety(lastMo, ym, carry, date); // من غير دين: اللي اترحّل كله زيادة، يروح للأمان
    return lastMo;
  };
  const spareHold = s.holdings.filter(h => h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  // أهداف الأمان أوتوماتيك: شهر أساسيات البلدين (وقت الدين)، و5 شهور × أغلى وضع (من غير دين). بتتحدث مع أي تغيير في البنود
  const worst = worstMonth(s, rate), starter = E, lastSpare = SAFE_MONTHS * worst.amount;
  const stabAED = () => Object.entries(bal).reduce((a, [c, w]) => a + w.stability * rate(c), 0) + spareHold;
  // 🔀 فلوس طالعة من الأساسيات بتتوزّع بنفس قاعدة الدخل بالظبط (طلب صاحب الحساب، 2026-11-25):
  // الأساسيات بس ليها سقف (الدورة دي + 10 أيام وقت الدين)، فأي حاجة فوقه بتتقسم كأنها دخل والأساسيات متغطية:
  // نصيب النمو للدين الأول ثم الاستثمار، والأمان والفلوس الحرّة بنسبهم. المحافظ التانية ما لهاش سقف.
  const spread = (mo, ym, cur, amt, date) => {
    const x = Math.min(Math.max(0, amt), Math.max(0, (essCur[cur] || 0) * rate(cur)));
    if (!(x > 0.5)) return null;
    const r = rate(cur), debtOn = debt > 0.5;
    const sp = splitIncome({ net: x, need: 0, inc: mo.income, E: mo.E || essCycle(s, rate, ym), debtOn, stab: stabAED(), starter, cap: lastSpare });
    const debtPay = Math.min(sp.growth, debt); let pay = debtPay; const paidTo = {};
    for (const d of dl) if (d.on && pay > 0) { const y = Math.min(pay, d.left); d.left -= y; pay -= y; if (y > 0) paidTo[d.id] = y; }
    debt = debtLeft();
    const invest = sp.growth - debtPay, w = wallet(cur);
    w.growth += invest / r; w.stability += sp.stability / r; w.reward += sp.reward / r;
    essCur[cur] -= x / r; mo.essAlloc -= x; mo.spread = (mo.spread || 0) + x;
    mo.alloc.debt += debtPay; mo.alloc.growth += invest; mo.alloc.stability += sp.stability; mo.alloc.reward += sp.reward;
    moves.push({ ym, date, cur, aed: x, nat: x / r, kind: 'spread', debtPay, invest, stability: sp.stability, reward: sp.reward });
    return { aed: x, debtPay, invest, stability: sp.stability, reward: sp.reward, paidTo };
  };
  const essCap = ym => essCycle(s, rate, ym) + (debt > 0.5 ? essNextDays(s, rate, ym) : 0); // سقف الأساسيات

  // كل دين بيتحسب من يوم ما اتضاف (since)، عشان الدخل اللي قبله ما يتحسبش إنه سدّده.
  // والسداد من نصيب النمو بيروح للديون بترتيب القايمة: الأول يخلص الأول.
  const dl = debtList(s).map(d => ({ id: d.id, bal: (+d.balance || 0) * rate(curOf(d)), since: d.since || '', left: 0, on: false }));
  const owe = date => { for (const d of dl) if (!d.on && (!d.since || d.since <= date)) { d.on = true; d.left = d.bal; } };
  const debtLeft = () => dl.reduce((a, d) => a + d.left, 0);
  owe('');
  let debt = debtLeft();
  const rows = {};
  const sorted = s.tx.map((t, i) => [t, i]).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]);

  for (const [tx] of sorted) {
    owe(tx.date); debt = debtLeft();
    const mo = month(periodOf(tx.date, paydayOf(s)), tx.date);
    const r = tx.rate || rate(curOf(tx));
    const aed = tx.amount * r;
    if (tx.type === 'transfer') { // من بند في عملة لبند (نفسه أو غيره) في عملة تانية
      // الأساسيات مش محفظة: فلوسها هي "اللي اتخصص للأساسيات الشهر ده" (essAlloc)، فالتحويل منها/ليها بيعدّله
      // الدهب (XAU) مش محفظة: الجرامات بتتشال/بتتضاف على الحتة نفسها في s.holdings وقت التحويل
      const tb = tx.toBucket || tx.bucket, inAED = (+tx.toAmount || 0) * (tx.toRate || rate(tx.to));
      if (curOf(tx) === 'XAU') { /* بيع دهب: الحتة نفسها اتنقصت */ } else if (tx.bucket === 'essentials') { mo.essAlloc -= aed; essCur[curOf(tx)] = (essCur[curOf(tx)] || 0) - (+tx.amount || 0); } else wallet(curOf(tx))[tx.bucket] -= tx.amount;
      if (tx.to === 'XAU') { /* شراء دهب: الحتة اتزوّدت */ } else if (tb === 'essentials') { mo.essAlloc += inAED; essCur[tx.to] = (essCur[tx.to] || 0) + (+tx.toAmount || 0); } else wallet(tx.to)[tb] += +tx.toAmount || 0;
      let sprd = null;
      if (tb === 'essentials' && tx.to !== 'XAU' && tx.date >= SPREAD_FROM) { const ym = periodOf(tx.date, paydayOf(s)); sprd = spread(mo, ym, tx.to, Math.min(inAED, mo.essAlloc - essCap(ym)), tx.date); }
      rows[tx.id] = { aed, r, transfer: true, inAED, spread: sprd };
      continue;
    }
    // استثمار مش مصروف: الفلوس بتخرج من محفظة البند (النمو) وبتدخل أصل في s.holdings (اللي بيتحسب
    // في نفس البند بقيمته)، فالإجمالي ما بيقلّش. والبيع (divest) العكس: الفلوس بترجع للمحفظة.
    // سداد دين من محفظة (غالبًا بعد تحويل من عملة تانية): الفلوس بتخرج من البند وبتنزّل الدين نفسه
    // ➕➖ تعديل على دين: فوايد، غرامة، أو تصحيح (طلب صاحب الحساب، 2026-11-25): بيتسجل في السجل ويتمسح زي أي معاملة
    if (tx.type === 'debtadj') {
      owe(tx.date);
      const x = dl.find(y => y.id === tx.debt) || dl[0];
      if (x) { if (!x.on) { x.on = true; x.left = x.bal; } const delta = (tx.dir === -1 ? -1 : 1) * aed; const nl = Math.max(0, x.left + delta); x.add = (x.add || 0) + (nl - x.left); x.left = nl; }
      debt = debtLeft();
      rows[tx.id] = { aed, r, debtadj: true, dir: tx.dir === -1 ? -1 : 1 };
      continue;
    }
    if (tx.type === 'essout') { // 🔀 وزّعت زيادة الأساسيات بالقاعدة العادية
      const sprd = spread(mo, periodOf(tx.date, paydayOf(s)), curOf(tx), aed, tx.date);
      rows[tx.id] = { aed, r, essout: true, spread: sprd };
      continue;
    }
    if (tx.type === 'debtpay') {
      if (tx.bucket === 'essentials') { mo.essAlloc -= aed; essCur[curOf(tx)] = (essCur[curOf(tx)] || 0) - (+tx.amount || 0); } // سداد من الأساسيات: بيطلع من فلوسها
      else wallet(curOf(tx))[tx.bucket || 'growth'] -= tx.amount;
      let pay = aed; const paidTo = {};
      for (const x of dl) if (x.on && pay > 0 && (!tx.debt || x.id === tx.debt)) { const y = Math.min(pay, x.left); x.left -= y; pay -= y; if (y > 0) paidTo[x.id] = y; }
      debt = debtLeft();
      rows[tx.id] = { aed, r, debtpay: true, paidTo };
      continue;
    }
    if (tx.type === 'invest' || tx.type === 'divest') {
      wallet(curOf(tx))[tx.bucket || 'growth'] += (tx.type === 'invest' ? -1 : 1) * tx.amount;
      rows[tx.id] = { aed, r, invest: true };
      continue;
    }
    if (tx.type === 'income') {
      // أساسيات الدولة دي وقت الدخل: Ecur (بعملتها) في المعاملات الجديدة؛ القديمة كان فيها E بالدرهم للكل
      // من دورة نوفمبر 2026 (يوم ما بدأ حساب المكان) الأساسيات بتتحسب حسب إنت ومراتك فين يوم بيوم،
      // فأي تغيير في المكان بيأثر على الشهر ده على طول. Efix = البنود الثابتة وقت الدخل.
      // الدورات اللي قبل كده فضلت على الصورة اللي اتسجلت وقتها (Ecur/E) عشان التاريخ ما يتغيّرش.
      const ym = periodOf(tx.date, paydayOf(s)), live = ym >= periodOf(LOCATION_FROM, paydayOf(s));
      // (Efix القديم كان أساسيات عملة الدخل بس، فمش بيتحسب في الدورات دي: الأساسيات كلها مع بعض)
      const Etx = live ? essCycle(s, rate, ym) : (tx.Efix != null ? tx.Efix * rate(curOf(tx)) + essFor(s, rate, ym).dyn
          : tx.Ecur != null ? tx.Ecur * rate(curOf(tx)) : curOf(tx) === 'AED' && tx.E != null ? tx.E * rate('AED') : E) * mo.f;
      // الصدقة بتطلع الأول من أي دخل، والتوزيع بيتم على الباقي — إلا لو عليك دين:
      // سداد الدين أولى من صدقة التطوّع (طلب صاحب الحساب، 2026-11-19)، فبتقف لحد ما الدين يخلص
      const sadPaused = debt > SAD_DEBT && +tx.sad > 0, debtOn = debt > 0.5;
      const sad = sadPaused ? 0 : aed * Math.min(100, Math.max(0, +tx.sad || 0)) / 100, net = aed - sad;
      // الأساسيات بتاخد الناقص بس: الهدف ناقص اللي اتخصص لها فعلًا الدورة دي (من دخل أو تحويل ليها، ناقص اللي اتحوّل منها)،
      // مش ناقص الدخل بس (طلب صاحب الحساب، 2026-11-20: كانت بتاخد تاني وهي مليانة من تحويل).
      // الباقي بيتقسم بنفس نسب الفيديو بالظبط، كأن الأساسيات اتملت.
      // وقت الدين: الأساسيات تغطي الدورة دي + 10 أيام من الجاية عشان ما ترجعش تستلف (طلب صاحب الحساب، 2026-11-20). من غير دين: الدورة دي بس.
      const Enext = debtOn ? essNextDays(s, rate, ym) : 0, target = Etx + Enext, held = mo.essAlloc, stabBefore = stabAED(), debtBefore = debt;
      const nY = nextPeriod(ym), ci = cycleInfo(s, ym), why = { held, stabBefore, debtBefore, Enext, nextFull: essFor(s, rate, nY).total, nextDays: cycleInfo(s, nY).days, Efull: essFor(s, rate, ym).total, Efull1: essFor({ ...s, essentials: s.essentials.filter(e => e.full1) }, rate, ym).total, cycDays: ci.days, cycLeft: ci.left, f: mo.f };
      const sp = splitIncome({ net, need: target - mo.essAlloc, inc: mo.income, E: Etx, debtOn, stab: stabAED(), starter, cap: lastSpare });
      const toEss = sp.essentials, capped = sp.capped;
      const shown = allocate(mo.income + net, Etx); // الوضع (A/B/C) بالدخل الحقيقي، للشرح
      const d = { essentials: toEss, growth: sp.growth, stability: sp.stability, reward: sp.reward };
      // أرقام عدّلها صاحب الحساب في شاشة التوزيع قبل التسجيل (بالدرهم). الباقي كله بيروح للنمو (الدين ثم الاستثمار)
      if (tx.ov) {
        for (const k of ['essentials', 'reward', 'stability']) if (tx.ov[k] != null) d[k] = Math.max(0, +tx.ov[k] || 0);
        const over = d.essentials + d.reward + d.stability - net;
        if (over > 0) { const cut = Math.min(over, d.stability); d.stability -= cut; d.reward -= Math.min(over - cut, d.reward); }
        d.growth = Math.max(0, net - d.essentials - d.reward - d.stability);
      }
      const debtPay = Math.min(d.growth, debt);
      let pay = debtPay;
      const paidTo = {}; // كل دين خد كام من الدخل ده (لسجل الدين)
      for (const x of dl) if (x.on && pay > 0) { const y = Math.min(pay, x.left); x.left -= y; pay -= y; if (y > 0) paidTo[x.id] = y; }
      debt = debtLeft();
      const invest = d.growth - debtPay;
      const w = wallet(curOf(tx));
      w.growth += invest / r; w.stability += d.stability / r; w.reward += d.reward / r; w.sadaqa += sad / r;
      mo.income += net; mo.gross += aed; mo.sadaqa += sad; mo.essAlloc += d.essentials; mo.mode = shown.mode; mo.E = Etx;
      essCur[curOf(tx)] = (essCur[curOf(tx)] || 0) + d.essentials / r;
      const moved = debtOn ? 0 : toSafety(mo, ym, mo.essAlloc - target, tx.date); // من غير دين: الزيادة في الأساسيات للأمان
      mo.alloc.growth += invest; mo.alloc.debt += debtPay; mo.alloc.stability += d.stability; mo.alloc.reward += d.reward;
      rows[tx.id] = {
        aed, net, sadaqa: sad, sadPaused, r, d, debtPay, paidTo, invest, capped, mode: shown.mode, modeBefore: allocate(mo.income - net, Etx).mode, essCovered: toEss < Math.min(net, Math.max(0, target - (mo.income - net))) - 0.5, debtOn, target, starter, moved, // الأساسيات كانت متغطية (من تحويل) فخدت أقل من العادي
        incomeAfter: mo.income, E: Etx, debtAfter: debt, deficit: Math.max(0, Etx - mo.essAlloc), ...why, video: sp.video, rest: sp.rest, ov: !!tx.ov,
      };
    } else {
      if (tx.bucket === 'essentials') {
        mo.essSpent += aed; essCur[curOf(tx)] = (essCur[curOf(tx)] || 0) - (+tx.amount || 0);
        if (tx.item) mo.items[tx.item] = (mo.items[tx.item] || 0) + aed;
      } else {
        wallet(curOf(tx))[tx.bucket] -= tx.amount;
        if (tx.bucket === 'reward') mo.rewardSpent += aed;
        if (tx.bucket === 'sadaqa') mo.sadGiven += aed;
      }
      rows[tx.id] = { aed, r };
    }
  }

  owe(isoDay(new Date())); debt = debtLeft();
  const debts = Object.fromEntries(dl.map(d => [d.id, { left: d.left, paid: d.on ? d.bal + (d.add || 0) - d.left : 0, added: d.add || 0, on: d.on }]));
  const sum = k => Object.entries(bal).reduce((a, [c, w]) => a + w[k] * rate(c), 0);
  const holdGrowth = s.holdings.filter(h => !h.spare).reduce((a, h) => a + holdingValue(h, rate), 0);
  return {
    E, bal, months, rows, debt, debts, paid: dl.filter(d => d.on).reduce((a, d) => a + d.bal + (d.add || 0), 0) - debt, lastSpare, starter, worst, moves, spareHold, holdGrowth,
    sadaqaAED: sum('sadaqa'),
    growthAED: sum('growth') + holdGrowth, stabilityAED: sum('stability') + spareHold, rewardAED: sum('reward'),
  };
}

/** الدخل الشهري المتوقع: متوسط آخر 3 شهور كاملة، ولو مفيش يبقى المرتب أو دخل الشهر الحالي. */
/** المتوسط (والدخل الجانبي) بيتحسب بس لما يبقى فيه 4 دورات خلصت فيها دخل؛ قبلها المرتب بس (طلب صاحب الحساب، 2026-11-20) */
/** من اليوم ده: التحويل للأساسيات فوق سقفها بيتوزّع لوحده بقاعدة الدخل (اللي قبله بيتوزّع بإيدك من زرار الزيادة) */
export const SPREAD_FROM = '2026-11-25';
export const AVG_MIN = 4;
export const pastIncomeMonths = (R, ym) => Object.keys(R.months).filter(k => k < ym && R.months[k].income > 0).sort();
export function expectedIncome(s, R, ym) {
  const past = pastIncomeMonths(R, ym);
  if (past.length >= AVG_MIN) return past.slice(-AVG_MIN).reduce((a, k) => a + R.months[k].income, 0) / AVG_MIN;
  return +s.salary > 0 ? +s.salary : (R.months[ym]?.income || 0);
}
/** متوسط الدخل الجانبي في الدورة: صفر لحد ما يبقى فيه 4 دورات بيانات */
export function sideAverage(s, R, ym, rate) {
  const past = pastIncomeMonths(R, ym);
  if (past.length < AVG_MIN) return 0;
  const keep = new Set(past.slice(-AVG_MIN)), pd = paydayOf(s);
  return s.tx.filter(x => x.type === 'income' && x.kind !== 'salary' && keep.has(periodOf(x.date, pd))).reduce((a, x) => a + x.amount * (x.rate || rate(curOf(x))), 0) / AVG_MIN;
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
