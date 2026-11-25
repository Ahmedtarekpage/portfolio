// The big-goal council for the finance planner (POST /api/ideas?finance=advise).
//
// The page works out every number and date itself (finance/goals.js) with the
// app's own rules, then sends a short summary here — never the transactions.
// Four advisors read it at the same time, each from one angle, and a chairman
// reads all four and gives the decision: now or later, cash or instalments,
// where it goes in the goal order, and "if X happens, do Y".
//
// Model: Google Gemini Flash on the free tier (owner's choice, 2026-11-18),
// key in the GEMINI_API_KEY env var. Free-tier data may be used by Google to
// improve its models, which is why only rounded numbers and the goal's name go
// out. If a model is busy or retired, the next one in MODELS is tried.
import { json } from "./util.js";
import { hasClaude, claudeJSON, claudeStep } from "./claude.js";

// Tried in order. New keys cannot use 2.5 or older ("no longer available to
// new users"), and the big Flash is often "high demand" (503) on the free tier,
// so it fails fast to the lite models, which answer in 1-3 s (tested 2026-11-18).
// The four advisors run at once on the lite models (fast, plenty for one
// angle each); the chairman, who weighs them, gets the big model first.
const LITE = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];
const CHAIR = ["gemini-3.8-flash", ...LITE];
const PER_TRY_MS = 20_000;
const MAX_FACTS = 8_000;

// The app's rules (finance/rules.js and the "Rules from the video" card), in words.
// The owner's decision order for any purchase (2026-11-20): 1) Islamic rules of wealth, 2) the
// "Mark Tilbury 1% Rule" (the video's money system below), 3) the app's numbers, 4) the council.
const ISLAMIC = `
WORDING (owner, 2026-11-25): in Arabic always call interest «ربا» (never «فوايد» / «فائدة»), e.g. «ربا الكارت», «هيتضاف ربا». In English write "riba (interest)".
The owner's decision order for any purchase or commitment (follow it exactly):
STEP 0 — HALAL OR HARAM (before anything else): is the thing itself, and the way of paying, allowed in Islam? Riba (any interest-bearing loan, conventional card instalments, late-payment interest) is haram; an Islamic-bank murabaha/ijara or a true 0%-profit instalment is the halal route. If a Quran verse or an authentic hadith clearly helps the decision, mention it briefly with its reference (e.g. Al-Baqarah 2:275-279 on riba, Al-Furqan 25:67 on moderation, Al-Isra 17:26-27 on waste, the Prophet's ﷺ seeking refuge from debt in Sahih al-Bukhari). Only cite texts you are sure of; if unsure, state the principle without a quote. Never invent a verse or hadith, and never issue a fatwa on a detailed case: say what must be confirmed with a trusted scholar or the Islamic bank's sharia board.
STEP 1 — HOW THE RICH MUSLIMS HANDLED WEALTH (Abdulrahman ibn Awf, Uthman ibn Affan and righteous Muslim merchants): wealth grows by trade and productive work, honest dealing and small steady profit, not by consumption; avoid debt unless there is a real need and clear existing debt first; moderation (neither waste nor stinginess); spend on family first; give zakat (2.5% on savings above the nisab held a lunar year) and sadaqa generously; prefer things that earn or save money over things that only cost; contentment, don't buy to compete with people.`;

const RULES = `
STEP 2 — "MARK TILBURY 1% RULE" (the video's money system the app is built on):
Rules of this money system (the owner's chosen book, as the app applies them since 2026-11-20). All maths is in AED; he is ONE person with money in the UAE (AED) and Egypt (EGP).
Base split from the video: essentials up to 50% of income, growth 25%, safety 15%, fun ("free money") 10%.
  If essentials are more than 50% of income: essentials first, and what is left splits 50% growth / 30% safety / 20% fun.
  If income is below essentials it is a deficit month.
WHILE HE HAS DEBT:
  1. Sadaqa stops only if the debt is above 100 AED (it comes back by itself after).
  2. Essentials must cover this pay cycle + the first 10 days of the next cycle; income only fills what is missing.
  3. Fun free money = 2.5% of the income, and only from what is left after essentials.
  4. Safety gets 0; its share goes to the debt.
  5. Everything else pays the debt (first debt in his list first). Investing = 0.
WITHOUT DEBT:
  1. Sadaqa (his %, default 2.5%) comes out of every income first.
  2. Essentials cover this cycle only; any surplus in essentials moves to Safety automatically.
  3. The rest uses the video split.
  4. Safety grows up to 5 months x the most expensive situation (he and his wife both in the UAE / he in the UAE and she in Egypt / both in Egypt, every item in full); after that its share goes to investing.
Leftover essentials carry to the next cycle. Safety is never spent on goals. Big cash purchases come from Growth only after debt is zero.
A new monthly commitment is allowed only when income is at least 2x the new essentials for 3 months in a row (living level rule).
Fun is spent only from the free money jar; for wants, wait 7 days before buying.
STEP 3 — LOGIC: the app's own numbers (dates, thresholds, impact after the split). Never estimate them yourself.
STEP 4 — COUNCIL: weigh the views and decide; every decision ends with a concrete action (CTA) he can do in the app.`;

