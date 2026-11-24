// content.js — الكلام: 50 رد مصري + سلّم المخاطرة + خطوات الفيديو

import { getLang } from './i18n.js';

const AR_JOKES = {
  income: [
    'يا باشا الفلوس جت 💸 ماتبصّش على طلبات دلوقتي',
    'ما شاء الله 🧿 بس الكارد أولى من الكشري',
    'إيه الحلاوة دي 😍 كده مراتك تحضّر الشنطة',
    'فلوس! 🤑 خبّيها قبل ما تشوفها عينك التانية',
    'ربنا يزيدك 🙌 ومتزودش في الدليفري',
    'عاش يا وحش 🦁 الدرهم على الدرهم يبني برج',
    'الله عليك 👏 كده البنك هيبدأ يحترمنا',
    'دي فلوس ولا حلم؟ 😴💰 اقرصني',
    'يا مسهّل 😎 حتة للكارد وحتة للأمان وحتة ندلّع بيها',
    'إنت كده بقيت رجل أعمال رسمي 🕴️',
    'الجنيه بيحبك والدرهم كمان 💚',
    'أيوه كده 🔥 اللي ييجي يتقسّم قبل ما يتبخّر',
    'مبروك 🎉 بس متعزمش الشلة كلها',
    'حلو أوي 😌 الكارد بيعيّط من الفرحة',
    'خمسة وخميسة 🖐️ ربنا يحفظ',
    'الفلوس دي ريحتها حلوة 👃💵',
    'تمام يا ريّس ⚓ المركب ماشية',
  ],
  spend: [
    'ماشي يا عم 🙄 بس دي آخر مرة النهارده',
    'صرفت؟ 😏 قول الحمد لله إنها جت على قد كده',
    'الدليفري تاني؟ 🍔 المطبخ زعلان منك',
    'اتسجّلت ✍️ ومحدش هيقول لمراتك',
    'يا راجل! 😳 ده إحنا لسه أول الشهر',
    'عادي بتحصل 🤷 بس خلّي بالك من الحنفية',
    'القرش الأبيض ينفع في اليوم الإسود ⚪⚫ فاكر؟',
    'حلال عليك 😋 بس الأمان مستني نصيبه',
    'الميزانية بتبصّلي بصّة وحشة 👀',
    'اتخصمت ✂️ والدنيا لسه بخير',
    'إنت بتصرف وأنا بحسب 🧮 شغلانة يعني',
    'جدع إنك سجّلتها 💪 الصراحة راحة',
    'على مهلك يا برنس 🐢 الشهر طويل',
    'شاورما؟ 🌯 قولّي بس كانت حلوة ولا لأ',
    'مصاريف مصاريف 😮‍💨 هي الدنيا كده',
    'اتسجّلت، وعيني عليك 🕵️',
    'خلاص عدّت 🫡 بس نشدّ شوية بقى',
  ],
  ok: [
    'اتظبطت يا معلّم 🔧',
    'حاضر من عينيّا 👀❤️',
    'تمام التمام ✅',
    'عُلم ويُنفّذ 🫡',
    'قشطة 🧈',
    'زي الفل 🌼',
    'ميّه ميّه 💯',
    'كله تحت السيطرة 🕹️',
  ],
  win: [
    'عدّينا محطة! 🚉🎉 زغروطة يا ولاد',
    'إيه الجمدان ده 💪🔥 كمّل',
    'خطوة خطوة ونوصل 🐾',
    'أحمد بيه وصل 🎩',
    'ده إنت طلعت جامد أوي 😎',
    'الهدف قرّب 🎯 شدّ حيلك',
    'يا سيدي على النظام 🗂️✨',
    'يلا بينا نكمّل 🚀',
  ],
};

const AR_GREET = [
  'إيه الأخبار يا أحمد؟ 👋 حصل إيه في الفلوس؟',
  'أنا جاهز 🫡 قولّي إيه الجديد',
  'ها يا كبير 😎 دخل ولا مصروف؟',
];

// سلّم المخاطرة زي ما الفيديو رتّبه، من الأهدى للأخطر
const AR_RISK = [
  { i: '📊', n: 'صناديق المؤشرات', t: 'بتشتري حتة من السوق كله (زي S&P 500). الفيديو بيقول ده المكان اللي معظم الناس تبدأ منه: مفيش اختيار أسهم ولا توقيت سوق.' },
  { i: '🏢', n: 'العقار وصناديق REITs', t: 'إيجار عقار لو معاك رأس مال، أو REITs: حصة صغيرة في مباني مع ناس تانية من غير ما تشتري عقار.' },
  { i: '🧠', n: 'مهارة بتجيب دخل', t: 'كتابة إعلانية، مونتاج، مبيعات، برمجة. الفيديو بيعتبرها أسرع عائد، ومحدش يقدر ياخدها منك، بس بتاخد وقت.' },
  { i: '🛒', n: 'بيزنس أونلاين', t: 'دروبشيبنج أو منتجات رقمية. ممكن يكسب كتير، بس مجهود كبير ولازم تتوقع تفشل كام مرة.' },
  { i: '📈', n: 'أسهم منفردة', t: 'من غير مذاكرة حقيقية ده تخمين. الفيديو بيقول: خلّيها مبلغ صغير وهواية، مش الخطة الأساسية.' },
  { i: '🎲', n: 'استثمارات بديلة', t: 'بيتكوين، NFT، دهب، ساعات، أحذية. ممكن تكسب وممكن تخسر في ليلة. الفيديو: ماتحطش غير اللي تستحمل تخسره.' },
];

