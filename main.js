/* =========================================================
   i18n — language + translation layer
   ========================================================= */
let LANG = "en";
try { LANG = localStorage.getItem("lang") || "en"; } catch (e) {}

// Arabic translations for dynamic (card/skill) strings.
// t() returns the Arabic value in AR mode, else the original English key.
const AR = {
  // --- places ---
  "Remote · Part-Time": "عن بُعد · دوام جزئي",
  "Estonia · Remote": "إستونيا · عن بُعد",
  "UAE · Remote": "الإمارات · عن بُعد",
  "Dubai, UAE · Hybrid": "دبي، الإمارات · هجين",
  "Cairo, Egypt · Hybrid": "القاهرة، مصر · هجين",
  "Saudi Arabia · Remote": "السعودية · عن بُعد",
  "Nagoya, Japan": "ناغويا، اليابان",
  "Udacity · DECI (Egypt Gov)": "يوداسيتي · DECI (حكومة مصر)",
  "Dubai, UAE": "دبي، الإمارات",
  "Alexandria, Egypt": "الإسكندرية، مصر",
  "Global · Remote": "عالمي · عن بُعد",
  "Worldwide · Remote": "حول العالم · عن بُعد",
  "USA · Remote": "الولايات المتحدة · عن بُعد",
  // --- roles ---
  "AI Product Manager": "مدير منتج ذكاء اصطناعي",
  "Product Manager": "مدير منتج",
  "Contestant — 1st Place, RoboCup Junior Egypt": "متسابق — المركز الأول، روبوكب جونيور مصر",
  "STEAM Session Lead": "قائد جلسات STEAM",
  "STEAM & Robotics Instructor": "مدرّس STEAM والروبوتيات",
  "ICT & Robotics Instructor": "مدرّس تقنية المعلومات والروبوتيات",
  "Super Tutor & Python Instructor": "معلّم متميّز ومدرّس بايثون",
  "EdTech Software Engineer & STEAM Instructor": "مهندس برمجيات تعليمية ومدرّس STEAM",
  "Python Developer — SaaS": "مطوّر بايثون — SaaS",
  "Junior Python Developer": "مطوّر بايثون مبتدئ",
  // --- kinds ---
  "AI EdTech Platform": "منصة تعليم بالذكاء الاصطناعي",
  "Video-Security SaaS": "SaaS لأمن الفيديو",
  "AI Education & Robotics": "تعليم بالذكاء الاصطناعي وروبوتيات",
  "B2B Travel Platform": "منصة سفر B2B",
  "B2C Events App (iOS/Android)": "تطبيق فعاليات B2C (iOS/Android)",
  "GovTech · Confidential": "تقنية حكومية · سرّي",
  "🏆 Robotics Champion": "🏆 بطل روبوتيات",
  "National STEAM Program": "برنامج STEAM وطني",
  "Robotics · Top Schools": "روبوتيات · مدارس مرموقة",
  "Makerspace · Roots": "ميكرسبيس · البدايات",
  "Tutoring at Scale": "تدريس واسع النطاق",
  "Top 3% Worldwide": "أفضل 3% عالميًا",
  "Automation Product": "منتج أتمتة",
  "Data Engineering": "هندسة بيانات",
  // --- what (summaries) ---
  "An AI-powered tutoring platform that gives students on-demand, personalized learning — built with Claude and a single engineer to prove that AI-augmented teams can ship a full product.":
    "منصة تدريس مدعومة بالذكاء الاصطناعي تمنح الطلاب تعلّمًا مخصّصًا عند الطلب — بُنيت باستخدام Claude ومهندس واحد لإثبات أن الفرق المعزّزة بالذكاء الاصطناعي قادرة على إطلاق منتج متكامل.",
  "A platform that protects video content with encryption — including live-stream protection — and helps creators publish on schedule.":
    "منصة تحمي محتوى الفيديو بالتشفير — بما في ذلك حماية البث المباشر — وتساعد صنّاع المحتوى على النشر في الوقت المحدد.",
  "A portfolio of B2B/B2C digital products — AI education platforms, e-commerce, mobile apps and VR — delivered for international clients at Top Rated Plus (Upwork top 3%).":
    "محفظة من المنتجات الرقمية B2B/B2C — منصات تعليم بالذكاء الاصطناعي وتجارة إلكترونية وتطبيقات وواقع افتراضي — سُلّمت لعملاء دوليين بتصنيف Top Rated Plus (أفضل 3% على Upwork).",
  "A B2B Islamic tourism platform managing VIP travel experiences through a cloud-based dynamic dashboard.":
    "منصة سياحة إسلامية B2B تدير تجارب سفر لكبار الشخصيات عبر لوحة تحكم سحابية ديناميكية.",
  "A B2C arts & culture events platform — iOS/Android apps plus an admin dashboard — connecting audiences with organizers and artists.":
    "منصة فعاليات فنية وثقافية B2C — تطبيقات iOS/Android مع لوحة تحكم إدارية — تربط الجمهور بالمنظّمين والفنانين.",
  "A confidential government project for Saudi Arabia — a custom web application built around Matterport 3D-capture technology, delivered under strict compliance requirements. Details are protected under NDA.":
    "مشروع حكومي سرّي للسعودية — تطبيق ويب مخصّص مبني حول تقنية Matterport للتصوير ثلاثي الأبعاد، سُلّم وفق متطلبات امتثال صارمة. التفاصيل محمية باتفاقية عدم إفصاح.",
  "Where it all began. Designed and programmed autonomous robots that took 1st place at RoboCup Junior Egypt — then represented Egypt at the international finals in Nagoya, Japan.":
    "حيث بدأ كل شيء. صمّمت وبرمجت روبوتات ذاتية القيادة حصلت على المركز الأول في روبوكب جونيور مصر — ثم مثّلت مصر في النهائيات الدولية في ناغويا، اليابان.",
  "A national initiative with the Egyptian government teaching Computer Fundamentals, AI and Python to students at scale.":
    "مبادرة وطنية مع الحكومة المصرية لتدريس أساسيات الحاسب والذكاء الاصطناعي وبايثون للطلاب على نطاق واسع.",
  "Taught robotics and programming to teenagers in Dubai's top-tier schools — American School of Dubai (ASD), JESS and Kings' Schools.":
    "درّست الروبوتيات والبرمجة للمراهقين في أرقى مدارس دبي — المدرسة الأمريكية بدبي (ASD) وJESS ومدارس Kings'.",
  "The foundation years — teaching ICT and science through inquiry-based, hands-on STEAM: Python, robotics, electronics and AI in a makerspace setting.":
    "سنوات التأسيس — تدريس تقنية المعلومات والعلوم عبر تعلّم استقصائي عملي في STEAM: بايثون وروبوتيات وإلكترونيات وذكاء اصطناعي داخل بيئة ميكرسبيس.",
  "Independent teaching across leading platforms — 1,000+ tutoring hours on Preply, 650+ students on almentor, and LEGO robotics coaching for WRO competitions.":
    "تدريس مستقل عبر منصات رائدة — أكثر من 1000 ساعة تدريس على Preply، و650+ طالبًا على almentor، وتدريب روبوتيات LEGO لمسابقات WRO.",
  "Built and delivered AI-integrated EdTech projects for global clients — leading development teams to ship scalable, custom learning solutions and automation tools.":
    "بنيت وسلّمت مشاريع تعليمية مدمجة بالذكاء الاصطناعي لعملاء حول العالم — بقيادة فرق تطوير لإطلاق حلول تعلّم مخصّصة وقابلة للتوسّع وأدوات أتمتة.",
  "Built 'Linker' — a Python SaaS tool that automatically applies to LinkedIn job postings, streamlining the job-search workflow end to end.":
    "بنيت 'Linker' — أداة SaaS بلغة بايثون تتقدّم تلقائيًا لوظائف LinkedIn، وتبسّط رحلة البحث عن عمل من البداية للنهاية.",
  "Built a real-estate data product scraping U.S. state listings, then cleaning and structuring the data into usable, accurate datasets.":
    "بنيت منتج بيانات عقاري يجمع قوائم الولايات الأمريكية، ثم ينظّف البيانات ويهيكلها في مجموعات دقيقة قابلة للاستخدام.",
  // --- built bullets ---
  "Took the platform from concept to launch — product vision, roadmap, and go-to-market.":
    "قدت المنصة من الفكرة إلى الإطلاق — رؤية المنتج وخارطة الطريق واستراتيجية الطرح.",
  "Designed and optimized the AI-engine pipeline powering the tutoring experience.":
    "صمّمت وحسّنت مسار محرّك الذكاء الاصطناعي المشغّل لتجربة التدريس.",
  "Defined the KPIs and growth loops driving post-launch scaling.":
    "حدّدت مؤشرات الأداء وحلقات النمو التي تقود التوسّع بعد الإطلاق.",
  "Shipped encrypted data protection for live-stream content, end-to-end validated with QA.":
    "أطلقت حماية بيانات مشفّرة لمحتوى البث المباشر، تم التحقق منها كاملةً مع فريق الجودة.",
  "Led a delay-prevention feature that predicts optimal upload times for on-time availability.":
    "قدت ميزة لمنع التأخير تتنبأ بأفضل أوقات الرفع لضمان التوفّر في الموعد.",
  "Turned user research into analytics feature specs, managing the backlog in Jira.":
    "حوّلت أبحاث المستخدمين إلى مواصفات ميزات تحليلية، مع إدارة قائمة المهام في Jira.",
  "Owned product roadmaps for AI-driven educational robotics products.":
    "امتلكت خرائط طريق المنتجات لمنتجات الروبوتيات التعليمية المدفوعة بالذكاء الاصطناعي.",
  "Ran discovery & stakeholder management for clients across 6 countries.":
    "أدرت الاكتشاف وإدارة أصحاب المصلحة لعملاء في 6 دول.",
  "Established a product-first model with flexible pricing for 50+ enterprise clients.":
    "أسّست نموذجًا يركّز على المنتج بتسعير مرن لأكثر من 50 عميلًا مؤسسيًا.",
  "Owned product vision & strategy for the VIP experience management system.":
    "امتلكت رؤية واستراتيجية المنتج لنظام إدارة تجارب كبار الشخصيات.",
  "Delivered an integrated booking system and real-time availability + CMS features.":
    "سلّمت نظام حجز متكامل وميزات توفّر لحظي ونظام إدارة محتوى.",
  "Aligned engineering, design and business teams around one roadmap.":
    "وحّدت فرق الهندسة والتصميم والأعمال حول خارطة طريق واحدة.",
  "Owned the full lifecycle from discovery through launch and iteration.":
    "امتلكت دورة الحياة الكاملة من الاكتشاف حتى الإطلاق والتحسين.",
  "Ran user research & market analysis to define and prioritize the roadmap.":
    "أجريت أبحاث المستخدمين وتحليل السوق لتحديد وترتيب أولويات خارطة الطريق.",
  "Led a cross-functional team of 8 over a 12-month cycle.":
    "قدت فريقًا متعدّد التخصصات من 8 أفراد على مدى 12 شهرًا.",
  "Managed the project from proposal to delivery under strict compliance requirements.":
    "أدرت المشروع من العرض حتى التسليم وفق متطلبات امتثال صارمة.",
  "Led Matterport integration via a custom web app that improved usability.":
    "قدت دمج Matterport عبر تطبيق ويب مخصّص حسّن سهولة الاستخدام.",
  "Designed team-management pipelines and tracked delivery in Jira.":
    "صمّمت مسارات إدارة الفريق وتتبّعت التسليم في Jira.",
  "Optimized decision-making algorithms for autonomous task execution.":
    "حسّنت خوارزميات اتخاذ القرار لتنفيذ المهام ذاتيًا.",
  "Competed on the world stage at the RoboCup international finals.":
    "تنافست على المسرح العالمي في نهائيات روبوكب الدولية.",
  "Delivered 100+ virtual STEAM lessons to 3,000+ students over 3 years.":
    "قدّمت أكثر من 100 درس STEAM افتراضي لأكثر من 3000 طالب خلال 3 سنوات.",
  "Designed hands-on coding & electronics projects — +30% engagement.":
    "صمّمت مشاريع برمجة وإلكترونيات عملية — +30% تفاعل.",
  "Ran weekly assessments with feedback — +20% student performance.":
    "أجريت تقييمات أسبوعية مع تغذية راجعة — +20% أداء الطلاب.",
  "Built interactive, project-based robotics modules — +40% engagement.":
    "بنيت وحدات روبوتيات تفاعلية قائمة على المشاريع — +40% تفاعل.",
  "Introduced students to real robotics-engineering concepts.":
    "عرّفت الطلاب على مفاهيم هندسة الروبوتيات الحقيقية.",
  "Ran makerspace activities with microcontrollers, sensors and automation.":
    "أدرت أنشطة ميكرسبيس بالمتحكّمات والحسّاسات والأتمتة.",
  "Won 1st place in Best Designs at robotics competitions.":
    "فزت بالمركز الأول لأفضل التصاميم في مسابقات الروبوتيات.",
  "Represented the team internationally in Nagoya, Japan.":
    "مثّلت الفريق دوليًا في ناغويا، اليابان.",
  "Delivered 1,000+ hours of Python, AI & robotics tutoring (95% satisfaction).":
    "قدّمت أكثر من 1000 ساعة تدريس في بايثون والذكاء الاصطناعي والروبوتيات (رضا 95%).",
  "Taught 650+ students on almentor — +25% retention & completion.":
    "درّست أكثر من 650 طالبًا على almentor — +25% في البقاء والإتمام.",
  "Coached LEGO Mindstorms teams for World Robot Olympiad (WRO).":
    "درّبت فرق LEGO Mindstorms لأولمبياد الروبوت العالمي (WRO).",
  "Managed AI-integrated EdTech projects, leading dev teams to delivery.":
    "أدرت مشاريع تعليمية مدمجة بالذكاء الاصطناعي، بقيادة فرق التطوير حتى التسليم.",
  "Delivered custom e-learning platforms and automation tools.":
    "سلّمت منصات تعلّم إلكتروني مخصّصة وأدوات أتمتة.",
  "Earned $80K+ in freelance revenue at Top 3% worldwide standing.":
    "حقّقت أكثر من 80 ألف دولار كإيرادات عمل حر ضمن أفضل 3% عالميًا.",
  "Developed the Linker automation product in Python.":
    "طوّرت منتج الأتمتة Linker بلغة بايثون.",
  "Drove a 40% increase in job-application efficiency.":
    "حقّقت زيادة 40% في كفاءة التقديم على الوظائف.",
  "Designed a scraping pipeline for U.S. real-estate data.":
    "صمّمت مسار جمع بيانات للعقارات الأمريكية.",
  "Cleaned and formatted data into Google Sheets for reliable analysis.":
    "نظّفت البيانات ونسّقتها في Google Sheets لتحليل موثوق.",
  // --- impact chips ---
  "Concept → Launch": "من الفكرة إلى الإطلاق",
  "Built with Claude": "بُني باستخدام Claude",
  "AI-augmented team": "فريق معزّز بالذكاء الاصطناعي",
  "Live-stream encryption": "تشفير البث المباشر",
  "Delay-prevention": "منع التأخير",
  "Analytics": "تحليلات",
  "10,000+ users": "+10,000 مستخدم",
  "+40% YoY revenue": "+40% إيرادات سنويًا",
  "95% satisfaction": "رضا 95%",
  "+60% retention": "+60% احتفاظ",
  "+40% booking efficiency": "+40% كفاءة الحجز",
  "+35% engagement": "+35% تفاعل",
  "50+ partners": "+50 شريك",
  "+30% acquisition": "+30% اكتساب",
  "+45% conversions": "+45% تحويلات",
  "99.5% uptime": "99.5% تشغيل",
  "200+ organizers": "+200 منظّم",
  "Saudi Government": "الحكومة السعودية",
  "Matterport integration": "دمج Matterport",
  "Custom web app": "تطبيق ويب مخصّص",
  "🥇 1st Place — Egypt": "🥇 المركز الأول — مصر",
  "🌏 International finals — Japan": "🌏 النهائيات الدولية — اليابان",
  "3,000+ students": "+3,000 طالب",
  "100+ lessons": "+100 درس",
  "+30% engagement": "+30% تفاعل",
  "ASD · JESS · Kings'": "ASD · JESS · Kings'",
  "+40% engagement": "+40% تفاعل",
  "🥇 Best Design award": "🥇 جائزة أفضل تصميم",
  "Makerspace": "ميكرسبيس",
  "Hybrid teaching": "تدريس هجين",
  "1,000+ hours": "+1,000 ساعة",
  "650+ students": "+650 طالب",
  "$80K+ delivered": "+80 ألف دولار",
  "Top 3% globally": "أفضل 3% عالميًا",
  "Led dev teams": "قيادة فرق التطوير",
  "+40% efficiency": "+40% كفاءة",
  "Python SaaS": "بايثون SaaS",
  "Data pipelines": "مسارات بيانات",
  "Web scraping": "جمع بيانات الويب",
  // --- link labels ---
  "Visit Ashrhly": "زيارة Ashrhly",
  "Visit Inkrypt Videos": "زيارة Inkrypt Videos",
  "Watch overview": "شاهد النظرة العامة",
  "Watch RoboCup video": "شاهد فيديو روبوكب",
  "Visit Sakeenah Tours": "زيارة Sakeenah Tours",
  "App Store": "App Store",
  "LinkedIn": "LinkedIn",
  // --- skill category titles ---
  "Product Management": "إدارة المنتجات",
  "AI & Emerging Tech": "الذكاء الاصطناعي والتقنيات الناشئة",
  "STEAM Education & Pedagogy": "تعليم STEAM وطرق التدريس",
  "Programming & Physical Computing": "البرمجة والحوسبة الفيزيائية",
  "Engineering & Data": "الهندسة والبيانات",
  "Methodologies & Tools": "المنهجيات والأدوات",
  // --- misc ---
  "What I did": "ما قمت به",
  "Under NDA": "تحت اتفاقية عدم إفصاح",
};
const t = (s) => (LANG === "ar" ? AR[s] || s : s);

