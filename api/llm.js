// OpenAI-compatible chat completions endpoint backed by the brain.
// Used by ElevenLabs ("Custom LLM", server-to-server with the shared secret) and by the
// open-source engine in the browser (origin-checked). Persona and model are chosen here,
// so the caller's `model` and system prompt are ignored.
import { respond } from "../brain/respond.mjs";
import { cors, gate } from "../brain/guardrails.mjs";

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const blocked = await gate(req);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  // Shape only, never content: lets us see what each caller (ElevenLabs, browser) sends.
  console.log(JSON.stringify({ path: req.url, keys: Object.keys(body), roles: (body.messages || []).map((m) => m.role), tools: (body.tools || []).map((t) => t.function?.name || t.type), toolSchemas: (body.tools || []).map((t) => t.function?.parameters), toolMsgs: (body.messages || []).filter((m) => m.tool_calls || m.role === "tool").map((m) => ({ role: m.role, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })) }));
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const agentId = req.query?.agent || "resume";

  let turn, first;
  try {
    turn = respond({ agentId, messages: body.messages });
    first = await turn.next(); // surface "no provider"/validation errors as a clean 4xx/5xx
  } catch (err) {
    const status = /last message|unknown agent/.test(err.message) ? 400 : 502;
    return res.status(status).json({ error: err.message });
  }

  const meta = first.value?.type === "meta" ? first.value : null;
  if (meta) res.setHeader("X-Brain-Route", `${meta.route};${meta.provider};${meta.model}`);

  if (!body.stream) {
    let text = "";
    for await (const ev of turn) if (ev.type === "text") text += ev.text;
    return res.status(200).json({
      id, object: "chat.completion", created, model: meta?.model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    });
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const send = (delta, finish = null) =>
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: meta?.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  send({ role: "assistant" });
  try {
    for await (const ev of turn) if (ev.type === "text") send({ content: ev.text });
  } catch (err) {
    console.error("[llm] stream error:", err.message);
  }
  send({}, "stop");
  res.write("data: [DONE]\n\n");
  res.end();
}
