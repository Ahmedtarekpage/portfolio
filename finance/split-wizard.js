// split-wizard.js — قبل ما أي دخل يتسجّل: شاشة منبثقة خطوة بخطوة بتوري كل جنيه/درهم رايح فين وليه،
// بحركة (العداد بيعدّ، الإيموجي بينط) وصوت وإفيه عشوائي من 50. كل خطوة: «تمام» أو «✏️ عدّل»، ورد فعل فوري.
// اللي بتشيله من بند بيروح للدين (أو الاستثمار لو مفيش دين)، واللي بتزوّده بيتاخد منه.
// في الآخر مراجعة و«✅ أيوه، سجّل». بيرجّع Promise: { ov } (مبالغ اتعدّلت بالدرهم، أو {}) أو null لو اتقفل.
//
// deps: { L, fmt, esc, parseNum, sfx, sym, k (وحدة لكل درهم), amount (بعملته), r (صف الدخل من replay), debtName, tx }

const AR = [
  'الفلوس نزلت يا معلّم 💸 قبل ما الدليفري يشم ريحتها، تعالى نوزّعها',
  'المرتب ده زي الضيف: لو ما خدتش بالك منه هيمشي من غير ما يسلّم 😅',
  'كل درهم ليه بيت، وإحنا هنوصّله لحد الباب 🏠',
  'خلّيك معايا خطوة خطوة… مش هنخلّي ولا قرش يتوه 🧭',
  'الأساسيات الأول، زي ما الأكل قبل الحلو 🍞',
  'الإيجار مش بيستنى، والأكل مش بيفاصل 😂',
  'الثلاجة بتتكلم: «اكفيني الأول» 🥶',
  'ده نصيب البيت… البيت اللي بيتشتكي من الأسعار 🏚️',
  'الفلوس الحرّة جت! بس بالراحة… مش هنعزم الحي كله 🎉',
  'شوية فرفشة مش هتموّتنا، الحرمان هو اللي بيموّت 😌',
  'خمسة في المية فلوس حرّة… يعني فنجان قهوة مش رحلة المالديف ☕',
  'الفلوس الحرّة حقك، بس الكارت بيبصلك من بعيد 👀',
  'الأمان ده المظلة… محدش بيفتكرها غير لما تمطر ☔',
  'صندوق الطوارئ: الصاحب اللي بيظهر وقت الزنقة 🛟',
  'الأمان كده تمام، شكرًا للدهب اللي قاعد ساكت 🥇',
  'لو العربية عطلت… الأمان هيرد عليها مش الكارت 🚗',
  'ENBD بيسلّم عليك… وإحنا بنرد السلام بفلوس 💳',
  'الدين ده زي البعوضة: صغير بس مزعّق. يلا نخلّص عليه 🦟',
  'كل درهم للدين = فوايد أقل = نوم أريح 😴',
  'الكارت عايز ياكل… بس المرة دي هناكله إحنا 🍽️',
  'فوايد 3% في الشهر؟ لأ يا حبيبي مش عندنا 🙅',
  'خطوة كمان والكارت يبطّل يتصل بيك 📵',
  'الاستثمار: فلوسك بتشتغل وهي نايمة 💤📈',
  'خلّي الفلوس تجيب فلوس… زي الأرانب بس أنضف 🐇',
  'صناديق المؤشرات: مش لازم تبقى عبقري، لازم تبقى صبور 🐢',
  'الصدقة واقفة عشان الدين… ربنا يسهّل وترجع قريب 🤲',
  'الصدقة بتطلع الأول، والبركة بتيجي بعدها 🤲✨',
  'إنت شخص واحد في بلدين… والحسبة واحدة 🇦🇪🇪🇬',
  'الجنيه والدرهم صحاب في الحسبة دي، كل واحد في محفظته 🤝',
  'لو مش عاجبك الرقم عدّله… بس ما تزعّلش الكارت 😏',
  'تعديل؟ تمام، بس افتكر: اللي بتشيله من هنا بيروح للدين 🔁',
  'متأكد؟ الأرقام دي بتحبك أكتر ما إنت فاكر 🫶',
  'هوب! الرقم اتظبط 👌',
  'عاش! كده الدنيا مترتبة 🙌',
  'بسيطة… الرياضيات النهارده في صفك ➗',
  'محاسب قانوني مستتر إنت 🧮😎',
  'لو أبوك شافك دلوقتي هيقول: «ابني اتعدل» 👨‍👦',
  'ده التنظيم اللي ماما كانت بتحلم بيه 🥹',
  'خطوة كمان ونخلّص… زي الماراثون بس قاعد 🏃',
  'الفلوس بتتوزّع أسرع من إشاعة في جروب العيلة 📱',
  'ولا قرش هيتسرق… حتى من إيدك إنت 😂',
  'قرار حكيم… أحكم من إنك تطلب دليفري الساعة 2 بالليل 🍕',
  'فلوسي شغال، وإنت كمان شغال، محدش نايم هنا ⚙️',
  'لو الفلوس ليها صوت، كانت دلوقتي بتقول «شكرًا» 🙏',
  'الدخل ده جه في وقته… زي الأتوبيس اللي عمره ما بيجي في وقته 🚌',
  'شهر محترم بيبدأ بقرار محترم 🎩',
  'مش بنصرف، إحنا بنستثمر في راحة البال 🧘',
  'الحساب مظبوط بالمليم… حتى الكالكوليتر انبهر 🤯',
  'خلصنا! الفلوس نامت في سريرها كل واحدة في مكانها 🛏️',
  'جاهز؟ دوسة واحدة والتوزيع يبقى رسمي ✅',
];
const EN = [
  'Money landed, boss 💸 before the delivery apps smell it, let\'s split it',
  'Salary is like a guest: ignore it and it leaves without saying bye 😅',
  'Every dirham gets a home, and we\'ll walk it to the door 🏠',
  'Stick with me step by step… not a single coin gets lost 🧭',
  'Essentials first, like dinner before dessert 🍞',
  'Rent doesn\'t wait, and food doesn\'t haggle 😂',
  'The fridge says: "feed me first" 🥶',
  'This is the home\'s share… the home that complains about prices 🏚️',
  'Fun free money is here! Easy though… we\'re not treating the whole street 🎉',
  'A little fun won\'t kill us; going without it will 😌',
  'Five percent fun… a coffee, not the Maldives ☕',
  'Fun free money is your right, but the card is watching from afar 👀',
  'Safety is the umbrella… nobody remembers it until it rains ☔',
  'The emergency fund: the friend who shows up when it\'s tight 🛟',
  'Safety is fine, thanks to the gold sitting quietly 🥇',
  'If the car breaks down… Safety answers, not the card 🚗',
  'ENBD says hi… we reply with money 💳',
  'This debt is like a mosquito: small but loud. Let\'s finish it 🦟',
  'Every dirham to the debt = less interest = better sleep 😴',
  'The card wants to eat… this time we eat it 🍽️',
  '3% interest a month? Not on our watch 🙅',
  'One more step and the card stops calling you 📵',
  'Investing: your money works while you sleep 💤📈',
  'Let money make money… like rabbits, but cleaner 🐇',
  'Index funds: you don\'t need to be a genius, just patient 🐢',
  'Sadaqa is paused for the debt… may it come back soon 🤲',
  'Sadaqa comes off the top, and the blessing comes after 🤲✨',
  'One person, two countries… one calculation 🇦🇪🇪🇬',
  'Pounds and dirhams are friends here, each in its own wallet 🤝',
  'Don\'t like the number? Edit it… just don\'t upset the card 😏',
  'Editing? Fine, but remember: what you take from here goes to the debt 🔁',
  'Sure? These numbers love you more than you think 🫶',
  'Hop! Number adjusted 👌',
  'Nice! Everything\'s in order 🙌',
  'Easy… math is on your side today ➗',
  'A secret accountant, you are 🧮😎',
  'If your dad saw you now he\'d say "my boy grew up" 👨‍👦',
  'This is the organisation mum dreamed of 🥹',
  'One more step and we\'re done… a marathon, sitting down 🏃',
  'Money spreads faster than gossip in the family group 📱',
  'Not a coin gets stolen… not even by you 😂',
  'Wise call… wiser than ordering delivery at 2 a.m. 🍕',
  'Floosy is working, you\'re working, nobody sleeps here ⚙️',
  'If money could talk, it would be saying "thank you" 🙏',
  'This income came on time… unlike the bus 🚌',
  'A respectable month starts with a respectable decision 🎩',
  'We\'re not spending, we\'re investing in peace of mind 🧘',
  'Accurate to the fils… even the calculator is impressed 🤯',
  'Done! Every coin is tucked into its own bed 🛏️',
  'Ready? One tap and the split is official ✅',
];