// Static (HTML) translations, keyed by data-i18n attribute. Values may contain markup.
const STATIC = {
  en: {
    "nav.story": "Story", "nav.journey": "Journey", "nav.products": "Products",
    "nav.skills": "Skills", "nav.contact": "Contact", "nav.cta": "Let's talk",
    "hero.eyebrow": "EDUCATOR · ENGINEER · AI PRODUCT MANAGER",
    "hero.name": "Ahmed Tarek", "hero.surname": "Mourssi",
    "hero.sub": "Ten years turning technology into impact — from teaching kids to build <strong>robots</strong>, to engineering <strong>EdTech</strong> tools, to leading <strong>AI-powered products</strong> end-to-end. Same curiosity, bigger canvas. This is that journey.",
    "hero.btnPrimary": "Read my story", "hero.btnGhost": "Get in touch",
    "persona.label": "What are you hiring for? Jump straight to it →",
    "persona.pm": "Product Manager", "persona.pmSub": "AI · SaaS · B2B/B2C",
    "persona.edu": "Educator / STEAM", "persona.eduSub": "Robotics · CS · Curriculum",
    "hero.stat1": "Years in tech & education", "hero.stat2": "Students taught",
    "hero.stat3": "Product users reached", "hero.stat4": "Top-rated globally",
    "hero.badge": "Open to work", "hero.scroll": "Scroll",
    "story.index": "01 · THE STORY",
    "story.title": "One journey,<br /><span class=\"grad\">three chapters.</span>",
    "story.lead": "I started out teaching children to build robots and write their first lines of code. To teach it well, I had to <strong>build it myself</strong> — so I became an engineer. And to build things that truly mattered, I learned to <strong>lead the whole product</strong>. Educator, engineer, product manager — three chapters, one throughline: <strong>making technology create real impact for real people.</strong>",
    "story.c1label": "Chapter One", "story.c1h": "The Educator",
    "story.c1p": "10 years of STEAM & CS teaching, 3,000+ students, RoboCup champion. Where the curiosity started.",
    "story.c2label": "Chapter Two", "story.c2h": "The Builder",
    "story.c2p": "Python, automation and EdTech engineering — Top 3% globally on Upwork, $80K+ delivered.",
    "story.c3label": "Chapter Three", "story.c3h": "The Product Manager",
    "story.c3p": "Leading AI-powered platforms from zero to launch, aligning engineering, design & ops.",
    "edu.index": "CHAPTER ONE", "edu.title": "The Educator",
    "edu.lead": "Before I built products, I built <strong>curiosity</strong>. A decade teaching STEAM, robotics and code across the UAE, USA, Saudi Arabia and Egypt — and a RoboCup title that started it all.",
    "build.index": "CHAPTER TWO", "build.title": "The Builder",
    "build.lead": "To teach technology well, I learned to <strong>build it</strong> — Python automation, data tooling and EdTech platforms, delivered to clients worldwide at the top of the field.",
    "work.index": "CHAPTER THREE", "work.title": "The Product Manager",
    "work.lead": "Today I lead products end-to-end. Not a list of job titles — the actual products I built, the problem each solved, and where you can go see them for yourself.",
    "skills.index": "04 · TOOLKIT", "skills.title": "Skills & toolkit",
    "contact.index": "05 · CONTACT",
    "contact.title": "Let's build<br /><span class=\"grad\">something great.</span>",
    "contact.sub": "Open to <strong>Product Manager</strong>, <strong>AI Product</strong> and <strong>STEAM / EdTech leadership</strong> roles. Based in Dubai, working globally.",
    "form.name": "Your name", "form.email": "Your email",
    "form.company": "Company / role (optional)", "form.message": "What role or project do you have in mind?",
    "form.submit": "Send message", "contact.email": "Email", "contact.phone": "Phone", "contact.linkedin": "LinkedIn",
    "footer.copy": "© 2026 Ahmed Tarek Mourssi",
    "cookie.text": "This site uses privacy-friendly analytics (Google Analytics & Microsoft Clarity) to understand how visitors engage. Nothing loads until you choose.",
    "cookie.decline": "Decline", "cookie.accept": "Accept",
  },
  ar: {
    "nav.story": "القصة", "nav.journey": "الرحلة", "nav.products": "المنتجات",
    "nav.skills": "المهارات", "nav.contact": "تواصل", "nav.cta": "لنتحدّث",
    "hero.eyebrow": "مُعلّم · مهندس · مدير منتج ذكاء اصطناعي",
    "hero.name": "أحمد طارق", "hero.surname": "مرسي",
    "hero.sub": "عشر سنوات في تحويل التقنية إلى أثر — من تعليم الأطفال بناء <strong>الروبوتات</strong>، إلى هندسة أدوات <strong>التعليم التقني</strong>، إلى قيادة <strong>منتجات مدعومة بالذكاء الاصطناعي</strong> من البداية للنهاية. الفضول نفسه، ومساحة أكبر. هذه هي الرحلة.",
    "hero.btnPrimary": "اقرأ قصتي", "hero.btnGhost": "تواصل معي",
    "persona.label": "عمّن تبحث للتوظيف؟ انتقل مباشرةً →",
    "persona.pm": "مدير منتج", "persona.pmSub": "ذكاء اصطناعي · SaaS · B2B/B2C",
    "persona.edu": "مُعلّم / STEAM", "persona.eduSub": "روبوتيات · علوم حاسب · مناهج",
    "hero.stat1": "سنوات في التقنية والتعليم", "hero.stat2": "طالب تم تدريسهم",
    "hero.stat3": "مستخدم وصلت إليهم المنتجات", "hero.stat4": "الأعلى تقييمًا عالميًا",
    "hero.badge": "متاح للعمل", "hero.scroll": "مرّر",
    "story.index": "01 · القصة",
    "story.title": "رحلة واحدة،<br /><span class=\"grad\">ثلاثة فصول.</span>",
    "story.lead": "بدأت بتعليم الأطفال بناء الروبوتات وكتابة أولى أسطر الكود. ولأعلّمه جيّدًا كان عليّ أن <strong>أبنيه بنفسي</strong> — فأصبحت مهندسًا. ولأبني ما يهمّ فعلًا، تعلّمت أن <strong>أقود المنتج بالكامل</strong>. مُعلّم، مهندس، مدير منتج — ثلاثة فصول وخيط واحد: <strong>جعل التقنية تُحدث أثرًا حقيقيًا في حياة الناس.</strong>",
    "story.c1label": "الفصل الأول", "story.c1h": "المُعلّم",
    "story.c1p": "عشر سنوات في تدريس STEAM وعلوم الحاسب، أكثر من 3000 طالب، وبطل روبوكب. من هنا بدأ الفضول.",
    "story.c2label": "الفصل الثاني", "story.c2h": "المُهندس",
    "story.c2p": "بايثون وأتمتة وهندسة تعليم تقني — ضمن أفضل 3% عالميًا على Upwork، وأكثر من 80 ألف دولار منجزة.",
    "story.c3label": "الفصل الثالث", "story.c3h": "مدير المنتج",
    "story.c3p": "قيادة منصات مدعومة بالذكاء الاصطناعي من الصفر حتى الإطلاق، مع توحيد فرق الهندسة والتصميم والعمليات.",
    "edu.index": "الفصل الأول", "edu.title": "المُعلّم",
    "edu.lead": "قبل أن أبني المنتجات، بنيت <strong>الفضول</strong>. عقد من تدريس STEAM والروبوتيات والبرمجة عبر الإمارات وأمريكا والسعودية ومصر — ولقب روبوكب الذي بدأ كل شيء.",
    "build.index": "الفصل الثاني", "build.title": "المُهندس",
    "build.lead": "لأعلّم التقنية جيّدًا، تعلّمت أن <strong>أبنيها</strong> — أتمتة بايثون وأدوات بيانات ومنصات تعليم تقني، سُلّمت لعملاء حول العالم في قمة المجال.",
    "work.index": "الفصل الثالث", "work.title": "مدير المنتج",
    "work.lead": "اليوم أقود المنتجات من البداية للنهاية. ليست قائمة مسمّيات وظيفية — بل المنتجات الحقيقية التي بنيتها، والمشكلة التي حلّها كلٌّ منها، وأين يمكنك رؤيتها بنفسك.",
    "skills.index": "04 · الأدوات", "skills.title": "المهارات والأدوات",
    "contact.index": "05 · تواصل",
    "contact.title": "لنبنِ<br /><span class=\"grad\">شيئًا عظيمًا.</span>",
    "contact.sub": "متاح لأدوار <strong>مدير منتج</strong> و<strong>منتجات الذكاء الاصطناعي</strong> و<strong>قيادة STEAM / التعليم التقني</strong>. مقيم في دبي، وأعمل عالميًا.",
    "form.name": "اسمك", "form.email": "بريدك الإلكتروني",
    "form.company": "الشركة / المنصب (اختياري)", "form.message": "ما الدور أو المشروع الذي تفكّر فيه؟",
    "form.submit": "إرسال الرسالة", "contact.email": "البريد", "contact.phone": "الهاتف", "contact.linkedin": "لينكدإن",
    "footer.copy": "© 2026 أحمد طارق مرسي",
    "cookie.text": "يستخدم هذا الموقع تحليلات محترمة للخصوصية (Google Analytics وMicrosoft Clarity) لفهم كيفية تفاعل الزوّار. لا يتم تحميل أي شيء حتى تختار.",
    "cookie.decline": "رفض", "cookie.accept": "قبول",
  },
};

