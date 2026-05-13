"""STT / TTS provider factory.

Set STT_PROVIDER and TTS_PROVIDER in .env to switch providers without
touching code. Supported values: sarvam (default), elevenlabs.

build_stt() returns (service, cleanup) where cleanup is an awaitable
called in the ws_handler finally block to close any open sessions.
build_tts() returns the TTS service.
"""
from __future__ import annotations
import os
from typing import Any, Callable, Awaitable

from pipecat.transcriptions.language import Language

STT_PROVIDER = os.getenv("STT_PROVIDER", "sarvam").lower()
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "sarvam").lower()


async def _noop():
    pass


def build_stt(
    lead_lang: Language | None,
) -> tuple[Any, Callable[[], Awaitable[None]]]:
    """Return (stt_service, async_cleanup).  Call cleanup() in finally."""
    if STT_PROVIDER == "elevenlabs":
        import aiohttp
        from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
        session = aiohttp.ClientSession()
        stt = ElevenLabsSTTService(
            api_key=_elevenlabs_key(),
            aiohttp_session=session,
            model=os.getenv("ELEVENLABS_STT_MODEL_PIPECAT", "scribe_v2"),
        )
        return stt, session.close

    elif STT_PROVIDER == "sarvam":
        from pipecat.services.sarvam.stt import SarvamSTTService
        stt = SarvamSTTService(
            api_key=_sarvam_key(),
            mode="transcribe",
            settings=SarvamSTTService.Settings(
                model=os.getenv("SARVAM_STT_MODEL", "saaras:v3"),
                language=lead_lang,
            ),
        )
        return stt, _noop

    else:
        raise ValueError(f"Unknown STT_PROVIDER={STT_PROVIDER!r}. Choose: sarvam, elevenlabs")


def build_tts(
    speaker: str,
    lead_lang: Language | None,
) -> Any:
    """Return the configured TTS service."""
    if TTS_PROVIDER == "elevenlabs":
        from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
        return ElevenLabsTTSService(
            api_key=_elevenlabs_key(),
            voice_id=speaker,
            model=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5"),
        )

    elif TTS_PROVIDER == "sarvam":
        from pipecat.services.sarvam.tts import SarvamTTSService
        return SarvamTTSService(
            api_key=_sarvam_key(),
            settings=SarvamTTSService.Settings(
                model=os.getenv("SARVAM_TTS_MODEL", "bulbul:v3"),
                voice=speaker,
                language=lead_lang,
            ),
        )

    else:
        raise ValueError(f"Unknown TTS_PROVIDER={TTS_PROVIDER!r}. Choose: sarvam, elevenlabs")


def default_speaker() -> str:
    """Return a sensible default speaker/voice ID for the active TTS provider."""
    if TTS_PROVIDER == "elevenlabs":
        return os.getenv("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us")
    return os.getenv("SARVAM_SPEAKER", "kavya")


# ── private key resolvers ─────────────────────────────────────────────────────

def _sarvam_key() -> str:
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("SARVAM_API_KEY not set")
    return key


def _elevenlabs_key() -> str:
    key = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVEN_API_KEY / ELEVENLABS_API_KEY not set")
    return key
