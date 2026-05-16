"""Unified FastAPI server.

Hosts BOTH the admin REST API (``/api/*``) AND the Pipecat bot WebSocket
(``/ws``) in a single ASGI app on a single port (default 8000). One ngrok
tunnel exposes everything. CORS is open so the Next.js dev server on
:3000 can hit ``/api/*`` directly.

Endpoints
---------
GET    /api/health                  — liveness check.
GET    /api/dashboard               — funnel counts.
GET    /api/leads                   — list leads.
POST   /api/leads                   — create one lead (json).
POST   /api/leads/upload            — bulk upload via CSV.
DELETE /api/leads/{id}              — delete one lead.
POST   /api/leads/{id}/call         — trigger an outbound call now.
POST   /api/calls/batch             — call N queued leads.
GET    /api/calls                   — list calls.
GET    /api/calls/{id}              — call detail + transcript + recording.
POST   /api/calls/{id}/analyze      — re-run the analyzer for one call.
WS     /ws                          — Twilio Media Streams bridge (Pipecat).
GET    /twiml                       — TwiML returning <Connect><Stream wss://.../ws>.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from loguru import logger as loguru_logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.transcriptions.language import Language
from pipecat.services.openai.base_llm import BaseOpenAILLMService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pydantic import BaseModel, Field
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from voice_agents import db
from voice_agents.analyzer import analyze_call
from voice_agents.pipecat_logger import (
    AssistantTranscriptLogger,
    ConversationLog,
    UserTranscriptLogger,
)
from voice_agents.prompts import build_greeting_instruction, build_system_prompt

from api.auth import (
    issue_token,
    require_user,
    verify_credentials,
)
from api.providers import build_stt, build_tts, default_speaker, STT_PROVIDER, TTS_PROVIDER

load_dotenv()

loguru_logger.remove()
loguru_logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)-22s %(message)s")
log = logging.getLogger("api.server")

# Enable MLflow tracing for every openai-SDK call (Pipecat side). The
# Studio text simulator uses raw httpx and is instrumented separately
# via mlflow.start_span() inside /api/simulate/text.
try:
    from voice_agents.mlflow_tracker import enable_openai_autolog
    enable_openai_autolog()
except Exception as _exc:
    log.warning("mlflow autolog setup skipped: %s", _exc)

LOG_DIR = Path(os.getenv("CONVERSATION_LOG_DIR", "logs"))
PORT = int(os.getenv("API_PORT", "8000"))
NGROK_API = os.getenv("NGROK_API", "http://127.0.0.1:4040/api/tunnels")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")  # if set, skips ngrok lookup

app = FastAPI(title="Rupeezy AP Agent — Admin + Bot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Verbose 422 logger — for the simulate WebRTC routes only — so we can see
# the actual body the SmallWebRTC client is sending. Without this, FastAPI
# just emits "422 Unprocessable Entity" with no detail in the log.
from fastapi.exceptions import RequestValidationError as _RVE


@app.exception_handler(_RVE)
async def _log_validation_errors(request: Request, exc: _RVE):
    from fastapi.responses import JSONResponse
    if "/api/simulate" in request.url.path:
        try:
            body = await request.body()
            log.error(
                "422 on %s %s — validation errors: %s — raw body: %s",
                request.method, request.url.path, exc.errors(),
                body.decode("utf-8", errors="replace")[:1500],
            )
        except Exception as e:
            log.error("422 on %s %s (could not read body: %s)",
                      request.method, request.url.path, e)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# ============================================================================
# Lead + call endpoints
# ============================================================================

class LeadIn(BaseModel):
    name: str
    phone: str = Field(..., description="E.164, e.g. +919444531354")
    language_pref: str | None = None
    voice_id: str | None = Field(default=None, description="Sarvam speaker name (e.g. 'kavya'); null falls back to SARVAM_SPEAKER env")
    agent_name: str | None = Field(default=None, description="Agent persona name; null falls back to AGENT_NAME env")
    agent_id: str | None = Field(default=None, description="FK to agents.id; null = use default agent (or env)")
    notes: str | None = None
    opening_line: str | None = Field(default=None, description="Spoken immediately via TTS when the call connects — eliminates the silent gap.")
    campaign: str | None = Field(default=None, description="Campaign title this lead belongs to.")


class LeadOut(LeadIn):
    id: str
    status: str
    created_at: str
    updated_at: str


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "agent_name": os.getenv("AGENT_NAME", "Priya"),
        "agent_brand": os.getenv("AGENT_BRAND", "Rupeezy"),
        "model": os.getenv("OPENAI_LLM_MODEL"),
    }


# ---------- Auth (no token required for these) -------------------------------

class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
async def auth_login(creds: LoginIn) -> dict[str, Any]:
    profile = verify_credentials(creds.username, creds.password)
    if not profile:
        raise HTTPException(401, "invalid username or password")
    token = issue_token(profile)
    return {"token": token, "profile": profile}


@app.get("/api/auth/me")
async def auth_me(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    sub = user.get("sub", "")
    # Strip the kind prefix so the UI sees a clean username.
    username = sub.split(":", 1)[1] if ":" in sub else sub
    return {
        "username": username,
        "display_name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "kind": "visitor" if sub.startswith("visitor:") else "admin",
    }


class VisitorIn(BaseModel):
    email: str
    name: str | None = None
    org_type: str | None = None  # 'judge' | 'mentor' | 'other'


@app.post("/api/auth/visitor")
async def auth_visitor(body: VisitorIn) -> dict[str, Any]:
    """Self-onboard for hackathon judges and mentors. Email-only — no
    verification. Idempotent: same email returns same visitor id."""
    from api.auth import issue_visitor_token
    try:
        visitor = db.upsert_visitor(
            email=body.email,
            name=(body.name or None),
            org_type=(body.org_type or "other"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    token = issue_visitor_token(visitor)
    profile = {
        "username": visitor["email"],
        "display_name": visitor.get("name") or visitor["email"],
        "email": visitor["email"],
        "role": (visitor.get("org_type") or "visitor").capitalize(),
        "kind": "visitor",
    }
    return {"token": token, "profile": profile}


@app.get("/api/dashboard")
async def dashboard(_user: dict = Depends(require_user)) -> dict[str, Any]:
    return db.funnel_metrics()


@app.get("/api/analytics")
async def analytics(days: int = 14,
                    _user: dict = Depends(require_user)) -> dict[str, Any]:
    """Backs the /analytics page: full breakdown — KPIs with deltas,
    funnel by stage, calls-by-day, score split, language mix, duration by
    score, hour-of-day volume."""
    return {
        "stage_funnel":       db.stage_funnel(),
        "calls_by_day":       db.calls_by_day(days=days),
        "score_split":        {k: db.funnel_metrics()[k] for k in ("hot", "warm", "cold")},
        "kpi":                db.kpi_summary(days=days),
        "language_breakdown": db.language_breakdown(days=days),
        "duration_by_score":  db.duration_by_score(days=days),
        "hour_of_day":        db.hour_of_day_volume(days=days),
    }


# Curated catalog of Sarvam bulbul:v3 speakers.
# voice_id here is the Sarvam speaker name (stored in the leads.voice_id column).
SARVAM_VOICE_CATALOG = [
    {"voice_id": "kavya",    "name": "Kavya",    "description": "Female · warm · natural"},
    {"voice_id": "priya",    "name": "Priya",    "description": "Female · friendly · clear"},
    {"voice_id": "neha",     "name": "Neha",     "description": "Female · bright · engaging"},
    {"voice_id": "anushka",  "name": "Anushka",  "description": "Female · soft · expressive"},
    {"voice_id": "manisha",  "name": "Manisha",  "description": "Female · mature · warm"},
    {"voice_id": "shreya",   "name": "Shreya",   "description": "Female · energetic · upbeat"},
    {"voice_id": "ishita",   "name": "Ishita",   "description": "Female · confident · articulate"},
    {"voice_id": "vidya",    "name": "Vidya",    "description": "Female · calm · professional"},
    {"voice_id": "shubh",    "name": "Shubh",    "description": "Male · warm · trustworthy"},
    {"voice_id": "rahul",    "name": "Rahul",    "description": "Male · clear · professional"},
    {"voice_id": "amit",     "name": "Amit",     "description": "Male · deep · calm"},
    {"voice_id": "kabir",    "name": "Kabir",    "description": "Male · smooth · confident"},
    {"voice_id": "aditya",   "name": "Aditya",   "description": "Male · resonant · authoritative"},
    {"voice_id": "abhilash", "name": "Abhilash", "description": "Male · rich · storyteller"},
]

# Set of valid Sarvam speaker names — used to discard stale ElevenLabs UUIDs
# that may still be stored in older leads' voice_id column.
_SARVAM_SPEAKERS: set[str] = {v["voice_id"] for v in SARVAM_VOICE_CATALOG}

# Pre-synthesised Sarvam TTS opener audio, keyed by call_id.
# Populated in _place_call, consumed once by GET /api/prewarm/{call_id}.
_PREWARM_CACHE: dict[str, bytes] = {}


ELEVENLABS_VOICE_CATALOG = [
    {"voice_id": "hpp4J3VqNfWAUOO0d1Us", "name": "Bella",   "description": "Female · professional · warm"},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah",   "description": "Female · mature · reassuring"},
    {"voice_id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "description": "Female · playful · bright"},
    {"voice_id": "FGY2WhTYpPnrIDTdsKH5", "name": "Laura",   "description": "Female · enthusiast · quirky"},
    {"voice_id": "JBFqnCBsd6RMkjVDRZzb", "name": "George",  "description": "Male · warm storyteller"},
    {"voice_id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "description": "Male · deep · confident"},
    {"voice_id": "cjVigY5qzO86Huf0OWal", "name": "Eric",    "description": "Male · smooth · trustworthy"},
    {"voice_id": "nPczCjzI2devNBz1zQrb", "name": "Brian",   "description": "Male · deep · resonant"},
]


@app.get("/api/voices")
async def voices(_user: dict = Depends(require_user)) -> dict[str, Any]:
    if TTS_PROVIDER == "elevenlabs":
        return {
            "default_voice_id": os.getenv("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us"),
            "voices": ELEVENLABS_VOICE_CATALOG,
        }
    return {
        "default_voice_id": os.getenv("SARVAM_SPEAKER", "kavya"),
        "voices": SARVAM_VOICE_CATALOG,
    }


@app.get("/api/leads")
async def get_leads(status: str | None = None, limit: int = 200,
                    _user: dict = Depends(require_user)) -> list[dict[str, Any]]:
    return db.list_leads(limit=limit, status=status)


@app.post("/api/leads", status_code=201)
async def create_lead(lead: LeadIn,
                      _user: dict = Depends(require_user)) -> dict[str, Any]:
    if not lead.phone.startswith("+"):
        raise HTTPException(400, "phone must be E.164 (start with +)")
    # Default to the studio's default agent if the form didn't specify one.
    agent_id = lead.agent_id
    if not agent_id:
        default = db.get_default_agent()
        if default:
            agent_id = default["id"]
    lid = db.insert_lead(
        name=lead.name,
        phone=lead.phone,
        language_pref=lead.language_pref,
        notes=lead.notes,
        voice_id=lead.voice_id,
        agent_name=(lead.agent_name or "").strip() or None,
        agent_id=agent_id,
        opening_line=(lead.opening_line or "").strip() or None,
        campaign=(lead.campaign or "").strip() or None,
    )
    return db.get_lead(lid)


@app.post("/api/leads/upload")
async def upload_leads(file: UploadFile,
                       _user: dict = Depends(require_user)) -> dict[str, Any]:
    """Bulk upload via CSV. Required columns: name, phone.
    Optional: language_pref, notes."""
    raw = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(raw))
    inserted = 0
    skipped: list[str] = []
    for i, row in enumerate(reader, start=1):
        name = (row.get("name") or "").strip()
        phone = (row.get("phone") or "").strip()
        if not name or not phone:
            skipped.append(f"row {i}: missing name or phone")
            continue
        if not phone.startswith("+"):
            skipped.append(f"row {i}: phone {phone!r} not E.164")
            continue
        db.insert_lead(name, phone, row.get("language_pref") or None,
                       row.get("notes") or None,
                       campaign=(row.get("campaign") or "").strip() or None)
        inserted += 1
    return {"inserted": inserted, "skipped": skipped}


@app.delete("/api/leads/{lead_id}", status_code=204)
async def delete_lead(lead_id: str,
                      _user: dict = Depends(require_user)) -> Response:
    with db.with_conn() as c:
        c.execute("DELETE FROM leads WHERE id=?", (lead_id,))
    return Response(status_code=204)


@app.post("/api/leads/{lead_id}/call", status_code=202)
async def trigger_call_for_lead(lead_id: str,
                                _user: dict = Depends(require_user)) -> dict[str, Any]:
    lead = db.get_lead(lead_id)
    if not lead:
        raise HTTPException(404, "lead not found")
    return await _place_call(lead)


@app.post("/api/calls/batch")
async def trigger_batch(limit: int = 10,
                        _user: dict = Depends(require_user)) -> dict[str, Any]:
    """Call up to ``limit`` queued leads sequentially. Spawns each in the
    background so this endpoint returns immediately with the SID list."""
    queued = db.list_leads(limit=limit, status="queued")
    placed = []
    for lead in queued:
        try:
            res = await _place_call(lead)
            placed.append(res)
        except HTTPException as e:
            placed.append({"lead_id": lead["id"], "error": e.detail})
    return {"placed": placed}


@app.get("/api/calls")
async def get_calls(lead_id: str | None = None, score: str | None = None,
                    limit: int = 200,
                    _user: dict = Depends(require_user)) -> list[dict[str, Any]]:
    return db.list_calls(limit=limit, lead_id=lead_id, score=score)


@app.get("/api/calls/{call_id}")
async def get_call_detail(call_id: str,
                          _user: dict = Depends(require_user)) -> dict[str, Any]:
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(404, "call not found")
    call["transcript"] = db.list_turns(call_id)
    call["events"] = db.list_events(call_id)
    return call


@app.post("/api/calls/{call_id}/analyze")
async def trigger_analyze(call_id: str,
                          _user: dict = Depends(require_user)) -> dict[str, Any]:
    res = await analyze_call(call_id)
    if not res:
        raise HTTPException(409, "analyzer could not produce a result")
    return res


@app.get("/api/calls/{call_id}/recording")
async def stream_recording(call_id: str, request: Request) -> StreamingResponse:
    """Proxy the Twilio recording through the backend with Basic Auth so the
    browser is never prompted for credentials. We stream the upstream GET
    directly (Twilio's HEAD on the .mp3 returns content-length: 0 which
    confuses the audio element). Range requests are forwarded so HTML5
    audio scrubbing works.
    """
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(404, "call not found")
    rec_url = call.get("recording_url")
    if not rec_url:
        raise HTTPException(404, "recording not ready yet — Twilio takes ~30s after hangup")

    sid = os.environ["TWILIO_ACCOUNT_SID"]
    tok = os.environ["TWILIO_AUTH_TOKEN"]
    fwd_headers = {}
    rng = request.headers.get("range")
    if rng:
        fwd_headers["Range"] = rng

    import httpx
    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None), auth=(sid, tok))

    # Open the upstream stream eagerly so we can mirror the response headers
    # (status, content-type, content-length, content-range) before returning.
    cm = client.stream("GET", rec_url, headers=fwd_headers)
    upstream = await cm.__aenter__()
    if upstream.status_code >= 400:
        body = await upstream.aread()
        await cm.__aexit__(None, None, None)
        await client.aclose()
        raise HTTPException(upstream.status_code,
                            f"twilio: {body.decode(errors='ignore')[:200]}")

    pass_through = {
        "Content-Type": upstream.headers.get("content-type", "audio/mpeg"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    for h in ("content-length", "content-range", "etag", "last-modified"):
        if h in upstream.headers:
            pass_through[h.title()] = upstream.headers[h]

    async def gen():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await cm.__aexit__(None, None, None)
            await client.aclose()

    return StreamingResponse(gen(), status_code=upstream.status_code,
                             headers=pass_through,
                             media_type=pass_through["Content-Type"])


# ============================================================================
# Handoffs (RM context-card delivery)
# ============================================================================

@app.post("/api/calls/{call_id}/handoff")
async def trigger_handoff(call_id: str,
                          _user: dict = Depends(require_user)) -> dict[str, Any]:
    """Manually create / resend a handoff for a HOT or WARM call. Used by
    the call detail page's 'Resend to RM' button."""
    from voice_agents.handoff import dispatch_handoff
    res = await dispatch_handoff(call_id)
    if not res:
        raise HTTPException(409, "no HOT/WARM analysis available for this call")
    return res


