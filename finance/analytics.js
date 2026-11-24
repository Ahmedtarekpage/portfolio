// analytics.js — صفحة التحليلات: أرقام رئيسية + رسوم + خط زمني للتوقعات
// الألوان من لوحة متراجَعة لوضع الداكن (فحص عمى الألوان والتباين نجح)
import { L as tr } from './i18n.js'; // اسمه tr هنا عشان L مستخدم كهامش في الرسوم

const C = { blue: '#6981B5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#D55E51', violet: '#9FAECF', blueSoft: '#A3B2D2' };
const BUCKET = { essentials: C.yellow, growth: C.aqua, stability: C.blue, reward: C.magenta, sadaqa: C.violet };
const GRID = 'rgba(255,255,255,.09)', INK2 = '#9AA8C7';

/** عمود بحواف مدوّرة من ناحية القيمة بس */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
const nice = max => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

function kpis(D, h) {
  const t = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b dir="ltr">${value}</b><small>${sub}</small></div>`;
  return `<div class="kpis">
    ${t(tr('دخل الدورة', 'Cycle income'), h.fmt(D.kpi.income) + ' Đ', tr('بعد الصدقة', 'After sadaqa'))}
    ${t(tr('اتصرف', 'Spent'), h.fmt(D.kpi.spent) + ' Đ', tr('كل المصاريف (من غير الصدقة)', 'All expenses (excluding sadaqa)'))}
    ${t(tr('نسبة الادخار', 'Savings rate'), h.fmt(D.kpi.saveRate * 100) + '%', tr('دين + أمان + استثمار', 'Debt + safety + investing'))}
    ${t(tr('الصافي', 'Net worth'), h.fmt(D.kpi.net) + ' Đ', tr('اللي معاك − الدين', 'What you have − debt'), D.kpi.net < -0.5 ? 'bad' : 'good')}
  </div>`;
}

function chartCycles(D, h) {
  const rows = D.cycles;
  if (!rows.length) return `<p class="note">${tr('لسه مفيش دورات متسجلة.', 'No cycles recorded yet.')}</p>`;
  const W = 640, H = 230, L = 46, R = 10, T = 12, B = 30, ph = H - T - B, pw = W - L - R;
  const max = nice(Math.max(1, ...rows.map(r => Math.max(r.income, r.spent))));
  const band = pw / rows.length, bw = Math.min(26, band / 2 - 6);
  const y = v => T + ph - (v / max) * ph;
  const grid = [0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="${GRID}"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end" class="ax">${h.fmt(max * f)}</text>`).join('');
  const inc = tr('الدخل', 'Income'), out = tr('المصروف', 'Spending');
  const bars = rows.map((r, i) => {
    const cx = L + band * i + band / 2;
    return `<g>
      <path d="${barPath(cx - bw - 1, y(r.income), bw, T + ph - y(r.income))}" fill="${C.blue}" data-tip="${r.label} · ${inc} ${h.fmt(r.income)} Đ"><title>${r.label}: ${inc} ${h.fmt(r.income)}</title></path>
      <path d="${barPath(cx + 1, y(r.spent), bw, T + ph - y(r.spent))}" fill="${C.orange}" data-tip="${r.label} · ${out} ${h.fmt(r.spent)} Đ"><title>${r.label}: ${out} ${h.fmt(r.spent)}</title></path>
      <rect x="${cx - band / 2}" y="${T}" width="${band}" height="${ph}" fill="transparent" data-tip="${r.label} · ${inc} ${h.fmt(r.income)} Đ · ${out} ${h.fmt(r.spent)} Đ"/>
      <text x="${cx}" y="${H - 10}" text-anchor="middle" class="ax">${r.label}</text></g>`;
  }).join('');
  return `<div class="legend"><span><i style="background:${C.blue}"></i>${inc}</span><span><i style="background:${C.orange}"></i>${out}</span></div>
    <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" dir="ltr" role="img" aria-label="${tr('الدخل والمصروف لكل دورة قبض', 'Income and spending per pay cycle')}">${grid}${bars}</svg></div>
    <details class="tbl-view"><summary>${tr('عرض كجدول', 'View as table')}</summary><table class="tbl"><thead><tr><th>${tr('الدورة', 'Cycle')}</th><th>${inc}</th><th>${out}</th><th>${tr('اتحوّش', 'Saved')}</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th>${r.label}</th><td dir="ltr">${h.fmt(r.income)}</td><td dir="ltr">${h.fmt(r.spent)}</td><td dir="ltr">${h.fmt(r.saved)}</td></tr>`).join('')}</tbody></table></details>`;
}

function chartAlloc(D, h) {
  const parts = D.alloc.filter(p => p.v > 0.5 && !p.out), total = parts.reduce((a, p) => a + p.v, 0), out = D.alloc.filter(p => p.out && p.v > 0.5);
  if (!total) return `<p class="note">${tr('لسه مفيش دخل اتوزع في الدورة دي.', 'No income has been split in this cycle yet.')}</p>`;
  return `<div class="seg-bar">${parts.map(p => `<i style="flex:${p.v};background:${BUCKET[p.k]}" data-tip="${p.n} · ${h.fmt(p.v)} Đ · ${h.fmt(p.v / total * 100, 1)}%"></i>`).join('')}</div>
    <ul class="leg-list">${D.alloc.filter(p => !p.out).map(p => `<li><i style="background:${BUCKET[p.k]}"></i><span>${p.n}</span><b dir="ltr">${h.fmt(p.v)} Đ</b><small dir="ltr">${h.fmt(total ? p.v / total * 100 : 0, 1)}%</small></li>`).join('')}
      <li class="tot"><i></i><span>${tr('المجموع = صافي دخل الدورة', "Total = this cycle's net income")}</span><b dir="ltr">${h.fmt(total)} Đ</b><small dir="ltr">100%</small></li>
      ${out.map(p => `<li class="mu"><i style="background:${BUCKET[p.k]}"></i><span>${p.n}</span><b dir="ltr">${h.fmt(p.v)} Đ</b><small></small></li>`).join('')}</ul>
    ${D.allocNote ? `<p class="note">ℹ️ ${D.allocNote}</p>` : ''}`;
}

function hbars(list, color, h, empty) {
  if (!list.length) return `<p class="note">${empty}</p>`;
  const max = Math.max(...list.map(r => r.v), 1);
  return `<ul class="hbars">${list.map(r => `<li data-tip="${h.esc(r.n)} · ${h.fmt(r.v)} Đ">
      <span class="hn">${h.esc(r.n)}</span><span class="hb"><i style="width:${(r.v / max * 100).toFixed(1)}%;background:${color}"></i></span><b dir="ltr">${h.fmt(r.v)}</b>
      ${r.subs.length > 1 || (r.subs.length === 1 && r.subs[0].n) ? `<ul>${r.subs.map(s => `<li data-tip="${h.esc(r.n)} ← ${h.esc(s.n || tr('من غير تفاصيل', 'No details'))} · ${h.fmt(s.v)} Đ"><span class="hn">${h.esc(s.n || tr('من غير تفاصيل', 'No details'))}</span><span class="hb thin"><i style="width:${(s.v / max * 100).toFixed(1)}%;background:${color}"></i></span><b dir="ltr">${h.fmt(s.v)}</b></li>`).join('')}</ul>` : ''}
    </li>`).join('')}</ul>`;
}

function chartNet(D, h) {
  const a = D.net.actual, p = D.net.proj, all = [...a, ...p];
  if (all.length < 2) return `<p class="note">${tr('محتاج معاملات أكتر عشان الخط يبان.', 'Need more transactions for the line to show.')}</p>`;
  const W = 640, H = 260, L = 52, R = 14, T = 14, B = 30, ph = H - T - B, pw = W - L - R;
  const t0 = all[0].t, t1 = all[all.length - 1].t || t0 + 1;
  let lo = Math.min(0, ...all.map(d => d.v)), hi = Math.max(0, ...all.map(d => d.v));
  const span = nice((hi - lo) || 1); lo = Math.floor(lo / (span / 4)) * (span / 4); hi = Math.ceil(hi / (span / 4)) * (span / 4); if (hi === lo) hi = lo + 1;
  const x = t => L + ((t - t0) / (t1 - t0 || 1)) * pw, y = v => T + ph - ((v - lo) / (hi - lo)) * ph;
  const path = pts => pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`).join('');
  const ticks = [lo, lo + (hi - lo) / 2, hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${h.fmt(v)}</text>`).join('');
  const zero = lo < 0 && hi > 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.4)" stroke-dasharray="2 4"/><text x="${W - R}" y="${y(0) - 5}" text-anchor="end" class="ax">${tr('صفر', 'Zero')}</text>` : '';
  const n = 5, xt = Array.from({ length: n }, (_, i) => t0 + (t1 - t0) * i / (n - 1)).map(t => `<text x="${x(t)}" y="${H - 9}" text-anchor="middle" class="ax">${h.short(new Date(t))}</text>`).join('');
  const now = a[a.length - 1], ACT = tr('فعلي', 'Actual'), PRJ = tr('متوقع', 'Expected');
  const hit = (pts, kind) => pts.map((d, i) => {
    const prev = pts[i - 1], next = pts[i + 1];
    const x0 = prev ? (x(prev.t) + x(d.t)) / 2 : x(d.t) - 8, x1 = next ? (x(next.t) + x(d.t)) / 2 : x(d.t) + 8;
    return `<g class="hit"><rect x="${x0}" y="${T}" width="${Math.max(6, x1 - x0)}" height="${ph}" fill="transparent" data-tip="${h.day(new Date(d.t))} · ${kind} ${h.fmt(d.v)} Đ"/>
      <line x1="${x(d.t)}" x2="${x(d.t)}" y1="${T}" y2="${T + ph}" stroke="rgba(255,255,255,.35)"/><circle cx="${x(d.t)}" cy="${y(d.v)}" r="5" fill="${kind === ACT ? C.blue : C.blueSoft}" stroke="#0b1020" stroke-width="2"/></g>`;
  }).join('');
  return `<div class="legend"><span><i class="ln" style="background:${C.blue}"></i>${ACT}</span><span><i class="ln dash" style="color:${C.blueSoft}"></i>${PRJ}</span></div>
    <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" dir="ltr" role="img" aria-label="${tr('الصافي مع الوقت: الفعلي والمتوقع', 'Net worth over time: actual and expected')}">
      ${ticks}${zero}${xt}
      <line x1="${x(now.t)}" x2="${x(now.t)}" y1="${T}" y2="${T + ph}" stroke="rgba(255,255,255,.25)"/><text x="${x(now.t) + 5}" y="${T + ph - 6}" class="ax">${tr('النهارده', 'Today')}</text>
      <path d="${path(a)}" fill="none" stroke="${C.blue}" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path([now, ...p])}" fill="none" stroke="${C.blueSoft}" stroke-width="2" stroke-dasharray="6 5" stroke-linejoin="round"/>
      ${a.map(d => `<circle cx="${x(d.t)}" cy="${y(d.v)}" r="4" fill="${C.blue}" stroke="#0b1020" stroke-width="2"/>`).join('')}
      <text x="${Math.min(W - R - 4, x(p.length ? p[p.length - 1].t : now.t))}" y="${y((p.length ? p[p.length - 1] : now).v) - 9}" text-anchor="end" class="ax strong">${h.fmt((p.length ? p[p.length - 1] : now).v)} Đ</text>
      ${hit(a, ACT)}${hit(p, PRJ)}
    </svg></div>
    <details class="tbl-view"><summary>${tr('عرض كجدول', 'View as table')}</summary><table class="tbl"><thead><tr><th>${tr('التاريخ', 'Date')}</th><th>${tr('الصافي', 'Net worth')}</th><th>${tr('النوع', 'Type')}</th></tr></thead>
      <tbody>${a.map(d => `<tr><th>${h.day(new Date(d.t))}</th><td dir="ltr">${h.fmt(d.v)}</td><td>${ACT}</td></tr>`).join('')}${p.filter((_, i) => i % 3 === 2).map(d => `<tr><th>${h.day(new Date(d.t))}</th><td dir="ltr">${h.fmt(d.v)}</td><td>${PRJ}</td></tr>`).join('')}</tbody></table></details>`;
}

