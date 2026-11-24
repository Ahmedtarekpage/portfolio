// Claude for Floosy (owner's choice, 2026-11-20): Claude Opus 5.5 replaces Gemini once
// ANTHROPIC_API_KEY is set in Vercel; until then advisor.js keeps using Gemini.
// Anthropic does not train on API data by default. Only what the page sends (rounded
// numbers, the chat) goes out; the PIN never does.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export const hasClaude = () => !!process.env.ANTHROPIC_API_KEY;
let _client = null;
const client = () => (_client ||= new Anthropic({ timeout: 55_000, maxRetries: 1 }));

// Opus 5.5 may decline on its safety classifiers; "default" fallbacks re-run the request
// on Anthropic's recommended model in the same call.
const BASE = { model: MODEL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

/** pulls the first JSON object out of the reply (tolerates ```json fences or a sentence around it) */
export function parseJSON(text) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in reply");
  return JSON.parse(t.slice(a, b + 1));
}

/** one call that must answer with a JSON object (council seats, chat, intent) */
export async function claudeJSON(system, user, effort = "low") {
  const r = await client().beta.messages.create({
    ...BASE, max_tokens: 16000, output_config: { effort },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  if (r.stop_reason === "refusal") throw new Error("refusal");
  return parseJSON(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

/** one step of the agent loop. The tools run in the page (the money engine lives there),
 *  so the page sends the turn's messages back with tool results until stop_reason is end_turn. */
export async function claudeStep({ system, tools, messages, effort = "medium" }) {
  const r = await client().beta.messages.create({
    ...BASE, max_tokens: 16000, output_config: { effort },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools, messages,
  });
  return { content: r.content, stop_reason: r.stop_reason };
}
