"""Pipecat-friendly conversation logger.

Two thin ``FrameProcessor`` shims that share a single backing store:

* ``UserTranscriptLogger`` — placed BEFORE the user context aggregator;
  catches ``TranscriptionFrame`` (the aggregator consumes them downstream).
* ``AssistantTranscriptLogger`` — placed AFTER the LLM, BEFORE the TTS;
  buffers ``LLMTextFrame`` chunks between
  ``LLMFullResponseStartFrame`` / ``LLMFullResponseEndFrame`` markers and
  commits the aggregated reply as one turn.

Both processors share a ``ConversationLog`` writer that persists each turn
to (a) the per-call JSON file under ``logs/`` AND (b) the SQLite
``transcripts`` table (when a ``call_id`` is provided). The dual-write
keeps the simple per-call JSON for casual inspection while the DB
becomes the source of truth for the admin dashboard.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from . import db

logger = logging.getLogger("voice-agents.pipecat_logger")


# ---------- shared writer -----------------------------------------------------

class ConversationLog:
    """Backs both a JSON file and the SQLite transcripts table."""

    def __init__(
        self,
        log_dir: Path,
        room_name: str,
        phone_number: str | None,
        call_id: str | None = None,
    ) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._path = log_dir / f"{room_name}.json"
        self._call_id = call_id
        self._state: dict[str, Any] = {
            "room": room_name,
            "phone_number": phone_number,
            "call_id": call_id,
            "started_at": _now_iso(),
            "transport": "pipecat",
            "turns": [],
        }
        self._assistant_buffer: list[str] = []
        self._flush()

    @property
    def path(self) -> Path:
        return self._path

    def append_user(self, text: str, language: Any) -> None:
        text = (text or "").strip()
        if not text:
            return
        self._record_turn("user", text, str(language) if language else None)

    def append_assistant_chunk(self, text: str) -> None:
        if text:
            self._assistant_buffer.append(text)

    def flush_assistant(self) -> None:
        if not self._assistant_buffer:
            return
        text = "".join(self._assistant_buffer).strip()
        self._assistant_buffer.clear()
        if not text:
            return
        self._record_turn("agent", text, None)

    def close(self) -> None:
        self.flush_assistant()
        self._state["ended_at"] = _now_iso()
        self._flush()
        logger.info("conversation log written: %s (call_id=%s)", self._path, self._call_id)

    # ---------- internals -----------------------------------------------------

    def _record_turn(self, speaker: str, text: str, language: str | None) -> None:
        turn = {
            "ts": _now_iso(),
            "speaker": speaker,
            "text": text,
            "language": language,
        }
        self._state["turns"].append(turn)
        self._flush()
        if self._call_id:
            try:
                db.append_turn(self._call_id, speaker, text, language)
            except Exception as e:
                logger.warning("DB transcript write failed (%s); JSON still ok", e)
        # MLflow turn tracking — non-fatal
        try:
            from .mlflow_tracker import get_tracker
            tracker = get_tracker(self._call_id)
            if tracker:
                tracker.log_turn(speaker, text)
        except Exception:
            pass

    def _flush(self) -> None:
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._state, ensure_ascii=False, indent=2))
        tmp.replace(self._path)


# ---------- frame processors --------------------------------------------------

class UserTranscriptLogger(FrameProcessor):
    """Captures finalized user STT into the shared ``ConversationLog``."""

    def __init__(self, log: ConversationLog) -> None:
        super().__init__()
        self._log = log

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            text = (frame.text or "").strip()
            if text:
                self._log.append_user(text, getattr(frame, "language", None))
        await self.push_frame(frame, direction)


class AssistantTranscriptLogger(FrameProcessor):
    """Buffers LLM text between Start/End response markers, commits one turn."""

    def __init__(self, log: ConversationLog) -> None:
        super().__init__()
        self._log = log

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._log.flush_assistant()
        elif isinstance(frame, LLMTextFrame):
            if frame.text:
                self._log.append_assistant_chunk(frame.text)
        elif isinstance(frame, LLMFullResponseEndFrame):
            self._log.flush_assistant()
        await self.push_frame(frame, direction)


# ---------- helpers -----------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


JsonTranscriptLogger = UserTranscriptLogger  # backwards-compat shim
