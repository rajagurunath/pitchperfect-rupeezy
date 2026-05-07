"""Pipecat bot — joins a Daily room, dials a phone, runs the conversation.

Invoked as a subprocess by ``dial_daily.py`` once the Daily room and
meeting token are ready::

    python -m voice_agents.pipecat_bot \\
        --room-url https://your.daily.co/abc \\
        --token   eyJ... \\
        --phone-number +919444531354

Pipeline (same logical stack as the LiveKit version, different transport):

    DailyTransport.input → ElevenLabsSTT → ContextAggregator(user)
        → OpenAI(Kimi-K2.6, thinking=False) → ElevenLabsTTS
        → DailyTransport.output → ContextAggregator(assistant)

Once the bot is fully joined, ``transport.start_dialout({phoneNumber})``
bridges the user's phone into the room. We greet on ``on_dialout_answered``
so we don't waste the first second talking to a ringing tone.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger as loguru_logger
from openai.types.chat import ChatCompletionToolParam  # noqa: F401  (forces openai import for plugin)

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.base_llm import BaseOpenAILLMService
from pipecat.transports.daily.transport import DailyParams, DailyTransport
import aiohttp

from .pipecat_logger import JsonTranscriptLogger
from .prompts import GREETING_INSTRUCTION, SYSTEM_PROMPT

load_dotenv()

# Quiet pipecat/loguru by default; flip to DEBUG via env if needed.
loguru_logger.remove()
loguru_logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voice-agents.pipecat_bot")


LOG_DIR = Path(os.getenv("CONVERSATION_LOG_DIR", "logs"))


def _resolve_eleven_key() -> str:
    key = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("ELEVEN_API_KEY / ELEVENLABS_API_KEY not set in .env")
    return key


async def run_bot(room_url: str, token: str, phone_number: str) -> None:
    room_name = room_url.rstrip("/").split("/")[-1]
    log.info("bot starting: room=%s dial=%s", room_name, phone_number)

    transport = DailyTransport(
        room_url=room_url,
        token=token,
        bot_name="Priya (Rupeezy AP)",
        params=DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            transcription_enabled=False,  # we run our own STT
        ),
    )

    aiohttp_session = aiohttp.ClientSession()
    stt = ElevenLabsSTTService(
        api_key=_resolve_eleven_key(),
        aiohttp_session=aiohttp_session,
        model=os.getenv("ELEVENLABS_STT_MODEL_PIPECAT", "scribe_v2"),
    )

    # Kimi-K2.6 served via vLLM at io.net. extra={chat_template_kwargs:
    # {thinking: false}} gets merged into every chat.completions request,
    # which kills the 1–4s reasoning latency that ruins phone-call feel.
    llm_extra: dict = {}
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        # vLLM-specific knob, must go through OpenAI SDK's extra_body.
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

    context = LLMContext(messages=[{"role": "system", "content": SYSTEM_PROMPT}])
    context_aggregator = LLMContextAggregatorPair(context)

    transcript_logger = JsonTranscriptLogger(
        log_dir=LOG_DIR, room_name=room_name, phone_number=phone_number
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            transcript_logger,
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @transport.event_handler("on_joined")
    async def _on_joined(_t, _data):
        log.info("bot joined room — placing dial-out to %s", phone_number)
        sid, err = await transport.start_dialout({"phoneNumber": phone_number})
        if err:
            log.error("dial-out failed: %s", err)
            await task.queue_frame(EndFrame())
        else:
            log.info("dial-out session id: %s", sid)

    @transport.event_handler("on_dialout_answered")
    async def _on_answered(_t, data):
        log.info("phone answered: %s — greeting", data)
        # Kick the LLM with the greeting instruction so it speaks first.
        context.add_message({"role": "system", "content": GREETING_INSTRUCTION})
        await task.queue_frames([context_aggregator.user().get_context_frame()])

    @transport.event_handler("on_dialout_error")
    async def _on_dialout_error(_t, data):
        log.error("dial-out error: %s", data)
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_dialout_stopped")
    async def _on_dialout_stopped(_t, data):
        log.info("dial-out stopped: %s", data)
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_participant_left")
    async def _on_left(_t, participant, reason):
        log.info("participant left (%s) reason=%s", participant.get("id"), reason)
        await task.queue_frame(EndFrame())

    runner = PipelineRunner()
    try:
        await runner.run(task)
    finally:
        transcript_logger.close()
        await aiohttp_session.close()
        log.info("bot shut down")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--room-url", required=True)
    p.add_argument("--token", required=True)
    p.add_argument("--phone-number", required=True)
    args = p.parse_args()
    asyncio.run(run_bot(args.room_url, args.token, args.phone_number))


if __name__ == "__main__":
    main()
