# PitchPerfect — Voice AI for partner programs

Multilingual voice agent that auto-dials inbound partner-program leads in
seconds, runs the qualification pitch in any of nine Indian languages,
handles the core objections, and hands every call back to the human RM
team scored **HOT / WARM / COLD** with a one-paragraph summary.

> Built for **Theme 7** (Rupeezy AP partner program) and currently powering
> Rupeezy's AP outreach in production.

## 60-second explainer

https://github.com/rajagurunath/rupeezy-voice-agents/raw/main/deliverables/rupeezy_voice_agent_explainer.mp4

<video src="deliverables/rupeezy_voice_agent_explainer.mp4" controls width="100%"></video>

> If the inline player doesn't load, [download the MP4](deliverables/rupeezy_voice_agent_explainer.mp4) (~7 MB).

## Hackathon deck

- 📊 [Slides (PPTX)](deliverables/rupeezy_voice_agent_deck.pptx) — open in PowerPoint, Keynote, or Google Slides
- 📄 [Slides (PDF)](deliverables/rupeezy_voice_agent_deck.pdf) — preview in any browser
- 📁 [All deliverables](deliverables/README.md) — deck, video, landing page, deploy notes
- 🎙 [Loom recording script](transcripts.md) — 5-minute demo with phone call

---

## Quick start (with `make`)

Everything below assumes you've cloned the repo and are sitting in its
root. The Makefile wraps the common flows so you don't have to remember
which terminal needs which command.

```bash
make            # show the menu of every target

make install    # one-time: uv sync + npm install (--legacy-peer-deps)
cp .env.example .env  &&  $EDITOR .env   # fill in Twilio / ElevenLabs / LLM keys
make seed       # populate the demo DB so dashboards aren't empty

make dev        # start backend + ngrok + frontend together (one Ctrl+C stops all)
```

Open http://localhost:3000 once `make dev` is running.

### Available targets

| Target | What it does |
|---|---|
| `make help` (default) | Print the menu (you can also run `make` with no argument) |
| `make install` | `uv sync` for Python, `npm install --legacy-peer-deps` in `ui/` |
| `make dev` | Start backend (`:8000`) **+** ngrok tunnel (`:4040`) **+** frontend (`:3000`) in parallel. One Ctrl+C tears all three down |
| `make backend` | Start the FastAPI backend **and** ngrok tunnel together (this is the combo Twilio needs — backend auto-discovers the public URL via the ngrok admin API) |
| `make api` | Start the FastAPI backend only |
| `make frontend` | Start the Next.js dev server only |
| `make ngrok` | Start an ngrok tunnel for an already-running backend |
| `make seed` | Seed `data/voice_agents.db` with realistic demo data: ~120 leads, ~125 calls across 14 days, ~25 transcripts, growth curve + weekend dips |
| `make reset-db` | Wipe `data/voice_agents.db` (and WAL files) then reseed from scratch — use this between demos to get reproducible numbers |
| `make stop` | Kill anything listening on `:8000`, `:3000`, `:4040`, plus any leftover Pipecat / Twilio / ngrok processes |
| `make status` | Show whether each port is in use, by which process |
| `make logs` | Tail the most recent backend / dev-server log lines |

### Typical sessions

**Local dev, no phone calls** — landing page + admin console + seeded analytics:

```bash
make seed          # once
make api &         # backend in one terminal (no ngrok needed for browser-only flows)
make frontend      # frontend in another
```

**End-to-end with a real outbound call** (requires Twilio + verified
caller-ID + ngrok auth-token configured):

```bash
make dev           # one command — backend, ngrok, frontend all up
# in browser: http://localhost:3000 → sign in → /leads → Call
```

**Reset the demo back to a clean state**:

