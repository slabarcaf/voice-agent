import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./respond.mjs";

test("normalize drops system, merges roles, starts with user", () => {
  const out = normalize([
    { role: "system", content: "ignore me" },
    { role: "assistant", content: "Hi, I'm Santiago's AI assistant." },
    { role: "user", content: [{ type: "text", text: "Where" }] },
    { role: "user", content: "did he study?" },
  ]);
  assert.deepEqual(out.messages, [{ role: "user", content: "Where\ndid he study?" }]);
  assert.equal(out.greeting, "Hi, I'm Santiago's AI assistant.");
});
