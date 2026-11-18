// i18n.js — تبديل اللغة: عربي (يمين لشمال) / English (left to right)
// الترجمة بتشتغل على النصوص الثابتة (التنقل، العناوين، الزراير). أي نص مش في القاموس بيفضل عربي.
const EN = {
  // التنقل والهيكل
  'فلوسي': 'Floosy', 'الرئيسية': 'Home', 'التحليلات': 'Analytics', 'تمام': 'OK', 'إلغاء': 'Cancel', 'رجوع': 'Back',
  'اكتب الرقم السري': 'Enter your PIN', 'بجيب الأسعار…': 'Loading prices…', 'محفوظ في data.json': 'Saved to data.json',
  // الهيرو
  'إجمالي اللي معاك': 'Total you have', 'الصافي بعد الدين': 'Net after debt', 'الصافي بكل عملة': 'Net in each currency', 'الإجمالي بكل عملة': 'Total in each currency',
  'الكل': 'All', 'دهب': 'Gold', 'القبض الجاي': 'Next payday', 'بداية الاستثمار': 'Investing starts', 'الهدف 50% أو أقل': 'Target: 50% or less',
  'مفيش مرتب': 'No salary', 'سجّل شغلك لو فيه': 'Register a job if you have one', 'مستحق دلوقتي': 'Due now', 'مفيش ديون': 'No debt', 'مفيش ديون ✅': 'No debt ✅',
  // البنود
  'الأساسيات': 'Essentials', 'النمو': 'Growth', 'الأمان': 'Safety', 'المتعة': 'Fun', 'الصدقة': 'Sadaqa',
  'صندوق الطوارئ': 'Emergency fund', 'حصّالة المتعة': 'Fun jar', 'مستنية تطلع': 'Waiting to be given', 'بيسدّ الكارد': 'Paying the card', 'استثمار': 'Investing',
  'مستني القبض': 'Waiting for payday', 'فاضية': 'Empty', 'كل الدخل': 'All income', 'ثابتة': 'Fixed',
  // عناوين الكروت
  'اعمل إيه دلوقتي': 'What to do now', '(اللي بيأكّلك مش اللي بيفشخرك)': '(needs, not ego)', 'المحافظ والعملات': 'Wallets & currencies',
  'مستوى المعيشة': 'Living level', 'محطات الأمان': 'Safety milestones', '(12 شهر لكل محطة)': '(12 months each)', 'الخروج والسفر': 'Outings & travel', '(حصّالة المتعة)': '(fun jar)',
  'الاستثمار (بند النمو)': 'Investing (growth bucket)', 'قواعد الفيديو': 'Rules from the video', 'المعاملات': 'Transactions',
  'عجز': 'Deficit', 'وضع الباقي': 'Leftover mode', 'النسب الأصلية': 'Original ratios', 'متوقع': 'Expected',
  // عناوين فرعية
  'أصول معاك': 'Assets you hold', 'المحطات': 'Milestones', 'جوّه الأمان فيه إيه': "What's inside Safety", 'سلّم المخاطرة من الفيديو': 'Risk ladder from the video',
  'هيتوزع كده أول ما ييجي': 'How it will be split on arrival', 'قايمة الـ 7 أيام': '7-day wait list', 'أول مرتب مش كامل عشان لسه بادئ': 'First salary is partial (you just started)',
  'حسبتك لحد يوم القبض وبعده': 'Your numbers until payday and after',
  // المصاريف
  'يوم': 'Day', 'شهر': 'Month', 'سنة': 'Year', 'النهارده': 'Today', 'الشهر ده': 'This month', 'السنة دي': 'This year',
  'ميزانية الشهر': 'Month budget', 'اتدفع لحد دلوقتي': 'Paid so far', 'فاضل': 'Left', 'زيادة عن الميزانية': 'Over budget',
  'أقصى حاجة تصرفها النهارده': 'Max to spend today', 'أقصى مصروف لليوم ده': 'Max for this day', 'اتصرف في اليوم ده': 'Spent that day',
  'ميزانية السنة لحد دلوقتي': 'Year budget so far', 'اتدفع في السنة': 'Paid this year', 'إجمالي الشهر الكامل': 'Full month total', 'أقل دخل يخلّيها 50%': 'Min income to make it 50%',
  // زراير الإضافة
  'بند جديد': 'New item', 'أصل (دهب أو عملة)': 'Asset (gold or currency)', 'مستوى جديد': 'New level', 'محطة جديدة': 'New milestone', 'هدف خروج': 'Outing goal',
  'سجّل شغل ومرتب': 'Register job & salary', 'سجّل المرتب دلوقتي': 'Record salary now', 'غيّر': 'Change', 'يدوي': 'Manual', 'أوتوماتيك': 'Automatic', 'جاي منين': 'Where from',
  // الشات
  'قبضت المرتب': 'Got my salary', 'جالي دخل جانبي': 'Got side income', 'صرفت': 'I spent', 'الدهب': 'Gold', 'يوم القبض': 'Payday', 'أعمل إيه دلوقتي؟': 'What should I do now?',
  'دخل جانبي': 'Side income', 'مرتب': 'Salary', 'مصروف': 'Expense', 'أساسيات': 'Essentials', 'متعة وخروج': 'Fun & outings', 'صدقة': 'Sadaqa', 'طوارئ من الأمان': 'Emergency from Safety',
  // التحليلات
  'أهم الأرقام': 'Key numbers', 'دخل الدورة': 'Cycle income', 'بعد الصدقة': 'After sadaqa', 'اتصرف': 'Spent', 'نسبة الادخار': 'Savings rate', 'الصافي': 'Net worth',
  'اللي معاك − الدين': 'What you have − debt', 'الخط الزمني المتوقع': 'Expected timeline', 'دين + أمان + استثمار': 'Debt + safety + investing',
  // حسبة القبض
  'مصاريفك في الأيام دي': 'Your expenses in these days', 'معاك ليها دلوقتي': 'You have for them now', 'لازم تجمّع على الأقل': 'You need to collect at least',
  'الشهر الجديد بعد المرتب': 'The new month after salary', 'مصاريف الشهر': 'Month expenses', 'هيفضل من المرتب': 'Left from salary',
  'المرتب مش مكفّي، محتاج للشهر الجديد': 'Salary is not enough; you need for the new month', 'مصاريفك متغطية ✅': 'Your expenses are covered ✅',
};
const ATTR = { 'اكتب هنا… مثال: 2000 أو 500 جنيه': 'Type here… e.g. 2000 or 500 EGP', 'التنقل': 'Navigation', 'الصوت': 'Sound', 'استيراد البيانات': 'Import data', 'تصدير البيانات': 'Export data', 'إظهار أو إخفاء الأرقام': 'Show or hide numbers', 'ابعت': 'Send', 'اكتب ردّك': 'Type your reply' };

