# voice-agent

Voice agent for Santiago's portfolio, built twice over one shared brain:
- **A, managed:** ElevenLabs Agents. STT, turn-taking and TTS all happen at ElevenLabs; the LLM is "Custom LLM" → our `/api/llm`.
- **B, open source:** Silero VAD (browser) → Whisper on Groq (`/api/stt`) → `/api/llm` → Kokoro-82M running in the visitor's browser on WebGPU.

Production: https://voice-agent-three-sable.vercel.app. Pushing to `main` deploys, but Git deploys have been skipped at least once (2026-10-27). If the site doesn't update, run `vercel deploy --prod --yes`.
Plan of record: `~/.claude/plans/i-want-to-create-compiled-brooks.md`.

- `brain/` holds everything that is not audio: the persona, the knowledge pack, the router, the providers and the guardrails. Change behaviour here and both engines follow.
- Facts come only from `brain/knowledge/knowledge.md`. `npm run knowledge` generates it from three sources:
  - `../portfolio/content.js`;
  - `sources/resume.txt`, the public CV with the phone number removed;
  - `sources/stories.md`: achievements, the two weaknesses he names and three failures, rewritten from Santiago's private Notion "Behavioral Story Bank".

  The CV wins on every number.
- `stories.md` is a hand-curated extract and is **never synced** from Notion. That page also holds coaching notes, interview tactics, conflicts and other people's details. To add a story, rewrite it into `stories.md`, show Santiago the exact text, and run the `priv-*` evals. The private career-evidence notes are never a source.
- Routes live in `brain/agents.mjs`: simple turns go to Haiku 5.5, fit and judgment turns go to Sonnet 5.5, and Groq gpt-oss-120b is the fallback for both. The fallback is free but capped at 8k tokens/min, which is too little for live use on its own. Model ids are env vars (`CLAUDE_FAST_MODEL`, `CLAUDE_SMART_MODEL`, `GROQ_FAST_MODEL`).
- `/api/llm` ignores the caller's system prompt and `model`. ElevenLabs authenticates with `Authorization: Bearer $LLM_SHARED_SECRET`; browsers are origin-checked.
- `VOICE_ENABLED=false` in Vercel turns everything off.
- Vercel login must be **slabarcaf** (`vercel whoami`).
- Checks: run `npm test`, then `node evals/run.mjs --url https://voice-agent-three-sable.vercel.app` (22/22 on 2026-10-27; pass `--delay 4`, because back-to-back bursts from one IP trip Vercel's automatic DDoS challenge, which returns 403 "Security Checkpoint", lasts a few minutes, and can't be bypassed on the free plan). ANTHROPIC_API_KEY is Production-only and sensitive, so it cannot be pulled; local runs (`--env-file=.env.local`) therefore fall back to Groq.

## Version A (ElevenLabs), live since 2026-10-26
- The agent is `eleven/agent.json` → `agentId`, voice Ashley Gordon `MPg42ZNt9M5HK0OndUTJ` (from the Voice Library, added to the account). Change it by editing `eleven/setup.mjs`, then run `node --env-file=.env.local eleven/setup.mjs` (idempotent, PATCHes the agent).
- ElevenLabs calls `<BRAIN_URL>/chat/completions`, and `vercel.json` rewrites that to `/api/llm`. It sends a `language_detection` tool. `api/llm.js` answers with that tool call whenever the visitor switches language, because the English agent model (`eleven_flash_v2`, required for `en`) can't speak Spanish; the `es` preset switches models.
- Auth is on: sessions only start through `POST /api/eleven-session`, which returns a WebRTC token. The test page is `/demo`.
- To test without a microphone: `POST /v1/convai/agents/{id}/simulate-conversation`.

## Version B (open source), live since 2026-10-27
- `/demo?engine=open` or the B toggle. The page wires it all up (`web/demo.html`). Silero VAD v5 (`@ricky0123/vad-web` 0.0.31 + onnxruntime-web 1.24.3 from jsDelivr) cuts each utterance after 700 ms of silence and posts a 16 kHz WAV to `/api/stt`. That endpoint calls Whisper large-v3-turbo on Groq's free tier, with a vocabulary prompt for names, and returns `{text, lang}`. The page then streams `/api/llm`, speaks it sentence by sentence, and lets the visitor barge in.
- TTS is Kokoro (`web/kokoro-worker.js`, kokoro-js 1.2.1, fp32, voice `af_heart`) inside a Web Worker. **WebGPU only:** on WASM it ran 1.6x slower than real time. It is skipped on phones because the model is ~330 MB. English on phones and anything without WebGPU goes to `api/tts.js`: Orpheus (`canopylabs/orpheus-v1-english`, open weights) on Groq, voice `hannah` (`GROQ_TTS_VOICE`), ~1.2 s per sentence; it needed the Orpheus terms accepted in the Groq console (done 2026-10-27). Spanish, and any server-voice failure, use the browser's `speechSynthesis` (neither kokoro-js nor Orpheus has Spanish). Phones mute `speechSynthesis` unless it first speaks inside the click, so `start()` speaks a silent utterance. Measured on a phone-size emulation: ~4.9 s to first audio vs ~3 s with Kokoro.
- Not on the Oracle VM. It is the 1 GB E2.1.Micro and runs the Sydney bot, which has no room for a TTS server. A server-side Kokoro (which would add Spanish voices) needs a bigger host, such as an Oracle Ampere A1 instance created in the console.
- Playback: Kokoro pads each clip with ~0.3 s of silence before and ~0.47 s after. The page trims that and schedules clips back to back on the audio clock. Chunks are one sentence first (at least 25 chars), then at least 140 chars.
- Measured 2026-10-27 in Chromium (desktop, Kokoro cached): about 1.0 s hearing, 1.0 s thinking and 0.9 s voice, so about 2–3 s from the end of speech to the first sound.
- To test without a microphone: in the browser console, have Kokoro synthesize a question, patch `navigator.mediaDevices.getUserMedia` to return a clone of a `MediaStreamDestination` stream, click Start, and play the clip into it.

## Portfolio pop-up
- santiagolabarca.vercel.app has a "Talk to my AI assistant" button (portfolio repo, `voice.js`) that iframes `/demo?embed=1&engine=open&theme=light|dark`. Embed mode hides the title and subtitle and follows the site's theme.
- `vercel.json` sets `frame-ancestors` so only the portfolio (and localhost:4322) can frame `/demo`. A new host for the button must be added there and to `DEFAULT_ORIGINS`.
- Phones play `web/greeting-orpheus.wav` (Orpheus, voice hannah) instead of synthesizing the greeting, to save the 3,600-character daily free quota. Regenerate it if the greeting text or voice changes.
