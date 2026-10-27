// Text-only eval of the brain: language, facts, refusals, route, latency.
//   node --env-file=.env.local evals/run.mjs [--only id1,id2] [--delay seconds] [--verbose] [--url https://…]
import fs from "node:fs";
import { respond } from "../brain/respond.mjs";

const qs = JSON.parse(fs.readFileSync(new URL("./questions.json", import.meta.url)));
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const delayMs = process.argv.includes("--delay") ? Number(process.argv[process.argv.indexOf("--delay") + 1]) * 1000 : 0;
const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;

// --url runs the questions against a deployed /api/llm instead of the local brain.
async function* remote(messages) {
  const r = await fetch(`${url}/api/llm`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ messages, stream: true }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const [route, provider, model] = (r.headers.get("x-brain-route") || "").split(";");
  yield { type: "meta", route, provider, model };
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).replace(/^data: /, "");
      buf = buf.slice(i + 2);
      if (line === "[DONE]") return;
      const text = JSON.parse(line).choices[0]?.delta?.content;
      if (text) yield { type: "text", text };
    }
  }
}

const ES = /\b(el|la|los|las|de|que|en|es|su|para|con|por|una|del|está|también)\b/gi;
const EN = /\b(the|and|is|he|his|for|with|of|to|in|was|has|at|on|also)\b/gi;
const langOf = (t) => ((t.match(ES) || []).length > (t.match(EN) || []).length ? "es" : "en");
const has = (t, s) => t.toLowerCase().includes(s.toLowerCase());

let passed = 0;
const rows = [];
for (const c of qs.filter((c) => !only || only.includes(c.id))) {
  if (delayMs && rows.length) await new Promise((r) => setTimeout(r, delayMs)); // free-tier TPM limits
  const t0 = performance.now();
  let ttft = null, text = "", meta = {}, error = null;
  try {
    for await (const ev of (url ? remote : (m) => respond({ messages: m }))([{ role: "user", content: c.q }])) {
      if (ev.type === "meta") meta = ev;
      else { ttft ??= performance.now() - t0; text += ev.text; }
    }
  } catch (e) { error = e.message; }
  const total = performance.now() - t0;
  const fails = [];
  if (error) fails.push(`error: ${error}`);
  if (!error && langOf(text) !== c.lang) fails.push(`language ${langOf(text)}≠${c.lang}`);
  if (c.anyOf && !c.anyOf.some((s) => has(text, s))) fails.push(`missing any of [${c.anyOf}]`);
  if (c.alsoAnyOf && !c.alsoAnyOf.some((s) => has(text, s))) fails.push(`missing any of [${c.alsoAnyOf}]`);
  if (c.noneOf) for (const s of c.noneOf) if (has(text, s)) fails.push(`contains "${s}"`);
  if (c.route && meta.route !== c.route) fails.push(`route ${meta.route}≠${c.route}`);
  if (text.length > 900) fails.push(`too long for voice (${text.length} chars)`);
  if (!fails.length) passed++;
  rows.push({ id: c.id, ok: !fails.length, route: meta.route, model: meta.model, ttft: ttft && Math.round(ttft), total: Math.round(total), fails, text });
  console.log(`${fails.length ? "✗" : "✓"} ${c.id.padEnd(14)} ${String(meta.provider ?? "-").padEnd(9)} ttft ${String(ttft ? Math.round(ttft) : "-").padStart(5)}ms  ${fails.join("; ")}`);
  if (process.argv.includes("--verbose") || fails.length) console.log(`    "${text.replace(/\s+/g, " ").slice(0, 300)}"`);
}
console.log(`\n${passed}/${rows.length} passed`);
fs.writeFileSync(new URL("./last-run.json", import.meta.url), JSON.stringify(rows, null, 2));
process.exit(passed === rows.length ? 0 : 1);
