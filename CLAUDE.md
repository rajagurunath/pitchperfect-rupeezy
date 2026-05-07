# CLAUDE.md — orientation for AI assistants and humans dropping in fresh

> Concise project context. For deeper architecture see `tech.md`.
> For original brief see `plan.md`. For Theme 7 spec see `hack-questions.md`.

---

## What this is

Multilingual voice-agent admin platform for **Rupeezy's Authorized Person
(AP) partner program** (hackathon Theme 7). Goal: lift inbound-lead
conversion from 18% to 40%+ by:

1. Calling leads instantly (no after-hours queue).
2. Speaking the lead's language (Hindi / Hinglish / English / Tamil /
   Telugu / Marathi / Gujarati / Bengali / Punjabi).
3. Handling the 5 core objections naturally (script in
   `src/voice_agents/prompts.py`).
4. Scoring each call **HOT / WARM / COLD** + producing a post-call
   summary for the human RM.

The same agent intelligence layer powers three surfaces: console (laptop
mic), one-shot phone (`uv run phone +91…`), and the **admin platform**
(FastAPI + SQLite + Next.js UI) — that last one is what we ship.

---

## Tech stack

| Layer | Choice |
|---|---|
| Voice agent framework | **Pipecat 1.1** (Twilio Media Streams transport) — primary path. **LiveKit Agents 1.5** retained for `console` mode. |
| Telephony | **Twilio Programmable Voice** (free trial works for India outbound to verified caller-IDs) |
| Public tunnel for the bot WebSocket | **ngrok** free tier |
| STT | **ElevenLabs Scribe v2 / scribe_v2_realtime** (multilingual auto-detect) |
| LLM | **Moonshot Kimi-K2.6** via vLLM at any OpenAI-compatible endpoint, reasoning disabled for live calls |
| TTS | **ElevenLabs `eleven_turbo_v2_5`**, voice configurable per lead |
| VAD | **Silero VAD (ONNX)** |
| Backend | **FastAPI** (`api/server.py`) — REST admin API + Pipecat /ws bot in one process on `:8000` |
| DB | **SQLite** at `data/voice_agents.db` (3 tables: `leads`, `calls`, `transcripts`, plus `call_events` for stage tracking) |
| Auth | **JWT (HS256)**, single predefined admin from `.env` |
| Frontend | **Next.js 15 + React 19 + Tailwind + Radix** on `:3000` |
| Charts | **Recharts** (analytics page) |
| Audio waveform | **WaveSurfer.js v7** (call detail page, only when recording is enabled) |
| Python project mgmt | **uv** — every script declared in `pyproject.toml`, run with `uv run <name>` |

---

## Run / stop / restart cheatsheet

You need **3 terminals** for the full platform.

### Terminal A — backend (FastAPI + Pipecat WebSocket)

```bash
# start
uv sync                  # one-time: install Python deps
uv run api               # → http://localhost:8000

# stop
Ctrl-C
# or, if it's running headless:
lsof -ti :8000 | xargs -r kill -9
```

### Terminal B — public tunnel (so Twilio's WebSocket can reach us)

```bash
# start
ngrok http 8000          # exposes wss://<id>.ngrok-free.app/ws

# stop
Ctrl-C
# or
pkill -9 -f "ngrok http"
```

The backend auto-discovers the ngrok public URL via `http://127.0.0.1:4040/api/tunnels`,
so you don't need to copy the URL anywhere.

### Terminal C — admin UI

```bash
# start
cd ui
npm install              # one-time (use --legacy-peer-deps if you hit React 19 RC peer issues)
npm run dev              # → http://localhost:3000

# stop
Ctrl-C
# or
lsof -ti :3000 | xargs -r kill -9
```

The dev server proxies `/api/*` → `http://localhost:8000/api/*`, so the
browser only ever talks to `:3000`.

### Stop EVERYTHING in one shot

When you want a clean slate (e.g. between debugging sessions, before a
git pull, or because the UI is acting weird):

```bash
# Kills backend (:8000), UI (:3000), ngrok (:4040), and any leftover
# Pipecat / Twilio bot / next-server processes.
lsof -ti :8000 :3000 :4040 | xargs -r kill -9
pkill -9 -f "api\.server|voice_agents\.api|next dev|next-server|ngrok http|twilio_bot"
```

