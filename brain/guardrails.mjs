// Cost and abuse controls shared by every endpoint. The site is public, so:
// kill switch → who may call → how often.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DEFAULT_ORIGINS = ["https://santiagolabarca.vercel.app", "https://voice-agent-three-sable.vercel.app", "http://localhost:4322", "http://localhost:3000"];

export function allowedOrigins(env = process.env) {
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function cors(req, res, env = process.env) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins(env).includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

// Server-to-server callers (ElevenLabs' Custom LLM) present the shared secret.
export function isTrustedServer(req, env = process.env) {
  const secret = env.LLM_SHARED_SECRET;
  return !!secret && req.headers.authorization === `Bearer ${secret}`;
}

let limiters;
function getLimiters(env) {
  if (limiters !== undefined) return limiters;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return (limiters = null);
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  const n = (k, d) => Number(env[k]) || d;
  limiters = {
    // A 3-minute conversation is ~15–25 turns; 60/hour allows a couple of full chats per visitor.
    ipTurns: new Ratelimit({ redis, prefix: "va:ip-turn", limiter: Ratelimit.slidingWindow(n("IP_TURNS_PER_HOUR", 60), "1 h") }),
    ipSessions: new Ratelimit({ redis, prefix: "va:ip-session", limiter: Ratelimit.fixedWindow(n("IP_SESSIONS_PER_DAY", 5), "1 d") }),
    globalTurns: new Ratelimit({ redis, prefix: "va:all-turn", limiter: Ratelimit.fixedWindow(n("GLOBAL_TURNS_PER_DAY", 600), "1 d") }),
  };
  return limiters;
}

export function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

// Returns null when the request may proceed, or {status, error} when it must stop.
export async function gate(req, { kind = "turn", env = process.env } = {}) {
  if (env.VOICE_ENABLED === "false") return { status: 503, error: "voice agent is turned off" };

  const trusted = isTrustedServer(req, env);
  if (!trusted && !allowedOrigins(env).includes(req.headers.origin)) return { status: 403, error: "origin not allowed" };

  const l = getLimiters(env);
  if (!l) return null; // no Redis configured (local dev): no limits
  const ip = clientIp(req);
  const checks = [l.globalTurns.limit("all")];
  if (!trusted) checks.push((kind === "session" ? l.ipSessions : l.ipTurns).limit(ip));
  const results = await Promise.all(checks);
  if (results.some((r) => !r.success)) return { status: 429, error: "rate limit reached — try again later" };
  return null;
}