/* =========================================================
   DATA (from resume)
   ========================================================= */
// Each product: what it is, my role, what I actually built, the impact, and a live link.
// `link.url = null` renders a disabled "Link coming soon" chip — fill these in.
const JOBS = [
  {
    date: "Jun 2025 — Present",
    place: "Remote · Part-Time",
    role: "AI Product Manager",
    company: "Ashrhly.com",
    kind: "AI EdTech Platform",
    what: "An AI-powered tutoring platform that gives students on-demand, personalized learning — built with Claude and a single engineer to prove that AI-augmented teams can ship a full product.",
    built: [
      "Took the platform from concept to launch — product vision, roadmap, and go-to-market.",
      "Designed and optimized the AI-engine pipeline powering the tutoring experience.",
      "Defined the KPIs and growth loops driving post-launch scaling.",
    ],
    impact: ["Concept → Launch", "Built with Claude", "AI-augmented team"],
    tags: ["EdTech", "LLM / Claude", "0→1", "KPIs"],
    links: [{ url: "https://ashrhly.com", label: "Visit Ashrhly" }],
    featured: true,
  },
  {
    date: "Jul 2025 — Jun 2026",
    place: "Estonia · Remote",
    role: "Product Manager",
    company: "Inkrypt Videos",
    kind: "Video-Security SaaS",
    what: "A platform that protects video content with encryption — including live-stream protection — and helps creators publish on schedule.",
    built: [
      "Shipped encrypted data protection for live-stream content, end-to-end validated with QA.",
      "Led a delay-prevention feature that predicts optimal upload times for on-time availability.",
      "Turned user research into analytics feature specs, managing the backlog in Jira.",
    ],
    impact: ["Live-stream encryption", "Delay-prevention", "Analytics"],
    tags: ["Video Security", "SaaS", "Agile / Jira", "QA"],
    links: [{ url: "https://inkryptvideos.com", label: "Visit Inkrypt Videos" }],
  },
  {
    date: "Aug 2021 — Aug 2024",
    place: "UAE · Remote",
    role: "Product Manager",
    company: "Awasis.ai",
    kind: "AI Education & Robotics",
    what: "A portfolio of B2B/B2C digital products — AI education platforms, e-commerce, mobile apps and VR — delivered for international clients at Top Rated Plus (Upwork top 3%).",
    built: [
      "Owned product roadmaps for AI-driven educational robotics products.",
      "Ran discovery & stakeholder management for clients across 6 countries.",
      "Established a product-first model with flexible pricing for 50+ enterprise clients.",
    ],
    impact: ["10,000+ users", "+40% YoY revenue", "95% satisfaction", "+60% retention"],
    tags: ["AI EdTech", "VR", "E-commerce", "Top Rated Plus"],
    links: [{ url: "https://www.youtube.com/watch?v=TAHexuZxpxA", label: "Watch overview" }],
  },
  {
    date: "Feb 2024 — Oct 2024",
    place: "Dubai, UAE · Hybrid",
    role: "Product Manager",
    company: "SAKINA",
    kind: "B2B Travel Platform",
    what: "A B2B Islamic tourism platform managing VIP travel experiences through a cloud-based dynamic dashboard.",
    built: [
      "Owned product vision & strategy for the VIP experience management system.",
      "Delivered an integrated booking system and real-time availability + CMS features.",
      "Aligned engineering, design and business teams around one roadmap.",
    ],
    impact: ["+40% booking efficiency", "+35% engagement", "50+ partners"],
    tags: ["B2B", "Booking Systems", "CMS", "Cloud Dashboard"],
    links: [{ url: "https://sakeenahtours.com/", label: "Visit Sakeenah Tours" }],
  },
  {
    date: "Aug 2023 — Jan 2025",
    place: "Cairo, Egypt · Hybrid",
    role: "Product Manager",
    company: "AlaFein · Gazebo Productions",
    kind: "B2C Events App (iOS/Android)",
    what: "A B2C arts & culture events platform — iOS/Android apps plus an admin dashboard — connecting audiences with organizers and artists.",
    built: [
      "Owned the full lifecycle from discovery through launch and iteration.",
      "Ran user research & market analysis to define and prioritize the roadmap.",
      "Led a cross-functional team of 8 over a 12-month cycle.",
    ],
    impact: ["+30% acquisition", "+45% conversions", "99.5% uptime", "200+ organizers"],
    tags: ["B2C", "iOS / Android", "Team of 8", "Admin Dashboard"],
    images: ["assets/alafein-1.jpg", "assets/alafein-2.jpg", "assets/alafein-3.jpg"],
    links: [
      { url: "https://apps.apple.com/eg/app/alafein/id1611144819", label: "App Store" },
      { url: "https://www.linkedin.com/showcase/alafein/posts/?feedView=all", label: "LinkedIn" },
    ],
  },
  {
    date: "Jan 2024 — May 2025",
    place: "Saudi Arabia · Remote",
    role: "Product Manager",
    company: "Fira.Ai — Government Project",
    kind: "GovTech · Confidential",
    what: "A confidential government project for Saudi Arabia — a custom web application built around Matterport 3D-capture technology, delivered under strict compliance requirements. Details are protected under NDA.",
    built: [
      "Managed the project from proposal to delivery under strict compliance requirements.",
      "Led Matterport integration via a custom web app that improved usability.",
      "Designed team-management pipelines and tracked delivery in Jira.",
    ],
    impact: ["Saudi Government", "Matterport integration", "Custom web app"],
    tags: ["GovTech", "Compliance", "Matterport", "Jira"],
    nda: true,
  },
];

