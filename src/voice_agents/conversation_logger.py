"""JSON conversation logger for the Rupeezy voice agent.

Subscribes to AgentSession events and appends one record per finalized
turn to logs/<room_name>.json. Records carry timestamps, speaker label,
detected language (when available from STT), and text — exactly what the
plan asks for and what the post-call summary stage will consume later.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from livekit.agents import AgentSession
from livekit.agents.llm.chat_context import ChatMessage
from livekit.agents.voice.events import (
    ConversationItemAddedEvent,
    UserInputTranscribedEvent,
)

logger = logging.getLogger("voice-agents.logger")


class ConversationLogger:
    """Streams conversation turns to a single JSON file per call.

    File layout:
        {
          "room": "...",
          "phone_number": "+91...",
          "started_at": "2026-...Z",
          "turns": [
            {"ts": "...", "speaker": "user"|"agent", "text": "...",
             "language": "hi"|"en"|null, "interrupted": false}
          ]
        }
    """

    def __init__(
        self,
        log_dir: Path,
        room_name: str,
        phone_number: str | None,
    ) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._path = log_dir / f"{room_name}.json"
        self._state: dict[str, Any] = {
            "room": room_name,
            "phone_number": phone_number,
            "started_at": _now_iso(),
            "turns": [],
        }
        self._last_user_language: str | None = None
        self._flush()

    def attach(self, session: AgentSession) -> None:
        @session.on("user_input_transcribed")
        def _on_user_transcribed(ev: UserInputTranscribedEvent) -> None:
            if ev.is_final and ev.language:
                self._last_user_language = ev.language

        @session.on("conversation_item_added")
        def _on_item(ev: ConversationItemAddedEvent) -> None:
            item = ev.item
            if not isinstance(item, ChatMessage):
                return
            text = item.text_content
            if not text:
                return
            speaker = "user" if item.role == "user" else "agent"
            language = self._last_user_language if speaker == "user" else None
            self._state["turns"].append(
                {
                    "ts": _iso_from_unix(item.created_at),
                    "speaker": speaker,
                    "text": text,
                    "language": language,
                    "interrupted": item.interrupted,
                }
            )
            self._flush()

        @session.on("close")
        def _on_close(_ev: Any) -> None:
            self._state["ended_at"] = _now_iso()
            self._flush()
            logger.info("conversation log written: %s", self._path)

    def _flush(self) -> None:
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._state, ensure_ascii=False, indent=2))
        tmp.replace(self._path)


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _iso_from_unix(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