const ADVISORS = [
  { key: "sharia", ar: "الشرعي", en: "The Islamic finance one",
    brief: "You check STEP 0 and STEP 1 first: is it halal (riba or not, contract type) with a Quran/Sunnah reference only if you are sure of it, is it a need or a luxury, does it add debt, is it israf, what would the wealthy Companions like Abdulrahman ibn Awf do. You do not issue fatwas; you point to what must be confirmed." },
  { key: "cautious", ar: "الحذِر", en: "The Cautious one",
    brief: "You look for what can go wrong: job loss, emergencies, income that does not keep growing, being locked into a commitment. You protect the safety fund." },
  { key: "ambitious", ar: "الطموح", en: "The Ambitious one",
    brief: "You make the honest case for the upside: quality of life, time saved, the cost of waiting too long, what this goal makes possible." },
  { key: "rules", ar: "حارس القواعد", en: "The Rules keeper",
    brief: "You apply the rules of the system strictly and say exactly which rule allows or blocks this, with its number." },
  { key: "practical", ar: "العملي", en: "The Practical one",
    brief: "You look for a smarter version: a cheaper option, a bigger down payment, a shorter term, waiting for a better month, a side income target." },
];

const langNote = (lang) => lang === "en"
  ? "Write in plain, simple English. Money is in AED."
  : "اكتب بالعامية المصرية البسيطة جدًا، جمل قصيرة. لو استخدمت كلمة إنجليزي اشرحها بين قوسين. الأرقام بالأرقام الإنجليزي (123). الفلوس كلها بالدرهم الإماراتي: اكتب \"درهم\"، وعمرك ما تكتب جنيه.";

async function gemini(models, system, user, temperature) {
  if (hasClaude()) return claudeJSON(system, user, models === CHAIR ? "medium" : "low"); // Claude first (owner, 2026-11-20)
  const key = process.env.GEMINI_API_KEY;
  let last = null;
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(PER_TRY_MS),
    }).catch((e) => ({ ok: false, status: 504, err: e }));
    if (r.ok) {
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      try { return JSON.parse(text); } catch { last = new Error(`${model}: bad JSON`); continue; }
    }
    last = new Error(`${model}: ${r.status}`);
    if (![404, 429, 500, 503, 504].includes(r.status)) break; // a key or request problem will not get better on another model
  }
  throw last;
}

// The investing question ("what do I invest in, when, and what to expect"), by the same book.
const INVEST = `
This time the question is about INVESTING the Growth share (not buying something). The book's investing rules:
- Debt first: investing starts only after debt is zero (the app already worked out the start month).
- The Safety fund is never invested; it stays in a savings account reachable within a day.
- Start with index funds: example mix US 60% + global 30% + bonds 10% (aggressive 90/10, calmer 80/20); more bonds with age.
- A skill that raises income is the fastest return. Single stocks and alternatives (crypto, etc.) only a small amount you can afford to lose.
- Automate a monthly transfer on payday, no market timing, do not sell in a crash.
- Each country is separate: UAE money (AED) is invested from the UAE, Egypt money (EGP) in Egypt.
You MAY name kinds of products available to someone living in the UAE with income in Egypt (for example a global index ETF through a regulated UAE broker, Egyptian bank certificates or Egyptian gold for EGP money), but say they must be checked, never promise a return, and never invent a number.`;
const isInvest = (facts) => facts?.kind === "invest";

function advisorPrompt(a, lang, inv) {
  return `You are "${lang === "en" ? a.en : a.ar}", one advisor on a money council for one person.
${a.brief}
${ISLAMIC}${RULES}${inv ? INVEST : ""}
Use ONLY the numbers and dates in the facts. Never invent a number, a price or a date. Amounts are AED.
${langNote(lang)}
Reply as JSON: {"stance":"now"|"wait"|"change"|"no","pay":"cash"|"instalments"|null,"say":"2-3 short sentences with your reason and the one number that matters most"}`;
}