/* ---- CHAPTER ONE — The Educator (STEAM / robotics / CS teaching) ---- */
const EDUCATOR = [
  {
    date: "2017",
    place: "Nagoya, Japan",
    role: "Contestant — 1st Place, RoboCup Junior Egypt",
    company: "RoboCup Federation",
    kind: "🏆 Robotics Champion",
    what: "Where it all began. Designed and programmed autonomous robots that took 1st place at RoboCup Junior Egypt — then represented Egypt at the international finals in Nagoya, Japan.",
    built: [
      "Optimized decision-making algorithms for autonomous task execution.",
      "Competed on the world stage at the RoboCup international finals.",
    ],
    impact: ["🥇 1st Place — Egypt", "🌏 International finals — Japan"],
    tags: ["Robotics", "Autonomous systems", "Algorithms"],
    images: [
      "assets/robocup-1.jpg",
      "assets/robocup-2.jpg",
      "assets/robocup-3.jpg",
      "assets/robocup-4.jpg",
      "assets/robocup-5.jpg",
      "assets/robocup-6.jpg",
    ],
    video: { id: "QEfibag-4l4", poster: "assets/robocup-2.jpg" },
    links: [],
    featured: true,
  },
  {
    date: "Aug 2022 — Jan 2026",
    place: "Udacity · DECI (Egypt Gov)",
    role: "STEAM Session Lead",
    company: "Digital Egypt Cubs Initiative",
    kind: "National STEAM Program",
    what: "A national initiative with the Egyptian government teaching Computer Fundamentals, AI and Python to students at scale.",
    built: [
      "Delivered 100+ virtual STEAM lessons to 3,000+ students over 3 years.",
      "Designed hands-on coding & electronics projects — +30% engagement.",
      "Ran weekly assessments with feedback — +20% student performance.",
    ],
    impact: ["3,000+ students", "100+ lessons", "+30% engagement"],
    tags: ["STEAM", "AI / Python", "Curriculum"],
    images: ["assets/udacity-1.jpg", "assets/udacity-2.jpg"],
    links: [],
  },
  {
    date: "2024",
    place: "Dubai, UAE",
    role: "STEAM & Robotics Instructor",
    company: "Alpha M Educational Services",
    kind: "Robotics · Top Schools",
    what: "Taught robotics and programming to teenagers in Dubai's top-tier schools — American School of Dubai (ASD), JESS and Kings' Schools.",
    built: [
      "Built interactive, project-based robotics modules — +40% engagement.",
      "Introduced students to real robotics-engineering concepts.",
    ],
    impact: ["ASD · JESS · Kings'", "+40% engagement"],
    tags: ["Robotics", "Project-based", "STEM"],
    links: [],
  },
  {
    date: "2016 — 2020",
    place: "Alexandria, Egypt",
    role: "ICT & Robotics Instructor",
    company: "AWASIS Science",
    kind: "Makerspace · Roots",
    what: "The foundation years — teaching ICT and science through inquiry-based, hands-on STEAM: Python, robotics, electronics and AI in a makerspace setting.",
    built: [
      "Ran makerspace activities with microcontrollers, sensors and automation.",
      "Won 1st place in Best Designs at robotics competitions.",
      "Represented the team internationally in Nagoya, Japan.",
    ],
    impact: ["🥇 Best Design award", "Makerspace", "Hybrid teaching"],
    tags: ["Arduino", "Electronics", "Robotics"],
    links: [],
  },
  {
    date: "2020 — 2022",
    place: "Global · Remote",
    role: "Super Tutor & Python Instructor",
    company: "Preply · almentor · Robokids",
    kind: "Tutoring at Scale",
    what: "Independent teaching across leading platforms — 1,000+ tutoring hours on Preply, 650+ students on almentor, and LEGO robotics coaching for WRO competitions.",
    built: [
      "Delivered 1,000+ hours of Python, AI & robotics tutoring (95% satisfaction).",
      "Taught 650+ students on almentor — +25% retention & completion.",
      "Coached LEGO Mindstorms teams for World Robot Olympiad (WRO).",
    ],
    impact: ["1,000+ hours", "650+ students", "95% satisfaction"],
    tags: ["Python", "Scratch", "LEGO Robotics"],
    links: [],
  },
];

