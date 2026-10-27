// One entry per agent. A new agent = a persona file + a knowledge file + a route table.
// Model ids come from env so they can be swapped without a code change.
export const AGENTS = {
  resume: {
    persona: "personas/resume-agent.md",
    knowledge: "knowledge/knowledge.md",
    maxOutputTokens: 350,
    routes: {
      // Small talk and simple facts: fast and free.
      fast: [
        { provider: "groq", model: (env) => env.GROQ_FAST_MODEL || "llama-3.3-70b-versatile" },
        { provider: "anthropic", model: (env) => env.CLAUDE_SMART_MODEL || "claude-sonnet-5-5" },
      ],
      // Fit, judgment and synthesis: better reasoning, paid.
      smart: [
        { provider: "anthropic", model: (env) => env.CLAUDE_SMART_MODEL || "claude-sonnet-5-5" },
        { provider: "groq", model: (env) => env.GROQ_FAST_MODEL || "llama-3.3-70b-versatile" },
      ],
    },
  },
};
