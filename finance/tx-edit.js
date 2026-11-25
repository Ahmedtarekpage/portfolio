// tx-edit.js — تعديل أو مسح معاملة من صفحة السجل، في شاشة منبثقة بنفس شكل الـ wizard.
// بيعدّل: التاريخ، المبلغ، سعر الصرف (لغير الدرهم)، الملاحظة، البند (للمصروف)، وللتحويل: اللي وصل والعمولة.
// الحاجات اللي ليها جرامات أو وحدات (دهب/استثمار) المبلغ فيها مقفول: امسحها واعملها تاني عشان الأرصدة تفضل مظبوطة.
// بيرجّع Promise: { op: 'save', patch } أو { op: 'del' } أو null لو اتقفل.
//
// deps: { L, fmt, esc, parseNum, CUR, B, sfx, today }

const BUCKETS = ['essentials', 'growth', 'stability', 'reward'];

export function txEditor(t, deps) {
  const { L, esc, parseNum, CUR, B, sfx } = deps;
  const c = t.cur || 'AED', sym = x => x === 'XAU' ? L('جم', 'g') : CUR[x]?.s ?? x;
  const gold = c === 'XAU' || t.to === 'XAU' || t.hold || t.toHold || t.units != null;
  const isX = t.type === 'transfer', isSpend = t.type === 'expense' || (!['income', 'transfer', 'debtpay', 'debtadj', 'invest', 'divest'].includes(t.type));
  const raw = v => v == null || v === '' ? '' : String(+(+v).toFixed(6));
  const TITLE = { income: L('💰 دخل', '💰 Income'), transfer: L('🔁 تحويل', '🔁 Transfer'), debtpay: L('💳 سداد دين', '💳 Debt payment'), debtadj: L('💳 تعديل على الدين', '💳 Debt adjustment'), invest: L('💼 استثمار', '💼 Investment'), divest: L('💼 بيع استثمار', '💼 Sold investment') }[t.type] || L('💸 مصروف', '💸 Expense');
  const field = (k, label, val, type = 'text', extra = '') => `<label class="te-f"><small>${label}</small><input data-te="${k}" type="${type}" ${type === 'text' && k !== 'note' ? 'inputmode="decimal" dir="ltr"' : ''} value="${esc(val)}" ${extra}></label>`;

  return new Promise(resolve => {
    const o = document.createElement('div');
    o.className = 'wiz'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    let bk = t.bucket || '', armed = false, armT = 0;
    const draw = () => {
      o.innerHTML = `<div class="wiz-card glass">
        <div class="wiz-top"><b>✏️ ${L('تعديل', 'Edit')} · ${TITLE}</b><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
        <div class="te-grid">
          ${field('date', L('📅 التاريخ', '📅 Date'), t.date, 'date', `max="${deps.today()}"`)}
          ${field('amount', `${L('💵 المبلغ', '💵 Amount')} (${sym(c)})`, raw(t.amount), 'text', gold ? 'disabled' : '')}
          ${c !== 'AED' && c !== 'XAU' && !isX ? field('rate', L(`💱 سعر الصرف (كام درهم للـ ${sym(c)})`, `💱 Rate (AED per ${sym(c)})`), raw(t.rate), 'text') : ''}
          ${isX ? field('toAmount', `${L('📥 اللي وصل', '📥 Arrived')} (${sym(t.to)})`, raw(t.toAmount), 'text', gold ? 'disabled' : '') : ''}
          ${isX ? field('fee', `${L('🧾 العمولة', '🧾 Fee')} (${sym(t.to)})`, raw(t.fee || 0), 'text') : ''}
          ${field('note', L('📝 ملاحظة', '📝 Note'), t.note || '')}
          ${isSpend ? field('desc', L('✍️ وصف (اختياري)', '✍️ Description (optional)'), t.desc || '') : ''}
        </div>
        ${isSpend && t.bucket ? `<p class="wiz-help">${L('من أنهي بند؟', 'From which bucket?')}</p>
          <div class="wiz-chips">${BUCKETS.map(k => `<button type="button" class="wiz-chip ${bk === k ? 'on' : ''}" data-bk="${k}">${B[k].i} ${B[k].n}</button>`).join('')}</div>` : ''}
        ${gold ? `<p class="wiz-note">🥇 ${L('المبالغ هنا مربوطة بجرامات أو وحدات، فمقفولة. لو غلط: امسحها واعملها تاني.', 'Amounts here are tied to grams or units, so they are locked. If wrong: delete it and redo it.')}</p>` : ''}
        ${deps.pair ? `<p class="wiz-note">🔗 ${L(`مربوطة بـ ${esc(deps.pair)}: الاتنين عملية واحدة، والمسح بيمسحهم مع بعض${gold || deps.pairGold ? ' ويرجّع الدهب' : ''}.`, `Linked to ${esc(deps.pair)}: both are one operation, and deleting removes both${gold || deps.pairGold ? ' and returns the gold' : ''}.`)}</p>` : ''}
        <div class="wiz-fb" aria-live="polite" hidden></div>
        <div class="wiz-nav"><button type="button" class="btn ghost te-del ${armed ? 'armed' : ''}" data-tdel>${armed ? L('متأكد؟ 🗑️ دوس تاني', 'Sure? 🗑️ Tap again') : L('🗑️ امسح', '🗑️ Delete')}</button>
          <button type="button" class="btn primary" data-tsave>${L('💾 احفظ التعديل', '💾 Save changes')}</button></div></div>`;
    };
    document.body.appendChild(o); draw();
    const close = v => { clearTimeout(armT); o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    const val = k => o.querySelector(`[data-te="${k}"]`)?.value;
    const err = msg => { const f = o.querySelector('.wiz-fb'); f.innerHTML = msg; f.hidden = false; sfx?.err?.(); const cd = o.querySelector('.wiz-card'); cd.classList.remove('shake'); void o.offsetWidth; cd.classList.add('shake'); };
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === o) close(null); return; }
      const d = b.dataset;
      if ('close' in d) return close(null);
      if (d.bk) { bk = d.bk; sfx?.select?.(); const keep = Object.fromEntries([...o.querySelectorAll('[data-te]')].map(i => [i.dataset.te, i.value])); draw(); for (const [k, v] of Object.entries(keep)) o.querySelector(`[data-te="${k}"]`).value = v; return; }
      if ('tdel' in d) {
        if (!armed) { armed = true; sfx?.warn?.(); b.classList.add('armed'); b.textContent = L('متأكد؟ 🗑️ دوس تاني', 'Sure? 🗑️ Tap again'); armT = setTimeout(() => { armed = false; if (b.isConnected) { b.classList.remove('armed'); b.textContent = L('🗑️ امسح', '🗑️ Delete'); } }, 4000); return; }
        return close({ op: 'del' });
      }
      if ('tsave' in d) {
        const patch = {}, date = val('date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return err(L('⚠️ اختار تاريخ صح.', '⚠️ Pick a valid date.'));
        if (date > deps.today()) return err(L('⚠️ التاريخ ما ينفعش يكون في المستقبل.', '⚠️ The date cannot be in the future.'));
        patch.date = date;
        if (!gold) {
          const a = parseNum(val('amount'));
          if (!(a > 0)) return err(L('⚠️ المبلغ لازم يكون أكبر من صفر.', '⚠️ The amount must be more than zero.'));
          patch.amount = a;
          if (isX) {
            const ta = parseNum(val('toAmount'));
            if (!(ta > 0)) return err(L('⚠️ اكتب اللي وصل.', '⚠️ Enter the amount that arrived.'));
            patch.toAmount = ta;
            // سعر السوق اتسجّل وقت التحويل: نفس السعر على المبلغ الجديد
            if (t.mkt != null && +t.amount > 0) patch.mkt = +t.mkt / +t.amount * a;
          }
        }
        if (isX) { const f = parseNum(val('fee') || '0'); patch.fee = f > 0 ? f : 0; }
        if (val('rate') != null) { const r = parseNum(val('rate')); if (!(r > 0)) return err(L('⚠️ سعر الصرف لازم يكون أكبر من صفر.', '⚠️ The rate must be more than zero.')); patch.rate = r; }
        patch.note = (val('note') || '').trim();
        if (isSpend) patch.desc = (val('desc') || '').trim().slice(0, 140);
        if (isSpend && t.bucket) patch.bucket = bk;
        return close({ op: 'save', patch });
      }
    });
  });
}