const AR_VIDEO = {
  growth: [
    ['اختار أصول النمو', 'ابدأ بالأساس: صناديق مؤشرات + مهارة بتزود دخلك. الباقي بعدين.'],
    ['حساب استثمار مناسب', 'الفيديو بيقول شوف الحسابات المعفية من الضرايب في بلدك قبل ما تبدأ.'],
    ['استثمر فعلًا وبشكل أوتوماتيك', 'تحويل شهري يوم القبض، من غير توقيت سوق. مثال الفيديو: 3 صناديق (أمريكي 60% + عالمي 30% + سندات 10%). هجومي = 90/10، أهدى = 80/20. وكل ما تكبر في السن زوّد السندات.'],
    ['بطّل تلعب في المحفظة وزوّد دخلك', 'اللي بيبني ثروة هو اللي بيحط أكتر بانتظام، مش اللي بيختار أشطر سهم.'],
  ],
  stability: [
    ['احسب الرقم', 'أساسيات الشهر × عدد الشهور. الفيديو بيقول 5، وفلوسي بيحسبها 5 شهور × أغلى وضع (بكل البنود كاملة)، ووقت الدين الأمان صفر ونصيبه للدين.'],
    ['خزّنه صح', 'تقدر توصله في 24 ساعة، صفر مخاطرة (مش بورصة ولا كريبتو)، وفي حساب بيدّي عائد عشان التضخم.'],
    ['كبّره بسرعة', 'كنسة القبض (أول ما الفلوس تنزل)، وعد التعويض (لو سحبت رجّع من أول قبض)، وأي كاش باك يروح للأمان.'],
  ],
  essentials: [
    ['حدد الأساسيات بجد', 'سكن، أكل بيت، مرافق، مواصلات، تأمين، لبس محتاجه. الدليفري والاشتراكات المنسية مش أساسيات. والجيم أساسي بس لو بتروح فعلًا.'],
    ['صغّر أكبر بندين', 'السكن والمواصلات. كل واحد فيهم يبقى أقل من نص الأساسيات. فاصل في الإيجار عند التجديد، وعربية مستعملة سليمة.'],
    ['قواعد مش إرادة', 'قبل أي شراء: ده اندفاع؟ استنى 7 أيام. بتشتري الماركة ولا القيمة؟ هيحسّن حياتك فعلًا؟'],
  ],
  reward: [
    ['من غير ذنب', 'سفر، هوايات، خروجات، وهدايا للي بتحبهم.'],
    ['حصّالة الفلوس الحرّة', 'حساب لوحده بياخد نصيبه كل شهر. لو خلص تستنى الشهر الجاي، ومفيش سحب من البنود التانية.'],
    ['التجارب أولًا', 'لو الحصّالة صغيرة، خلّيها على حاجة هتفتكرها مش حاجة هتتركن.'],
  ],
};

// ───────── English twin: same structure and counts as the Arabic lists ─────────
const EN_JOKES = {
  income: [
    'Money just landed, boss 💸 step away from the delivery apps',
    'Mashallah 🧿 but the card eats before the koshary does',
    'Look at you 😍 somebody tell the wife to pack a bag',
    'Cash! 🤑 hide it before your other eye spots it',
    'May it keep coming 🙌 and may the takeaway orders not',
    'Go on, lion 🦁 dirham on dirham builds a tower',
    'Lovely 👏 the bank might start returning our calls',
    'Is this money or a dream? 😴💰 pinch me',
    'Easy does it 😎 a bit for the card, a bit for Safety, a bit to spoil ourselves',
    'That is it, you are officially a businessman 🕴️',
    'The pound loves you and so does the dirham 💚',
    'That is the way 🔥 split it before it evaporates',
    'Congrats 🎉 just do not treat the whole gang',
    'Very nice 😌 the card is crying happy tears',
    'Touch wood 🖐️ may it be protected',
    'This money smells amazing 👃💵',
    'Aye aye, captain ⚓ the ship is sailing',
  ],
  spend: [
    'Fine, fine 🙄 but that is the last one today',
    'You spent? 😏 be grateful it stopped there',
    'Delivery again? 🍔 your kitchen is taking it personally',
    'Logged ✍️ and nobody is telling your wife',
    'Mate! 😳 the month has barely started',
    'It happens 🤷 just keep an eye on the tap',
    'Save for a rainy day ⚪⚫ remember that one?',
    'Enjoy it 😋 but Safety is still waiting for its share',
    'The budget is giving me a dirty look 👀',
    'Deducted ✂️ and the world is still standing',
    'You spend, I count 🧮 it is a living',
    'Respect for logging it 💪 honesty is restful',
    'Slow down, champ 🐢 it is a long month',
    'Shawarma? 🌯 just tell me, was it worth it',
    'Bills, bills, bills 😮‍💨 such is life',
    'Logged, and I have my eye on you 🕵️',
    'Done and dusted 🫡 now let us tighten up a little',
  ],
  ok: [
    'Sorted, chief 🔧',
    'Your wish, my command 👀❤️',
    'All good ✅',
    'Roger that 🫡',
    'Smooth as butter 🧈',
    'Fresh as a daisy 🌼',
    'One hundred percent 💯',
    'Everything under control 🕹️',
  ],
  win: [
    'Milestone passed! 🚉🎉 somebody cheer',
    'Now that is strength 💪🔥 keep going',
    'Step by step, we get there 🐾',
    'Ahmed Bey has arrived 🎩',
    'Turns out you are seriously good at this 😎',
    'The goal is close 🎯 push on',
    'Look at that discipline 🗂️✨',
    'Come on, onwards 🚀',
  ],
};