function timeline(D, h) {
  if (!D.events.length) return `<p class="note">${tr('مفيش أحداث متوقعة بالمعدل الحالي.', 'No expected events at the current rate.')}</p>`;
  return `<ol class="tl">${D.events.map(e => `<li class="${e.kind || ''}"><span class="td">${e.far ? tr('بعيد', 'Far off') : h.month(new Date(e.t))}</span><span class="ti">${e.i}</span>
    <div><b>${e.h}</b><small>${e.s}</small></div></li>`).join('')}</ol>`;
}

export function renderAnalytics(D, h) {
  const card = (title, body, cls = '') => `<article class="card glass ${cls}"><h2>${title}</h2>${body}</article>`;
  if (D.locked) return card(tr('📊 التحليلات', '📊 Analytics'), `<p class="note">${tr('🙈 الأرقام مستخبية. دوس على العين فوق واكتب الرقم السري عشان تشوف التحليلات.', '🙈 Numbers are hidden. Tap the eye at the top and enter your PIN to see the analytics.')}</p>`, 'wide');
  return card(tr('📌 أهم الأرقام', '📌 Key numbers') + ' <small>(' + h.esc(D.cycleLabel) + ')</small>', kpis(D, h), 'wide')
    + card(tr('🗓️ الخط الزمني المتوقع', '🗓️ Expected timeline'), `<p class="note">${D.assume}</p>${timeline(D, h)}`, 'wide')
    + card(tr('📈 الصافي مع الوقت', '📈 Net worth over time'), chartNet(D, h), 'wide')
    + card(tr('💵 الدخل والمصروف لكل دورة', '💵 Income and spending per cycle'), chartCycles(D, h))
    + card(tr('🥧 دخل الدورة دي راح فين', "🥧 Where this cycle's income went"), chartAlloc(D, h))
    + card(tr('🏷️ الدخل حسب التصنيف', '🏷️ Income by category'), hbars(D.incomeCats, C.blue, h, tr('لسه مفيش دخل متسجل.', 'No income recorded yet.')))
    + card(tr('🧾 المصروف حسب التصنيف', '🧾 Spending by category'), hbars(D.spendCats, C.orange, h, tr('لسه مفيش مصاريف متسجلة.', 'No expenses recorded yet.')));
}
