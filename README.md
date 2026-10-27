# voice-agent

Voice agent for Santiago's portfolio, built twice over one shared brain:
- **A, managed:** ElevenLabs Agents. STT, turn-taking and TTS all happen at ElevenLabs; the LLM is "Custom LLM" → our `/api/llm`.
- **B, open source:** browser VAD → Groq Whisper → `/api/llm` → Kokoro TTS on the Oracle VM.

Plan of record: `~/.claude/plans/i-want-to-create-compiled-brooks.md`.

- `brain/` holds everything that is not audio: the persona, the knowledge pack, the router, the providers and the guardrails. Change behaviour here and both engines follow.
- Facts come only from `brain/knowledge/knowledge.md`, which `npm run knowledge` generates from `../portfolio/content.js` plus `sources/resume.txt` (the public CV with the phone number removed). Numbers come from the CV only. The private career-evidence notes are never a source.
- Model ids are env vars (`GROQ_FAST_MODEL`, `CLAUDE_SMART_MODEL`). Routes live in `brain/agents.mjs`.
- `/api/llm` ignores the caller's system prompt and `model`. ElevenLabs authenticates with `Authorization: Bearer $LLM_SHARED_SECRET`; browsers are origin-checked.
- `VOICE_ENABLED=false` in Vercel turns everything off.
- Vercel login must be **slabarcaf** (`vercel whoami`).
- Local checks: run `npm test`, then `vercel env pull .env.local && node --env-file=.env.local evals/run.mjs`.
