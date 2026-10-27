// Creates or updates the ElevenLabs agent (version A). Idempotent: ids live in eleven/agent.json.
//   node --env-file=.env.local eleven/setup.mjs
// ElevenLabs handles speech-to-text, turn-taking and the voice; every reply comes from our
// brain through its "Custom LLM" option, authenticated with LLM_SHARED_SECRET.
import fs from "node:fs";

const API = "https://api.elevenlabs.io";
const BRAIN_URL = process.env.BRAIN_URL || "https://voice-agent-three-sable.vercel.app/api/llm";
const VOICE_ID = process.env.ELEVEN_VOICE_ID || "MPg42ZNt9M5HK0OndUTJ"; // Ashley Gordon (Voice Library)
const stateFile = new URL("./agent.json", import.meta.url);
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

// The shared secret is stored at ElevenLabs as a workspace secret, never in the agent config.
if (!state.secretId) {
  const s = await call("POST", "/v1/convai/secrets", { type: "new", name: "voice-agent-llm", value: process.env.LLM_SHARED_SECRET });
  state.secretId = s.secret_id;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
}

export const config = {
  name: "Santiago's AI assistant (résumé)",
  conversation_config: {
    agent: {
      first_message: "Hi! I'm Santiago's AI assistant. Ask me anything about his experience, projects or background, in English or Spanish.",
      language: "en",
      prompt: {
        // Ignored by our brain (it owns the persona); kept so the dashboard explains itself.
        prompt: "Persona and knowledge live in the voice-agent brain (slabarcaf/voice-agent, brain/personas/resume-agent.md).",
        llm: "custom-llm",
        custom_llm: { url: BRAIN_URL, model_id: "brain", api_key: { secret_id: state.secretId } },
        // Switches speech recognition and voice to Spanish when the visitor speaks Spanish.
        built_in_tools: {
          language_detection: { name: "language_detection", description: "", params: { system_tool_type: "language_detection" } },
        },
      },
    },
    // English agents must use an English-only model; the Spanish preset below uses a multilingual one.
    tts: { voice_id: VOICE_ID, model_id: "eleven_flash_v2" },
    language_presets: {
      es: {
        overrides: {
          agent: { language: "es", first_message: "¡Hola! Soy el asistente de IA de Santiago. Pregúntame lo que quieras sobre su experiencia, proyectos o trayectoria." },
        },
      },
    },
    conversation: { max_duration_seconds: 180 },
  },
  // Only sessions started with a signed URL from our server are allowed.
  platform_settings: { auth: { enable_auth: true } },
};

if (state.agentId) {
  await call("PATCH", `/v1/convai/agents/${state.agentId}`, config);
  console.log(`updated agent ${state.agentId}`);
} else {
  const a = await call("POST", "/v1/convai/agents/create", config);
  state.agentId = a.agent_id;
  console.log(`created agent ${state.agentId}`);
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
