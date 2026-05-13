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
from fastapi.responses import Response, StreamingResponse
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
    notes: str | None = None


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
    return {
        "username": user["sub"],
        "display_name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


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
    lid = db.insert_lead(
        name=lead.name,
        phone=lead.phone,
        language_pref=lead.language_pref,
        notes=lead.notes,
        voice_id=lead.voice_id,
        agent_name=(lead.agent_name or "").strip() or None,
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
                       row.get("notes") or None)
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


@app.post("/api/simulate/text")
async def simulate_text(
    payload: SimulateTextIn,
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    """One text turn against the configured agent. Stateless — the client
    sends back the full history each call. Returns ``{reply, language}``."""
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

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json=req,
        )
    if r.status_code != 200:
        log.error("simulate LLM failed: %d %s", r.status_code, r.text[:300])
        raise HTTPException(502, f"upstream LLM returned {r.status_code}")
    body = r.json()
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
    return {
        "reply": reply,
        "language": payload.persona.language_pref,
        "model": model,
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

    # Browser sim doesn't write to the DB or to mlflow — it's a preview. We
    # still buffer the conversation in-memory to mirror it back over the
    # data channel for the side-by-side transcript panel.
    convo_log = ConversationLog(
        log_dir=LOG_DIR,
        room_name=f"sim-{webrtc_connection.pc_id[:8]}",
        phone_number=None,
        call_id=None,
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
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
        ),
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

    asyncio.create_task(_run())


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
    # SQLite by call_id → lead_id, avoiding payload-in-URL footguns.
    from xml.sax.saxutils import escape as xml_escape
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        '<Pause length="1"/>'
        '<Say voice="Polly.Aditi" language="hi-IN">'
        f'Connecting you to {xml_escape(os.getenv("AGENT_NAME", "Priya"))} from '
        f'{xml_escape(os.getenv("AGENT_BRAND", "Rupeezy"))}.'
        '</Say>'
        f'<Connect><Stream url="{ws_url}">'
        f'<Parameter name="call_id" value="{xml_escape(call_id)}"/>'
        '</Stream></Connect>'
        '</Response>'
    )

    client = TwilioClient(sid_acc, sid_tok)
    try:
        call = client.calls.create(
            twiml=twiml,
            to=lead["phone"],
            from_=from_no,
            # Recording is OFF by default to save cost. Flip
            # TWILIO_RECORD_CALLS=1 in .env when you want call audio archived.
            record=os.getenv("TWILIO_RECORD_CALLS", "0") == "1",
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

    # Re-load lead context from DB so we can use the admin-supplied notes
    # and per-lead voice without stuffing them into the TwiML <Parameter>s.
    lead_row: dict[str, Any] | None = None
    if call_id:
        call_row = db.get_call(call_id)
        if call_row and call_row.get("lead_id"):
            lead_row = db.get_lead(call_row["lead_id"])
    lead_name = (lead_row or {}).get("name")
    lead_notes = (lead_row or {}).get("notes")
    lead_lang = _to_language((lead_row or {}).get("language_pref"))  # e.g. Language.TA_IN
    # Per-lead agent persona; falls back to AGENT_NAME env (default "Priya").
    lead_agent_name = (lead_row or {}).get("agent_name") or os.getenv("AGENT_NAME") or "Priya"
    # Sarvam speaker name stored in voice_id column; falls back to SARVAM_SPEAKER env.
    # Guard against stale ElevenLabs UUIDs stored in older leads — if the value
    # isn't a known Sarvam speaker name, ignore it and use the default.
    _raw_voice = (lead_row or {}).get("voice_id") or ""
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

    system_prompt = build_system_prompt(
        agent_name=lead_agent_name,
        lead_name=lead_name,
        lead_notes=lead_notes,
    )
    greeting = build_greeting_instruction(agent_name=lead_agent_name)
    context = LLMContext(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": greeting},
        ]
    )
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
        log.info("client fully connected — kicking off greeting (call_id=%s)", call_id)
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
    events = {e["stage"] for e in db.list_events(call_id)}
    if twcall_status == "completed":
        if "user_spoke" in events:
            db.record_event(call_id, "completed")
        else:
            db.record_event(call_id, "dropped_early",
                            detail="answered but lead never spoke")
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
