// Server-side text-to-speech for the open-source engine (B) on devices that can't run Kokoro
// (phones, browsers without WebGPU). The page posts one sentence and gets a WAV back.
// Orpheus (Canopy Labs) is an open-weights model; Groq serves it. English only.
import Groq from "groq-sdk";
import { cors, gate } from "../brain/guardrails.mjs";

const MAX_CHARS = 400; // one chunk from the page's sentence splitter, with room to spare

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Each sentence is a request, so this only checks the kill switch and origin; the turn that
  // produced the text was already counted by /api/llm.
  const blocked = await gate(req, { kind: "tts" });
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "no text" });
  if (text.length > MAX_CHARS) return res.status(413).json({ error: "text too long" });

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const out = await groq.audio.speech.create({
      model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
      voice: process.env.GROQ_TTS_VOICE || "hannah",
      input: text,
      response_format: "wav",
    });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(await out.arrayBuffer()));
  } catch (err) {
    console.error("[tts]", err.status || "", String(err.message).slice(0, 300));
    return res.status(502).json({ error: "speech failed" });
  }
}