/* ---- CHAPTER TWO — The Builder (engineering / automation / EdTech dev) ---- */
const BUILDER = [
  {
    date: "2020 — 2024",
    place: "Worldwide · Remote",
    role: "EdTech Software Engineer & STEAM Instructor",
    company: "Upwork",
    kind: "Top 3% Worldwide",
    what: "Built and delivered AI-integrated EdTech projects for global clients — leading development teams to ship scalable, custom learning solutions and automation tools.",
    built: [
      "Managed AI-integrated EdTech projects, leading dev teams to delivery.",
      "Delivered custom e-learning platforms and automation tools.",
      "Earned $80K+ in freelance revenue at Top 3% worldwide standing.",
    ],
    impact: ["$80K+ delivered", "Top 3% globally", "Led dev teams"],
    tags: ["AI EdTech", "Django", "Automation"],
    images: ["assets/upwork.jpg"],
    links: [],
    featured: true,
  },
  {
    date: "2023",
    place: "Saudi Arabia · Remote",
    role: "Python Developer — SaaS",
    company: "Modernint (Linker)",
    kind: "Automation Product",
    what: "Built 'Linker' — a Python SaaS tool that automatically applies to LinkedIn job postings, streamlining the job-search workflow end to end.",
    built: [
      "Developed the Linker automation product in Python.",
      "Drove a 40% increase in job-application efficiency.",
    ],
    impact: ["+40% efficiency", "Python SaaS"],
    tags: ["Python", "Selenium", "Automation"],
    links: [],
  },
  {
    date: "2022 — 2023",
    place: "USA · Remote",
    role: "Junior Python Developer",
    company: "Peakregroup",
    kind: "Data Engineering",
    what: "Built a real-estate data product scraping U.S. state listings, then cleaning and structuring the data into usable, accurate datasets.",
    built: [
      "Designed a scraping pipeline for U.S. real-estate data.",
      "Cleaned and formatted data into Google Sheets for reliable analysis.",
    ],
    impact: ["Data pipelines", "Web scraping"],
    tags: ["Python", "Pandas", "Data"],
    links: [],
  },
];