@app.get("/api/handoffs")
async def list_handoffs_route(
    since_days: int | None = None,
    _user: dict = Depends(require_user),
) -> list[dict[str, Any]]:
    return db.list_handoffs(since_days=since_days)


@app.get("/api/handoffs/today")
async def handoffs_today(_user: dict = Depends(require_user)) -> dict[str, int]:
    return {"count": db.handoffs_today_count()}


# --- public (unauth) — the WhatsApp link the RM taps on their phone ---------

@app.get("/api/public/handoff/{token}")
async def get_public_handoff(token: str) -> dict[str, Any]:
    """No auth — the link is gated by the HMAC token. On open we mark the
    handoff as 'opened' so the dashboard can show delivery confirmation."""
    from voice_agents.handoff import parse_card_token
    handoff_id = parse_card_token(token)
    if not handoff_id:
        raise HTTPException(404, "invalid or expired card link")
    handoff = db.get_handoff(handoff_id)
    if not handoff:
        raise HTTPException(404, "handoff not found")
    call = db.get_call(handoff["call_id"]) or {}
    lead = db.get_lead(handoff["lead_id"]) or {}
    import json as _json
    analysis: dict[str, Any] = {}
    if call.get("analysis_json"):
        try:
            analysis = _json.loads(call["analysis_json"])
        except Exception:
            pass
    transcript = db.list_turns(handoff["call_id"])

    db.mark_handoff_opened(handoff_id)

    return {
        "score":      handoff.get("score"),
        "channel":    handoff.get("channel"),
        "agent_name": handoff.get("agent_name"),
        "sent_at":    handoff.get("sent_at"),
        "opened_at":  handoff.get("opened_at"),
        "lead": {
            "name":          lead.get("name"),
            "phone":         lead.get("phone"),
            "language_pref": lead.get("language_pref"),
            "notes":         lead.get("notes"),
        },
        "call": {
            "id":               call.get("id"),
            "duration_seconds": call.get("duration_seconds"),
            "summary":          call.get("summary"),
        },
        "analysis":   analysis,
        "transcript": transcript,
    }


