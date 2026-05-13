"""MLflow run tracker for outbound voice calls.

Each call → one MLflow run. Tracks params (lead metadata, provider config),
metrics (duration, turn counts, analyzer scores), tags (HOT/WARM/COLD,
sentiment), and artifacts (transcript.json, analysis.json).

Enabled by default when mlflow is installed. Disable via MLFLOW_ENABLED=0.
MLFLOW_TRACKING_URI defaults to ./mlruns (local). Set to a remote URI to
push to a hosted MLflow server.

The tracker is stored in a global dict keyed by call_id so the analyzer
and pipecat_logger can access it without needing it threaded through APIs.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger("voice-agents.mlflow")

_ENABLED = os.getenv("MLFLOW_ENABLED", "1") == "1"
_EXPERIMENT = os.getenv("MLFLOW_EXPERIMENT", "voice-agent-calls")

# Global registry keyed by call_id → CallTracker
_active: dict[str, "CallTracker"] = {}


def get_tracker(call_id: str | None) -> "CallTracker | None":
    """Look up an active tracker by call_id. Returns None if not found."""
    if not call_id:
        return None
    return _active.get(call_id)


class CallTracker:
    """Wraps one outbound voice call as a single MLflow run.

    Usage::

        tracker = CallTracker(call_id, lead_row)
        tracker.start(transport="pipecat")
        ...  # turns are auto-fed via ConversationLog / ConversationLogger
        tracker.log_analysis(analysis_dict)   # called by analyzer.py
        tracker.end(duration_seconds=120)
    """

    def __init__(self, call_id: str, lead: dict[str, Any] | None = None) -> None:
        self._call_id = call_id
        self._lead = lead or {}
        self._run = None
        self._turns: list[dict[str, str]] = []

    # ── lifecycle ──────────────────────────────────────────────────────────────

    def start(self, transport: str = "pipecat") -> None:
        """Begin the MLflow run and log static call parameters."""
        if not _ENABLED:
            return
        try:
            import mlflow  # lazy import — not required for the rest of the app
            # Anchor to repo root so `mlflow ui` (started from anywhere) and
            # the API server (CWD might differ from repo root) write to the
            # same store. Override via MLFLOW_TRACKING_URI in .env.
            default_uri = "file://" + str(
                Path(__file__).resolve().parents[2] / "mlruns"
            )
            mlflow.set_tracking_uri(
                os.getenv("MLFLOW_TRACKING_URI", default_uri)
            )
            mlflow.set_experiment(_EXPERIMENT)
            self._run = mlflow.start_run(
                run_name=f"{transport}-{self._call_id[:8]}"
            )
            mlflow.log_params({
                "call_id":       self._call_id,
                "lead_id":       self._lead.get("id", ""),
                "lead_name":     self._lead.get("name", ""),
                "language_pref": self._lead.get("language_pref") or "auto",
                "agent_name":    (self._lead.get("agent_name")
                                  or os.getenv("AGENT_NAME", "Priya")),
                "transport":     transport,
                "stt_provider":  os.getenv("STT_PROVIDER", "sarvam"),
                "tts_provider":  os.getenv("TTS_PROVIDER", "sarvam"),
                "stt_model":     os.getenv("SARVAM_STT_MODEL", "saaras:v3"),
                "tts_model":     os.getenv("SARVAM_TTS_MODEL", "bulbul:v3"),
                "llm_model":     os.getenv("OPENAI_LLM_MODEL", ""),
            })
            mlflow.set_tags({
                "transport":     transport,
                "language_pref": self._lead.get("language_pref") or "auto",
            })
            _active[self._call_id] = self
            log.info("mlflow run started: %s (call=%s transport=%s)",
                     self._run.info.run_id, self._call_id, transport)
        except Exception as exc:
            log.warning("mlflow start failed (non-fatal): %s", exc)

    def log_turn(self, speaker: str, text: str) -> None:
        """Accumulate one conversation turn; uploaded as artifact on end()."""
        if not _ENABLED or self._run is None:
            return
        self._turns.append({"speaker": speaker, "text": text})

    def log_analysis(self, analysis: dict[str, Any]) -> None:
        """Log post-call analyzer output as MLflow metrics, tags, and artifact."""
        if not _ENABLED or self._run is None:
            return
        try:
            import mlflow
            metrics: dict[str, float] = {}
            for key in ("interest_level", "objection_intensity", "follow_up_priority"):
                val = analysis.get(key)
                if isinstance(val, (int, float)):
                    metrics[key] = float(val)
            if metrics:
                mlflow.log_metrics(metrics)

            tags: dict[str, str] = {}
            if analysis.get("score"):
                tags["score"] = str(analysis["score"])
            if analysis.get("sentiment"):
                tags["sentiment"] = str(analysis["sentiment"])
            if analysis.get("next_action"):
                tags["next_action"] = str(analysis["next_action"])[:250]
            if tags:
                mlflow.set_tags(tags)

            self._log_dict_artifact(analysis, "analysis.json")
        except Exception as exc:
            log.warning("mlflow log_analysis failed (non-fatal): %s", exc)

    def end(self, duration_seconds: int | None = None,
            status: str = "FINISHED") -> None:
        """Upload transcript artifact, log final metrics, close the run."""
        if not _ENABLED or self._run is None:
            return
        try:
            import mlflow
            user_turns  = sum(1 for t in self._turns if t["speaker"] == "user")
            agent_turns = sum(1 for t in self._turns if t["speaker"] == "agent")
            metrics: dict[str, float] = {
                "turn_count":  float(len(self._turns)),
                "user_turns":  float(user_turns),
                "agent_turns": float(agent_turns),
            }
            if duration_seconds is not None:
                metrics["duration_seconds"] = float(duration_seconds)
            mlflow.log_metrics(metrics)

            self._log_dict_artifact(self._turns, "transcript.json")
            mlflow.end_run(status=status)
            log.info("mlflow run ended: %s (call=%s status=%s)",
                     self._run.info.run_id, self._call_id, status)
        except Exception as exc:
            log.warning("mlflow end failed (non-fatal): %s", exc)
        finally:
            _active.pop(self._call_id, None)
            self._run = None

    # ── helpers ────────────────────────────────────────────────────────────────

    def _log_dict_artifact(self, data: Any, filename: str) -> None:
        import mlflow
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / filename
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
            mlflow.log_artifact(str(path))