function chairPrompt(lang, inv) {
  if (inv) return `You chair a money council for one person. Five advisors answered about how to invest the Growth share. Weigh them, then decide.
${ISLAMIC}${RULES}${INVEST}
Use ONLY the numbers and dates in the facts and in what the advisors said. Never invent numbers or dates. Amounts are AED.
${langNote(lang)}
Reply as JSON:
{"verdict":"now"|"wait"|"change",
 "when":"YYYY-MM or null (copy it from the facts)",
 "headline":"one short line: the decision",
 "why":"2-3 short sentences",
 "picks":[{"what":"a kind of investment and where (UAE or Egypt)","pct":number or null,"why":"one short line"}],  (2 to 4 items, percentages add to 100 when given)
 "ifs":[{"if":"a concrete condition with a number","then":"what to do then"}],  (2 or 3 items)
 "who":[{"key":"sharia|cautious|ambitious|rules|practical","said":"what that advisor said, in one short line"}]}`;
  return `You chair a money council for one person. Five advisors answered about one goal. Weigh them, then decide.
${ISLAMIC}${RULES}
Use ONLY the numbers and dates in the facts and in what the advisors said. Never invent numbers or dates. Amounts are AED.
${langNote(lang)}
Reply as JSON:
{"verdict":"now"|"wait"|"change"|"no",
 "pay":"cash"|"instalments"|null,
 "when":"YYYY-MM or null (copy it from the facts)",
 "headline":"one short line: the decision",
 "why":"2-3 short sentences",
 "order":"one sentence: where this goal sits in the order (after which goal / milestone)",
 "ifs":[{"if":"a concrete condition with a number","then":"what to do then"}],  (2 or 3 items)
 "steps":{"halal":"STEP 0 verdict in one line (+ the verse/hadith reference if one clearly applies)","muslims":"STEP 1: what the rich Muslims would do, one line","tilbury":"STEP 2 (Mark Tilbury 1% Rule) verdict in one line","logic":"STEP 3: the key numbers in one line"},
 "cta":[{"task":"a task key from facts.tasks","label":"short button text"}],  (1 or 2 items: what he should do now in the app)
 "who":[{"key":"sharia|cautious|ambitious|rules|practical","said":"what that advisor said, in one short line"}]}`;
}

/** POST ?finance=advise { facts, lang } -> { advisors:[...], chair:{...} } */
export async function advise(req, res, memory = "") {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY && !hasClaude()) return json(res, 503, { error: "no AI key" });
  const b = req.body || {};
  const lang = b.lang === "en" ? "en" : "ar";
  const facts = JSON.stringify(b.facts || {});
  if (facts.length > MAX_FACTS || !b.facts?.goal) return json(res, 400, { error: "bad facts" });

  const inv = isInvest(b.facts);
  const ask = `Facts (worked out by the app from the owner's real data):\n${facts}` + (memory ? `\n\nThe owner's chat with the app (most recent last). Use it to understand his life, plans and what he cares about; never quote private details back needlessly:\n${memory}` : "");
  const said = await Promise.all(ADVISORS.map(async (a) => {
    try {
      let o;
      try { o = await gemini(LITE, advisorPrompt(a, lang, inv), ask, 0.7); }
      catch { o = await gemini(LITE, advisorPrompt(a, lang, inv), ask, 0.7); } // one more go: free-tier 503s come and go
      return { key: a.key, name: lang === "en" ? a.en : a.ar, stance: o.stance, pay: o.pay ?? null, say: String(o.say || "").slice(0, 600) };
    } catch (e) {
      console.error("advisor", a.key, e.message);
      return null;
    }
  }));
  const advisors = said.filter(Boolean);
  if (!advisors.length) return json(res, 502, { error: "AI unavailable" });

  let chair;
  try {
    chair = await gemini(CHAIR, chairPrompt(lang, inv), `${ask}\n\nWhat the advisors said:\n${JSON.stringify(advisors)}`, 0.3);
  } catch (e) {
    console.error("chair", e.message);
    return json(res, 200, { advisors, chair: null });
  }
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { advisors, chair });
}