export function splitWizard(deps) {
  const { L, fmt, esc, parseNum, sfx, sym, k, r, debtName } = deps;
  const jokes = L(AR, EN), used = new Set();
  const joke = () => { let i; do { i = Math.floor(Math.random() * jokes.length); } while (used.has(i) && used.size < jokes.length); used.add(i); return jokes[i]; };
  const v = x => x * k; // درهم ← عملة الدخل
  const debtOn = r.debtOn;
  // القيم اللي تتعدّل (بالدرهم) والباقي بيروح للنمو (الدين أو الاستثمار)
  const val = { essentials: r.d.essentials, reward: r.d.reward, stability: r.d.stability };
  const sink = () => Math.max(0, r.net - val.essentials - val.reward - val.stability);
  const split = () => { const s = sink(), dp = Math.min(s, r.debtPay + r.debtAfter); return { debt: debtOn || r.debtPay > 0.005 ? dp : 0, invest: s - (debtOn || r.debtPay > 0.005 ? dp : 0) }; };
  const m = x => `<b dir="ltr">${fmt(v(x), 2)} ${sym}</b>`;

  // تفاصيل الحسبة: كل صف [اسم، قيمة، مهم؟، معادلة (ltr)، تفاصيل لما تدوس عليه] بعملة الدخل
  const n = x => `${fmt(v(x), 2)} ${sym}`, pc = x => `${fmt(x, 2)}%`, d0 = x => fmt(v(x), 2);
  const vid = r.video || { growth: 0, stability: 0, reward: 0 };
  const items = deps.items || [], held = deps.held || [], debtsL = deps.debts || [];
  const tbl = (rows, foot) => `<table class="sw-t">${rows.map(([a, b, c]) => `<tr><td>${a}</td><td dir="ltr">${b}</td>${c != null ? `<td class="mu">${c}</td>` : ''}</tr>`).join('')}${foot ? `<tr class="ft"><td>${foot[0]}</td><td dir="ltr">${foot[1]}</td></tr>` : ''}</table>`;
  const itemRows = key => tbl(items.map(x => [`${x.icon || '•'} ${esc(x.name)}`, x[key] > 0.005 ? n(x[key]) : '0', x[key + 'Pre'] ? L('مدفوع مقدّم', 'prepaid') : x.loc ? L('حسب مكانكم', 'by location') : '']), [L('المجموع', 'Total'), n(items.reduce((a, x) => a + x[key], 0))]);
  // أول دورة: كل بند بالأيام اللي فاضلة أو كامل (حسب اختيارك في كارت الأساسيات)
  const firstRows = () => tbl(items.map(x => [`${x.icon || '•'} ${esc(x.name)}`, x.now > 0.005 ? n(x.nowEff) : '0', x.nowPre ? L('مدفوع مقدّم', 'prepaid') : x.full1 ? L('💯 كامل', '💯 in full') : `📆 ${d0(x.now)} × ${r.cycLeft}/${r.cycDays}`]), [L('المجموع', 'Total'), n(items.reduce((a, x) => a + (x.nowEff || 0), 0))]);
  const essCalc = () => [
    [L('أساسيات الدورة دي', "This cycle's essentials"), n(r.E), 0, r.f < 1 ? `${d0(r.Efull - r.Efull1)} ÷ ${r.cycDays} × ${r.cycLeft}${r.Efull1 > 0.005 ? ` + ${d0(r.Efull1)}` : ''} = ${d0(r.E)}` : '',
      r.f < 1 ? `<p>${L(`أول دورة ليك (${r.cycLeft} يوم من ${r.cycDays}): كل بند بالأيام اللي فاضلة، إلا اللي معلّم «💯 كامل»:`, `Your first cycle (${r.cycLeft} of ${r.cycDays} days): each item by the days left, except the ones marked “💯 in full”:`)}</p>${firstRows()}<p>${L('تقدر تغيّر أي بند من كارت الأساسيات (📆 بالأيام / 💯 كامل).', 'You can change any item from the Essentials card (📆 by days / 💯 in full).')}</p>`
        : `<p>${L('كل بنود البلدين بالدرهم:', 'Every item in both countries, in AED:')}</p>${itemRows('now')}`],
    ...(debtOn ? [
      [L('الدورة الجاية كلها', 'The whole next cycle'), n(r.nextFull), 0, '', `<p>${L('نفس البنود في الدورة الجاية (المدفوع مقدّم بيتحسب صفر لحد ما مدته تخلص):', 'The same items next cycle (prepaid ones count as zero until they run out):')}</p>${itemRows('next')}`],
      [L('أول 10 أيام منها', 'Its first 10 days'), n(r.Enext), 0, `${d0(r.nextFull)} ÷ ${r.nextDays} × 10 = ${d0(r.Enext)}`, `<p>${L('عليك دين، فبنحجز أول 10 أيام من الدورة الجاية، عشان لو الدخل اتأخر ما ترجعش تستلف على الكارت.', 'You have debt, so we hold the first 10 days of the next cycle, so a late income never pushes you back onto the card.')}</p>`],
    ] : []),
    [L('الهدف', 'Target'), n(r.target), 1, debtOn ? `${d0(r.E)} + ${d0(r.Enext)} = ${d0(r.target)}` : '', `<p>${debtOn ? L('الدورة دي + أول 10 أيام من الجاية.', 'This cycle + the first 10 days of the next.') : L('من غير دين: الدورة دي بس، وأي زيادة بتروح للأمان.', 'Without debt: this cycle only, and any extra goes to Safety.')}</p>`],
    [L('معاك فيها قبل الدخل ده', 'Already in it before this income'), n(r.held), 0, '', held.length ? `<p>${L('جات منين:', 'Where it came from:')}</p>${tbl(held.map(x => [x.label, n(x.aed), x.date || '']), [L('المجموع', 'Total'), n(r.held)])}` : `<p>${L('مفيش فلوس اتحطت للأساسيات الدورة دي لسه.', 'Nothing was put into Essentials this cycle yet.')}</p>`],
    [L('الناقص', 'Missing'), n(Math.max(0, r.target - r.held)), 1, `${d0(r.target)} − ${d0(r.held)} = ${d0(Math.max(0, r.target - r.held))}`, ''],
    [L('الأساسيات بتاخد', 'Essentials take'), n(val.essentials), 1, `min(${d0(Math.max(0, r.target - r.held))}, ${d0(r.net)}) = ${d0(val.essentials)}`, `<p>${L('بتاخد الناقص بس. ولو الدخل أقل من الناقص، بتاخده كله والباقي يتكمّل من الدخل الجاي.', 'It takes only what is missing. If the income is smaller than that, it takes all of it and the next income tops up the rest.')}</p>`],
  ];
  const restAfterEss = () => Math.max(0, r.net - val.essentials);
  const steps = [];
  steps.push({ key: 'intro', icon: '💰', title: L('جالك فلوس!', 'Money came in!'), amt: () => r.aed,
    calc: () => [[L('المبلغ', 'Amount'), n(r.aed), 1, '', `<p>${esc(deps.tx.note || '')} · ${deps.tx.date}</p>`],
      ...(k !== 1 ? [[L('سعر الصرف', 'Exchange rate'), `1 ${sym} = ${fmt(r.r, 4)} Đ`, 0, '', `<p>${L('سعر السوق النهارده. كل الحسابات بتتعمل بالدرهم، والفلوس نفسها بتفضل بعملتها.', "Today's market rate. All the maths is done in AED, while the money itself stays in its own currency.")}</p>`]] : []),
      [L('الصدقة', 'Sadaqa'), `− ${n(r.sadaqa)}`, 0, '', ''], [L('اللي هيتوزّع', 'To split'), n(r.net), 1, `${d0(r.aed)} − ${d0(r.sadaqa)} = ${d0(r.net)}`, ''],
      [L('الدين دلوقتي', 'Debt now'), `${fmt(r.debtBefore, 2)} Đ`, 0, '', debtsL.length ? tbl(debtsL.map(x => [esc(x.name), `${fmt(x.left, 2)} Đ`])) : '']],
    why: () => L(`هنوزّع ${m(r.aed)} خطوة بخطوة، وكل خطوة توافق عليها أو تعدّلها.`, `We'll split ${m(r.aed)} step by step, and you accept or edit each one.`) });
  steps.push({ key: 'sadaqa', icon: '🤲', title: L('الصدقة', 'Sadaqa'), amt: () => r.sadaqa,
    calc: () => r.sadPaused ? [[L('الدين', 'Debt'), `${fmt(r.debtBefore, 2)} Đ`], [L('الحد اللي الصدقة بتقف بعده', 'Limit above which it pauses'), '100 Đ'], [L('الصدقة', 'Sadaqa'), L('صفر (واقفة)', 'zero (paused)'), 1, '', `<p>${L('سداد الدين أولى من صدقة التطوّع (اختيارك). بترجع لوحدها أول ما الدين يقل عن 100 درهم.', 'Paying a debt comes before voluntary charity (your choice). It comes back by itself once the debt drops below 100 AED.')}</p>`]]
      : [[L('النسبة', 'Rate'), pc(deps.tx.sad || 0)], [L('الصدقة', 'Sadaqa'), n(r.sadaqa), 1, `${d0(r.aed)} × ${fmt(deps.tx.sad || 0, 2)}% = ${d0(r.sadaqa)}`, '']],
    why: () => r.sadPaused ? L('واقفة لأن عليك دين أكبر من 100 درهم.', 'Paused because you owe more than 100 AED.')
      : r.sadaqa > 0.005 ? L(`بتطلع الأول من أي دخل.`, `Comes off the top of any income.`) : L('مفيش نسبة صدقة متحددة.', 'No sadaqa percentage is set.') });
  steps.push({ key: 'essentials', edit: true, icon: '🍞', title: L('الأساسيات', 'Essentials'), amt: () => val.essentials, calc: essCalc,
    why: () => debtOn ? L('عليك دين، فالأساسيات بتغطي الدورة دي + أول 10 أيام من الجاية، وبتاخد الناقص بس.', 'You have debt, so Essentials cover this cycle + the first 10 days of the next, taking only what is missing.')
      : L('الأساسيات بتغطي الدورة دي، وبتاخد الناقص بس.', 'Essentials cover this cycle, taking only what is missing.') });
  if (r.moved > 0.5) steps.push({ key: 'moved', icon: '🛟', title: L('زيادة الأساسيات ← الأمان', 'Extra essentials → Safety'), amt: () => r.moved,
    calc: () => [[L('معاك في الأساسيات', 'In Essentials'), n(r.held + val.essentials)], [L('أساسيات الدورة دي', "This cycle's essentials"), n(r.target)], [L('الزيادة ← الأمان', 'Extra → Safety'), n(r.moved), 1, `${d0(r.held + val.essentials)} − ${d0(r.target)} = ${d0(r.moved)}`, '']],
    why: () => L('مفيش دين، والأساسيات فيها أكتر من الدورة دي، فالزيادة بتروح للأمان لوحدها.', 'No debt, and Essentials hold more than this cycle needs, so the extra goes to Safety by itself.') });
  steps.push({ key: 'reward', edit: true, icon: '🎉', title: L('الفلوس الحرّة', 'Fun free money'), amt: () => val.reward,
    calc: () => debtOn ? [[L('اللي فاضل بعد الأساسيات', 'Left after Essentials'), n(restAfterEss()), 0, `${d0(r.net)} − ${d0(val.essentials)} = ${d0(restAfterEss())}`, ''], [L('2.5% من الدخل', '2.5% of income'), n(r.net * 0.025), 0, `${d0(r.net)} × 2.5% = ${d0(r.net * 0.025)}`, `<p>${L('وعليك دين الفلوس الحرّة بتنزل من نصيب الفيديو لـ2.5% بس، عشان ما تقفش خالص.', "While in debt, Fun free money drops from the video's share to only 2.5%, so it never stops completely.")}</p>`], [L('الفلوس الحرّة', 'Fun free money'), n(Math.min(restAfterEss(), r.net * 0.025)), 1, `min(${d0(restAfterEss())}, ${d0(r.net * 0.025)})`, ''], ...(Math.abs(val.reward - r.d.reward) > 0.005 ? [[L('✏️ إنت عدّلتها لـ', '✏️ You set it to'), n(val.reward), 1]] : [])]
      : [[L('اللي فاضل بعد الأساسيات', 'Left after Essentials'), n(r.rest ?? restAfterEss())], [L('الفلوس الحرّة', 'Fun free money'), n(vid.reward), 1, vid.mode === 'B' ? `${d0(r.rest ?? restAfterEss())} × 20%` : `${d0(r.net)} × 10%`, `<p>${vid.mode === 'B' ? L('أساسياتك أكبر من نص الدخل، فالباقي بيتقسم بنسب الفيديو 25 : 15 : 10، يعني الفلوس الحرّة 20% منه.', "Your essentials are more than half of income, so the rest splits by the video's 25 : 15 : 10, which gives Fun free money 20% of it.") : L('أساسياتك نص الدخل أو أقل، فالفلوس الحرّة 10% من الدخل زي الفيديو.', 'Your essentials are half of income or less, so Fun free money is 10% of income, as in the video.')}</p>`]],
    why: () => debtOn ? L('عليك دين، فالفلوس الحرّة 2.5% بس من الدخل، من اللي فاضل بعد الأساسيات.', "You have debt, so Fun free money gets only 2.5% of income, from what's left after Essentials.")
      : L('نصيب الفلوس الحرّة بنسب الفيديو.', "Fun free money's share by the video's ratios.") });
  steps.push({ key: 'stability', edit: true, icon: '🛟', title: L('الأمان', 'Safety'), amt: () => val.stability,
    calc: () => debtOn ? [[L('نصيبه بنسب الفيديو', "Its share by the video's ratios"), n(vid.stability)], [L('بيروح للدين', 'Goes to the debt'), n(vid.stability), 0, '', `<p>${L('الأساسيات ماسكة الدورة دي + 10 أيام، فمفيش داعي نحوّش أمان والكارت بياكل 3% في الشهر.', 'Essentials already hold this cycle + 10 days, so there is no point saving into Safety while the card eats 3% a month.')}</p>`], [L('الأمان', 'Safety'), n(val.stability), 1]]
      : [[L('نصيبه بنسب الفيديو', "Its share by the video's ratios"), n(vid.stability), 0, vid.mode === 'B' ? `${d0(r.rest ?? restAfterEss())} × 30%` : `${d0(r.net)} × 15%`, ''], [L('معاك في الأمان', 'In Safety now'), n(r.stabBefore)], [L('هدف 5 شهور', '5-month target'), r.capped ? L('وصل ✅', 'Reached ✅') : L('لسه', 'Not yet'), 0, '', `<p>${L('5 شهور × أغلى وضع ليك ولمراتك (بكل البنود كاملة). لما يوصل، نصيب الأمان بيروح للاستثمار.', 'Five months × the most expensive situation for you and your wife (every item in full). Once reached, Safety’s share goes to investing.')}</p>`], [L('الأمان', 'Safety'), n(val.stability), 1]],
    why: () => debtOn ? L('عليك دين، فنصيب الأمان كله بيروح للدين.', "You have debt, so all of Safety's share goes to the debt.")
      : r.capped ? L('الأمان وصل 5 شهور، فنصيبه رايح للاستثمار.', 'Safety reached 5 months, so its share goes to investing.') : L('نصيب الأمان بنسب الفيديو.', "Safety's share by the video's ratios.") });
  steps.push({ key: 'debt', icon: '💳', title: esc(debtName), amt: () => split().debt, skip: () => split().debt < 0.005 && !debtOn,
    calc: () => [[L('الباقي للدين', 'Left for the debt'), n(sink()), 0, `${d0(r.net)} − ${d0(val.essentials)} − ${d0(val.reward)} − ${d0(val.stability)} = ${d0(sink())}`, ''], [L('الدين قبل الدخل ده', 'Debt before this income'), `${fmt(r.debtBefore, 2)} Đ`, 0, '', debtsL.length ? `<p>${L('بيتسدّ بالترتيب، الأول في القايمة الأول:', 'Paid in order, first in the list first:')}</p>${tbl(debtsL.map((x, j) => [`${j + 1}. ${esc(x.name)}`, `${fmt(x.left, 2)} Đ`]))}` : ''], [L('للدين', 'To the debt'), n(split().debt), 1], [L('الدين بعده', 'Debt after'), `${fmt(Math.max(0, r.debtBefore - split().debt), 2)} Đ`, 1, `${fmt(r.debtBefore, 2)} − ${fmt(split().debt, 2)}`, '']],
    why: () => L('كل اللي فاضل بيسدّ الدين.', 'Everything left pays off the debt.') });
  steps.push({ key: 'invest', icon: '📈', title: L('الاستثمار', 'Investing'), amt: () => split().invest, skip: () => split().invest < 0.005 && debtOn,
    calc: () => [[L('الباقي', 'Left'), n(sink())], [L('− الدين', '− Debt'), n(split().debt)], [L('للاستثمار', 'To investing'), n(split().invest), 1]],
    why: () => debtOn ? L('الدين خلص بالدخل ده، فالزيادة بتروح للاستثمار 🎉', 'This income finishes the debt, so the extra goes to investing 🎉') : L('نصيب النمو بيروح للاستثمار.', "Growth's share goes to investing.") });
  steps.push({ key: 'review', icon: '🧾', title: L('الشيت النهائي', 'Final sheet'), amt: () => r.aed });

  return new Promise(resolve => {
    let i = 0, editing = false, flash = '';
    // ⚡ سريع (الأرقام بس) أو 🔍 بالتفصيل (المعادلات + دوس على أي سطر يفتح التفاصيل). بيتفتكر.
    let det = false; try { det = localStorage.getItem('floosy.swmode') === 'det'; } catch {}
    const calcHTML = rows => `<ul class="sw-calc ${det ? 'det' : ''}">${rows.map(([a, b, st, f, more], j) => {
      const has = det && more;
      return `<li class="${st ? 'st' : ''} ${has ? 'has' : ''}"><${has ? `button type="button" data-more="${j}"` : 'div'} class="sw-line"><span class="sw-l">${a}${det && f ? `<small class="sw-f" dir="ltr">${f}</small>` : ''}</span><b dir="ltr">${b}</b>${has ? '<i class="sw-chev">‹</i>' : ''}</${has ? 'button' : 'div'}>${has ? `<div class="sw-more"><div>${more}</div></div>` : ''}</li>`;
    }).join('')}</ul>`;
    // الشيت النهائي: كل بند، مبلغه، نسبته من الدخل، وليه
    const sheet = () => {
      const why = { sadaqa: r.sadPaused ? L('واقفة (عليك دين)', 'Paused (debt)') : L('من الأول', 'Off the top'), essentials: debtOn ? L('الدورة دي + 10 أيام', 'This cycle + 10 days') : L('الدورة دي', 'This cycle'), moved: L('زيادة الأساسيات', 'Extra essentials'),
        reward: debtOn ? '2.5%' : L('نسب الفيديو', "Video's ratios"), stability: debtOn ? L('صفر وقت الدين', 'Zero while in debt') : L('نسب الفيديو', "Video's ratios"), debt: L('كل الباقي', 'Everything left'), invest: L('اللي بعد الدين', 'After the debt') };
      const list = [['sadaqa', '🤲', L('الصدقة', 'Sadaqa'), r.sadaqa], ['essentials', '🍞', L('الأساسيات', 'Essentials'), val.essentials], ...(r.moved > 0.5 ? [['moved', '🛟', L('زيادة ← الأمان', 'Extra → Safety'), r.moved]] : []), ['reward', '🎉', L('الفلوس الحرّة', 'Fun free money'), val.reward], ['stability', '🛟', L('الأمان', 'Safety'), val.stability], ['debt', '💳', esc(debtName), split().debt], ['invest', '📈', L('الاستثمار', 'Investing'), split().invest]];
      const ed = ov();
      return `<div class="sw-sheet"><div class="sw-sh-top"><b>🧾 ${esc(deps.tx.note || L('دخل', 'Income'))}</b><small>${deps.tx.date}</small><b dir="ltr" class="big">${n(r.aed)}</b></div>
        <table class="sw-t sheet"><tr class="hd"><td>${L('البند', 'Bucket')}</td><td>${L('المبلغ', 'Amount')}</td><td>%</td>${det ? `<td>${L('ليه', 'Why')}</td>` : ''}</tr>
        ${list.map(([kk, ic, nm, x]) => `<tr class="${x > 0.005 ? '' : 'zero'}"><td>${ic} ${nm}${ed[kk] != null ? ' ✏️' : ''}</td><td dir="ltr">${d0(x)}</td><td dir="ltr">${fmt(r.aed ? x / r.aed * 100 : 0, 1)}%</td>${det ? `<td class="mu">${why[kk]}</td>` : ''}</tr>`).join('')}
        <tr class="ft"><td>${L('المجموع', 'Total')}</td><td dir="ltr">${d0(list.reduce((a, x) => a + x[3], 0))}</td><td dir="ltr">100%</td>${det ? '<td></td>' : ''}</tr></table>
        ${det ? `<p class="mu">${L(`الدين بعد الدخل ده: ${fmt(Math.max(0, r.debtBefore - split().debt), 2)} Đ`, `Debt after this income: ${fmt(Math.max(0, r.debtBefore - split().debt), 2)} Đ`)}</p>` : ''}</div>`;
    };
    const live = () => steps.filter(s => !s.skip?.());
    const o = document.createElement('div');
    o.className = 'wiz sw'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    document.body.appendChild(o); sfx?.open?.();
    const close = res => { o.classList.add('out'); setTimeout(() => o.remove(), 220); document.removeEventListener('keydown', onKey); resolve(res); };
    const onKey = e => { if (e.key === 'Escape') close(null); else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveEdit(); } };
    document.addEventListener('keydown', onKey);
    const countUp = (el, to) => {
      const t0 = performance.now(), dur = 650, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const tick = t => { const p = reduce ? 1 : Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(to * e, 2); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    const rows = () => [['🤲', L('الصدقة', 'Sadaqa'), r.sadaqa], ['🍞', L('الأساسيات', 'Essentials'), val.essentials + 0], ...(r.moved > 0.5 ? [['🛟', L('زيادة ← الأمان', 'Extra → Safety'), r.moved]] : []), ['🎉', L('الفلوس الحرّة', 'Fun free money'), val.reward], ['🛟', L('الأمان', 'Safety'), val.stability], ['💳', esc(debtName), split().debt], ['📈', L('الاستثمار', 'Investing'), split().invest]].filter(x => x[2] > 0.005);
    const draw = (dir = 1) => {
      const L_ = live(); i = Math.min(i, L_.length - 1);
      const s = L_[i], last = i === L_.length - 1, a = s.amt();
      o.innerHTML = `<div class="wiz-card glass">
        <div class="wiz-top"><b>💰 ${L('توزيع الدخل', 'Splitting your income')}</b><span class="sw-mode" role="group"><button type="button" data-mode="q" class="${det ? '' : 'on'}">⚡ ${L('سريع', 'Quick')}</button><button type="button" data-mode="det" class="${det ? 'on' : ''}">🔍 ${L('بالتفصيل', 'Detailed')}</button></span><button type="button" class="wiz-x" data-close aria-label="${L('اقفل', 'Close')}">✕</button></div>
        <div class="wiz-prog"><i style="width:${((i + 1) / L_.length * 100).toFixed(1)}%"></i></div>
        <small class="wiz-n">${L(`خطوة ${i + 1} من ${L_.length}`, `Step ${i + 1} of ${L_.length}`)}</small>
        <div class="wiz-step ${dir > 0 ? 'fwd' : 'back'}">
          ${s.key === 'review' ? `<h3>🧾 ${L('الشيت النهائي', 'Final sheet')}</h3>${sheet()}
            <p class="wiz-help">${Object.keys(ov()).length ? L('✏️ فيه أرقام إنت عدّلتها، وهتتسجّل زي ما هي.', '✏️ Some amounts were edited by you and will be saved as they are.') : L('كله ماشي بالقواعد.', 'Everything follows the rules.')}</p>`
          : `<div class="sw-hero"><span class="sw-ic">${s.icon}</span><h3>${s.title}</h3>
            <div class="sw-amt"><b dir="ltr"><span data-cnt>0</span> ${sym}</b></div></div>
            <p class="wiz-help">${s.why()}</p>
            ${s.calc ? calcHTML(s.calc()) : ''}${det && s.calc?.().some(x => x[4]) ? `<small class="sw-tip">👆 ${L('دوس على أي سطر فيه ‹ عشان تشوف التفاصيل', 'Tap any row with ‹ to see the details')}</small>` : ''}
            ${editing && s.edit ? `<label class="te-f"><small>${L('المبلغ الجديد', 'New amount')} (${sym})</small><input data-sw type="text" inputmode="decimal" dir="ltr" value="${(+v(a).toFixed(2))}"></label>` : ''}`}
          <p class="sw-joke">🎭 ${joke()}</p>
        </div>
        <div class="wiz-fb" aria-live="polite" ${flash ? '' : 'hidden'}>${flash}</div>
        <div class="wiz-nav">${i ? `<button type="button" class="btn ghost" data-back>${L('→ رجوع', '← Back')}</button>` : '<span></span>'}
          <span class="sw-btns">${s.edit && !editing ? `<button type="button" class="btn ghost" data-edit>✏️ ${L('عدّل', 'Edit')}</button>` : ''}
          ${editing ? `<button type="button" class="btn ghost" data-cancel-ed>${L('إلغاء', 'Cancel')}</button><button type="button" class="btn primary" data-ok>💾 ${L('ظبّط', 'Apply')}</button>` : `<button type="button" class="btn primary" data-next>${last ? L('✅ أيوه، سجّل', '✅ Yes, save it') : L('👍 تمام', '👍 OK')}</button>`}</span></div></div>`;
      flash = '';
      const cnt = o.querySelector('[data-cnt]'); if (cnt) countUp(cnt, v(a));
      if (s.key !== 'intro' && s.key !== 'review' && a > 0.005) sfx?.coin?.();
      o.querySelector('input')?.focus();
    };
    const ov = () => Object.fromEntries(Object.entries(val).filter(([kk, x]) => Math.abs(x - r.d[kk]) > 0.005));
    const saveEdit = () => {
      const s = live()[i], inp = o.querySelector('[data-sw]'); if (!inp) return;
      const n = parseNum(inp.value), old = val[s.key];
      const room = r.net - (val.essentials + val.reward + val.stability - old);
      if (!(n >= 0)) { flash = L('⚠️ اكتب رقم صح.', '⚠️ Enter a valid number.'); sfx?.err?.(); return draw(0); }
      if (n / k > room + 0.005) { flash = L(`⚠️ أقصى حاجة ${fmt(v(room), 2)} ${sym}، لأن ده كل اللي فاضل من الدخل.`, `⚠️ The most is ${fmt(v(room), 2)} ${sym}, because that's all that's left of the income.`); sfx?.err?.(); return draw(0); }
      val[s.key] = n / k; editing = false;
      const diff = val[s.key] - old, to = split().debt > 0.005 || debtOn ? esc(debtName) : L('الاستثمار', 'investing');
      flash = Math.abs(diff) < 0.005 ? L('👌 ما اتغيّرش حاجة.', '👌 Nothing changed.')
        : diff > 0 ? L(`✏️ زوّدت ${fmt(v(diff), 2)} ${sym}، اتاخدوا من ${to}.`, `✏️ You added ${fmt(v(diff), 2)} ${sym}, taken from ${to}.`)
          : L(`✏️ شلت ${fmt(v(-diff), 2)} ${sym}، راحوا لـ${to}.`, `✏️ You removed ${fmt(v(-diff), 2)} ${sym}, sent to ${to}.`);
      sfx?.edit?.(); draw(0);
    };
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === o) close(null); return; }
      const d = b.dataset;
      if ('close' in d) return close(null);
      if (d.mode) { det = d.mode === 'det'; try { localStorage.setItem('floosy.swmode', det ? 'det' : 'q'); } catch {} sfx?.select?.(); return draw(0); }
      if (d.more != null) { const li = b.closest('li'); li.classList.toggle('open'); (li.classList.contains('open') ? sfx?.step : sfx?.back)?.(); return; }
      if ('back' in d) { editing = false; i--; return draw(-1); }
      if ('edit' in d) { editing = true; return draw(0); }
      if ('ok' in d) return saveEdit();
      if ('cancelEd' in d) { editing = false; return draw(0); }
      if ('next' in d) {
        if (i === live().length - 1) return close({ ov: ov() });
        flash = pick2(L(['👍 تمام!', '✅ ماشي', '🙌 حلو', '👌 كده تمام'], ['👍 OK!', '✅ Done', '🙌 Nice', '👌 Good']));
        sfx?.step?.(); i++; return draw(1);
      }
    });
    const pick2 = a => a[Math.floor(Math.random() * a.length)];
    draw(1);
  });
}
