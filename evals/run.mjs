// Text-only eval of the brain: language, facts, refusals, route, latency.
//   node --env-file=.env.local evals/run.mjs [--only id1,id2]
import fs from "node:fs";
import { respond } from "../brain/respond.mjs";

const qs = JSON.parse(fs.readFileSync(new URL("./questions.json", import.meta.url)));
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;

const ES = /\b(el|la|los|las|de|que|en|es|su|para|con|por|una|del|está|también)\b/gi;
const EN = /\b(the|and|is|he|his|for|with|of|to|in|was|has|at|on|also)\b/gi;
const langOf = (t) => ((t.match(ES) || []).length > (t.match(EN) || []).length ? "es" : "en");
const has = (t, s) => t.toLowerCase().includes(s.toLowerCase());

let passed = 0;
const rows = [];
for (const c of qs.filter((c) => !only || only.includes(c.id))) {
  const t0 = performance.now();
  let ttft = null, text = "", meta = {}, error = null;
  try {
    for await (const ev of respond({ messages: [{ role: "user", content: c.q }] })) {
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
