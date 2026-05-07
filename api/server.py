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

import aiohttp
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
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
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


# ============================================================================
# Lead + call endpoints
# ============================================================================

class LeadIn(BaseModel):
    name: str
    phone: str = Field(..., description="E.164, e.g. +919444531354")
    language_pref: str | None = None
    voice_id: str | None = Field(default=None, description="ElevenLabs voice ID; null falls back to ELEVENLABS_VOICE_ID")
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
    """Backs the /analytics page: funnel by stage, calls-by-day, score split."""
    return {
        "stage_funnel": db.stage_funnel(),
        "calls_by_day": db.calls_by_day(days=days),
        "score_split": {
            k: db.funnel_metrics()[k] for k in ("hot", "warm", "cold")
        },
    }


# Curated catalog of multilingual-capable ElevenLabs voices. ``eleven_turbo_v2_5``
# makes any voice speak Hindi/Tamil natively, so this is enough for the form.
# Override or extend by editing this list (no runtime cost).
ELEVENLABS_VOICE_CATALOG = [
    {"voice_id": "hpp4J3VqNfWAUOO0d1Us", "name": "Bella",   "description": "Female · professional · warm"},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah",   "description": "Female · mature · reassuring"},
    {"voice_id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "description": "Female · playful · bright"},
    {"voice_id": "FGY2WhTYpPnrIDTdsKH5", "name": "Laura",   "description": "Female · enthusiast · quirky"},
    {"voice_id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily",    "description": "Female · velvety · actress"},
    {"voice_id": "JBFqnCBsd6RMkjVDRZzb", "name": "George",  "description": "Male · warm storyteller"},
    {"voice_id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "description": "Male · deep · confident"},
    {"voice_id": "cjVigY5qzO86Huf0OWal", "name": "Eric",    "description": "Male · smooth · trustworthy"},
    {"voice_id": "nPczCjzI2devNBz1zQrb", "name": "Brian",   "description": "Male · deep · resonant"},
    {"voice_id": "iP95p4xoKVk53GoZ742B", "name": "Chris",   "description": "Male · charming · down-to-earth"},
]


@app.get("/api/voices")
async def voices(_user: dict = Depends(require_user)) -> dict[str, Any]:
    return {
        "default_voice_id": os.getenv("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us"),
        "voices": ELEVENLABS_VOICE_CATALOG,
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
    lid = db.insert_lead(lead.name, lead.phone, lead.language_pref,
                         lead.notes, lead.voice_id)
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

def _resolve_eleven_key() -> str:
    key = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVEN_API_KEY / ELEVENLABS_API_KEY not set")
    return key


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
    voice_id = ((lead_row or {}).get("voice_id")
                or os.getenv("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us"))

    log.info("stream=%s call=%s lead=%s call_id=%s voice=%s notes=%s",
             stream_sid, call_sid, lead_name, call_id, voice_id,
             "yes" if lead_notes else "no")

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

    aiohttp_session = aiohttp.ClientSession()

    stt = ElevenLabsSTTService(
        api_key=_resolve_eleven_key(),
        aiohttp_session=aiohttp_session,
        model=os.getenv("ELEVENLABS_STT_MODEL_PIPECAT", "scribe_v2"),
    )

    llm_extra: dict[str, Any] = {}
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        llm_extra["extra_body"] = {"chat_template_kwargs": {"thinking": False}}

    llm = OpenAILLMService(
        model=os.getenv("OPENAI_LLM_MODEL", "moonshotai/Kimi-K2.6"),
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        params=BaseOpenAILLMService.InputParams(extra=llm_extra),
    )

    tts = ElevenLabsTTSService(
        api_key=_resolve_eleven_key(),
        voice_id=voice_id,
        model=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5"),
    )

    system_prompt = build_system_prompt(
        lead_name=lead_name,
        lead_notes=lead_notes,
    )
    greeting = build_greeting_instruction()
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
        await aiohttp_session.close()
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