// Understanding what the owner typed in the middle of a chat step (POST /api/ideas?finance=intent).
// The page sends the question on screen, its options, what he typed, and the menu of tasks.
// The model decides: he picked one of the options, he asked something on the side (answer it, then
// the same question stays), he wants another task (switch), or it is a full question (ai). 2026-11-20.
function intentPrompt(lang) {
  return `You are Shark (قرش), the owner's money AGENT inside his finance app Floosy. You run the chat: you read what he typed and decide what to do with it, like a smart human assistant would. Never get stuck.
${ISLAMIC}${RULES}
You get: the question currently on screen (may be empty = main menu), its options [{l,v}], whether free text is allowed, the tasks the app can start, a short data summary, the recent chat, and what he typed.
Decide ONE action:
- "pick": what he typed means one of the options (any language, typos, Franco-Arabic like "2kl" = اكل, synonyms, "the first one", "rent" -> the rent item, "yes"/"aywa" -> the yes option). Return its exact "v".
- "free": free text is allowed and what he typed is a valid free answer (a new name, a note...). Return "value" = the cleaned text.
- "reply": he asked or said something on the side (a quick question, a complaint, small talk, "why?", "what does this mean?"). Answer it in "say" (short, from his data, never invent numbers), then the same question stays on screen.
- "switch": he wants to do a different task from the tasks list (e.g. "I spent 50 on food" while the app asks something else, or from the menu). Return "flow" = the task key, and "amount" + "cur" (AED|EGP|USD|EUR|SAR) if he gave an amount, and "say" = one short line saying what you will do.
- "ai": a real money question that needs thinking with his numbers (planning, should I, how long, compare). Return "say" empty.
- "none": you truly cannot tell. Put in "say" a short, friendly line that explains what the question needs, mentioning 2-3 of the options by name.
Rules: prefer "pick" when it is reasonably clear. If the question asks for a number or amount and he typed one (even inside a sentence like "it's 500 a month"), use "free" with "value" = just the number and currency, digits only (e.g. "500" or "300 EGP"). In "prefill" mode (he already said a sentence before this question and you are filling the steps for him): only "pick", "free" (when that exact value is clearly stated in his sentence for THIS question) or "none", and NEVER pick an option that saves, confirms, deletes or sends money for real — those he taps himself.
${lang === "en" ? "Write 'say' in plain, simple English." : "اكتب say بالعامية المصرية البسيطة، جمل قصيرة، والأرقام بالأرقام الإنجليزي (123)."} Friendly, a bit of humour is fine, max 60 words.
Reply as JSON: {"action":"pick|free|reply|switch|ai|none","v":"option v or null","value":null,"flow":null,"amount":null,"cur":null,"say":""}`;
}

/** POST ?finance=intent { q, opts:[{l,v}], free, typed, mode, flows:[{v,l}], data, history, lang } */
export async function intent(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY && !hasClaude()) return json(res, 503, { error: "no AI key" });
  const b = req.body || {};
  const lang = b.lang === "en" ? "en" : "ar";
  const typed = String(b.typed || "").slice(0, 600).trim();
  const opts = (Array.isArray(b.opts) ? b.opts : []).slice(0, 40).map((o) => ({ l: String(o.l ?? "").slice(0, 80), v: o.v == null ? null : String(o.v).slice(0, 80) }));
  const flows = (Array.isArray(b.flows) ? b.flows : []).slice(0, 30).map((o) => ({ v: String(o.v).slice(0, 30), l: String(o.l).slice(0, 80) }));
  const body = JSON.stringify({ question: String(b.q || "").slice(0, 600), options: opts, freeTextAllowed: !!b.free, mode: b.mode === "prefill" ? "prefill" : "normal", tasks: flows, data: b.data || {}, history: Array.isArray(b.history) ? b.history.slice(-12) : [] });
  if (!typed || body.length > MAX_CHAT) return json(res, 400, { error: "bad request" });
  try {
    const o = await gemini(LITE, intentPrompt(lang), `${body}\n\nHe typed:\n${typed}`, 0.2);
    const okV = opts.some((x) => x.v === (o.v == null ? null : String(o.v)));
    let action = ["pick", "free", "reply", "switch", "ai", "none"].includes(o.action) ? o.action : "none";
    if (action === "pick" && !okV) action = "none";
    if (action === "switch" && !flows.some((f) => f.v === o.flow)) action = "ai";
    const amount = Number(o.amount);
    res.setHeader("Cache-Control", "private, no-store");
    return json(res, 200, { action, v: action === "pick" ? (o.v == null ? null : String(o.v)) : null, value: action === "free" ? String(o.value || typed).slice(0, 80) : null, flow: action === "switch" ? o.flow : null, amount: amount > 0 ? amount : null, cur: ["AED", "EGP", "USD", "EUR", "SAR"].includes(o.cur) ? o.cur : null, say: String(o.say || "").slice(0, 600) });
  } catch (e) {
    console.error("intent", e.message);
    return json(res, 502, { error: "AI unavailable" });
  }
}

// Free chat (POST /api/ideas?finance=chat): anything typed in the Floosy chat that the
// page does not understand as a command. The page sends a summary of the owner's data
// (no PIN, no raw transaction list) and the recent chat, at the owner's request (2026-11-19).
const MAX_CHAT = 40_000;
function chatPrompt(lang) {
  return `You are Shark (قرش) 🦈, the owner's personal money AGENT inside his finance app Floosy. Think like a sharp, honest financial planner who knows his numbers by heart, talks like a friend, and always ends with a clear next move.
${ISLAMIC}${RULES}${INVEST}
How to answer:
- Answer the owner's last message directly, using his real data below and what was said in the chat.
- Do the maths step by step from the data. Never invent a number, price or date that is not in the data or the message; if something is missing, say what you need.
- Follow the rules above (they are his chosen book). If what he asks breaks a rule, say which rule and what to do instead.
- Each country (UAE in AED, Egypt in EGP) is managed on its own. Use the currency of the thing being discussed.
- Short and practical: the answer, the reason with the key numbers, then what to do next. At most ~150 words.
- Not a licensed advisor: for investing in specific products, say to check them.
${lang === "en" ? "Write in plain, simple English." : "اكتب بالعامية المصرية البسيطة، جمل قصيرة، والأرقام بالأرقام الإنجليزي (123). لو كلمة إنجليزي اشرحها."}
- If a task in the app would help him act on your answer, add it to "do" using the task keys given in the data (tasks). Never more than 2.
Reply as JSON: {"answer":"the reply, may use \\n for new lines","next":["up to 3 short follow-up questions he might ask"],"do":["task key"]}`;
}

