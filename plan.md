# Original brief (sanitized)

> Real credentials live only in `.env` (gitignored). This file kept the
> initial intent without the secrets.

## Goal

Build a LiveKit-style voice agent that:

1. Calls a real Indian mobile phone number end-to-end.
2. Holds a multilingual conversation (Hindi-first, plus English / Hinglish /
   Tamil / Telugu / Marathi / Gujarati / Bengali / Punjabi).
3. Saves the full conversation log as JSON with timestamps, speaker labels,
   and transcriptions.

## Stack chosen

- ElevenLabs for STT (Scribe v2 / Scribe v2 realtime) and TTS
  (`eleven_turbo_v2_5`, multilingual).
- An OpenAI-compatible LLM endpoint (started with Daily.co + Pipecat;
  ended on Pipecat + Twilio Media Streams via ngrok — Daily blocks
  international dial-out without sales approval, Twilio's free trial does not).
- `uv` is first-class — `uv init`, `uv add`, `uv sync`, `uv run`, all
  scripts declared in `pyproject.toml`.

## Phase 2

After the basic voice loop works, layer the hackathon theme on top
(see `hack-questions.md`): batch lead upload, qualification, score
(Hot/Warm/Cold), post-call summary, RM hand-off, dashboard.

## Where credentials go

Every secret is loaded from `.env` (gitignored). `.env.example` is the
committed template with placeholders only. Reference list of variables
the project reads:

- `ELEVENLABS_API_KEY` / `ELEVEN_API_KEY` — STT + TTS auth
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_LLM_MODEL` — LLM endpoint
- `LLM_DISABLE_THINKING` — turn off reasoning for live calls
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — only if you
  switch back to the LiveKit-SIP path
- `DAILY_API_KEY` — only if you swap to Pipecat-Daily transport
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` — admin UI auth
- `AGENT_NAME` / `AGENT_BRAND` / `AGENT_PRONOUNS` — persona

Sample curl against the LLM endpoint (model name + thinking-off pattern,
no auth header — fill from `.env`):

```bash
curl -s -X POST "$OPENAI_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "moonshotai/Kimi-K2.6",
    "messages": [{"role": "user", "content": "What is 23 * 17? Explain briefly."}],
    "max_tokens": 200,
    "chat_template_kwargs": { "thinking": false }
  }'
```
