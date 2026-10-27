// Speech-to-text for the open-source engine (B): the browser posts one utterance as a WAV
// (16 kHz mono, cut by the VAD) and gets back the transcript and its language.
// Whisper large-v3-turbo is an open model; Groq serves it on the free tier.
import Groq, { toFile } from "groq-sdk";
import { cors, gate } from "../brain/guardrails.mjs";

const MAX_BYTES = 2_000_000; // ~60 s of 16 kHz 16-bit mono; well under Vercel's 4.5 MB body cap

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("audio too long"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const blocked = await gate(req);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  let audio;
  try {
    audio = await readBody(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (audio.length < 1000) return res.status(400).json({ error: "no audio" });

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const out = await groq.audio.transcriptions.create({
      file: await toFile(audio, "utterance.wav", { type: "audio/wav" }),
      model: process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
      response_format: "verbose_json",
      temperature: 0,
    });
    // Whisper names the language in full ("english", "spanish"); the page wants a code.
    const lang = /^(es|spanish)/i.test(out.language || "") ? "es" : "en";
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ text: (out.text || "").trim(), lang });
  } catch (err) {
    console.error("[stt]", err.status || "", String(err.message).slice(0, 300));
    return res.status(502).json({ error: "transcription failed" });
  }
}
