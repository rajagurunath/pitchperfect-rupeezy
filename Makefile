# PitchPerfect / Rupeezy AP Voice Agent — developer Makefile.
#
# All targets are .PHONY (no real files are produced). Most targets run in
# the foreground so Ctrl+C cleanly stops them. The combined targets
# (`backend`, `dev`) start multiple processes with `wait`+`trap` so a
# single Ctrl+C tears all of them down at once.
#
# Run `make` (or `make help`) to see the menu.

SHELL      := /bin/bash
PORT_API   := 8000
PORT_UI    := 3000
PORT_NGROK := 4040
UV         := uv run

# ANSI colours for the help banner
BOLD := \033[1m
DIM  := \033[2m
GRN  := \033[32m
CYN  := \033[36m
RST  := \033[0m

.DEFAULT_GOAL := help

.PHONY: help install dev backend api frontend ngrok seed reset-db \
        stop status logs clean

help:
	@printf "$(BOLD)PitchPerfect — voice agent for partner programs$(RST)\n\n"
	@printf "$(DIM)One-time setup$(RST)\n"
	@printf "  $(CYN)make install$(RST)        $(DIM)— uv sync + npm install$(RST)\n"
	@printf "  $(DIM)cp .env.example .env  → fill in Twilio / ElevenLabs / LLM keys$(RST)\n\n"
	@printf "$(DIM)Run everything$(RST)\n"
	@printf "  $(CYN)make dev$(RST)            $(DIM)— start backend + ngrok + frontend (single Ctrl+C stops all)$(RST)\n\n"
	@printf "$(DIM)Run components individually$(RST)\n"
	@printf "  $(CYN)make backend$(RST)        $(DIM)— start FastAPI on :$(PORT_API) AND ngrok tunnel together$(RST)\n"
	@printf "  $(CYN)make api$(RST)            $(DIM)— start FastAPI on :$(PORT_API) (no ngrok)$(RST)\n"
	@printf "  $(CYN)make frontend$(RST)       $(DIM)— start Next.js dev server on :$(PORT_UI)$(RST)\n"
	@printf "  $(CYN)make ngrok$(RST)          $(DIM)— start ngrok tunnel for :$(PORT_API) only$(RST)\n\n"
	@printf "$(DIM)Database$(RST)\n"
	@printf "  $(CYN)make seed$(RST)           $(DIM)— seed demo data into data/voice_agents.db$(RST)\n"
	@printf "  $(CYN)make reset-db$(RST)       $(DIM)— wipe data/voice_agents.db and reseed from scratch$(RST)\n\n"
	@printf "$(DIM)Lifecycle$(RST)\n"
	@printf "  $(CYN)make stop$(RST)           $(DIM)— kill anything on :$(PORT_API) :$(PORT_UI) :$(PORT_NGROK)$(RST)\n"
	@printf "  $(CYN)make status$(RST)         $(DIM)— show what's running on each port$(RST)\n"
	@printf "  $(CYN)make logs$(RST)           $(DIM)— tail recent backend log lines$(RST)\n\n"

# ---------------------------------------------------------------------------
# One-time setup
# ---------------------------------------------------------------------------

install:
	@echo "→ uv sync"
	uv sync
	@echo "→ npm install (ui)"
	cd ui && npm install --legacy-peer-deps
	@echo
	@echo "Setup complete. Next:"
	@echo "  cp .env.example .env  &&  $$EDITOR .env"
	@echo "  make seed"
	@echo "  make dev"

# ---------------------------------------------------------------------------
# Run everything
# ---------------------------------------------------------------------------

dev:
	@echo "→ starting backend + ngrok + frontend (Ctrl+C to stop all)"
	@trap 'echo; echo "stopping..."; kill 0' INT TERM; \
	$(UV) api & \
	(sleep 2 && ngrok http $(PORT_API) --log=stdout) & \
	(sleep 2 && cd ui && npm run dev) & \
	wait

# ---------------------------------------------------------------------------
# Backend (FastAPI + Pipecat /ws). Combined target also brings up ngrok so
# Twilio Media Streams can reach the bot WebSocket.
# ---------------------------------------------------------------------------

backend:
	@echo "→ starting FastAPI on :$(PORT_API) and ngrok tunnel together"
	@echo "  (the backend auto-discovers the public ngrok URL via 127.0.0.1:4040)"
	@trap 'echo; echo "stopping backend + ngrok..."; kill 0' INT TERM; \
	$(UV) api & \
	(sleep 2 && ngrok http $(PORT_API) --log=stdout) & \
	wait

api:
	@echo "→ starting FastAPI on :$(PORT_API)"
	$(UV) api

# ---------------------------------------------------------------------------
# Frontend (Next.js 15 admin console + landing page)
# ---------------------------------------------------------------------------

frontend:
	@echo "→ starting Next.js on :$(PORT_UI)  →  http://localhost:$(PORT_UI)"
	cd ui && npm run dev

# ---------------------------------------------------------------------------
# ngrok tunnel for an already-running backend
# ---------------------------------------------------------------------------

ngrok:
	@echo "→ ngrok tunnel for :$(PORT_API)"
	ngrok http $(PORT_API)

# ---------------------------------------------------------------------------
# Database / demo data
# ---------------------------------------------------------------------------

seed:
	@echo "→ seeding demo data"
	$(UV) python scripts/seed_demo_data.py

reset-db:
	@echo "→ wiping data/voice_agents.db"
	rm -f data/voice_agents.db data/voice_agents.db-wal data/voice_agents.db-shm
	@$(MAKE) --no-print-directory seed

# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------

stop:
	@echo "→ stopping anything on :$(PORT_API) :$(PORT_UI) :$(PORT_NGROK)"
	-@lsof -ti :$(PORT_API) :$(PORT_UI) :$(PORT_NGROK) 2>/dev/null | xargs -r kill -9
	-@pkill -9 -f "api\.server|voice_agents\.api|next dev|next-server|ngrok http|twilio_bot" 2>/dev/null || true
	@echo "→ stopped"

status:
	@for p in $(PORT_API) $(PORT_UI) $(PORT_NGROK); do \
	  who=$$(lsof -i :$$p -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $$1, $$2}'); \
	  if [ -n "$$who" ]; then \
	    printf "  $(GRN)● :%s$(RST)  in use by  %s\n" "$$p" "$$who"; \
	  else \
	    printf "  $(DIM)○ :%s$(RST)  free\n" "$$p"; \
	  fi; \
	done

logs:
	@tail -n 60 /tmp/api.log /tmp/dev.log 2>/dev/null || \
	  echo "(no logs found — run 'make dev' to populate /tmp/api.log)"