/** POST ?finance=chat { message, history:[{who,text}], data, lang } -> { answer, next } */
export async function chat(req, res, memory = "") {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY && !hasClaude()) return json(res, 503, { error: "no AI key" });
  const b = req.body || {};
  const lang = b.lang === "en" ? "en" : "ar";
  const message = String(b.message || "").slice(0, 2000).trim();
  const body = JSON.stringify({ data: b.data || {}, history: Array.isArray(b.history) ? b.history.slice(-30) : [], ...(memory ? { olderChatMemory: memory } : {}) });
  if (!message || body.length > MAX_CHAT) return json(res, 400, { error: "bad request" });
  try {
    const o = await gemini(CHAIR, chatPrompt(lang), `Owner's data and recent chat:\n${body}\n\nHis message now:\n${message}`, 0.4);
    res.setHeader("Cache-Control", "private, no-store");
    return json(res, 200, { do: (Array.isArray(o.do) ? o.do : []).slice(0, 2).map((x) => String(x).slice(0, 30)), answer: String(o.answer || "").slice(0, 4000), next: (Array.isArray(o.next) ? o.next : []).slice(0, 3).map((x) => String(x).slice(0, 120)) });
  } catch (e) {
    console.error("chat", e.message);
    return json(res, 502, { error: "AI unavailable" });
  }
}