const SKILLS = [
  {
    title: "Product Management",
    chips: ["End-to-End Lifecycle", "Product Strategy & Vision", "Discovery & Experimentation", "Roadmap Planning", "Backlog Prioritization", "Stakeholder Management", "User Research", "A/B Testing", "B2B & B2C", "KPI & Growth"],
  },
  {
    title: "AI & Emerging Tech",
    chips: ["Claude", "Large Language Models", "AI Prototyping", "AI Pipeline Optimization", "Prompt Engineering", "Computer Vision / OpenCV", "Machine Learning", "VR Experiences", "Matterport"],
  },
  {
    title: "STEAM Education & Pedagogy",
    chips: ["Project-Based Learning", "Inquiry-Based Learning", "STEM/STEAM Curriculum", "Makerspace Facilitation", "Differentiated Instruction", "Student Assessment", "EdTech Integration", "Workshop & Camp Delivery"],
  },
  {
    title: "Programming & Physical Computing",
    chips: ["Python", "C++ / C", "JavaScript", "Arduino", "Raspberry Pi", "ESP32 / micro:bit", "Sensors & Circuits", "Robotics (LEGO, VEX)", "ROS", "IoT"],
  },
  {
    title: "Engineering & Data",
    chips: ["Django", "Flask", "REST APIs", "NumPy / Pandas", "SQL / MySQL", "Selenium", "Web Scraping", "Power BI", "PCB Design (Eagle)", "SOLIDWORKS / CAD"],
  },
  {
    title: "Methodologies & Tools",
    chips: ["Agile & Scrum", "Jira", "Confluence", "Slack", "Google Classroom", "Moodle / Blackboard", "Data-Driven Decisions", "Cross-Functional Leadership", "Risk Management"],
  },
];

