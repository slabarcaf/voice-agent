// OpenAI-compatible chat completions endpoint backed by the brain.
// Used by ElevenLabs ("Custom LLM", server-to-server with the shared secret) and by the
// open-source engine in the browser (origin-checked). Persona and model are chosen here,
// so the caller's `model` and system prompt are ignored.
import { respond } from "../brain/respond.mjs";
import { cors, gate } from "../brain/guardrails.mjs";
import { detectLang } from "../brain/lang.mjs";

// ElevenLabs offers a `language_detection` tool. Calling it switches speech recognition and
// the voice model (its English model can't pronounce Spanish), so we call it whenever the
// visitor's language differs from the one the conversation is in.
function languageSwitch(body) {
  if (!(body.tools || []).some((t) => t.function?.name === "language_detection")) return null;
  const msgs = body.messages || [];
  if (msgs[msgs.length - 1]?.role !== "user") return null; // e.g. right after our own switch
  let current = detectLang(msgs.find((m) => m.role === "assistant")?.content || "") || "en";
  for (const m of msgs)
    for (const tc of m.tool_calls || [])
      if (tc.function?.name === "language_detection") current = JSON.parse(tc.function.arguments || "{}").language || current;
  const wanted = detectLang(String(msgs[msgs.length - 1].content || ""));
  if (!wanted || wanted === current) return null;
  return {
    id: `call_${Date.now().toString(36)}`,
    type: "function",
    function: { name: "language_detection", arguments: JSON.stringify({ reason: `Visitor is speaking ${wanted === "es" ? "Spanish" : "English"}`, language: wanted }) },
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const blocked = await gate(req);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  // Shape only, never content: lets us see what each caller (ElevenLabs, browser) sends.
  console.log(JSON.stringify({ path: req.url, roles: (body.messages || []).map((m) => m.role), tools: (body.tools || []).map((t) => t.function?.name) }));
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const agentId = req.query?.agent || "resume";

  const toolCall = languageSwitch(body);
  if (toolCall) {
    if (!body.stream)
      return res.status(200).json({ id, object: "chat.completion", created, model: "brain", choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [toolCall] }, finish_reason: "tool_calls" }] });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" });
    const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "brain", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    chunk({ role: "assistant", tool_calls: [{ index: 0, ...toolCall }] });
    chunk({}, "tool_calls");
    res.write("data: [DONE]\n\n");
    return res.end();
  }

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
