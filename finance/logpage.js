// logpage.js — صفحة "السجل": كل المعاملات بأسعارها (سعر الصرف وقتها، قيمتها بالدرهم، وعمولة التحويلات)،
// مع فلتر بالوقت (الدورة دي، 30 يوم، 3 شهور، السنة، الكل، أو من/لحد) وبالنوع والعملة وبحث.
// الملف ده بيرسم بس؛ الحالة (S) والحسابات (R) بتيجي من app.js في h.

/** الفلتر الافتراضي */
export const LOG_F = () => ({ t: 'cycle', type: 'all', cur: 'ALL', q: '', from: '', to: '' });

const TYPES = ['income', 'expense', 'transfer', 'debt', 'invest'];
const typeOf = t => t.type === 'debtpay' || t.type === 'debtadj' ? 'debt' : t.type === 'divest' ? 'invest' : t.type === 'income' || t.type === 'transfer' || t.type === 'invest' ? t.type : 'expense';

/** حدود الفترة [من، لحد] كتواريخ YYYY-MM-DD */
function range(f, h) {
  const td = h.today(), d = n => h.iso(new Date(Date.now() - n * 864e5));
  if (f.t === 'cycle') return [h.cycleStart(), td];
  if (f.t === '30') return [d(29), td];
  if (f.t === '90') return [d(89), td];
  if (f.t === 'year') return [`${td.slice(0, 4)}-01-01`, td];
  if (f.t === 'custom') return [f.from || '0000-00-00', f.to || '9999-12-31'];
  return ['0000-00-00', '9999-12-31'];
}

/** المعاملات بعد الفلتر، الأحدث الأول */
export function filterTx(tx, f, h) {
  const [a, b] = range(f, h), q = f.q.trim().toLowerCase();
  return tx.filter(t => t.date >= a && t.date <= b
    && (f.type === 'all' || typeOf(t) === f.type)
    && (f.cur === 'ALL' || h.cOf(t) === f.cur || t.to === f.cur)
    && (!q || [t.note, t.desc, t.cat, t.sub, t.item && h.itemName(t.item)].some(x => String(x || '').toLowerCase().includes(q))))
    .sort((x, y) => y.date.localeCompare(x.date) || (y.id > x.id ? 1 : -1));
}