/* =========================================================
   INJECT CONTENT
   ========================================================= */
function linkBtn(j) {
  if (j.nda) {
    return `<span class="prod__cta prod__cta--nda"><span class="prod__lock">🔒</span> ${t("Under NDA")}</span>`;
  }
  const links = j.links || [];
  if (!links.length) return "";
  return `<div class="prod__ctas">` + links
    .map((l, k) =>
      `<a class="prod__cta${k > 0 ? " prod__cta--ghost" : ""}" href="${l.url}" target="_blank" rel="noopener">
        ${t(l.label)} <span class="prod__cta-arrow">↗</span></a>`
    )
    .join("") + `</div>`;
}
function cardHTML(j, i) {
  return `
  <article class="prod glass reveal${j.featured ? " prod--featured" : ""}" style="--d:${Math.min(i * 0.05, 0.3)}s">
    <div class="prod__top">
      <span class="prod__kind">${t(j.kind)}</span>
      <span class="prod__date">${j.date}</span>
    </div>
    <h3 class="prod__name">${j.company}</h3>
    <p class="prod__role">${t(j.role)} · ${t(j.place)}</p>
    <p class="prod__what">${t(j.what)}</p>
    ${j.video
      ? `<div class="prod__video" data-yt="${j.video.id}">
          <img class="prod__video-poster" src="${j.video.poster}" alt="${j.company}" loading="lazy" />
          <button class="prod__video-play" aria-label="Play video"><span>▶</span></button>
        </div>`
      : ""}
    ${(j.images && j.images.length)
      ? `<div class="prod__gallery">${j.images
          .map((src) => `<a class="prod__shot" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${j.company}" loading="lazy" onerror="this.closest('.prod__shot').remove()" /></a>`)
          .join("")}</div>`
      : ""}
    <div class="prod__section">
      <span class="prod__label">${t("What I did")}</span>
      <ul class="prod__built">${j.built.map((b) => `<li>${t(b)}</li>`).join("")}</ul>
    </div>
    <div class="prod__impact">${j.impact.map((m) => `<span class="prod__metric">${t(m)}</span>`).join("")}</div>
    <div class="prod__foot">
      <div class="prod__tags">${j.tags.map((tag) => `<span class="job__tag">${tag}</span>`).join("")}</div>
      ${linkBtn(j)}
    </div>
  </article>`;
}
function renderInto(id, list) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = list.map(cardHTML).join("");
}
function renderCards() {
  renderInto("eduTimeline", EDUCATOR);
  renderInto("buildTimeline", BUILDER);
  renderInto("timeline", JOBS);
  const skillsGrid = document.getElementById("skillsGrid");
  if (skillsGrid) {
    skillsGrid.innerHTML = SKILLS.map(
      (s, i) => `
      <div class="skillcat reveal" style="--d:${i * 0.08}s">
        <h3>${t(s.title)}</h3>
        <div class="skillcat__chips">${s.chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
      </div>`
    ).join("");
  }
}

/* =========================================================
   APPLY LANGUAGE (static text + direction) & TOGGLE
   ========================================================= */
function applyStatic() {
  const dict = STATIC[LANG] || STATIC.en;
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === "ar" ? "rtl" : "ltr";
  document.body.classList.toggle("ar", LANG === "ar");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n")];
    if (v != null) el.innerHTML = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n-ph")];
    if (v != null) el.setAttribute("placeholder", v);
  });
  const tg = document.getElementById("langToggle");
  if (tg) {
    tg.textContent = LANG === "ar" ? "EN" : "ع";
    tg.setAttribute("aria-label", LANG === "ar" ? "Switch to English" : "التبديل إلى العربية");
  }
  try { localStorage.setItem("lang", LANG); } catch (e) {}
}

// initial paint
renderCards();
applyStatic();

// toggle handler
const langToggle = document.getElementById("langToggle");
if (langToggle) {
  langToggle.addEventListener("click", () => {
    LANG = LANG === "ar" ? "en" : "ar";
    renderCards();
    applyStatic();
    // re-rendered cards are new nodes; reveal them immediately (user already scrolled)
    document
      .querySelectorAll("#eduTimeline .reveal, #buildTimeline .reveal, #timeline .reveal, #skillsGrid .reveal")
      .forEach((el) => el.classList.add("in"));
  });
}

/* =========================================================
   REVEAL ON SCROLL
   ========================================================= */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* =========================================================
   NAV + SCROLL PROGRESS
   ========================================================= */
const nav = document.getElementById("nav");
const progress = document.getElementById("scrollProgress");
function onScroll() {
  const y = window.scrollY;
  nav.classList.toggle("scrolled", y > 40);
  const h = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* =========================================================
   COUNT-UP STATS
   ========================================================= */
function animateCount(el) {
  const target = +el.dataset.count;
  const suffix = el.dataset.suffix || "";
  const dur = 1600;
  let start = null;
  const fmt = (n) => (target >= 1000 ? Math.round(n).toLocaleString() : Math.round(n));
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const statObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animateCount(e.target);
        statObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll(".stat__num").forEach((el) => statObs.observe(el));

/* =========================================================
   COOKIE CONSENT
   ========================================================= */
(function () {
  const banner = document.getElementById("cookieBanner");
  if (!banner) return;
  let stored = null;
  try { stored = localStorage.getItem("cookie-consent"); } catch (e) {}

  function save(v) { try { localStorage.setItem("cookie-consent", v); } catch (e) {} }
  function hide() { banner.classList.remove("show"); setTimeout(() => (banner.hidden = true), 400); }

  if (!stored) {
    banner.hidden = false;
    requestAnimationFrame(() => setTimeout(() => banner.classList.add("show"), 400));
  }
  document.getElementById("cookieAccept").addEventListener("click", () => {
    save("granted");
    if (window.__initAnalytics) window.__initAnalytics();
    hide();
  });
  document.getElementById("cookieDecline").addEventListener("click", () => {
    save("denied");
    hide();
  });
})();

/* =========================================================
   CONTACT FORM (Formspree) + fallback to email
   ========================================================= */
const EMAIL = "se.ahmedtprofile@gmail.com";
const form = document.getElementById("contactForm");
if (form) {
  const status = document.getElementById("formStatus");
  const btn = form.querySelector(".form__submit");
  const cfg = window.SITE_CONFIG || {};
  const hasFormspree = cfg.FORMSPREE_ID && cfg.FORMSPREE_ID.indexOf("XXX") === -1;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);

    // No Formspree ID yet → open the visitor's email client pre-filled.
    if (!hasFormspree) {
      const body =
        `Name: ${data.get("name")}\nEmail: ${data.get("email")}\n` +
        `Company: ${data.get("company") || "-"}\n\n${data.get("message")}`;
      window.location.href =
        `mailto:${EMAIL}?subject=${encodeURIComponent("Portfolio enquiry")}` +
        `&body=${encodeURIComponent(body)}`;
      return;
    }

    btn.disabled = true;
    status.className = "form__status";
    status.textContent = "Sending…";
    try {
      const res = await fetch(`https://formspree.io/f/${cfg.FORMSPREE_ID}`, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        form.reset();
        status.textContent = "Thanks — your message is on its way. I'll be in touch soon.";
        status.className = "form__status is-ok";
        if (window.gtag) gtag("event", "generate_lead", { form: "contact" });
      } else {
        status.textContent = `Something went wrong. You can email me directly at ${EMAIL}.`;
        status.className = "form__status is-err";
      }
    } catch {
      status.textContent = `Network issue. You can email me directly at ${EMAIL}.`;
      status.className = "form__status is-err";
    } finally {
      btn.disabled = false;
    }
  });
}

