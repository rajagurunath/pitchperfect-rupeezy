# Rupeezy AP Voice Agent — MVP

LiveKit + ElevenLabs voice agent that places an outbound call to an Indian
phone number, runs a Hindi/English/Hinglish sales conversation pitching the
Rupeezy Authorized Person (AP) program, and writes a per-call JSON
transcript log.

This is the MVP plumbing for hackathon Theme 7. It proves:

- LiveKit Agents 1.x worker with `AgentSession` (STT → LLM → TTS pipeline)
- ElevenLabs Scribe v2 realtime STT (Hindi + Hinglish auto-detect)
- ElevenLabs `eleven_turbo_v2_5` TTS (Hindi/English voice synthesis)
- OpenAI `gpt-4o-mini` LLM with the Rupeezy AP system prompt
- SIP outbound dialing to Indian PSTN via a third-party trunk (Plivo / Telnyx)
- JSON conversation log per call: timestamps, speaker, language, text

Once this works end-to-end, layer on lead qualification, scoring, post-call
summary, RM handoff, and the dashboard.

---

## Project layout

```
voice-agents/
├── src/voice_agents/
│   ├── agent.py                  # LiveKit worker entrypoint + outbound SIP dial
│   ├── dispatch_call.py          # CLI: dispatch agent into a room with a phone number
│   ├── conversation_logger.py    # JSON transcript writer
│   └── prompts.py                # Rupeezy AP system prompt + greeting
├── .env.example
├── pyproject.toml                # uv-managed
└── logs/                         # per-call JSON conversation logs (gitignored)
```

CLI entry points (defined in `pyproject.toml`):

- `uv run agent` — LiveKit CLI for the worker (subcommands: `dev`, `start`,
  `console`, `connect`).
- `uv run dial +91XXXXXXXXXX` — dispatch the worker into a fresh room and
  trigger the outbound call to that number.

---

## Prerequisites you must set up once

The Python framework is open source, but actually dialing a real phone needs
two paid-but-free-tier services on top of ElevenLabs / OpenAI.

### 1. LiveKit Cloud project (free tier is fine)

1. Sign up at https://cloud.livekit.io/
2. Create a project. The dashboard shows a `wss://...livekit.cloud` URL.
3. Settings → Keys → "Create new key". Save the API Key + Secret.
4. **Region pinning**: for Indian PSTN traffic LiveKit requires region
   pinning. In the project settings enable a region close to India
   (Singapore / Mumbai). See
   https://docs.livekit.io/sip/region-pinning/

Put the URL / key / secret in `.env`.

### 2. SIP outbound trunk for India PSTN

LiveKit does not own phone numbers — you bring your own trunk. For India
outbound the cheapest reliable option is **Plivo**:

1. Sign up at https://console.plivo.com/, add a few dollars of credit.
2. Console → Voice → SIP Trunking → Outbound Trunks → Create.
   - Authentication: IP ACL or username/password — use username/password
     since LiveKit terminates anywhere.
   - Note the SIP domain (e.g. `your-account.outbound.plivo.com`),
     username, password.
3. Enable destination "India" on the trunk (Plivo blocks India by default).

Then register the trunk with your LiveKit project. Install the LiveKit CLI:

```bash
brew install livekit-cli   # or see https://github.com/livekit/livekit-cli
lk cloud auth              # log in, select your project
```

Create the outbound trunk in LiveKit pointing at Plivo:

```bash
cat > /tmp/outbound-trunk.json <<'EOF'
{
  "trunk": {
    "name": "plivo-india",
    "address": "your-account.outbound.plivo.com",
    "numbers": ["+1XXXXXXXXXX"],            // your Plivo caller-ID number
    "auth_username": "PLIVO_SIP_USERNAME",
    "auth_password": "PLIVO_SIP_PASSWORD"
  }
}
EOF

lk sip outbound create /tmp/outbound-trunk.json
# → prints: SIP Trunk: ST_xxxxxxxxxxxxx
```

Copy that `ST_…` ID into `.env` as `SIP_OUTBOUND_TRUNK_ID`.

Telnyx and Twilio work identically — see
https://docs.livekit.io/sip/trunk-outbound/ for their config blocks.

### 3. ElevenLabs API key

Already provided in `plan.md`. Goes into `.env` as `ELEVENLABS_API_KEY`.

For best Hindi audio quality, browse
https://elevenlabs.io/app/voice-library, filter by Hindi, copy a voice ID
into `ELEVENLABS_VOICE_ID`. (The default voice synthesizes Hindi but with a
detectable English accent.)

### 4. OpenAI API key

`OPENAI_API_KEY` for the LLM. `gpt-4o-mini` is fast and cheap enough for
phone-call latency. Swap to Groq / Anthropic by editing `agent.py` if you
prefer.

---

## Run it

```bash
# 1. install (once)
uv sync

# 2. configure
cp .env.example .env
$EDITOR .env

# 3. terminal A — start the agent worker
uv run agent dev
# (use `uv run agent start` for production; `dev` enables hot reload)

# 4. terminal B — dial your phone
uv run dial +91XXXXXXXXXX --name "Lead"
```

Your phone rings. Pick up. The agent opens in Hinglish: *"Namaste! Main
Priya bol rahi hoon Rupeezy se..."* Talk back in Hindi, English, or
Hinglish — it should handle all three and switch on the fly.

When the call ends, look in `logs/`:

```
logs/call-919444531354-1714997234.json
```

Each turn has `ts`, `speaker`, `language`, `text`, `interrupted`. That file
is the input to the post-call summary / qualification stage in the next
phase of the project.

---

## Quick sanity checks without a phone

Before burning Plivo credit, you can validate the agent locally.

**Console mode** — talks to your laptop mic/speakers, no telephony involved:

```bash
uv run agent console
```

**LiveKit Agents Playground** — browser-based test harness:

```bash
uv run agent dev
# then open https://agents-playground.livekit.io and connect to your project
```

Both modes run the exact same `entrypoint`, just without the SIP dial step
(no `phone_number` in metadata). Use this to verify the prompt, voice, and
language behavior before placing a real call.

---

## What's NOT here yet (next phases)

This MVP intentionally stops at "phone rings, conversation happens, log
gets written." Still to build:

- Lead qualification function tools — score Hot/Warm/Cold from conversation
  signals, hand off to RM.
- Post-call summary generation (LLM over the JSON log).
- WhatsApp follow-up dispatch for Warm leads.
- RM dashboard with funnel + transcripts.
- Sarvam STT/TTS swap-in for regional languages (Tamil, Telugu, Marathi,
  Gujarati, Bengali) — ElevenLabs covers Hindi/Tamil but Sarvam is stronger
  on the others. Replace the `stt=` / `tts=` lines in `agent.py`.

See `hack-questions.md` for the full theme spec.

---

## Troubleshooting

**"SIP_OUTBOUND_TRUNK_ID is not set"** — register a trunk with
`lk sip outbound create` (see above) and put the ID in `.env`.

**Call connects but agent doesn't speak** — check the agent worker terminal
for ElevenLabs / OpenAI auth errors. Most common cause: missing API key in
`.env`.

**Plivo `403` / `503` SIP status on dial** — destination India not enabled
on the trunk, or the caller-ID number isn't in the trunk's `numbers` list,
or your LiveKit project isn't region-pinned.

**STT picks the wrong language** — leave `language_code` unset (current
default) so Scribe auto-detects each turn. Forcing `hi` will mistranscribe
English replies.