export function renderLog(tx, R, f, h) {
  const { L, fmt, esc, CUR, B } = h;
  const list = filterTx(tx, f, h), [a, b] = range(f, h);
  const sym = c => CUR[c]?.s ?? c;
  // السعر بالشكل اللي الناس بتقوله: الوحدة الأكبر قيمة الأول
  const px = (c, r) => !(r > 0) || c === 'AED' ? '' : r >= 1 ? `1 ${sym(c)} = ${fmt(r, 2)} Đ` : `1 Đ = ${fmt(1 / r, 2)} ${sym(c)}`;
  const pair = (from, to, per) => per >= 1 ? `1 ${sym(from)} = ${fmt(per, per >= 10 ? 2 : 4)} ${sym(to)}` : `1 ${sym(to)} = ${fmt(1 / per, 2)} ${sym(from)}`;
  const aedOf = t => (+t.amount || 0) * (t.rate || h.rate(h.cOf(t)));

  // الملخص
  let inc = 0, out = 0, debt = 0, inv = 0, lost = 0, nx = 0;
  for (const t of list) {
    const k = typeOf(t), v = aedOf(t);
    if (k === 'income') inc += v; else if (k === 'expense') out += v; else if (k === 'debt' && t.type !== 'debtadj') debt += v;
    else if (k === 'invest') inv += (t.type === 'invest' ? 1 : -1) * v;
    else if (k === 'transfer') { nx++; if (t.mkt != null) lost += Math.max(0, (+t.mkt - +t.toAmount) * h.rate(t.to)); }
  }
  const kpi = (l, v, s, cls = '') => `<div class="kpi ${cls}"><small>${l}</small><b dir="ltr">${v}</b><small>${s}</small></div>`;

  // الصفوف، متجمعة بالأيام
  const ICON = { income: '💰', expense: '💸', transfer: '🔁', debt: '💳', invest: '💼' };
  const row = t => {
    const k = typeOf(t), c = h.cOf(t), r = R.rows[t.id] || {}, v = aedOf(t);
    let title = esc(t.note || ''), sub = [], amt = '', extra = '';
    if (k === 'income') {
      title = title || L('دخل', 'Income');
      const parts = [[L('صدقة', 'sadaqa'), r.sadaqa], [L('أساسيات', 'essentials'), r.d?.essentials], [L('دين', 'debt'), r.debtPay], [L('استثمار', 'investing'), r.invest], [L('أمان', 'safety'), r.d?.stability], [L('فلوس حرّة', 'fun'), r.d?.reward]].filter(([, x]) => x > 0.5);
      if (parts.length) extra = `<small class="split">↳ ${parts.map(([n, x]) => `${n} <b dir="ltr">${fmt(x)} Đ</b>`).join(' · ')}</small>`;
      if (r.sadPaused) extra += `<small class="split">⏸️ ${L('الصدقة واقفة عشان الدين', 'Sadaqa paused because of debt')}</small>`;
      amt = `<b dir="ltr" class="pos">+${fmt(t.amount, 2)} ${sym(c)}</b>`;
    } else if (k === 'transfer') {
      const tb = t.toBucket || t.bucket, got = (+t.toAmount || 0) / (+t.amount || 1), ls = t.mkt != null ? +t.mkt - +t.toAmount : null;
      title = `${CUR[c]?.f ?? ''} ${B[t.bucket]?.i ?? ''} ${B[t.bucket]?.n ?? ''} → ${CUR[t.to]?.f ?? ''} ${B[tb]?.i ?? ''} ${B[tb]?.n ?? ''}`;
      sub.push(`${L('سعرك', 'Your rate')} <span dir="ltr">${pair(c, t.to, got)}</span>`);
      if (t.mkt != null) sub.push(`${L('السوق', 'Market')} <span dir="ltr">${pair(c, t.to, t.mkt / t.amount)}</span>`);
      if (ls != null) extra = `<small class="split">${ls > 0.005 ? `💸 ${L('اتخصم', 'Lost')} <b dir="ltr">${fmt(ls, 2)} ${sym(t.to)}</b> (${fmt(ls / t.mkt * 100, 1)}%)${t.fee ? ` · ${L('منهم عمولة', 'fee')} ${fmt(t.fee, 2)}` : ''}` : ls < -0.005 ? `🎉 ${L('أحسن من السوق بـ', 'Beat the market by')} <b dir="ltr">${fmt(-ls, 2)} ${sym(t.to)}</b>` : `✅ ${L('من غير عمولة', 'No fee')}`}</small>`;
      amt = `<b dir="ltr" class="neg">−${fmt(t.amount, 2)} ${sym(c)}</b><b dir="ltr" class="pos">+${fmt(t.toAmount, 2)} ${sym(t.to)}</b>`;
    } else if (k === 'debt') {
      if (t.type === 'debtadj') { // ➕➖ ربا / غرامة / تصحيح على الدين (بتزوّد أو بتقلّل الباقي)
        title = title || `${({ interest: L('📈 ربا', '📈 Riba (interest)'), fee: L('⚠️ غرامة', '⚠️ Fee'), correction: L('✏️ تصحيح', '✏️ Correction') }[t.why] || L('✏️ تعديل', '✏️ Adjustment'))} · ${esc(h.debtName(t.debt))}`;
        sub.push(t.dir === -1 ? L('قلّل الدين', 'Lowered the debt') : L('زوّد الدين', 'Raised the debt'));
        amt = `<b dir="ltr" class="${t.dir === -1 ? 'pos' : 'neg'}">${t.dir === -1 ? '−' : '+'}${fmt(t.amount, 2)} ${sym(c)} 💳</b>`;
      } else {
      title = title || `${L('سداد', 'Paid')} ${esc(h.debtName(t.debt))}`;
      amt = `<b dir="ltr" class="neg">−${fmt(t.amount, 2)} ${sym(c)}</b>`;
      }
    } else if (k === 'invest') {
      title = title || (t.type === 'invest' ? L('استثمار', 'Investment') : L('بيع استثمار', 'Sold investment'));
      if (t.units) sub.push(`${fmt(t.units, 2)} ${L('وحدة', 'units')}`);
      amt = `<b dir="ltr" class="${t.type === 'invest' ? 'neg' : 'pos'}">${t.type === 'invest' ? '−' : '+'}${fmt(t.amount, 2)} ${sym(c)}</b>`;
    } else {
      title = title || (t.item ? esc(h.itemName(t.item)) : L('مصروف', 'Expense'));
      amt = `<b dir="ltr" class="neg">−${fmt(t.amount, 2)} ${sym(c)}</b>`;
    }
    if (t.desc) extra += `<small class="split">✍️ ${esc(t.desc)}</small>`; // الوصف الاختياري اللي اتكتب وقت التسجيل
    if (k !== 'transfer' && t.bucket && B[t.bucket]) sub.unshift(`${B[t.bucket].i} ${B[t.bucket].n}`);
    if (k !== 'transfer' && c !== 'AED') sub.push(`${L('السعر', 'Rate')} <span dir="ltr">${px(c, t.rate || h.rate(c))}</span> · ≈ <b dir="ltr">${fmt(v, 2)} Đ</b>`);
    return `<li class="row tx lg-${k}"><button type="button" class="lg-hit" data-ltx="${t.id}" aria-label="${L('عدّل أو امسح', 'Edit or delete')}"></button><span class="badge">${ICON[k]}</span>
      <div class="grow"><b>${title}</b>${sub.length ? `<small>${sub.join(' · ')}</small>` : ''}${extra}</div>
      <span class="amt">${amt}</span><span class="lg-ed" aria-hidden="true">✏️</span></li>`;
  };
  let day = '', rows = '';
  for (const t of list) {
    if (t.date !== day) { day = t.date; rows += `<li class="lg-day">${h.dayLabel(day)}</li>`; }
    rows += row(t);
  }

  const chip = (k, v, label) => `<button type="button" class="pill ${f[k] === v ? 'on' : ''}" data-lf="${k}" data-v="${v}">${label}</button>`;
  const curs = [...new Set(tx.flatMap(t => [h.cOf(t), t.to]).filter(Boolean))];
  return `<article class="card glass wide lg">
    <h2>📒 ${L('السجل', 'Log')}</h2>
    <div class="chips-c lg-add"><button type="button" class="pill" data-ladd="spend">➕ 💸 ${L('مصروف', 'Expense')}</button><button type="button" class="pill" data-ladd="side">➕ 🤑 ${L('دخل', 'Income')}</button><button type="button" class="pill" data-ladd="salary">➕ 💰 ${L('مرتب', 'Salary')}</button><button type="button" class="pill" data-ladd="transfer">➕ 🔁 ${L('تحويل', 'Transfer')}</button></div>
    <p class="note">✏️ ${L('دوس على أي معاملة عشان تعدّلها أو تمسحها.', 'Tap any transaction to edit or delete it.')}</p>
    <div class="lg-filters">
      <div class="lg-row"><small>🗓️ ${L('الوقت', 'Time')}</small>
        ${chip('t', 'cycle', L('الدورة دي', 'This cycle'))}${chip('t', '30', L('آخر 30 يوم', 'Last 30 days'))}${chip('t', '90', L('آخر 3 شهور', 'Last 3 months'))}${chip('t', 'year', L('السنة دي', 'This year'))}${chip('t', 'all', L('الكل', 'All'))}${chip('t', 'custom', L('📅 من / لحد', '📅 From / to'))}</div>
      ${f.t === 'custom' ? `<div class="lg-row"><label>${L('من', 'From')} <input type="date" data-lfd="from" value="${f.from}"></label><label>${L('لحد', 'To')} <input type="date" data-lfd="to" value="${f.to}"></label></div>` : ''}
      <div class="lg-row"><small>🏷️ ${L('النوع', 'Type')}</small>
        ${chip('type', 'all', L('الكل', 'All'))}${TYPES.map(k => chip('type', k, `${ICON[k]} ${{ income: L('دخل', 'Income'), expense: L('مصاريف', 'Spending'), transfer: L('تحويلات', 'Transfers'), debt: L('سداد ديون', 'Debt payments'), invest: L('استثمار', 'Investing') }[k]}`)).join('')}</div>
      ${curs.length > 1 ? `<div class="lg-row"><small>💱 ${L('العملة', 'Currency')}</small>${chip('cur', 'ALL', L('الكل', 'All'))}${curs.map(c => chip('cur', c, `${CUR[c]?.f ?? ''} ${sym(c)}`)).join('')}</div>` : ''}
      <div class="lg-row"><input type="search" class="lg-q" data-lq value="${esc(f.q)}" placeholder="🔎 ${L('دوّر بالاسم أو النوع…', 'Search by name or category…')}"></div>
    </div>
    <p class="note">${L(`${list.length} معاملة · من ${h.dayLabel(a === '0000-00-00' ? (tx.map(t => t.date).sort()[0] || h.today()) : a)} لحد ${h.dayLabel(b > h.today() ? h.today() : b)}`, `${list.length} transactions · ${h.dayLabel(a === '0000-00-00' ? (tx.map(t => t.date).sort()[0] || h.today()) : a)} to ${h.dayLabel(b > h.today() ? h.today() : b)}`)}</p>
    <div class="kpis">
      ${kpi(L('💰 دخل', '💰 Income'), `${fmt(inc)} Đ`, L('قبل الصدقة', 'Before sadaqa'), 'good')}
      ${kpi(L('💸 مصاريف', '💸 Spending'), `${fmt(out)} Đ`, L('أساسيات + فلوس حرّة + صدقة', 'Essentials + fun + sadaqa'))}
      ${kpi(L('💳 سداد ديون', '💳 Debt paid'), `${fmt(debt)} Đ`, L('سداد مباشر من محفظة', 'Paid straight from a wallet'))}
      ${kpi(L('🔁 تحويلات', '🔁 Transfers'), `${nx}`, lost > 0.5 ? L(`راح ${fmt(lost)} Đ عمولة وفرق سعر`, `${fmt(lost)} Đ lost to fees and rates`) : L('من غير خسارة', 'Nothing lost'), lost > 0.5 ? 'bad' : '')}
      ${inv ? kpi(L('💼 استثمار', '💼 Investing'), `${fmt(inv)} Đ`, L('صافي اللي اتحط', 'Net put in')) : ''}
    </div>
    ${list.length ? `<ul class="list lg-list">${rows}</ul>` : `<p class="note">${L('مفيش معاملات في الفترة دي. جرّب فلتر تاني.', 'No transactions in this period. Try another filter.')}</p>`}
    ${list.length ? `<div class="chips-c"><button type="button" class="pill" data-lcsv>⬇️ ${L('نزّل الفترة دي CSV', 'Download this period as CSV')}</button></div>` : ''}
  </article>`;
}

/** CSV للمعاملات اللي ظاهرة (يتفتح في Excel/Sheets) */
export function logCSV(tx, f, h) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['date', 'type', 'note', 'bucket', 'amount', 'currency', 'rate_to_AED', 'value_AED', 'to_currency', 'to_amount', 'market_to_amount', 'fee'];
  const lines = filterTx(tx, f, h).map(t => {
    const r = t.rate || h.rate(h.cOf(t));
    return [t.date, t.type, t.note || t.cat || '', t.bucket || '', t.amount, h.cOf(t), r, ((+t.amount || 0) * r).toFixed(2), t.to || '', t.toAmount ?? '', t.mkt != null ? (+t.mkt).toFixed(2) : '', t.fee || ''].map(q).join(',');
  });
  return '﻿' + [head.join(','), ...lines].join('\n');
}
