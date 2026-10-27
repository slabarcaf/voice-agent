// Picks a route per turn with plain rules — no extra LLM call, so it adds no latency.
const JUDGMENT = [
  /\bfit\b/i, /\bwhy\b/i, /\bcompar/i, /\bshould\b/i, /\bhire\b/i, /\bstrength/i, /\bweakness/i,
  /\bjob description\b/i, /\brole (at|for)\b/i, /\bgood (match|candidate)\b/i, /\bstand out\b/i,
  /por ?qu[eé]/i, /\bencaja/i, /\bcalza/i, /\bcontratar/i, /\bfortaleza/i, /\bdebilidad/i,
  /\b(puesto|cargo|rol) (en|de|para)\b/i, /\bbuen candidato\b/i, /\bdestaca/i,
];

export function classify(text) {
  if (text.length > 400) return "smart"; // pasted job description or long question
  return JUDGMENT.some((r) => r.test(text)) ? "smart" : "fast";
}

const configured = { groq: (env) => !!env.GROQ_API_KEY, anthropic: (env) => !!env.ANTHROPIC_API_KEY };

// Ordered candidates for this turn: the route's preference, minus providers without a key.
export function candidates(agent, text, env) {
  const route = classify(text);
  const list = agent.routes[route]
    .filter((c) => configured[c.provider](env))
    .map((c) => ({ route, provider: c.provider, model: c.model(env) }));
  return list;
}
