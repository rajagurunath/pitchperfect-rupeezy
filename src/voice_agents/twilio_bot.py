"""Pipecat + Twilio Media Streams voice agent — no LiveKit, no Daily.

Architecture
------------
Twilio  ──PSTN──>  +91 9444531354 (your phone)
   │
   │ (Media Streams: mu-law 8 kHz, base64-over-WebSocket)
   ▼
ngrok tunnel  ──>  this FastAPI server on localhost:8765
   │
   ▼
Pipecat pipeline:
   transport.input → VAD → ElevenLabs STT
     → context aggregator (user) → JSON logger
     → Kimi-K2.6 (thinking off) → ElevenLabs TTS (Bella, multilingual)
     → transport.output → context aggregator (assistant)

How it runs
-----------
1. ``uv run twilio-bot``                 — starts FastAPI on :8765
2. ``ngrok http 8765``                   — exposes it; copy the https URL
3. ``uv run twilio-dial +919444531354 \\
        --public-url <ngrok-url>``       — places the outbound call

The dial script POSTs TwiML ``<Connect><Stream url="wss://.../ws"/></Connect>``
so Twilio bridges PSTN audio straight into our WebSocket. No SIP trunk
required, no LiveKit project, no Daily account. The Twilio account you
already have is enough.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import Response
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
import aiohttp
import uvicorn

from .pipecat_logger import (
    AssistantTranscriptLogger,
    ConversationLog,
    UserTranscriptLogger,
)
from .prompts import GREETING_INSTRUCTION, SYSTEM_PROMPT

load_dotenv()

loguru_logger.remove()
loguru_logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voice-agents.twilio_bot")


LOG_DIR = Path(os.getenv("CONVERSATION_LOG_DIR", "logs"))
PORT = int(os.getenv("TWILIO_BOT_PORT", "8765"))


def _resolve_eleven_key() -> str:
    key = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("ELEVEN_API_KEY / ELEVENLABS_API_KEY not set in .env")
    return key


app = FastAPI(title="Rupeezy AP — Twilio Media Streams bot")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/twiml")
async def twiml(request: Request) -> Response:
    """Return TwiML that connects the inbound (or just-placed outbound) call
    to our WebSocket. Used both by inbound webhooks and as the ``twiml`` body
    of outbound ``client.calls.create`` calls.
    """
    host = request.headers.get("host", f"localhost:{PORT}")
    # Twilio Media Streams require wss:// (TLS). ngrok provides it for free.
    ws_url = f"wss://{host}/ws"
    log.info("serving TwiML pointing at %s", ws_url)
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        '<Pause length="1"/>'
        f'<Connect><Stream url="{ws_url}"/></Connect>'
        '</Response>'
    )
    return Response(content=body, media_type="application/xml")


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept()
    log.info("Twilio WebSocket connected")

    # Twilio sends two events before any audio:
    #   1. {"event":"connected", ...}        -> handshake
    #   2. {"event":"start", "start":{"streamSid","callSid","accountSid",...}}
    # We must capture streamSid/callSid before constructing the serializer.
    raw1 = await websocket.receive_text()
    raw2 = await websocket.receive_text()
    log.info("twilio connected event: %s", raw1[:200])
    start = json.loads(raw2)
    if start.get("event") != "start":
        # Tolerate extra "connected" frames or different ordering.
        for _ in range(3):
            raw_n = await websocket.receive_text()
            start = json.loads(raw_n)
            if start.get("event") == "start":
                break
        else:
            log.error("never received Twilio 'start' event; bailing")
            await websocket.close()
            return

    stream_sid = start["start"]["streamSid"]
    call_sid = start["start"]["callSid"]
    log.info("stream=%s call=%s — building pipeline", stream_sid, call_sid)

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
            audio_in_sample_rate=8000,   # Twilio Media Streams: mu-law 8kHz
            audio_out_sample_rate=8000,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    aiohttp_session = aiohttp.ClientSession()

    # Pipecat's ElevenLabs STT uses the synchronous /v1/speech-to-text endpoint
    # which accepts scribe_v1 / scribe_v2 only. (LiveKit's plugin hits a
    # different realtime websocket and uses scribe_v2_realtime.)
    stt = ElevenLabsSTTService(
        api_key=_resolve_eleven_key(),
        aiohttp_session=aiohttp_session,
        model=os.getenv("ELEVENLABS_STT_MODEL_PIPECAT", "scribe_v2"),
    )

    # vLLM-specific knobs go through the OpenAI SDK's `extra_body` so they
    # land in the request payload but bypass kwarg validation. Putting
    # `chat_template_kwargs` directly into `extra` raises a TypeError.
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
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us"),
        model=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5"),
    )

    context = LLMContext(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            # Kick the agent to speak first as soon as the call connects.
            {"role": "system", "content": GREETING_INSTRUCTION},
        ]
    )
    context_aggregator = LLMContextAggregatorPair(context)

    convo_log = ConversationLog(
        log_dir=LOG_DIR,
        room_name=f"twilio-{call_sid}",
        phone_number=start["start"].get("customParameters", {}).get("to", "unknown"),
    )

    # Two thin processors share one ConversationLog, so we get a single
    # coherent JSON transcript despite needing to tap two pipeline slots:
    # user-side BEFORE the aggregator consumes TranscriptionFrame, and
    # assistant-side AFTER the LLM emits LLMTextFrame.
    user_log = UserTranscriptLogger(convo_log)
    assistant_log = AssistantTranscriptLogger(convo_log)

    pipeline = Pipeline(
        [
            transport.input(),
            VADProcessor(vad_analyzer=SileroVADAnalyzer()),
            stt,
            user_log,                     # catches TranscriptionFrame
            context_aggregator.user(),
            llm,
            assistant_log,                # catches LLMFullResponse* + LLMTextFrame
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

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
        log.info("client fully connected — kicking off greeting")
        # LLMRunFrame triggers the LLM to generate against the existing
        # context. SYSTEM_PROMPT + GREETING_INSTRUCTION are already loaded,
        # so the model speaks first as Priya in Hinglish.
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_t, _ws):
        log.info("client disconnected — ending pipeline")
        await task.queue_frame(EndFrame())

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(task)
    finally:
        convo_log.close()
        await aiohttp_session.close()
        log.info("pipeline finished for call %s", call_sid)


def main() -> None:
    log.info("starting Twilio Media Streams bot on :%d", PORT)
    log.info("expose with:  ngrok http %d", PORT)
    log.info("then dial:    uv run twilio-dial +919444531354 --public-url <ngrok-url>")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