// ───────────── 🦈 The agent (POST /api/ideas?finance=agent), Claude only ─────────────
// Shark answers with the owner's data + the whole saved chat (memory), and can call tools.
// The tools run IN THE PAGE (the money engine and the data live there), so this endpoint
// does one model step at a time: the page sends the turn's messages, runs any tool_use it
// gets back, appends the results and calls again until end_turn. Nothing is saved or spent
// by a tool: "propose_action" only shows a button the owner taps himself.
const AGENT_TOOLS = [
  { name: "simulate_goal", description: "Run the app's own money engine on a possible purchase or new monthly cost, starting now, and get the real numbers: when it is affordable in cash or on instalments, the 2x-essentials income threshold, the max monthly cost affordable now, and the impact AFTER the app's split in a normal month (to debt / safety / investing / free money, without vs with), debt-free date and safety-target date without vs with, and whether instalments create new debt. All amounts in AED. Call it before giving any verdict on a goal; never estimate these numbers yourself.",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "type"], properties: {
      name: { type: "string" }, type: { type: "string", enum: ["buy", "monthly", "term"], description: "buy = one-time purchase (cash or instalments); monthly = ongoing monthly cost; term = monthly cost for a set number of months" },
      price: { type: "number", description: "cash price (buy)" }, down: { type: "number", description: "down payment (buy on instalments)" }, instalment: { type: "number", description: "monthly instalment (buy on instalments)" },
      months: { type: "integer", description: "instalment months (buy) or duration (term)" }, monthly: { type: "number", description: "monthly amount (monthly/term)" },
      running: { type: "number", description: "monthly running costs of the thing (fuel, insurance, upkeep)" }, replaces: { type: "string", description: "name of the essentials item it replaces, e.g. transport" },
      contract: { type: "string", enum: ["islamic", "zero", "interest", "unknown"], description: "instalment contract: Islamic bank murabaha/ijara, true 0%, interest-bearing (riba), or unknown" } } } },
  { name: "compare_goals", description: "Run simulate_goal on 2-4 alternatives at once (e.g. cash vs 36 vs 48 months, cheaper car, waiting) and get them side by side.",
    input_schema: { type: "object", additionalProperties: false, required: ["options"], properties: { options: { type: "array", minItems: 2, maxItems: 4, items: { type: "object" } } } } },
  { name: "list_transactions", description: "Read the owner's recorded transactions (newest first), optionally filtered.",
    input_schema: { type: "object", additionalProperties: false, properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string" }, type: { type: "string", enum: ["income", "expense", "transfer", "debtpay", "invest", "divest"] }, text: { type: "string", description: "words to search in category/note" }, limit: { type: "integer", maximum: 100 } } } },
  { name: "show_chart", description: "Draw an animated chart inside your reply. Use it only when a picture makes the answer clearer: without vs with a goal (debt/safety/investing per month), 2-4 options compared, or a value over months. Use ONLY numbers that came from your tools or the context, never estimates. At most 2 charts per answer. Labels in the owner's language, short.",
    input_schema: { type: "object", additionalProperties: false, required: ["type", "title", "labels", "series"], properties: {
      type: { type: "string", enum: ["bar", "line"], description: "bar = compare categories/options; line = change over time" },
      title: { type: "string" }, unit: { type: "string", description: "e.g. AED or months" },
      labels: { type: "array", minItems: 1, maxItems: 24, items: { type: "string" } },
      series: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["name", "values"], properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } } } } } } },
  { name: "ask_user", description: "Ask the owner ONE short question and wait for his answer (the turn continues with it). Use it whenever a decision needs a fact you don't have: what exactly, price, how he will pay (cash / instalments / with interest or not), which pocket, his goal. Give 2-5 quick answer options when they exist; he can also type freely.",
    input_schema: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string" }, options: { type: "array", maxItems: 6, items: { type: "string" } } } } },
  { name: "record_expense", description: "Record a spending in the app AFTER the decision is clear. The owner sees a confirm button first; nothing is saved unless he taps it. bucket: essentials (needs an essentials item name), reward = the free money jar (wants, outings, gadgets), sadaqa, stability = emergency only.",
    input_schema: { type: "object", additionalProperties: false, required: ["bucket", "amount", "note"], properties: { bucket: { type: "string", enum: ["essentials", "reward", "sadaqa", "stability"] }, item: { type: "string", description: "essentials item name when bucket=essentials" }, amount: { type: "number" }, cur: { type: "string", enum: ["AED", "EGP", "USD", "EUR", "SAR"] }, note: { type: "string", description: "what it was, short" } } } },
  { name: "add_goal", description: "Add a big goal (car, apartment, course...) to the owner's goals card so the app tracks its date. He confirms first. Same fields as simulate_goal plus pay (cash | inst).",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "type"], properties: { name: { type: "string" }, type: { type: "string", enum: ["buy", "monthly", "term"] }, price: { type: "number" }, down: { type: "number" }, instalment: { type: "number" }, months: { type: "integer" }, monthly: { type: "number" }, running: { type: "number" }, replaces: { type: "string" }, contract: { type: "string", enum: ["islamic", "zero", "interest", "unknown"] }, pay: { type: "string", enum: ["cash", "inst"] } } } },
  { name: "simulate_situation", description: "What changes if where he or his wife lives changes (e.g. his wife moves to the UAE, or he moves back to Egypt): every essentials item now vs then using the amounts already saved per situation, total monthly change, a normal month after the split (debt/safety/investing/free money), and the debt-free and safety-target dates now vs then. 'missing' lists items with no saved amount for the new situation: ask him only about those and about new costs the move adds (bigger flat, her phone, her transport).",
    input_schema: { type: "object", additionalProperties: false, properties: { me: { type: "string", enum: ["AED", "EGP"], description: "AED = he lives in the UAE, EGP = in Egypt" }, wife: { type: "string", enum: ["AED", "EGP"] }, from: { type: "string", description: "YYYY-MM-DD when it would start" } } } },
  { name: "spending_summary", description: "Analyse the owner's spending habits from his real transactions: per month per pocket, top categories and items, small frequent buys, weekday pattern, free-money jar overspend, essentials items over budget. Use it to spot bad habits and suggest concrete improvements.",
    input_schema: { type: "object", additionalProperties: false, properties: { months: { type: "integer", minimum: 1, maximum: 12 } } } },
  { name: "invest_projection", description: "The app's investing engine (Mark Tilbury rules): when investing starts (after debt), monthly amount, the mix for a risk level 1-6, and expected value after 1/3/5/10 years in low/mid/high scenarios. Add your Islamic screen on top (no interest-bearing bonds or deposits; sukuk, sharia-compliant index funds, halal trade/partnership instead).",
    input_schema: { type: "object", additionalProperties: false, properties: { risk: { type: "integer", minimum: 1, maximum: 6 }, extraMonthly: { type: "number", description: "extra AED a month if he raises income" } } } },
  { name: "ask_council", description: "When the decision is NOT clear after the steps, convene the app's council (5 advisors incl. the Islamic one + a chair) on a goal and get their verdict. Costs more and takes ~20s, so only when truly needed.",
    input_schema: { type: "object", additionalProperties: false, required: ["name", "type"], properties: { name: { type: "string" }, type: { type: "string", enum: ["buy", "monthly", "term"] }, price: { type: "number" }, down: { type: "number" }, instalment: { type: "number" }, months: { type: "integer" }, monthly: { type: "number" }, running: { type: "number" }, replaces: { type: "string" }, contract: { type: "string", enum: ["islamic", "zero", "interest", "unknown"] } } } },
  { name: "request_feature", description: "The owner wants something new in the app (a new goal type, a tracker, a card, a rule change). You cannot change the app's code yourself; save a clear request (what, why, how it should work) so his developer assistant builds it, and tell him that.",
    input_schema: { type: "object", additionalProperties: false, required: ["title", "what"], properties: { title: { type: "string" }, what: { type: "string", description: "what to build and how it should behave" }, why: { type: "string" } } } },
  { name: "point_to", description: "Show the owner something ON his Floosy page: the screen glides to it, a glowing cursor points at it and your short note appears, then he comes back to you. Use it when explaining where a number lives or what to look at (e.g. the free money jar, the debt, the safety target).",
    input_schema: { type: "object", additionalProperties: false, required: ["place", "note"], properties: { place: { type: "string", enum: ["hero", "debt", "have", "today", "cta", "pay", "month", "essentials", "living", "safety", "fun", "goals", "sadaqa", "invest", "wallets", "transfers", "rules", "transactions", "analytics", "log"] }, note: { type: "string", description: "one short line shown next to it" } } } },
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { name: "propose_action", description: "Offer the owner a button that starts one of the app's tasks (he taps it himself; nothing happens until then). Use when your answer leads to a clear next step.",
    input_schema: { type: "object", additionalProperties: false, required: ["task", "label"], properties: { task: { type: "string", description: "a task key from the tasks list in the context" }, label: { type: "string", description: "short button text in the owner's language" }, amount: { type: "number" }, cur: { type: "string", enum: ["AED", "EGP", "USD", "EUR", "SAR"] } } } },
];

