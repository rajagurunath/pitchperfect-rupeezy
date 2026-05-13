"""LiveKit voice agent entrypoint.

Run modes
---------
1. ``uv run agent dev`` — local dev worker; you can also test in the LiveKit
   playground/agent sandbox without telephony.
2. ``uv run agent start`` — production worker. ``dispatch_call.py`` then
   creates a job whose metadata contains a phone number. The entrypoint
   reads that metadata, places an outbound SIP call, and bridges the
   answering phone into the LiveKit room.

The same entrypoint handles both inbound and outbound — outbound is just an
agent dispatch with a phone_number in metadata.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import elevenlabs, noise_cancellation, openai, silero

from .conversation_logger import ConversationLogger
from .mlflow_tracker import CallTracker
from .prompts import GREETING_INSTRUCTION, SYSTEM_PROMPT

load_dotenv()

logger = logging.getLogger("voice-agents.agent")
logging.basicConfig(level=logging.INFO)


# Agent name registered with the LiveKit worker. Must match the value used in
# `lk dispatch create --agent-name ...` (see dispatch_call.py).
AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "rupeezy-ap-agent")
LOG_DIR = Path(os.getenv("CONVERSATION_LOG_DIR", "logs"))

# The ElevenLabs plugin reads ELEVEN_API_KEY natively. plan.md uses the
# more common ELEVENLABS_API_KEY name, so accept either.
_ELEVEN_KEY = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
if _ELEVEN_KEY and not os.getenv("ELEVEN_API_KEY"):
    os.environ["ELEVEN_API_KEY"] = _ELEVEN_KEY


class RupeezyAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Outbound vs inbound: outbound jobs carry a phone number in metadata.
    dial_info: dict = {}
    if ctx.job.metadata:
        try:
            dial_info = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            logger.warning("job metadata is not JSON: %r", ctx.job.metadata)

    phone_number: str | None = dial_info.get("phone_number")

    if phone_number:
        await _place_outbound_call(ctx, phone_number)

    # MLflow tracking for this LiveKit session
    lk_call_id = ctx.room.name
    lk_lead = {
        "id": ctx.room.name,
        "name": phone_number or "inbound",
        "language_pref": None,
        "agent_name": os.getenv("AGENT_NAME", "Priya"),
    }
    tracker = CallTracker(lk_call_id, lk_lead)
    tracker.start(transport="livekit")

    session = AgentSession(
        vad=silero.VAD.load(),
        # ElevenLabs Scribe v2 realtime — Hindi, Hinglish, English all supported.
        # Leaving language_code unset enables auto-detect, which is what we want
        # for Hinglish leads who switch mid-sentence.
        stt=elevenlabs.STT(
            model_id=os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2_realtime"),
        ),
        # Supports any OpenAI-compatible endpoint (vLLM, llama.cpp, LiteLLM,
        # io.net hosted models, etc.) via OPENAI_BASE_URL.
        llm=_build_llm(),
        # eleven_turbo_v2_5 supports Hindi + 30 other languages with ~300ms
        # first-byte latency, which is what we need for natural phone turns.
        # Override ELEVENLABS_VOICE_ID with a Hindi-native voice for best
        # quality (see README for picking one).
        tts=elevenlabs.TTS(
            model=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5"),
            # Bella — multilingual via eleven_turbo_v2_5. Override per-deploy
            # in .env. The previous default ("l7k...") doesn't exist on every
            # account and silently kills TTS — keep this to a known premade.
            voice_id=os.getenv(
                "ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us"
            ),
        ),
    )

    convo_logger = ConversationLogger(
        log_dir=LOG_DIR,
        room_name=ctx.room.name,
        phone_number=phone_number,
    )
    convo_logger.attach(session)

    try:
        await session.start(
            room=ctx.room,
            agent=RupeezyAgent(),
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
            ),
        )

        # Speak first only on outbound calls — we placed the call, the lead
        # answered, they expect us to talk first. On inbound, let the caller open.
        if phone_number:
            await session.generate_reply(instructions=GREETING_INSTRUCTION)
    finally:
        tracker.end()


def _build_llm() -> openai.LLM:
    """Build the LLM plugin, honoring OPENAI_BASE_URL for vLLM/io.net/LiteLLM.

    When the model is a "thinking" model (Kimi-K2.6, DeepSeek-R1, etc.) served
    over vLLM, we disable reasoning via the chat template. Reasoning tokens
    add 1–4s of latency before the first audible word, which kills phone-call
    feel. Toggle off by setting LLM_DISABLE_THINKING=0 in .env.
    """
    kwargs: dict = {"model": os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini")}
    base_url = os.getenv("OPENAI_BASE_URL")
    if base_url:
        kwargs["base_url"] = base_url
    if os.getenv("LLM_DISABLE_THINKING", "1") == "1":
        kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": False}}
    return openai.LLM(**kwargs)


async def _place_outbound_call(ctx: JobContext, phone_number: str) -> None:
    """Dial ``phone_number`` via the configured SIP outbound trunk and bridge
    the answering call into the current room."""
    trunk_id = os.environ.get("SIP_OUTBOUND_TRUNK_ID")
    if not trunk_id:
        raise RuntimeError(
            "SIP_OUTBOUND_TRUNK_ID is not set — register an outbound trunk "
            "with `lk sip outbound create` and put its ID in .env. See README."
        )

    logger.info("dialing %s via trunk %s into room %s",
                phone_number, trunk_id, ctx.room.name)

    try:
        await ctx.api.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                room_name=ctx.room.name,
                sip_trunk_id=trunk_id,
                sip_call_to=phone_number,
                participant_identity=phone_number,
                participant_name="Lead",
                wait_until_answered=True,
            )
        )
        logger.info("call answered by %s", phone_number)
    except api.TwirpError as e:
        sip_status = e.metadata.get("sip_status_code") if e.metadata else None
        sip_reason = e.metadata.get("sip_status") if e.metadata else None
        logger.error(
            "SIP dial failed: %s (sip_status=%s %s)",
            e.message, sip_status, sip_reason,
        )
        ctx.shutdown()
        raise


def main() -> None:
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=AGENT_NAME,
        )
    )


if __name__ == "__main__":
    main()