/* Track outbound "Visit product" clicks (only if GA is active) */
document.addEventListener("click", (e) => {
  const link = e.target.closest(".prod__cta[href]");
  if (link && window.gtag) {
    gtag("event", "product_click", {
      product: link.closest(".prod")?.querySelector(".prod__name")?.textContent || "unknown",
      url: link.href,
    });
  }
});

/* =========================================================
   INLINE VIDEO — click poster to load & play the embed
   ========================================================= */
document.addEventListener("click", (e) => {
  const box = e.target.closest(".prod__video");
  if (!box || box.dataset.loaded) return;
  const id = box.dataset.yt;
  box.dataset.loaded = "1";
  box.innerHTML =
    `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1" ` +
    `title="RoboCup video" frameborder="0" ` +
    `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  if (window.gtag) gtag("event", "video_play", { id });
});

/* =========================================================
   LIGHTBOX — click a gallery image to view full-screen
   ========================================================= */
const lb = document.getElementById("lightbox");
const lbImg = lb ? lb.querySelector(".lightbox__img") : null;
let lbGroup = [];
let lbIndex = 0;

function lbShow(i) {
  lbIndex = (i + lbGroup.length) % lbGroup.length;
  lbImg.src = lbGroup[lbIndex];
}
function lbOpen(group, i) {
  lbGroup = group;
  lb.classList.add("open");
  document.body.style.overflow = "hidden";
  lbShow(i);
}
function lbClose() {
  lb.classList.remove("open");
  document.body.style.overflow = "";
  lbImg.src = "";
}

if (lb) {
  document.addEventListener("click", (e) => {
    const shot = e.target.closest(".prod__shot");
    if (!shot) return;
    e.preventDefault();
    const gallery = shot.closest(".prod__gallery");
    const shots = [...gallery.querySelectorAll(".prod__shot")];
    lbOpen(shots.map((s) => s.getAttribute("href")), shots.indexOf(shot));
  });
  lb.querySelector(".lightbox__close").addEventListener("click", lbClose);
  lb.querySelector(".lightbox__prev").addEventListener("click", () => lbShow(lbIndex - 1));
  lb.querySelector(".lightbox__next").addEventListener("click", () => lbShow(lbIndex + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) lbClose(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") lbClose();
    else if (e.key === "ArrowLeft") lbShow(lbIndex - 1);
    else if (e.key === "ArrowRight") lbShow(lbIndex + 1);
  });
}

/* =========================================================
   CUSTOM CURSOR
   ========================================================= */
const cursor = document.getElementById("cursorGlow");
let cx = window.innerWidth / 2, cy = window.innerHeight / 2, tx = cx, ty = cy;
window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
document.querySelectorAll("a, .btn, .glass, .prod, .prod__cta, .skillcat, .chip").forEach((el) => {
  el.addEventListener("mouseenter", () => cursor.classList.add("big"));
  el.addEventListener("mouseleave", () => cursor.classList.remove("big"));
});
function cursorLoop() {
  cx += (tx - cx) * 0.18;
  cy += (ty - cy) * 0.18;
  cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  requestAnimationFrame(cursorLoop);
}
cursorLoop();

/* =========================================================
   3D CARD TILT
   ========================================================= */
document.querySelectorAll(".tilt").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(700px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateY(-4px)`;
  });
  card.addEventListener("mouseleave", () => { card.style.transform = ""; });
});

/* =========================================================
   BACKGROUND PARALLAX (scroll + pointer) — no WebGL
   ========================================================= */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const aurora = document.querySelector(".aurora");
let auroraTX = 0, auroraTY = 0, auroraX = 0, auroraY = 0, lastScroll = window.scrollY || 0;

if (aurora && !reduceMotion) {
  window.addEventListener("mousemove", (e) => {
    auroraTX = (e.clientX / window.innerWidth - 0.5) * 34;
    auroraTY = (e.clientY / window.innerHeight - 0.5) * 34;
  });
  window.addEventListener("scroll", () => { lastScroll = window.scrollY; }, { passive: true });
  (function auroraLoop() {
    auroraX += (auroraTX - auroraX) * 0.06;
    auroraY += (auroraTY - auroraY) * 0.06;
    aurora.style.transform = `translate3d(${auroraX}px, ${auroraY + lastScroll * 0.08}px, 0)`;
    aurora.style.filter = `hue-rotate(${lastScroll * 0.04}deg)`;
    requestAnimationFrame(auroraLoop);
  })();
}

/* =========================================================
   SCROLL-DRIVEN HERO PARALLAX
   ========================================================= */
const heroInner = document.querySelector(".hero__inner");
const heroPhoto = document.querySelector(".hero__photo");
const heroScroll = document.querySelector(".hero__scroll");
if (!reduceMotion && (heroInner || heroPhoto)) {
  let ticking = false;
  const onHeroScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const p = Math.min(y / window.innerHeight, 1);
      if (heroInner) {
        heroInner.style.transform = `translateY(${y * 0.16}px)`;
        heroInner.style.opacity = String(1 - p * 0.85);
      }
      if (heroPhoto) heroPhoto.style.transform = `translateY(${y * 0.06}px)`;
      if (heroScroll) heroScroll.style.opacity = String(Math.max(0, 1 - p * 2));
      ticking = false;
    });
  };
  window.addEventListener("scroll", onHeroScroll, { passive: true });
}

/* =========================================================
   SCROLL-LINKED SECTION DEPTH (subtle rise as sections enter)
   ========================================================= */
if (!reduceMotion) {
  const depthEls = document.querySelectorAll(".section__head, .persona");
  let dTick = false;
  const onDepth = () => {
    if (dTick) return;
    dTick = true;
    requestAnimationFrame(() => {
      const vh = window.innerHeight;
      depthEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) {
          // -1 (below) → 0 (centered): gentle parallax on the section heading
          const rel = (r.top - vh * 0.5) / vh; // ~ -0.5..0.5 across viewport
          el.style.transform = `translateY(${rel * -18}px)`;
        }
      });
      dTick = false;
    });
  };
  window.addEventListener("scroll", onDepth, { passive: true });
  onDepth();
}