function agentPrompt(lang) {
  return `You are Shark (قرش) 🦈, the owner's personal, open-minded finance consultant and money AGENT inside his app Floosy. You are sharp, honest and warm, like a friend who is a great Muslim financial planner, knows his numbers and his habits by heart, and gets things done.
${ISLAMIC}${RULES}${INVEST}
What you get each turn: <saved_snapshot> (his data when last saved) + <changes_since_snapshot> (only what changed since: + added, - removed, ~ old → new; apply them to know his data NOW) (his live data: wallets per currency and pocket, debts, essentials, goals, the video rules word for word in videoRules, the app's tasks, recent chat) and <chat_memory_saved> + <new_chat_since_snapshot> (everything you discussed before). Use both; never make him repeat himself.

LOOK BEFORE YOU ASK: before every ask_user, check the context (essentials with bySituation amounts, wallets, debts, goals, recent chat, chat_memory) and your tools (list_transactions, spending_summary, simulate_situation, simulate_goal). Only ask what is truly not in his data, and say what you already found ("لقيت إيجارك 1000 هنا…").
Think in every point of view: a life change ripples through many items (e.g. his wife coming to the UAE → rent maybe bigger, food, her phone line, transport, visa/insurance, and the Egypt flat costs may stop) — use simulate_situation, list every affected item, and ask only about the ones with no amount.

DECISION PROTOCOL — "should I buy / take / do X?" (also jobs, side work, commitments):
1. Understand: what exactly, price, how he will pay (cash / instalments; interest or Islamic or 0%), why. Missing a key fact → ask_user (ONE question at a time, with options).
2. 🕌 Halal or haram: if clearly fine, ONE line "🕌 ✅ مفيش مشكلة شرعية" and move on. If riba, gharar, haram goods/work, or doubt: web_search Quran/Sunnah (and reliable fatwa sites) and give the reference (surah:ayah, hadith source); never invent a text; say what to confirm with a scholar. If haram → stop there and give the halal alternative.
3. 🌴 Rich Muslims: one line of how Abdulrahman ibn Awf / Uthman / righteous merchants would see it (e.g. honest small, steady profit and productive work beat waiting for a big one; quote a saying only if you are sure it is authentic, otherwise state the principle). web_search if you need specifics.
4. 📜 Mark Tilbury 1% Rule: name the exact rule(s) from videoRules / the rules above that decide it (essentials ≤ 50%, debt first, free-money jar for wants, 7-day wait, 2x living-level rule, safety never for goals...).
5. 🧮 Numbers: simulate_goal / compare_goals for purchases and commitments. Say the POCKET it comes from and what it has: e.g. "هتدفعها من 🎉 الفلوس الحرّة، فيها 151 درهم" or "ده بند أساسيات جديد، والأساسيات هتبقى X". Add a show_chart when it helps.
6. Clear → verdict (✅ اشتري / ⏳ استنى لحد ... / ❌ لأ) in one line. Not clear → ask_council.
7. CTA: finish with a doable step: record_expense (if he is buying now), add_goal (if it's a goal), propose_action, or request_feature (if the app needs something new). Ask before recording; the confirm button is shown by the tool.

OTHER JOBS:
- Habits: spending_summary → 2-3 bad habits with numbers, and a concrete fix each (cap, rule, wait, swap).
- Investing: invest_projection for amounts/timing/expected value; add the Islamic screen (no riba: avoid interest bonds/deposits; sukuk, sharia-compliant index funds, halal trade/partnership); give a % mix and expected low/mid/high, never a promise; web_search for current halal products available in the UAE/Egypt and name them as options to check.
- Research: web_search books, articles, Quran/hadith, product info when it improves the answer. Cite sources briefly.
- Showing: use point_to to show him where something is on his page while you explain (max 2 per answer).
- New things in the app: you cannot edit code; request_feature saves a precise spec for his developer assistant (Claude Code) to build.

SHOW YOUR RESEARCH: whenever you web_search, put what you found IN the answer under the step it belongs to, e.g. "🔎 لقيت: عبد الرحمن بن عوف لما دخل المدينة قال «دلّوني على السوق» (صحيح البخاري)". Quote short, give the source, and connect it to his decision. Never search silently.
WORK / INCOME OFFERS (a freelance job, a side gig, a low rate): compare the offered hourly rate with his salary's hourly rate (salary ÷ ~176 h) and with what that time could earn elsewhere; count what it really adds per month after the split (debt first while in debt); weigh skills, portfolio, reputation and energy; then 🕌 (halal work? fair contract?), 🌴 (the Companions valued honest small profit and started small, e.g. Abdulrahman ibn Awf began trading with little: find and cite), 📜 (Mark Tilbury: raise income, a skill is the best investment), 🧮 numbers, ✅ verdict with a condition (e.g. "خدها لو ≤ X ساعات في الأسبوع ولمدة شهرين، وبعدين ارفع السعر لـ Y").
CTA must be REAL and useful now: a task he can do today in the app (record an expense he actually made, add a goal, open a task) — never offer to record money he has not received yet, and skip the CTA if nothing fits.
The VERDICT comes first or last in one clear line (✅/⏳/❌), so he never has to guess what you decided.
Style: short lines with the step emojis, skip steps that don't apply, no filler. Max ~200 words unless comparing. Never invent numbers, dates, prices, verses or hadith.
${lang === "en" ? "Write in plain, simple English, warm and a bit funny." : "ردّ دايمًا بالعامية المصرية حتى لو هو كتب أو اتكلم إنجليزي أو خلط عربي وإنجليزي (المصطلحات الإنجليزي تفضل زي ما هي). اكتب بالعامية المصرية زي واحد صاحبه ابن بلد ودمه خفيف: قفشة صغيرة أو تشبيه مصري هنا وهناك (\"يا معلم\"، \"إحنا مش ناقصين أقساط يا باشا\")، بس الأرقام والقرار جد ومظبوطين، ومن غير تريقة عليه. جمل قصيرة، والأرقام بالأرقام الإنجليزي (123). لو كلمة إنجليزي اشرحها."}`;
}