```bash
make stop          # if anything is still running
make reset-db      # fresh DB with the same seed
make dev
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Voice framework | **Pipecat 1.1** (Twilio Media Streams transport). LiveKit Agents 1.5 retained for `agent console` mic-and-speaker mode. |
| Telephony | **Twilio Programmable Voice** (free trial works for India outbound to verified caller-IDs) |
| Public tunnel | **ngrok** — Twilio's WebSocket dials our local `/ws` through it |
| STT | **ElevenLabs Scribe v2** (multilingual auto-detect across 9 Indian languages) |
| LLM | **Moonshot Kimi-K2.6** via vLLM at any OpenAI-compatible endpoint, reasoning off (low-latency mode) |
| TTS | **ElevenLabs `eleven_turbo_v2_5`**, voice configurable per lead |
| VAD | **Silero VAD (ONNX)** |
| Backend | **FastAPI** (`api/server.py`) — admin REST API + Pipecat `/ws` bot in one process on `:8000` |
| Database | **SQLite** at `data/voice_agents.db` — `leads`, `calls`, `transcripts`, `call_events` |
| Auth | **JWT (HS256)**, single predefined admin from `.env` |
| Frontend | **Next.js 15 + React 19 + Tailwind + Radix** on `:3000` |
| Charts | **Recharts** (analytics page) |
| Audio waveform | **WaveSurfer.js v7** (call detail page) |
| Python project mgmt | **uv** — every script is a `pyproject.toml` entry point |

---

## Deployment

The marketing site (landing + pricing + contact + login) deploys to
Vercel as a backend-less static build. See
[`deliverables/DEPLOY.md`](deliverables/DEPLOY.md) for the full
walk-through. Short version:

1. Vercel → Import the GitHub repo
2. **Root Directory**: `ui`
3. **Env var**: `NEXT_PUBLIC_DEMO_MODE = 1`
4. Deploy

In demo mode the login screen renders as "by invitation only" and
authed routes (`/operations`, `/leads`, etc.) bounce back to `/`.

---

## Project layout

```
voice-agents/
├── Makefile                       # ★ developer commands
├── pyproject.toml                 # uv-managed; entry-points: api, agent, phone, seed-demo…
├── .env.example                   # placeholders only — real creds live in .env (gitignored)
│
├── api/
│   ├── server.py                  # FastAPI: /api/* + Pipecat /ws + /twiml
│   └── auth.py                    # JWT issue/verify + require_user dependency
│
├── src/voice_agents/
│   ├── prompts.py                 # build_system_prompt(name, brand, pronouns, lead_*, …)
│   ├── db.py                      # SQLite schema + helpers + analytics queries
│   ├── analyzer.py                # post-call HOT/WARM/COLD scorer (Kimi)
│   ├── pipecat_logger.py          # transcript writer (JSON + DB)
│   ├── agent.py                   # LiveKit console-mode entry point
│   └── phone.py                   # one-shot single-call CLI
│
├── scripts/
│   └── seed_demo_data.py          # populates 120 leads / 125 calls / transcripts
│
├── ui/                            # Next.js 15 admin + landing
│   ├── app/{,login,pricing,contact,operations,leads,calls,analytics,profile}/
│   ├── components/                # header, shell, ui primitives, pipeline DAG…
│   └── lib/{api,auth,utils}.ts
│
├── deliverables/                  # ★ hackathon artifacts
│   ├── README.md
│   ├── DEPLOY.md
│   ├── loom_script.md
│   ├── rupeezy_voice_agent_deck.pptx + .pdf
│   ├── rupeezy_voice_agent_explainer.mp4
│   └── remotion-explainer/        # source for the explainer video
│
├── data/voice_agents.db           # SQLite (gitignored, created on first run)
└── logs/                          # per-call JSON transcripts (gitignored)
```

---

## REST endpoints (all `/api/*` require `Authorization: Bearer <jwt>`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `{token, profile}` |
| GET  | `/api/auth/me` | current user from JWT |
| GET  | `/api/health` | liveness (public) |
| GET  | `/api/dashboard` | funnel counts |
| GET  | `/api/analytics` | KPI deltas + funnel + calls/day + score split + language mix + duration-by-score + hour-of-day |
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

## Things to know

- **Twilio trial accounts** can only dial verified caller-IDs and play
  *"You have a trial account, press any key…"* before every call. Press
  `1` to skip. Top up $20 to remove both restrictions.
- **Recordings cost money.** Off by default. Flip `TWILIO_RECORD_CALLS=1`
  in `.env` only when you actively want call audio.
- **Kimi-K2.6 is a thinking model** — leaving reasoning on adds 1–4 s of
  latency before the first audible word. We disable it via
  `LLM_DISABLE_THINKING=1`.
- **DB is anchored to repo root**, not CWD — so launching `make api`
  from any directory still hits the same DB.
- **Per-lead voice + notes** flow into the system prompt at call time.

## Common gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| Lead form does nothing | Stale `.next` cache | `rm -rf ui/.next && make frontend`, or open Incognito |
| Audio player asks for username/password | Tried to load Twilio recording URL directly | Use `/api/calls/{id}/recording` (already wired in the UI) |
| Bot connects but is silent | `ELEVENLABS_VOICE_ID` doesn't exist on your account | Set it to a valid voice in `.env` |
| Twilio error 21219 | Destination not on Verified Caller IDs (trial) | Verify in Twilio console, or upgrade |
| `chat_template_kwargs` unexpected kwarg | vLLM-specific kwargs need the `extra_body` envelope | Already handled by Pipecat OpenAI service `extra={"extra_body":{...}}` |
| `make dev` blocked on port 8000 | Another service is listening | `make stop` then `make dev` |

---

## Hackathon authorship

Team: **PitchPerfect**. Theme 7 — Rupeezy AP partner program is the launch
customer. See [`hack-questions.md`](hack-questions.md) for the original
brief and [`tech.md`](tech.md) for the deeper architecture write-up.