const EN_GREET = [
  "What's new, Ahmed? 👋 What happened with the money?",
  'Ready when you are 🫡 tell me the latest',
  'So, boss 😎 income or expense?',
];

const EN_RISK = [
  { i: '📊', n: 'Index funds', t: 'You buy a slice of the whole market (like the S&P 500). The video says this is where most people should start: no stock picking, no market timing.' },
  { i: '🏢', n: 'Property and REITs', t: 'Rent out a property if you have the capital, or REITs: a small share in buildings alongside other people, without buying a property.' },
  { i: '🧠', n: 'A skill that earns income', t: 'Copywriting, video editing, sales, coding. The video counts it as the fastest return, and nobody can take it from you, but it takes time.' },
  { i: '🛒', n: 'Online business', t: 'Dropshipping or digital products. It can pay very well, but it is a lot of work and you should expect to fail a few times.' },
  { i: '📈', n: 'Individual stocks', t: 'Without real homework it is guessing. The video says: keep it a small amount and a hobby, not the main plan.' },
  { i: '🎲', n: 'Alternative investments', t: 'Bitcoin, NFTs, gold, watches, sneakers. You might win, or lose it overnight. The video: only put in what you can afford to lose.' },
];

const EN_VIDEO = {
  growth: [
    ['Choose your growth assets', 'Start with the base: index funds + a skill that raises your income. The rest comes later.'],
    ['The right investment account', 'The video says to check the tax-free accounts in your country before you start.'],
    ['Actually invest, and automate it', 'A monthly transfer on payday, with no market timing. The video\'s example: 3 funds (US 60% + global 30% + bonds 10%). Aggressive = 90/10, calmer = 80/20. And add more bonds as you get older.'],
    ['Stop fiddling with the portfolio and raise your income', 'Wealth is built by whoever puts in more, regularly, not by whoever picks the cleverest stock.'],
  ],
  stability: [
    ['Work out the number', 'Monthly essentials × number of months. The video says 5; Floosy uses 5 months × the most expensive situation (every item in full), and while in debt Safety gets 0 and its share pays the debt.'],
    ['Store it properly', 'Reachable within 24 hours, zero risk (no stocks, no crypto), and in an account that pays a return to keep up with inflation.'],
    ['Grow it fast', 'The payday sweep (as soon as the money lands), the payback promise (if you withdraw, refill from the next payday), and any cashback goes to Safety.'],
  ],
  essentials: [
    ['Define essentials honestly', 'Housing, home food, utilities, transport, insurance, clothes you need. Delivery and forgotten subscriptions are not essentials. And the gym is essential only if you actually go.'],
    ['Shrink the two biggest items', 'Housing and transport. Each should be less than half of Essentials. Negotiate the rent at renewal, and buy a sound used car.'],
    ['Rules, not willpower', 'Before any purchase: is it an impulse? Wait 7 days. Are you buying the brand or the value? Will it really improve your life?'],
  ],
  reward: [
    ['Guilt-free', 'Travel, hobbies, outings, and gifts for the people you love.'],
    ['Fun free money jar', 'A separate account that gets its share every month. If it runs out you wait for next month, and nothing gets pulled from the other buckets.'],
    ['Experiences first', 'If the jar is small, spend it on something you will remember, not something that will gather dust.'],
  ],
};

// المحتوى بيتقري بلغة الواجهة وقت الاستخدام، فتبديل اللغة يبان من غير إعادة تحميل
const live = (blank, pickSrc) => new Proxy(blank, {
  get: (_, k) => { const src = pickSrc(); const v = Reflect.get(src, k, src); return typeof v === 'function' ? v.bind(src) : v; },
  has: (_, k) => k in pickSrc(),
});
const en = () => getLang() === 'en';

export const JOKES = live({}, () => (en() ? EN_JOKES : AR_JOKES));
export const GREET = live([], () => (en() ? EN_GREET : AR_GREET));
export const RISK = live([], () => (en() ? EN_RISK : AR_RISK));
export const VIDEO = live({}, () => (en() ? EN_VIDEO : AR_VIDEO));