/** POST ?finance=agent { messages, data?, lang } -> { content, stop_reason, first? } */
export async function agent(req, res, ctx = null) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!hasClaude()) return json(res, 503, { error: "no-claude" });
  const b = req.body || {};
  const lang = b.lang === "en" ? "en" : "ar";
  let messages = Array.isArray(b.messages) ? b.messages : [];
  if (!messages.length || JSON.stringify(messages).length > 400_000) return json(res, 400, { error: "bad request" });
  let first = null;
  // first step of a turn: the server builds the opening message (data + memory + his words) and hands it
  // back, so later steps of the same turn resend it byte-for-byte (append-only history)
  if (b.start) {
    const q = String(b.start).slice(0, 4000);
    // saved snapshot + saved chat = the same bytes for every question until it is rebased → prompt cache (1 hour)
    const c = ctx || { snapshot: JSON.stringify(b.data || {}), savedAt: "", memory: "", changes: "", newChat: "" };
    first = { role: "user", content: [
      { type: "text", text: `<saved_snapshot saved_at="${c.savedAt}">\n${c.snapshot}\n</saved_snapshot>\n<chat_memory_saved>\n${c.memory || "(empty)"}\n</chat_memory_saved>`, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: `<changes_since_snapshot>\n${c.changes || "(none)"}\n</changes_since_snapshot>\n<new_chat_since_snapshot>\n${c.newChat || "(none)"}\n</new_chat_since_snapshot>\n<message>\n${q}\n</message>` },
    ] };
    messages = [first];
  }
  try {
    const r = await claudeStep({ system: agentPrompt(lang), tools: AGENT_TOOLS, messages });
    res.setHeader("Cache-Control", "private, no-store");
    return json(res, 200, { ...r, ...(first ? { first } : {}) });
  } catch (e) {
    console.error("agent", e.status || "", e.message);
    return json(res, 502, { error: "AI unavailable" });
  }
}