Or as a one-liner you can paste anywhere:

```bash
lsof -ti :8000 :3000 :4040 | xargs -r kill -9; pkill -9 -f "api\.server|voice_agents\.api|next dev|next-server|ngrok http|twilio_bot"
```

Verify nothing's left listening:

```bash
for p in 8000 3000 4040; do lsof -i :$p >/dev/null && echo "$p in use" || echo "$p free"; done
```

### Optional one-off scripts

```bash
uv run agent console                  # local mic/speaker test (no DB, no phone)
uv run phone +91XXXXXXXXXX            # one-shot dial without the admin platform
python scripts/test_twilio_call.py    # Twilio account sanity check
sqlite3 data/voice_agents.db < useful.sql   # inspect DB
```

---

## Things you need before first run

1. **Python 3.12+** and **uv** (`brew install uv`).
2. **Node 20+** and **npm** (Node 24 works fine).
3. **ngrok** (`brew install ngrok`) — free tier is enough.
4. **Twilio account** — free trial works:
   - Sign up at https://www.twilio.com/try-twilio
   - Verify your test destination phone in *Phone Numbers → Verified Caller IDs*.
   - Buy any US number ($1.15/mo, free during trial) to use as `from_`.
   - Voice → Settings → **Geographic Permissions** → enable **India**.
5. **ElevenLabs API key** — https://elevenlabs.io
6. **An OpenAI-compatible LLM endpoint** — real OpenAI, or any vLLM /
   LiteLLM / io.net hosted model. Kimi-K2.6 is the current default.
7. Copy `.env.example` to `.env` and fill in **all** secrets there. Real
   credentials live ONLY in `.env`. Other docs use placeholders.

---

## Project layout

```
voice-agents/
├── pyproject.toml                # uv-managed; entry-points: agent, api, phone, twilio-bot…
├── .env / .env.example           # secrets (.env gitignored) — placeholders only in .example
├── CLAUDE.md / tech.md / README.md / plan.md / hack-questions.md
├── useful.sql                    # SQLite inspection queries
├── data/voice_agents.db          # SQLite DB (gitignored, auto-created)
├── logs/                         # per-call JSON transcripts (gitignored)
├── src/voice_agents/
│   ├── prompts.py                # build_system_prompt(name, brand, pronouns, lead_name, lead_notes)
│   ├── db.py                     # SQLite schema + helpers (leads/calls/transcripts/call_events)
│   ├── analyzer.py               # post-call Kimi pass: HOT/WARM/COLD + summary
│   ├── pipecat_logger.py         # ConversationLog → JSON + DB
│   ├── agent.py                  # LiveKit Agents — console mode entry point
│   ├── twilio_bot.py             # standalone Pipecat bot (legacy; superseded by api/server.py)
│   ├── phone.py                  # one-command orchestrator (single dial, no DB/UI)
│   └── (legacy: dispatch_call.py, dial_daily.py, pipecat_bot.py)
├── api/
│   ├── server.py                 # ★ unified FastAPI: /api/* + Pipecat /ws + /twiml
│   └── auth.py                   # JWT issue/verify + require_user dependency
├── ui/                           # Next.js 15 admin
│   ├── app/{login,profile,leads,calls/[id],analytics,page}.tsx
│   ├── components/{header,ui}.tsx
│   └── lib/{api,auth,utils}.ts
└── scripts/
    ├── test_twilio_call.py       # account sanity check
    └── tamil.sh                  # curl proof Kimi handles Tamil natively
```

### REST endpoints (all `/api/*` require `Authorization: Bearer <jwt>`)

| Method | Path | What |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `{token, profile}` |
| GET  | `/api/auth/me` | current user from JWT |
| GET  | `/api/health` | liveness (public) |
| GET  | `/api/dashboard` | funnel counts |
| GET  | `/api/analytics` | stage funnel + calls-by-day + score split |
| GET  | `/api/voices` | curated ElevenLabs voice catalog |
| GET / POST / DELETE | `/api/leads[/...]` | CRUD + bulk CSV upload |
| POST | `/api/leads/{id}/call` | trigger outbound dial |
| POST | `/api/calls/batch?limit=N` | dial N queued leads |
| GET  | `/api/calls[/{id}]` | list / detail (detail includes transcript + events) |
| POST | `/api/calls/{id}/analyze` | re-run scorer + summary |
| GET  | `/api/calls/{id}/recording` | streamed Twilio mp3 with backend auth |
| GET  | `/twiml` | TwiML returning `<Connect><Stream>` |
| WS   | `/ws` | Twilio Media Streams bridge |

