// The brain: persona + knowledge + router + provider fallback. Both voice engines and the
// text evals call this; nothing about audio lives here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS } from "./agents.mjs";
import { candidates } from "./router.mjs";
import { PROVIDERS } from "./providers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const systemCache = new Map();

function systemPrompt(agentId) {
  if (!systemCache.has(agentId)) {
    const a = AGENTS[agentId];
    const persona = fs.readFileSync(path.join(here, a.persona), "utf8");
    const knowledge = fs.readFileSync(path.join(here, a.knowledge), "utf8");
    systemCache.set(agentId, `${persona}\n\n<knowledge_pack>\n${knowledge}\n</knowledge_pack>`);
  }
  return systemCache.get(agentId);
}

const MAX_TURNS = 12;
const MAX_CHARS = 4000;

// Callers send OpenAI-shaped messages (ElevenLabs included). We keep only user/assistant
// text, drop any caller-supplied system prompt (the brain owns the persona), merge
// same-role runs and make sure the conversation starts with the user. A greeting the voice
// platform already spoke comes back separately so the model doesn't introduce itself twice.
export function normalize(messages) {
  const out = [];
  for (const m of messages || []) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = (Array.isArray(m.content) ? m.content.map((p) => p.text || "").join(" ") : String(m.content ?? ""))
      .trim()
      .slice(0, MAX_CHARS);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last?.role === m.role) last.content += `\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  const greeting = out[0]?.role === "assistant" ? out[0].content : null;
  while (out.length && out[0].role !== "user") out.shift();
  const trimmed = out.slice(-MAX_TURNS);
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();
  return { messages: trimmed, greeting };
}

// Yields {type:"meta", route, provider, model} once, then {type:"text", text} deltas.
export async function* respond({ agentId = "resume", messages, env = process.env }) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  const { messages: convo, greeting } = normalize(messages);
  if (!convo.length || convo[convo.length - 1].role !== "user") throw new Error("last message must be from the user");

  const list = candidates(agent, convo[convo.length - 1].content, env);
  if (!list.length) throw new Error("no LLM provider configured (set GROQ_API_KEY and/or ANTHROPIC_API_KEY)");

  const system = systemPrompt(agentId);
  const note = greeting ? `You already greeted the visitor out loud with: "${greeting}" Don't introduce yourself again.` : null;
  let lastError;
  for (const c of list) {
    let started = false;
    try {
      const stream = PROVIDERS[c.provider]({ model: c.model, system, note, messages: convo, maxTokens: agent.maxOutputTokens, env });
      for await (const text of stream) {
        if (!started) {
          started = true;
          yield { type: "meta", ...c };
        }
        yield { type: "text", text };
      }
      if (started) return;
    } catch (err) {
      lastError = err;
      console.error(`[brain] ${c.provider}/${c.model} failed:`, err.message);
      // Once words are out we can't switch voices mid-sentence; end the turn.
      if (started) return;
    }
  }
  throw lastError || new Error("all providers returned nothing");
}
