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
- Local checks: run `npm test`, then `vercel env pull .env.local && node --env-file=.env.local evals/run.mjs`.