let lang = 'ar';
try { lang = localStorage.getItem('floosy.lang') === 'en' ? 'en' : 'ar'; } catch { /* خاص أو ممنوع */ }
const orig = new WeakMap(); // النص العربي الأصلي لكل عقدة اتترجمت
const EDGE = /^([^\p{L}\p{N}(]*)([\s\S]*?)([^\p{L}\p{N})؟?%]*)$/u;

function trText(node) {
  if (node.parentElement?.closest('[contenteditable], [data-p], script, style')) return;
  const src = node.nodeValue; if (!src || !/[؀-ۿ]/.test(src)) return;
  const m = src.match(EDGE); if (!m) return;
  const en = EN[m[2].trim()];
  if (en) { orig.set(node, src); node.nodeValue = m[1] + en + m[3]; }
}
function walk(root) {
  if (root.nodeType === 3) return trText(root);
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) trText(n);
  for (const el of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')]) {
    for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute?.(a); if (v && ATTR[v]) { el.dataset['ar' + a.replace('-', '')] = v; el.setAttribute(a, ATTR[v]); } }
  }
}
function restore() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); }
  for (const el of document.querySelectorAll('[data-arplaceholder],[data-ararialabel],[data-artitle]')) {
    for (const [k, a] of [['arplaceholder', 'placeholder'], ['ararialabel', 'aria-label'], ['artitle', 'title']]) if (el.dataset[k]) { el.setAttribute(a, el.dataset[k]); delete el.dataset[k]; }
  }
}
const obs = new MutationObserver(list => {
  if (lang !== 'en') return;
  for (const m of list) {
    if (m.type === 'characterData') trText(m.target);
    else for (const n of m.addedNodes) walk(n);
  }
});

function apply() {
  const h = document.documentElement;
  h.lang = lang; h.dir = lang === 'en' ? 'ltr' : 'rtl';
  const b = document.querySelector('#lang'); if (b) { b.textContent = lang === 'en' ? 'عربي' : 'English'; b.title = lang === 'en' ? 'حوّل للعربي' : 'Switch to English'; }
  if (lang === 'en') walk(document.body); else restore();
}
export const getLang = () => lang;
/** نص بلغتين: L('عربي', 'English') */
export const L = (ar, en) => (lang === 'en' ? en : ar);
/** لغة التواريخ والأرقام */
export const LOC = () => (lang === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn');
/** عدّ بالإنجليزي: EN(1,'day') → "1 day"، EN(3,'day') → "3 days" */
export const EN_N = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ar';
  try { localStorage.setItem('floosy.lang', lang); } catch { /* مش مهم */ }
  apply();
}
export function initLang(onChange) {
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.querySelector('#lang')?.addEventListener('click', () => { setLang(lang === 'en' ? 'ar' : 'en'); onChange?.(lang); });
  apply();
}
