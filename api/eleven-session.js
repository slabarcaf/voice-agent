// Starts a version-A conversation: returns a short-lived WebRTC token for our private
// ElevenLabs agent. The agent requires auth, so this endpoint is the only way in, and the
// per-visitor session limits apply here.
import fs from "node:fs";
import { cors, gate } from "../brain/guardrails.mjs";

const { agentId } = JSON.parse(fs.readFileSync(new URL("../eleven/agent.json", import.meta.url)));

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const blocked = await gate(req, { kind: "session" });
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
  });
  if (!r.ok) {
    console.error("[eleven-session]", r.status, (await r.text()).slice(0, 300));
    return res.status(502).json({ error: "could not start a voice session" });
  }
  const { token } = await r.json();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ token });
}
