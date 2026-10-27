import test from "node:test";
import assert from "node:assert/strict";
import { detectLang } from "./lang.mjs";

test("detects Spanish and English, unsure on noise", () => {
  assert.equal(detectLang("Hola, ¿dónde estudió Santiago?"), "es");
  assert.equal(detectLang("cuéntame de su trabajo"), "es");
  assert.equal(detectLang("Where did he study?"), "en");
  assert.equal(detectLang("Xepelin"), null);
});
