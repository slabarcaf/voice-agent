import test from "node:test";
import assert from "node:assert/strict";
import { classify, candidates } from "./router.mjs";
import { AGENTS } from "./agents.mjs";

test("simple facts go fast", () => {
  assert.equal(classify("Where did he study?"), "fast");
  assert.equal(classify("¿Dónde estudió?"), "fast");
});
test("fit and judgment go smart", () => {
  assert.equal(classify("Would he be a good fit for a strategy role at Stripe?"), "smart");
  assert.equal(classify("¿Por qué debería contratarlo?"), "smart");
  assert.equal(classify("x".repeat(500)), "smart");
});
test("providers without keys are skipped", () => {
  const c = candidates(AGENTS.resume, "why him?", { GROQ_API_KEY: "g" });
  assert.deepEqual(c.map((x) => x.provider), ["groq"]);
  assert.equal(c[0].route, "smart");
});
test("fast turns prefer Haiku, smart turns Sonnet, Groq last", () => {
  const env = { GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" };
  assert.deepEqual(candidates(AGENTS.resume, "Where did he study?", env).map((x) => x.model), ["claude-haiku-5-5", "openai/gpt-oss-120b"]);
  assert.deepEqual(candidates(AGENTS.resume, "Why hire him?", env).map((x) => x.model), ["claude-sonnet-5-5", "openai/gpt-oss-120b"]);
});
