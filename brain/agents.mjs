// One entry per agent. A new agent = a persona file + a knowledge file + a route table.
// Model ids come from env so they can be swapped without a code change.
const haiku = { provider: "anthropic", model: (env) => env.CLAUDE_FAST_MODEL || "claude-haiku-5-5" };
const sonnet = { provider: "anthropic", model: (env) => env.CLAUDE_SMART_MODEL || "claude-sonnet-5-5" };
// Groq's free tier (8k tokens/min) can't carry a live conversation alone; it's the fallback.
const groq = { provider: "groq", model: (env) => env.GROQ_FAST_MODEL || "openai/gpt-oss-120b" };

export const AGENTS = {
  resume: {
    persona: "personas/resume-agent.md",
    knowledge: "knowledge/knowledge.md",
    maxOutputTokens: 350,
    routes: {
      // Small talk and simple facts: fastest and cheapest.
      fast: [haiku, groq],
      // Fit, judgment and synthesis: better reasoning.
      smart: [sonnet, groq],
    },
  },
};
