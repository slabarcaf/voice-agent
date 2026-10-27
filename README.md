# voice-agent

Voice agent for Santiago's portfolio, built twice over one shared brain:
- **A, managed:** ElevenLabs Agents. STT, turn-taking and TTS all happen at ElevenLabs; the LLM is "Custom LLM" → our `/api/llm`.
- **B, open source:** browser VAD → Groq Whisper → `/api/llm` → Kokoro TTS on the Oracle VM.

Production: https://voice-agent-three-sable.vercel.app (pushing to `main` deploys).
Plan of record: `~/.claude/plans/i-want-to-create-compiled-brooks.md`.

- `brain/` holds everything that is not audio: the persona, the knowledge pack, the router, the providers and the guardrails. Change behaviour here and both engines follow.
- Facts come only from `brain/knowledge/knowledge.md`, which `npm run knowledge` generates from `../portfolio/content.js` plus `sources/resume.txt` (the public CV with the phone number removed). Numbers come from the CV only. The private career-evidence notes are never a source.
- Routes live in `brain/agents.mjs`: simple turns go to Haiku 5.5, fit and judgment turns go to Sonnet 5.5, and Groq gpt-oss-120b is the fallback for both. The fallback is free but capped at 8k tokens/min, which is too little for live use on its own. Model ids are env vars (`CLAUDE_FAST_MODEL`, `CLAUDE_SMART_MODEL`, `GROQ_FAST_MODEL`).
- `/api/llm` ignores the caller's system prompt and `model`. ElevenLabs authenticates with `Authorization: Bearer $LLM_SHARED_SECRET`; browsers are origin-checked.
- `VOICE_ENABLED=false` in Vercel turns everything off.
- Vercel login must be **slabarcaf** (`vercel whoami`).
- Checks: run `npm test`, then `node evals/run.mjs --url https://voice-agent-three-sable.vercel.app` (13/13 on 2026-10-26). ANTHROPIC_API_KEY is Production-only and sensitive, so it cannot be pulled; local runs (`--env-file=.env.local`) therefore fall back to Groq.

## Version A (ElevenLabs), live since 2026-10-26
- The agent is `eleven/agent.json` → `agentId`, voice Ashley Gordon `MPg42ZNt9M5HK0OndUTJ` (from the Voice Library, added to the account). Change it by editing `eleven/setup.mjs`, then run `node --env-file=.env.local eleven/setup.mjs` (idempotent, PATCHes the agent).
- ElevenLabs calls `<BRAIN_URL>/chat/completions`, and `vercel.json` rewrites that to `/api/llm`. It sends a `language_detection` tool. `api/llm.js` answers with that tool call whenever the visitor switches language, because the English agent model (`eleven_flash_v2`, required for `en`) can't speak Spanish; the `es` preset switches models.
- Auth is on: sessions only start through `POST /api/eleven-session`, which returns a WebRTC token. The test page is `/demo`.
- To test without a microphone: `POST /v1/convai/agents/{id}/simulate-conversation`.