@app.get("/handoff/{token}", response_class=HTMLResponse)
async def handoff_card_html(token: str):
    """Public card page rendered server-side so the RM can open it directly
    from the WhatsApp link without needing the Next.js dev server."""
    from voice_agents.handoff import parse_card_token
    import json as _json, html as _html

    if token == "sample":
        return HTMLResponse("<h2>Sample card — open a real handoff from the admin console.</h2>")

    handoff_id = parse_card_token(token)
    if not handoff_id:
        return HTMLResponse("<h2>Invalid or expired link.</h2>", status_code=404)
    handoff = db.get_handoff(handoff_id)
    if not handoff:
        return HTMLResponse("<h2>Handoff not found.</h2>", status_code=404)

    call  = db.get_call(handoff["call_id"]) or {}
    lead  = db.get_lead(handoff["lead_id"]) or {}
    analysis: dict[str, Any] = {}
    if call.get("analysis_json"):
        try: analysis = _json.loads(call["analysis_json"])
        except Exception: pass
    transcript = db.list_turns(handoff["call_id"])
    db.mark_handoff_opened(handoff_id)

    score     = handoff.get("score") or "—"
    lead_name = lead.get("name") or "Lead"
    lead_ph   = lead.get("phone") or "—"
    dur_s     = call.get("duration_seconds")
    dur       = f"{dur_s // 60}m {dur_s % 60}s" if dur_s else "—"
    summary   = _html.escape(analysis.get("summary") or call.get("summary") or "—")
    key_sig   = _html.escape(analysis.get("key_signal") or "")
    next_act  = _html.escape(analysis.get("next_action") or "")
    interest  = analysis.get("interest_level")
    sentiment = (analysis.get("sentiment") or "").capitalize()
    score_color = {"HOT": "#ef4444", "WARM": "#f59e0b", "COLD": "#60a5fa"}.get(score, "#8a92a0")

    objs_html = ""
    for o in (analysis.get("objections_handled") or []):
        q = _html.escape(str(o.get("objection", "")))
        r = _html.escape(str(o.get("resolution", "")))
        objs_html += f'<li><b>"{q}"</b><br><span style="color:#8a92a0">→ {r}</span></li>'

    tx_html = ""
    for t in transcript:
        spk   = "Agent" if t.get("speaker") == "agent" else lead_name
        color = "#5eead4" if t.get("speaker") == "agent" else "#e2e8f0"
        tx_html += (
            f'<div style="margin-bottom:12px">'
            f'<div style="font-size:10px;color:#8a92a0;text-transform:uppercase;'
            f'letter-spacing:.1em;margin-bottom:3px">{_html.escape(spk)}</div>'
            f'<div style="color:{color}">{_html.escape(t.get("text",""))}</div>'
            f'</div>'
        )

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>PitchPerfect — {_html.escape(lead_name)}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        background:#0d1117;color:#e2e8f0;padding:20px;max-width:620px;margin:auto}}
  .badge{{display:inline-block;padding:4px 12px;border-radius:99px;font-size:11px;
          font-weight:700;letter-spacing:.12em;text-transform:uppercase;
          border:1px solid {score_color}40;color:{score_color};background:{score_color}18;margin-bottom:12px}}
  h1{{font-size:28px;font-weight:600;margin-bottom:4px}}
  .sub{{color:#8a92a0;font-size:13px;margin-bottom:20px}}
  .grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}}
  .stat{{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px}}
  .stat-label{{font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:#8a92a0;margin-bottom:4px}}
  .stat-value{{font-size:15px;font-weight:600}}
  .card{{background:#161b22;border:1px solid #21262d;border-radius:12px;padding:16px;margin-bottom:14px}}
  .card-title{{font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:#8a92a0;margin-bottom:10px}}
  .key-sig{{background:#5eead418;border:1px solid #5eead440;border-radius:10px;
             padding:14px;margin-bottom:14px}}
  .key-sig .card-title{{color:#5eead4}}
  .key-sig p{{color:#e2e8f0;line-height:1.6}}
  ul{{padding-left:18px;line-height:1.8}}
  footer{{margin-top:24px;text-align:center;font-size:11px;color:#8a92a0}}
</style>
</head>
<body>
<div class="badge">{_html.escape(score)} LEAD</div>
<h1>{_html.escape(lead_name)}</h1>
<div class="sub">{_html.escape(lead_ph)}</div>

<div class="grid">
  <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">{dur}</div></div>
  <div class="stat"><div class="stat-label">Interest</div><div class="stat-value">{f"{interest}/10" if interest else "—"}</div></div>
  <div class="stat"><div class="stat-label">Sentiment</div><div class="stat-value">{sentiment or "—"}</div></div>
  <div class="stat"><div class="stat-label">Action</div><div class="stat-value">{"Call back 30m" if score=="HOT" else "WhatsApp" if score=="WARM" else "No follow-up"}</div></div>
</div>

{"<div class='key-sig'><div class='card-title'>Key signal</div><p>" + key_sig + "</p></div>" if key_sig else ""}

<div class="card"><div class="card-title">Summary</div><p style="line-height:1.7;color:#cbd5e1">{summary}</p>
{"<p style='margin-top:10px;color:#8a92a0'><b style='color:#e2e8f0'>Next action:</b> " + next_act + "</p>" if next_act else ""}
</div>

{"<div class='card'><div class='card-title'>Objections handled</div><ul>" + objs_html + "</ul></div>" if objs_html else ""}

{"<div class='card'><div class='card-title'>Transcript · " + str(len(transcript)) + " turns</div>" + tx_html + "</div>" if transcript else ""}

<footer>PitchPerfect context card</footer>
</body></html>"""

    return HTMLResponse(page)


# ============================================================================
# WhatsApp outbound message
# ============================================================================

class WhatsAppSendBody(BaseModel):
    from_number: str   # E.164, e.g. +14155238886
    to_number: str     # E.164, e.g. +919876543210
    message: str

@app.post("/api/calls/{call_id}/twilio-status")
async def twilio_status_callback(call_id: str, request: Request):
    """Twilio posts here when a call reaches a terminal state. Used as a
    safety net: if the WebSocket pipeline never ran, the lead status would
    be stuck on 'calling' — this clears it regardless."""
    form = await request.form()
    status = (form.get("CallStatus") or "").lower()
    terminal = {"completed", "busy", "no-answer", "canceled", "failed"}
    if status in terminal:
        call = db.get_call(call_id)
        if call and call.get("lead_id"):
            lead = db.get_lead(call["lead_id"])
            if lead and lead.get("status") == "calling":
                db.update_lead_status(call["lead_id"], "done")
                log.info("twilio-status callback: lead %s → done (call_status=%s)",
                         call["lead_id"], status)
    return {"ok": True}


@app.get("/api/whatsapp/config")
async def whatsapp_config(_user: dict = Depends(require_user)):
    """Return the configured WhatsApp sender number (plain E.164, no whatsapp: prefix)."""
    raw = os.getenv("TWILIO_WHATSAPP_FROM", "")
    number = raw.replace("whatsapp:", "").strip()
    return {"from_number": number}


@app.post("/api/whatsapp/send")
async def whatsapp_send(body: WhatsAppSendBody, _user: dict = Depends(require_user)):
    """Send a WhatsApp message via Twilio. Numbers are passed as plain E.164;
    the whatsapp: prefix is added here."""
    sid_acc = os.getenv("TWILIO_ACCOUNT_SID", "")
    sid_tok = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not sid_acc or not sid_tok:
        raise HTTPException(503, "Twilio credentials not configured")

    from_wa = f"whatsapp:{body.from_number}" if not body.from_number.startswith("whatsapp:") else body.from_number
    to_wa   = f"whatsapp:{body.to_number}"   if not body.to_number.startswith("whatsapp:")   else body.to_number

    client = TwilioClient(sid_acc, sid_tok)
    try:
        msg = client.messages.create(from_=from_wa, to=to_wa, body=body.message)
    except TwilioRestException as e:
        raise HTTPException(502, f"twilio error {e.code}: {e.msg}")

    log.info("whatsapp sent sid=%s to=%s", msg.sid, body.to_number)
    return {"sid": msg.sid, "status": msg.status}


# ============================================================================
# Agents (Campaign Studio · saved-agent registry)
# ============================================================================

class AgentIn(BaseModel):
    name: str
    description: str | None = None
    agent_name: str | None = None
    brand: str | None = None
    voice_id: str | None = None
    language_pref: str | None = None
    opener_variant: str | None = None
    custom_opener: str | None = None
    system_prompt: str | None = None
    is_default: bool | None = None


def _log_agent_to_mlflow(agent_row: dict[str, Any], change: str) -> str | None:
    """One MLflow run per save → builds prompt-version history. Returns run_id."""
    from voice_agents.mlflow_prompts import log_agent_version
    return log_agent_version(agent_row, change=change)


@app.get("/api/agents")
async def get_agents(_user: dict = Depends(require_user)) -> list[dict[str, Any]]:
    return db.list_agents()


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str,
                    _user: dict = Depends(require_user)) -> dict[str, Any]:
    row = db.get_agent(agent_id)
    if not row:
        raise HTTPException(404, "agent not found")
    return row


@app.get("/api/agents/{agent_id}/versions")
async def get_agent_versions(
    agent_id: str, _user: dict = Depends(require_user),
) -> list[dict[str, Any]]:
    """MLflow prompt-version history for this agent (newest first)."""
    if not db.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    from voice_agents.mlflow_prompts import list_agent_versions
    return list_agent_versions(agent_id)


@app.get("/api/agents/{agent_id}/versions/{run_id}/prompt")
async def get_agent_version_prompt(
    agent_id: str, run_id: str, _user: dict = Depends(require_user),
) -> dict[str, Any]:
    """Read back one version's system_prompt.md artifact."""
    if not db.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    from voice_agents.mlflow_prompts import get_agent_version_prompt as _get
    text = _get(run_id)
    return {"run_id": run_id, "system_prompt": text or ""}


@app.get("/api/studio/trials")
async def get_studio_trials(
    agent_id: str | None = None,
    _user: dict = Depends(require_user),
) -> list[dict[str, Any]]:
    """List recent Studio simulator runs (text + voice)."""
    from voice_agents.mlflow_prompts import list_studio_trials
    return list_studio_trials(agent_id=agent_id)


@app.post("/api/agents", status_code=201)
async def create_agent(payload: AgentIn,
                       _user: dict = Depends(require_user)) -> dict[str, Any]:
    fields = payload.model_dump(exclude_none=True)
    if "is_default" in fields:
        fields["is_default"] = 1 if fields["is_default"] else 0
    try:
        aid = db.insert_agent(**fields)
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(409, f"agent name '{payload.name}' already exists")
        raise
    row = db.get_agent(aid)
    if row:
        run_id = _log_agent_to_mlflow(row, change="created")
        if run_id:
            db.update_agent(aid, mlflow_run_id=run_id)
            row = db.get_agent(aid)
    return row or {}


@app.put("/api/agents/{agent_id}")
async def update_agent(agent_id: str, payload: AgentIn,
                       _user: dict = Depends(require_user)) -> dict[str, Any]:
    if not db.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    fields = payload.model_dump(exclude_none=True)
    if "is_default" in fields:
        fields["is_default"] = 1 if fields["is_default"] else 0
    try:
        db.update_agent(agent_id, **fields)
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(409, f"agent name '{payload.name}' already exists")
        raise
    row = db.get_agent(agent_id)
    if row:
        run_id = _log_agent_to_mlflow(row, change="updated")
        if run_id:
            db.update_agent(agent_id, mlflow_run_id=run_id)
            row = db.get_agent(agent_id)
    return row or {}


@app.delete("/api/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: str,
                       _user: dict = Depends(require_user)) -> Response:
    db.delete_agent(agent_id)
    return Response(status_code=204)


# ============================================================================
# Simulator — text + voice (no real call placed)
# ============================================================================
# The Campaign Studio's preview surface. RM plays the lead, agent uses the
# exact same prompts.py + LLM + qualification rules that production calls
# use. Two transports share these prompts:
#   * text  → /api/simulate/text  (stateless POST; fastest dev loop)
#   * voice → /api/simulate/voice (Pipecat SmallWebRTCTransport; same
#             STT/LLM/TTS pipeline the Twilio path runs, but talked to
#             from the browser via voice-ui-kit)

class SimulatePersona(BaseModel):
    agent_name: str | None = None
    brand: str | None = None
    pronouns: str | None = None
    language_pref: str | None = None        # e.g. "hi-IN", "ta-IN", "en-IN"
    voice_id: str | None = None             # Sarvam speaker name
    lead_name: str | None = None
    lead_notes: str | None = None
    opener_variant: str | None = None       # benefits | social_proof | question
    custom_opener: str | None = None        # overrides opener_variant if set


class SimulateTextTurn(BaseModel):
    role: str                                # "agent" | "lead"
    content: str


class SimulateTextIn(BaseModel):
    persona: SimulatePersona = Field(default_factory=SimulatePersona)
    history: list[SimulateTextTurn] = Field(default_factory=list)
    message: str | None = None               # the RM-as-lead reply; null = ask for opener
    trial_id: str | None = None              # frontend-generated; groups turns into one MLflow run
    agent_id: str | None = None              # if the trial is rooted on a saved Agent
    session_id: str | None = None            # persistent DB session; new one created if absent


# ── Studio sessions (persisted text conversations) ───────────────────────────

@app.get("/api/studio/sessions")
async def studio_sessions_list(
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    """List the current user's saved Studio chat sessions, newest first."""
    sub = _user.get("sub", "")
    rows = db.list_studio_sessions(owner_sub=sub, limit=50)
    return {"sessions": rows}


@app.get("/api/studio/sessions/{session_id}")
async def studio_session_get(
    session_id: str,
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    sub = _user.get("sub", "")
    row = db.get_studio_session(session_id, owner_sub=sub)
    if not row:
        raise HTTPException(404, "session not found")
    return row


@app.delete("/api/studio/sessions/{session_id}")
async def studio_session_delete(
    session_id: str,
    _user: dict = Depends(require_user),
) -> dict[str, bool]:
    sub = _user.get("sub", "")
    ok = db.delete_studio_session(session_id, owner_sub=sub)
    if not ok:
        raise HTTPException(404, "session not found")
    return {"deleted": True}


_OPENER_VARIANT_HINTS = {
    "benefits": (
        "Open by leading with the strongest concrete benefit: 100% brokerage "
        "share AND daily payouts via the RISE Portal. One sentence hook."
    ),
    "social_proof": (
        "Open by mentioning that 1000+ APs already partner with Rupeezy and "
        "earn daily payouts. Make it sound like the lead is missing out."
    ),
    "question": (
        "Open with a curiosity question — ask the lead what brokerage share "
        "they're getting today and pause for their answer before pitching."
    ),
}


def _persona_system_prompt(p: SimulatePersona) -> str:
    """Render the agent system prompt for a simulation, layering opener
    variant / custom opener onto the standard prompts.py template."""
    base = build_system_prompt(
        agent_name=p.agent_name,
        brand=p.brand,
        pronouns=p.pronouns,
        lead_name=p.lead_name,
        lead_notes=p.lead_notes,
    )
    extras: list[str] = []
    if p.custom_opener:
        extras.append(
            "Use this exact opener (or a very close paraphrase in the lead's "
            f"language) for your first turn:\n\n```\n{p.custom_opener.strip()}\n```"
        )
    elif p.opener_variant and p.opener_variant in _OPENER_VARIANT_HINTS:
        extras.append(
            f"Opener style for this campaign: {_OPENER_VARIANT_HINTS[p.opener_variant]}"
        )
    if p.language_pref:
        extras.append(
            f"The lead's preferred language is **{p.language_pref}**. "
            "Open in that language. Switch languages mid-call only if the "
            "lead clearly responds in another."
        )
    extras.append(
        "IMPORTANT — SIMULATION MODE: a Relationship Manager is previewing "
        "this script before activating the campaign. Stay in character as "
        "the agent. Keep replies short (1–3 sentences)."
    )
    return base + "\n# CAMPAIGN OVERRIDES\n\n" + "\n\n".join(extras) + "\n"


@app.post("/api/simulate/preview-prompt")
async def simulate_preview_prompt(
    persona: SimulatePersona,
    _user: dict = Depends(require_user),
) -> dict[str, str]:
    """Returns the exact composed system prompt that would be sent to
    the LLM for this persona. Studio uses this to render the collapsible
    'Runtime prompt' panel — so the RM can see how the opener, language
    rules, and lead notes get layered into the final instructions."""
    return {"system_prompt": _persona_system_prompt(persona)}


# Studio text trials are stateless on the wire but stateful in MLflow — the
# frontend reuses one trial_id per chat session so we accumulate turns into
# a single run instead of creating one per send.
_studio_text_trials: dict[str, Any] = {}


def _studio_text_trial(trial_id: str | None, persona: SimulatePersona,
                       agent_id: str | None) -> Any | None:
    """Get-or-create the StudioTrial for a text chat session."""
    if not trial_id:
        return None
    cached = _studio_text_trials.get(trial_id)
    if cached:
        return cached
    try:
        from voice_agents.mlflow_prompts import StudioTrial
        trial = StudioTrial.start(
            mode="text",
            persona_snapshot=persona.model_dump(),
            agent_id=agent_id,
        )
        trial.log_system_prompt(_persona_system_prompt(persona))
        _studio_text_trials[trial_id] = trial
        return trial
    except Exception as exc:
        log.warning("studio text trial start failed: %s", exc)
        return None


@app.post("/api/simulate/text/end")
async def simulate_text_end(
    payload: dict[str, Any],
    _user: dict = Depends(require_user),
) -> dict[str, bool]:
    """Close out a text trial's MLflow run. Frontend calls this on reset /
    unmount / mode-switch so the run gets transcript + turn metrics."""
    trial_id = (payload or {}).get("trial_id")
    trial = _studio_text_trials.pop(trial_id, None) if trial_id else None
    if trial:
        try:
            trial.end()
        except Exception as exc:
            log.warning("studio text trial end failed: %s", exc)
    return {"ended": bool(trial)}


@app.post("/api/simulate/text")
async def simulate_text(
    payload: SimulateTextIn,
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    """One text turn against the configured agent. Stateless — the client
    sends back the full history each call. Returns ``{reply, language, session_id}``.

    Persistence: if ``session_id`` is omitted we create a new row in
    ``studio_sessions`` keyed to the JWT subject (admin or visitor) and
    return its id. Each user message + agent reply is appended to
    ``studio_messages`` so the user can resume a chat across refreshes /
    devices.
    """
    sub = _user.get("sub", "")
    user_text = (payload.message or "").strip()
    # Create-or-resume the persisted session.
    session_id = payload.session_id
    if not session_id:
        import json as _json
        title = (user_text[:80] if user_text else "New chat")
        session_id = db.create_studio_session(
            owner_sub=sub,
            agent_id=payload.agent_id,
            persona_json=_json.dumps(payload.persona.model_dump(), ensure_ascii=False),
            title=title,
        )
    import httpx
    base_url = (os.getenv("OPENAI_BASE_URL", "") or "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "OPENAI_API_KEY not set")

    messages: list[dict[str, str]] = [
        {"role": "system", "content": _persona_system_prompt(payload.persona)},
    ]
    for turn in payload.history:
        role = "assistant" if turn.role == "agent" else "user"
        messages.append({"role": role, "content": turn.content})
    if payload.message is not None and payload.message.strip():
        messages.append({"role": "user", "content": payload.message.strip()})
    elif not payload.history:
        # First turn — ask the agent to deliver the opener.
        messages.append({
            "role": "user",
            "content": "[SIMULATION START] Begin the call now with your opener.",
        })

    req: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        # Headroom: Kimi sometimes ignores the thinking-off toggle and burns
        # the budget on reasoning before emitting any content.
        "max_tokens": int(os.getenv("SIMULATE_MAX_TOKENS", "2048")),
    }
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        # Send both spellings — Moonshot vLLM builds disagree on which key
        # actually disables the chain-of-thought template.
        req["extra_body"] = {
            "chat_template_kwargs": {"thinking": False, "enable_thinking": False},
            "enable_thinking": False,
        }

    # Manual MLflow trace around the raw httpx LLM call so the Studio
    # text simulator shows up in the Traces tab alongside Pipecat (which
    # autolog covers automatically). Use a contextlib helper so a missing
    # mlflow doesn't tank the request.
    import contextlib
    @contextlib.contextmanager
    def _trace_studio_llm():
        try:
            import mlflow as _mf
            from voice_agents.mlflow_prompts import (
                _configure as _mlconf,
                _ensure_experiment,
                _STUDIO_EXPERIMENT,
            )
            mf = _mlconf()
            if mf is None:
                yield None
                return
            # Anchor the trace to the studio-trials experiment so it
            # appears in the right Traces tab, not under Default.
            _ensure_experiment(mf, _STUDIO_EXPERIMENT)
            with _mf.start_span(name="studio.simulate_text") as span:
                try:
                    span.set_inputs({
                        "model": model,
                        "messages": messages,
                        "temperature": req.get("temperature"),
                        "session_id": session_id,
                        "agent_id": payload.agent_id,
                    })
                except Exception:
                    pass
                yield span
        except Exception as exc:
            log.debug("studio trace skipped: %s", exc)
            yield None

    with _trace_studio_llm() as _span:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"},
                json=req,
            )
        if r.status_code != 200:
            log.error("simulate LLM failed: %d %s", r.status_code, r.text[:300])
            if _span is not None:
                try:
                    _span.set_outputs({"status_code": r.status_code,
                                       "error": r.text[:500]})
                except Exception:
                    pass
            raise HTTPException(502, f"upstream LLM returned {r.status_code}")
        body = r.json()
        if _span is not None:
            try:
                _span.set_outputs({
                    "reply": (body.get("choices", [{}])[0]
                                  .get("message", {})
                                  .get("content", "") or "")[:2000],
                    "finish_reason": body.get("choices", [{}])[0].get("finish_reason"),
                    "usage": body.get("usage"),
                })
            except Exception:
                pass
    msg = body["choices"][0]["message"]
    reply = (msg.get("content") or "").strip()
    if not reply:
        # Some vLLM builds split reasoning model output: chain-of-thought in
        # reasoning_content, final answer in content. Strip <think> if present.
        import re as _re
        reasoning = (msg.get("reasoning_content") or "").strip()
        cleaned = _re.sub(r"<think>.*?</think>", "", reasoning, flags=_re.DOTALL).strip()
        reply = cleaned
    if not reply:
        finish = body["choices"][0].get("finish_reason")
        log.error(
            "simulate: empty reply (finish=%s, msg_keys=%s, content_len=%d, reasoning_len=%d)",
            finish, sorted(msg.keys()),
            len(msg.get("content") or ""),
            len(msg.get("reasoning_content") or ""),
        )
        raise HTTPException(502, "LLM returned empty content")
    trial = _studio_text_trial(payload.trial_id, payload.persona, payload.agent_id)
    if trial:
        # Mirror the user message + agent reply onto the trial's transcript.
        if user_text:
            trial.log_turn("user", user_text)
        trial.log_turn("agent", reply)

    # Persist to DB so the session can be resumed.
    try:
        if user_text:
            db.append_studio_message(session_id, "lead", user_text)
        db.append_studio_message(session_id, "agent", reply)
        db.touch_studio_session(session_id)
    except Exception as exc:
        log.warning("studio session persist failed: %s", exc)

    return {
        "reply": reply,
        "language": payload.persona.language_pref,
        "model": model,
        "trial_id": payload.trial_id,
        "session_id": session_id,
    }


# ---- voice simulator (Pipecat SmallWebRTC) ---------------------------------
# One process-wide request handler keeps a map of pc_id → connection. We
# accept the SDP offer here, kick off the full STT→LLM→TTS pipeline against
# the new connection, then return the SDP answer. The browser uses
# voice-ui-kit's SmallWebRTCTransport client.

from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCRequest,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequestHandler,
    ConnectionMode,
)

_webrtc_handler = SmallWebRTCRequestHandler(
    connection_mode=ConnectionMode.MULTIPLE,
)

# Connection-id → persona override (kept until the connection closes). Persona
# arrives via the offer's `request_data` so we don't need a second hop.
_webrtc_personas: dict[str, dict[str, Any]] = {}


async def _start_webrtc_pipeline(
    webrtc_connection: Any,
    persona: SimulatePersona,
) -> None:
    """Build the same STT→LLM→TTS pipeline used for Twilio calls, but on a
    SmallWebRTC transport. Audio is 16kHz both ways (WebRTC default for the
    browser is 48kHz; Pipecat resamples internally)."""
    lead_lang = _to_language(persona.language_pref)

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
        ),
    )

    stt, stt_cleanup = build_stt(lead_lang)

    llm_extra: dict[str, Any] = {}
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        llm_extra["extra_body"] = {"chat_template_kwargs": {"thinking": False}}
    llm = OpenAILLMService(
        model=os.getenv("OPENAI_LLM_MODEL", "moonshotai/Kimi-K2.6"),
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        params=BaseOpenAILLMService.InputParams(extra=llm_extra),
    )

    speaker = (persona.voice_id or "").strip() or default_speaker()
    tts = build_tts(speaker, lead_lang)

    system_prompt = _persona_system_prompt(persona)
    greeting = build_greeting_instruction(
        agent_name=persona.agent_name, brand=persona.brand,
    )

    context = LLMContext(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": greeting},
        ]
    )
    context_aggregator = LLMContextAggregatorPair(context)

    # Browser sim doesn't write to the DB — it's a preview — but we DO log
    # the session to MLflow as a Studio trial so the RM can compare prompt
    # iterations across runs.
    convo_log = ConversationLog(
        log_dir=LOG_DIR,
        room_name=f"sim-{webrtc_connection.pc_id[:8]}",
        phone_number=None,
        call_id=None,
    )
    user_log = UserTranscriptLogger(convo_log)
    assistant_log = AssistantTranscriptLogger(convo_log)

    try:
        from voice_agents.mlflow_prompts import StudioTrial
        voice_trial = StudioTrial.start(
            mode="voice",
            persona_snapshot=persona.model_dump(),
            agent_id=None,
        )
        voice_trial.log_system_prompt(system_prompt)
    except Exception as exc:
        log.warning("studio voice trial start failed: %s", exc)
        voice_trial = None

    # Custom broadcaster — pushes agent turns directly to the browser via
    # the WebRTC data channel as `{"type":"agent_turn", "text":"..."}`. We
    # do this in addition to RTVI because RTVI's TTS-text events don't
    # reliably surface as `assistant` messages in the kit's
    # usePipecatConversation, leaving the user side of the transcript empty
    # of agent replies. The frontend listens for these app messages and
    # appends them to a local mirror.
    from pipecat.frames.frames import (
        LLMFullResponseStartFrame as _LRS,
        LLMFullResponseEndFrame as _LRE,
        LLMTextFrame as _LTF,
    )
    from pipecat.processors.frame_processor import (
        FrameProcessor as _FP, FrameDirection as _FD,
    )

    class BotTranscriptBroadcaster(_FP):
        """Buffers LLM text chunks and broadcasts a single agent_turn
        message per response over the WebRTC app-message channel."""
        def __init__(self, conn: Any) -> None:
            super().__init__()
            self._conn = conn
            self._buf: list[str] = []

        async def process_frame(self, frame: Any, direction: _FD) -> None:
            await super().process_frame(frame, direction)
            if isinstance(frame, _LRS):
                self._buf.clear()
            elif isinstance(frame, _LTF) and frame.text:
                self._buf.append(frame.text)
            elif isinstance(frame, _LRE):
                text = "".join(self._buf).strip()
                self._buf.clear()
                if text:
                    try:
                        self._conn.send_app_message(
                            {"type": "agent_turn", "text": text}
                        )
                    except Exception as exc:
                        log.warning("send_app_message failed: %s", exc)
                    if voice_trial:
                        try:
                            voice_trial.log_turn("agent", text)
                        except Exception:
                            pass
            await self.push_frame(frame, direction)

    bot_broadcaster = BotTranscriptBroadcaster(webrtc_connection)

    # RTVI processor → handles user-side STT events on the data channel.
    # (Bot text now goes via bot_broadcaster above instead of RTVI.)
    from pipecat.processors.frameworks.rtvi.processor import RTVIProcessor
    from pipecat.processors.frameworks.rtvi.observer import (
        RTVIObserver, RTVIObserverParams,
    )
    rtvi = RTVIProcessor(transport=transport)

    pipeline = Pipeline([
        transport.input(),
        rtvi,
        VADProcessor(vad_analyzer=SileroVADAnalyzer()),
        stt,
        user_log,
        context_aggregator.user(),
        llm,
        assistant_log,
        bot_broadcaster,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
        ),
        observers=[
            RTVIObserver(
                rtvi=rtvi,
                params=RTVIObserverParams(
                    bot_llm_enabled=True,
                    bot_tts_enabled=True,
                    bot_output_enabled=True,
                    bot_speaking_enabled=True,
                    user_transcription_enabled=True,
                    user_speaking_enabled=True,
                ),
            ),
        ],
    )

    @transport.event_handler("on_client_connected")
    async def _on_connected(_t, _c):
        log.info("sim-webrtc: client connected (pc_id=%s)", webrtc_connection.pc_id)
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_t, _c):
        log.info("sim-webrtc: client disconnected (pc_id=%s)", webrtc_connection.pc_id)
        await task.queue_frame(EndFrame())

    runner = PipelineRunner(handle_sigint=False)
    # Run the pipeline in the background; the request handler returns the
    # SDP answer immediately so the browser can finish ICE.
    async def _run() -> None:
        try:
            await runner.run(task)
        except Exception as exc:
            log.exception("sim-webrtc pipeline crashed: %s", exc)
        finally:
            try:
                await stt_cleanup()
            except Exception:
                pass
            _webrtc_personas.pop(webrtc_connection.pc_id, None)

    async def _run_with_trial() -> None:
        try:
            await _run()
        finally:
            if voice_trial:
                try:
                    # Pull the user side of the transcript out of convo_log
                    # (we already streamed agent turns into the trial above).
                    for t in (convo_log._state.get("turns") or []):  # noqa: SLF001
                        if t.get("speaker") == "user" and t.get("text"):
                            voice_trial.log_turn("user", t["text"])
                    voice_trial.end()
                except Exception as exc:
                    log.warning("studio voice trial end failed: %s", exc)

    asyncio.create_task(_run_with_trial())


class _OfferRequestData(BaseModel):
    """The `requestData` envelope the SmallWebRTCTransport client wraps any
    custom session data in (we put the campaign persona here)."""
    persona: SimulatePersona | None = None


class SimulateVoiceOffer(BaseModel):
    """Matches the exact body shape the @pipecat-ai/small-webrtc-transport
    client sends: `{sdp, type, pc_id, restart_pc, requestData}`."""
    sdp: str
    type: str
    pc_id: str | None = None
    restart_pc: bool | None = None
    requestData: _OfferRequestData | None = None


# Trickle-ICE candidate as the SDK sends it (snake_case in the inner objects).
class _IceCandidatePayload(BaseModel):
    candidate: str
    sdp_mid: str | None = None
    sdp_mline_index: int | None = None


class SimulateVoicePatch(BaseModel):
    pc_id: str
    candidates: list[_IceCandidatePayload]


@app.post("/api/simulate/voice/offer")
async def simulate_voice_offer(
    request: Request,
    _user: dict = Depends(require_user),
) -> dict[str, str] | None:
    """Browser sends an SDP offer + persona; we spin up a Pipecat pipeline
    bound to a fresh SmallWebRTCConnection and return the SDP answer.

    We parse the body manually because the SDK's fetch sometimes omits a
    proper Content-Type header (or it gets stripped by intermediaries),
    which makes FastAPI deliver the body as raw bytes and Pydantic 422s.
    """
    raw = await request.body()
    try:
        body = json.loads(raw)
    except Exception as exc:
        raise HTTPException(400, f"body must be JSON: {exc!s}")
    try:
        offer = SimulateVoiceOffer.model_validate(body)
    except Exception as exc:
        raise HTTPException(422, f"bad offer payload: {exc!s}")

    persona = (offer.requestData.persona
               if offer.requestData and offer.requestData.persona
               else SimulatePersona())

    async def _callback(connection: Any) -> None:
        _webrtc_personas[connection.pc_id] = persona.model_dump()
        try:
            await _start_webrtc_pipeline(connection, persona)
        except Exception:
            log.exception("sim-webrtc: pipeline assembly failed; "
                          "tearing down peer connection")
            try:
                await connection.disconnect()
            except Exception:
                pass
            raise

    req = SmallWebRTCRequest(
        sdp=offer.sdp,
        type=offer.type,
        pc_id=offer.pc_id,
        restart_pc=offer.restart_pc,
    )
    try:
        return await _webrtc_handler.handle_web_request(req, _callback)
    except HTTPException:
        raise
    except Exception as exc:
        # Surface the real reason instead of a bare 500. SDP-parse errors and
        # provider key issues are the usual culprits.
        log.exception("sim-webrtc offer failed")
        raise HTTPException(status_code=500, detail=f"webrtc offer failed: {exc!s}")


@app.patch("/api/simulate/voice/offer")
async def simulate_voice_offer_patch(
    request: Request,
    _user: dict = Depends(require_user),
) -> dict[str, bool]:
    """Trickle-ICE: SmallWebRTCTransport pushes candidates as PATCH to the
    same offer URL (not a separate `/ice` endpoint as you might expect).

    Body is parsed manually for the same Content-Type reason as the POST."""
    raw = await request.body()
    try:
        body = json.loads(raw)
    except Exception as exc:
        raise HTTPException(400, f"body must be JSON: {exc!s}")
    try:
        patch = SimulateVoicePatch.model_validate(body)
    except Exception as exc:
        raise HTTPException(422, f"bad ICE payload: {exc!s}")

    from pipecat.transports.smallwebrtc.request_handler import IceCandidate
    req = SmallWebRTCPatchRequest(
        pc_id=patch.pc_id,
        candidates=[
            IceCandidate(
                candidate=c.candidate,
                sdp_mid=c.sdp_mid or "",
                sdp_mline_index=c.sdp_mline_index or 0,
            )
            for c in patch.candidates
        ],
    )
    await _webrtc_handler.handle_patch_request(req)
    return {"ok": True}


# ============================================================================
# Outbound dial helper (used by the API endpoints)
# ============================================================================

def _build_opener(
    lang_pref: str, lead_first: str, agent_name: str, brand: str
) -> tuple[str, str]:
    """Return (opening_line, sarvam_language_code) for the given language preference."""
    lp = (lang_pref or "").lower().strip()
    name = f", {lead_first}" if lead_first else ""

    if any(k in lp for k in ("ta", "tamil")):
        return (
            f"Vanakkam{name}! Naan {agent_name}, {brand} irundu pesugiren. "
            f"Ungalukku oru nalla vasadhi pathi sollanom — "
            f"100 silavidam brokerage share matrum daily payouts. Oru nimisham pesalama?",
            "ta-IN",
        )
    if any(k in lp for k in ("te", "telugu")):
        return (
            f"Namaskaram{name}! Nenu {agent_name}, {brand} nunchi matladutunna. "
            f"Meeru kosam oka manci avasaram undi — "
            f"100 percent brokerage share mariyu daily payouts. Okka nimisham matladataniki velustu?",
            "te-IN",
        )
    if any(k in lp for k in ("mr", "marathi")):
        return (
            f"Namaskar{name}! Mi {agent_name} {brand} kadun boltey. "
            f"Tumhala ek chhan sandhi sangaychay — "
            f"100 percent brokerage share ani daily payouts. Ek minute bolal ka?",
            "mr-IN",
        )
    if any(k in lp for k in ("gu", "gujarati")):
        return (
            f"Namaste{name}! Hu {agent_name} chu {brand} thi. "
            f"Tamne ek saras takh vishe janavaanu chhe — "
            f"100 percent brokerage share ane daily payouts. Ek minit vaat kari shakasho?",
            "gu-IN",
        )
    if any(k in lp for k in ("bn", "bengali")):
        return (
            f"Namaskar{name}! Ami {agent_name}, {brand} theke bolchi. "
            f"Apnake ekta darun sujog somporke bolte chhaichi — "
            f"100 percent brokerage share ebong daily payouts. Ek minit kotha bolte parben?",
            "bn-IN",
        )
    if any(k in lp for k in ("pa", "punjabi")):
        return (
            f"Sat Sri Akal{name}! Main {agent_name} haan {brand} to. "
            f"Tuhanu ik bahut vadiya mauka dasna chahunda si — "
            f"100 percent brokerage share te daily payouts. Ik minute gal kar sakte ho?",
            "pa-IN",
        )
    if any(k in lp for k in ("en", "english")):
        return (
            f"Hello{name}! I'm {agent_name} calling from {brand}. "
            f"I wanted to share a great opportunity with you — "
            f"100 percent brokerage share and daily payouts. Do you have a minute?",
            "en-IN",
        )
    # Default: Hindi / Hinglish
    name_ji = f", {lead_first} ji" if lead_first else ""
    return (
        f"Haan ji, namaste{name_ji}! "
        f"Main {agent_name} bol rahi hoon {brand} ki taraf se. "
        f"Aapko ek bahut achha opportunity ke baare mein batana tha — "
        f"jahan aap 100 percent brokerage share pa sakte hain, aur payout bhi daily milta hai. "
        f"Kya aap ek minute baat kar sakte hain?",
        "hi-IN",
    )


def _prewarm_sarvam_audio(text: str, lang_code: str, speaker: str) -> bytes | None:
    """Call Sarvam HTTP TTS and return raw WAV bytes, or None on any failure."""
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key or not text:
        return None
    model = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
    payload: dict[str, Any] = {
        "text": text,
        "target_language_code": lang_code,
        "speaker": speaker,
        "model": model,
        "sample_rate": 22050,
        "enable_preprocessing": True,
        "pace": 1.0,
    }
    if "v3" in model:
        payload["temperature"] = 0.5
    try:
        import base64
        resp = requests.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        audios = resp.json().get("audios") or []
        if not audios:
            return None
        return base64.b64decode(audios[0])
    except Exception as exc:
        log.warning("sarvam prewarm failed (%s/%s): %s", lang_code, speaker, exc)
        return None


def _public_base_url() -> str:
    """Return ``https://<host>`` reachable from Twilio.

    Prefers PUBLIC_BASE_URL env var; else queries ngrok's local API."""
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL.rstrip("/")
    try:
        r = requests.get(NGROK_API, timeout=2)
        r.raise_for_status()
        for t in r.json().get("tunnels", []):
            url = t.get("public_url", "")
            if url.startswith("https://"):
                return url
    except Exception as e:
        log.error("ngrok URL lookup failed: %s", e)
    raise HTTPException(503, "no public URL — set PUBLIC_BASE_URL or run ngrok")


async def _place_call(lead: dict[str, Any]) -> dict[str, Any]:
    sid_acc = os.environ.get("TWILIO_ACCOUNT_SID")
    sid_tok = os.environ.get("TWILIO_AUTH_TOKEN")
    from_no = os.environ.get("TWILIO_FROM_NUMBER")
    if not (sid_acc and sid_tok and from_no):
        raise HTTPException(503, "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing")

    base = _public_base_url()
    host = urlparse(base).netloc
    ws_url = f"wss://{host}/ws"

    call_id = db.insert_call(lead["id"])
    db.update_lead_status(lead["id"], "calling")
    db.record_event(call_id, "queued")
    db.record_event(call_id, "dialing", detail=f"to={lead['phone']}")

    # Twilio's <Stream><Parameter> values must be HTML-escaped so a
    # name with an apostrophe or notes with quotes don't break the XML.
    # call_id is enough for the bot — it loads notes and voice_id from
    from xml.sax.saxutils import escape as xml_escape
    agent_name  = os.getenv("AGENT_NAME", "Priya")
    brand       = os.getenv("AGENT_BRAND", "Rupeezy")
    lead_first  = (lead.get("name") or "").split()[0] if lead.get("name") else ""
    lang_pref   = (lead.get("language_pref") or "").lower().strip()

    _default_opener, _lang_code = _build_opener(lang_pref, lead_first, agent_name, brand)
    opening_line = (
        (lead.get("opening_line") or "").strip()
        or os.getenv("AGENT_OPENING_LINE", "").strip()
        or _default_opener
    )
    _speaker = (lead.get("voice_id") or "").strip() or os.getenv("SARVAM_SPEAKER", "kavya")
    wav_bytes = _prewarm_sarvam_audio(opening_line, _lang_code, _speaker)

    if wav_bytes:
        _PREWARM_CACHE[call_id] = wav_bytes
        say_block = f'<Play>{xml_escape(base)}/api/prewarm/{xml_escape(call_id)}</Play>'
        opening_param = f'<Parameter name="opening_line" value="{xml_escape(opening_line)}"/>'
    else:
        # Prewarm failed — silence then LLM generates the opener
        say_block = '<Pause length="2"/>'
        opening_param = ""

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        f'{say_block}'
        f'<Connect><Stream url="{ws_url}">'
        f'<Parameter name="call_id" value="{xml_escape(call_id)}"/>'
        f'{opening_param}'
        '</Stream></Connect>'
        '</Response>'
    )

    client = TwilioClient(sid_acc, sid_tok)
    try:
        call = client.calls.create(
            twiml=twiml,
            to=lead["phone"],
            from_=from_no,
            record=os.getenv("TWILIO_RECORD_CALLS", "0") == "1",
            status_callback=f"{base}/api/calls/{call_id}/twilio-status",
            status_callback_method="POST",
        )
    except TwilioRestException as e:
        db.update_call(call_id, status="failed",
                       summary=f"twilio error {e.code}: {e.msg}")
        db.record_event(call_id, "failed", detail=f"{e.code}: {e.msg}")
        raise HTTPException(502, f"twilio error {e.code}: {e.msg}")
    db.attach_twilio_sid(call_id, call.sid)
    db.update_call(call_id, status="ringing")
    db.record_event(call_id, "ringing", detail=call.sid)
    log.info("placed call=%s twilio_sid=%s ws=%s", call_id, call.sid, ws_url)
    return {"call_id": call_id, "twilio_sid": call.sid, "lead_id": lead["id"],
            "status": "ringing", "ws_url": ws_url}


# ============================================================================
# Twilio Media Streams bot — same pipeline as twilio_bot.py, hosted here
# ============================================================================

def _to_language(pref: str | None) -> Language | None:
    """Convert a language_pref string (e.g. 'ta-IN') to a pipecat Language enum.
    Returns None for unknown/missing prefs so services fall back to auto-detect."""
    if not pref:
        return None
    try:
        return Language(pref)
    except ValueError:
        return None


@app.get("/api/prewarm/{call_id}")
async def prewarm_audio(call_id: str) -> Response:
    """Serve pre-synthesised Sarvam opener WAV for Twilio <Play>. One-shot."""
    wav_bytes = _PREWARM_CACHE.pop(call_id, None)
    if wav_bytes is None:
        raise HTTPException(404, "prewarm audio not found or already served")
    return Response(content=wav_bytes, media_type="audio/wav")


@app.get("/twiml")
async def twiml(request: Request) -> Response:
    host = request.headers.get("host", f"localhost:{PORT}")
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        '<Pause length="1"/>'
        f'<Connect><Stream url="wss://{host}/ws"/></Connect>'
        '</Response>'
    )
    return Response(content=body, media_type="application/xml")


@app.websocket("/ws")
async def ws_handler(websocket: WebSocket) -> None:
    await websocket.accept()
    log.info("Twilio WebSocket connected")

    # Twilio sends connected → start before any audio.
    raw1 = await websocket.receive_text()
    log.info("twilio connected event: %s", raw1[:200])
    start = json.loads(await websocket.receive_text())
    if start.get("event") != "start":
        for _ in range(3):
            start = json.loads(await websocket.receive_text())
            if start.get("event") == "start":
                break
        else:
            log.error("never received Twilio 'start' event")
            await websocket.close()
            return

    stream_sid = start["start"]["streamSid"]
    call_sid = start["start"]["callSid"]
    custom_params = start["start"].get("customParameters", {}) or {}
    call_id = custom_params.get("call_id")
    opening_line_param = custom_params.get("opening_line", "").strip()

    # Re-load lead context from DB so we can use the admin-supplied notes
    # and per-lead voice without stuffing them into the TwiML <Parameter>s.
    lead_row: dict[str, Any] | None = None
    if call_id:
        call_row = db.get_call(call_id)
        if call_row and call_row.get("lead_id"):
            lead_row = db.get_lead(call_row["lead_id"])
    lead_name = (lead_row or {}).get("name")
    lead_notes = (lead_row or {}).get("notes")
    # Trained-agent lookup. If the lead points at an agent (or there's a
    # studio default), we use the agent's persona / voice / language /
    # opener as the baseline, and let the lead's own fields override.
    agent_row: dict[str, Any] | None = None
    if lead_row:
        if lead_row.get("agent_id"):
            agent_row = db.get_agent(lead_row["agent_id"])
        if not agent_row:
            agent_row = db.get_default_agent()
    # Effective config = lead override → agent → env defaults
    eff_language = (
        (lead_row or {}).get("language_pref")
        or (agent_row or {}).get("language_pref")
    )
    lead_lang = _to_language(eff_language)
    lead_agent_name = (
        (lead_row or {}).get("agent_name")
        or (agent_row or {}).get("agent_name")
        or os.getenv("AGENT_NAME")
        or "Priya"
    )
    # Sarvam speaker name. Voice precedence mirrors the rest:
    # lead.voice_id → agent.voice_id → default_speaker() (env). Guard against
    # stale ElevenLabs UUIDs stored in older leads.
    _raw_voice = (
        (lead_row or {}).get("voice_id")
        or (agent_row or {}).get("voice_id")
        or ""
    )
    speaker = _raw_voice if _raw_voice in _SARVAM_SPEAKERS else default_speaker()

    log.info("stream=%s call=%s lead=%s call_id=%s lang=%s speaker=%s notes=%s",
             stream_sid, call_sid, lead_name, call_id,
             lead_lang.value if lead_lang else "auto",
             speaker, "yes" if lead_notes else "no")

    from voice_agents.mlflow_tracker import CallTracker
    _mlflow_call_id = call_id or f"anon-{stream_sid[:8]}"
    tracker = CallTracker(_mlflow_call_id, lead_row)
    tracker.start(transport="pipecat")

    if call_id:
        db.update_call(call_id, status="in-progress")
        db.record_event(call_id, "picked",
                        detail=f"twilio_sid={call_sid}")

    serializer = TwilioFrameSerializer(
        stream_sid=stream_sid,
        call_sid=call_sid,
        account_sid=os.environ["TWILIO_ACCOUNT_SID"],
        auth_token=os.environ["TWILIO_AUTH_TOKEN"],
    )

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    stt, stt_cleanup = build_stt(lead_lang)

    llm_extra: dict[str, Any] = {}
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        llm_extra["extra_body"] = {"chat_template_kwargs": {"thinking": False}}

    llm = OpenAILLMService(
        model=os.getenv("OPENAI_LLM_MODEL", "moonshotai/Kimi-K2.6"),
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        params=BaseOpenAILLMService.InputParams(extra=llm_extra),
    )

    tts = build_tts(speaker, lead_lang)

    # If the trained agent has a full system_prompt override, use it as-is
    # (the RM was explicit). Otherwise build one from prompts.py and layer
    # the agent's opener variant / custom opener on top.
    agent_system_prompt = (agent_row or {}).get("system_prompt") if agent_row else None
    if agent_system_prompt and agent_system_prompt.strip():
        system_prompt = agent_system_prompt
        extras: list[str] = []
        if lead_name:
            extras.append(f"The lead's name is **{lead_name}** — use it in the opener.")
        if lead_notes:
            extras.append(
                "Background notes from the admin about this lead — internalize "
                "and adapt your pitch around them. Do NOT read them out loud:\n\n"
                f"```\n{str(lead_notes).strip()}\n```"
            )
        if extras:
            system_prompt += "\n\n# THIS CALL\n\n" + "\n\n".join(extras) + "\n"
    else:
        system_prompt = build_system_prompt(
            agent_name=lead_agent_name,
            brand=(agent_row or {}).get("brand"),
            lead_name=lead_name,
            lead_notes=lead_notes,
        )
        # Layer the trained agent's opener style on top of the default prompt.
        opener_variant = (agent_row or {}).get("opener_variant")
        custom_opener = (agent_row or {}).get("custom_opener")
        _OPENER_HINTS = {
            "benefits": "Open by leading with the strongest concrete benefit: 100% brokerage share AND daily payouts via the RISE Portal.",
            "social_proof": "Open by mentioning that 1000+ APs already partner with us and earn daily payouts.",
            "question": "Open with a curiosity question — ask the lead what brokerage share they're getting today and pause for their answer.",
        }
        opener_extra: list[str] = []
        if custom_opener and custom_opener.strip():
            opener_extra.append(
                "Use this exact opener (or a very close paraphrase in the lead's language) for your first turn:\n\n"
                f"```\n{custom_opener.strip()}\n```"
            )
        elif opener_variant and opener_variant in _OPENER_HINTS:
            opener_extra.append(f"Opener style for this call: {_OPENER_HINTS[opener_variant]}")
        if opener_extra:
            system_prompt += "\n\n# CAMPAIGN OVERRIDES\n\n" + "\n\n".join(opener_extra) + "\n"

    greeting = build_greeting_instruction(
        agent_name=lead_agent_name,
        brand=(agent_row or {}).get("brand"),
    )

    # Snapshot the runtime composed prompt onto the call's MLflow run so the
    # Studio / call-detail UI can show exactly what the model saw.
    try:
        from voice_agents.mlflow_prompts import log_runtime_prompt
        log_runtime_prompt(
            call_id=_mlflow_call_id,
            system_prompt=system_prompt,
            agent_id=(agent_row or {}).get("id"),
            agent_name=lead_agent_name,
            lead_name=lead_name,
            language=lead_lang.value if lead_lang else None,
            voice=speaker,
        )
    except Exception as exc:
        log.warning("runtime prompt log failed (non-fatal): %s", exc)

    init_messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": greeting},
    ]
    if opening_line_param:
        # Agent already spoke via Twilio <Say> — seed context so LLM knows.
        init_messages.append({"role": "assistant", "content": opening_line_param})

    context = LLMContext(messages=init_messages)
    context_aggregator = LLMContextAggregatorPair(context)

    convo_log = ConversationLog(
        log_dir=LOG_DIR,
        room_name=f"twilio-{call_sid}",
        phone_number=(lead_row or {}).get("phone"),
        call_id=call_id,
    )
    user_log = UserTranscriptLogger(convo_log)
    assistant_log = AssistantTranscriptLogger(convo_log)

    pipeline = Pipeline([
        transport.input(),
        VADProcessor(vad_analyzer=SileroVADAnalyzer()),
        stt,
        user_log,
        context_aggregator.user(),
        llm,
        assistant_log,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def _on_connected(_t, _ws):
        log.info("client fully connected (call_id=%s)", call_id)
        if opening_line_param:
            # Opening already spoken by Twilio <Say> — log it and wait for lead.
            convo_log.flush_assistant()  # no-op buffer clear
            if call_id:
                from voice_agents.db import append_turn
                append_turn(call_id, "agent", opening_line_param, None)
        else:
            await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_t, _ws):
        log.info("client disconnected — ending pipeline (call_id=%s)", call_id)
        await task.queue_frame(EndFrame())

    # Hook stage events directly off the loggers we already have. Putting
    # them here (in the transport hot path) keeps everything in one place.
    if call_id:
        _orig_user_append = convo_log.append_user
        _orig_asst_flush = convo_log.flush_assistant

        def _user_append(text, lang):
            _orig_user_append(text, lang)
            db.record_event(call_id, "user_spoke", detail=text[:80])
        def _asst_flush():
            had_buffer = bool(convo_log._assistant_buffer)
            _orig_asst_flush()
            if had_buffer:
                db.record_event(call_id, "agent_spoke")
        convo_log.append_user = _user_append          # type: ignore[assignment]
        convo_log.flush_assistant = _asst_flush       # type: ignore[assignment]

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(task)
    finally:
        convo_log.close()
        await stt_cleanup()
        if call_id:
            await _finalize_call(call_id, call_sid)
        log.info("pipeline finished for call %s (call_id=%s)", call_sid, call_id)


async def _finalize_call(call_id: str, twilio_sid: str) -> None:
    """After hangup: pull duration + recording URL from Twilio, decide a
    final stage event, run the analyzer, mark the lead done."""
    sid_acc = os.environ["TWILIO_ACCOUNT_SID"]
    sid_tok = os.environ["TWILIO_AUTH_TOKEN"]
    client = TwilioClient(sid_acc, sid_tok)

    await asyncio.sleep(2)
    twcall_status = "completed"
    try:
        twcall = await asyncio.to_thread(client.calls(twilio_sid).fetch)
        twcall_status = twcall.status or "completed"
        recordings = await asyncio.to_thread(
            lambda: client.calls(twilio_sid).recordings.list(limit=1)
        )
        rec_url = None
        if recordings:
            rec = recordings[0]
            rec_url = f"https://api.twilio.com{rec.uri.replace('.json', '.mp3')}"
        db.update_call(
            call_id,
            status=twcall_status,
            duration_seconds=int(twcall.duration) if twcall.duration else None,
            recording_url=rec_url,
            ended_at=db.now_iso(),
        )
    except Exception as e:
        log.warning("twilio fetch on finalize failed: %s", e)

    # Decide the terminal stage event:
    #   - 'completed' if Twilio says completed AND the user actually spoke;
    #   - 'dropped_early' if call was answered but no user_spoke event ever
    #     fired (engagement signal — picked up but bailed without talking);
    #   - else mirror Twilio's terminal status (no_answer / busy / failed /
    #     canceled).
    if twcall_status == "completed":
        db.record_event(call_id, "completed")
    elif twcall_status in ("no-answer", "busy", "failed", "canceled"):
        db.record_event(call_id, twcall_status.replace("-", "_"))
    else:
        db.record_event(call_id, "completed", detail=twcall_status)

    call = db.get_call(call_id)
    if call and call.get("lead_id"):
        db.update_lead_status(call["lead_id"], "done")

    try:
        await analyze_call(call_id)
    except Exception as e:
        log.warning("analyzer failed for %s: %s", call_id, e)

    # End the MLflow run for this call
    try:
        from voice_agents.mlflow_tracker import get_tracker
        tracker = get_tracker(call_id)
        if tracker:
            duration = None
            try:
                call_data = db.get_call(call_id)
                duration = call_data.get("duration_seconds") if call_data else None
            except Exception:
                pass
            tracker.end(duration_seconds=duration)
    except Exception as exc:
        log.warning("mlflow finalize failed (non-fatal): %s", exc)


# ============================================================================
# Entry point
# ============================================================================

def main() -> None:
    import uvicorn
    log.info("starting unified API + bot server on :%d", PORT)
    log.info("expose with:  ngrok http %d", PORT)
    log.info("UI default:   cd ui && npm install && npm run dev   (then open :3000)")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