---

## Configuration (`.env`)

Everything that's a secret or environment-specific. Categories:

- **Admin login** — `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME`,
  `ADMIN_EMAIL`, `ADMIN_ROLE`, `ADMIN_JWT_SECRET`.
- **Agent persona** — `AGENT_NAME`, `AGENT_BRAND`, `AGENT_PRONOUNS`.
- **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
  `TEST_TO_NUMBER`, `TWILIO_RECORD_CALLS` (0 = off, default).
- **ElevenLabs** — `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
  optional model overrides.
- **LLM** — `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_LLM_MODEL`,
  `LLM_DISABLE_THINKING` (1 = off, faster).
- **Logging / DB** — `CONVERSATION_LOG_DIR`, `VOICE_AGENTS_DB`.
- **(unused unless switching paths)** — `LIVEKIT_*`, `DAILY_API_KEY`.

The login screen pre-fills `ADMIN_USERNAME` / `ADMIN_PASSWORD` so a fresh
operator can just hit "Sign in".

---

## Things to know

- **Twilio trial accounts** can only dial numbers on the *Verified Caller
  IDs* list and play *"You have a trial account, press any key…"* before
  every call. Press 1 to skip. Top up $20 to remove both restrictions.
- **Recordings cost money.** They're off by default. Flip
  `TWILIO_RECORD_CALLS=1` only when you actively want call audio.
- **Kimi-K2.6 is a thinking model** — leaving reasoning on adds 1–4s of
  latency before the first audible word. We disable it via
  `LLM_DISABLE_THINKING=1` (passed as `extra_body.chat_template_kwargs.thinking=false`).
- **DB is anchored to repo root**, not CWD — `Path(__file__).resolve().parents[2] / "data" / "voice_agents.db"` —
  so launching the server from any directory still hits the same DB.
- **Per-lead voice and notes** flow into the prompt at call time. Notes
  are framed to the model as background to *internalize*, not read aloud.
- **Call lifecycle stages** (`queued → dialing → ringing → picked → agent_spoke → user_spoke → completed`,
  or `dropped_early` / `no_answer` / `busy` / `failed`) are recorded in
  `call_events` and rendered as a horizontal pill timeline on
  `/calls/[id]`.

---

## Common gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| Lead form does nothing | Browser cache / stale `.next` | Hard-refresh, or `rm -rf ui/.next && npm run dev`, or open in Incognito |
| Audio player asks for username/password | Tried to load Twilio recording URL directly | Use `/api/calls/{id}/recording` (already wired) |
| Bot connects but is silent | ElevenLabs voice ID does not exist on account | Set `ELEVENLABS_VOICE_ID` to a known voice |
| Twilio error 21219 | Destination not on Verified Caller IDs (trial) | Verify in Twilio console, or upgrade |
| Twilio "You have a trial account" | Trial gate | Press 1 on call, or upgrade |
| LLM error: `unexpected keyword 'chat_template_kwargs'` | Need `extra_body` wrapping for vLLM kwargs | Already handled in `_build_llm` / Pipecat OpenAI service `extra={"extra_body":{...}}` |
| Two `voice_agents.db` files | Old: relative path created stray DB when launched from `ui/` | Fixed — DB now anchored to repo root |
| Dashboard rendering unstyled HTML | Cached service worker from a previous app | DevTools → Application → Storage → Clear site data |

---

## When asking Claude to make changes

- **Leave secrets alone** — never embed real keys in code, prompts, docs,
  or commit messages. Real keys live only in `.env`.
- **Voice + notes are configurable** — don't hardcode persona / voice ID;
  add to `.env` and read via `os.getenv`.
- **Don't auto-dial during debug** — placing real calls costs Twilio credit
  and rings the user's phone. Reproduce via `curl` against `/api/*`
  endpoints first; only place a call when the user explicitly asks.
- **uv is the source of truth** — never tell the user to `pip install`;
  use `uv add <pkg>` and let it update `pyproject.toml` + `uv.lock`.
- **Use `useful.sql`** for DB inspection rather than ad-hoc Python.
