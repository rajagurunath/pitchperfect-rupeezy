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

import concurrent.futures
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

# Single-worker background executor so MLflow disk + SQLite writes happen
# off the Pipecat audio thread. Critical for live calls: even occasional
# multi-hundred-ms IO must NEVER block the STT→LLM→TTS pipeline. Single
# worker (not a pool) because mlflow uses thread-local active-run state —
# parallel writes would race. Daemon so the process can exit cleanly.
_io_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="mlflow-async"
)


_AUTOLOG_ENABLED = False


def enable_openai_autolog() -> None:
    """Turn on mlflow.openai.autolog() so every openai-SDK call (Pipecat's
    OpenAILLMService → openai.AsyncOpenAI) emits an MLflow Trace with
    prompt + completion + tokens + latency. Safe to call repeatedly — the
    underlying mlflow.openai.autolog() is idempotent but we still guard
    with a module flag to avoid log spam. Call this once at process
    startup (api/server.py)."""
    global _AUTOLOG_ENABLED
    if _AUTOLOG_ENABLED or not _ENABLED:
        return
    try:
        # Make sure the tracking URI is configured so spans land in the
        # SQLite store alongside runs.
        from .mlflow_prompts import _tracking_uri
        import mlflow
        mlflow.set_tracking_uri(_tracking_uri())
        mlflow.openai.autolog()
        _AUTOLOG_ENABLED = True
        log.info("mlflow openai.autolog enabled — LLM calls will appear as Traces")
    except Exception as exc:
        log.warning("could not enable mlflow.openai.autolog: %s", exc)


def _fire(fn, *args, **kwargs) -> None:
    """Submit a write to the background pool, swallowing any exception so
    nothing about MLflow can ever propagate into the call hot path."""
    if not _ENABLED:
        return
    def _safe():
        try:
            fn(*args, **kwargs)
        except Exception as exc:
            log.warning("mlflow async write failed: %s", exc)
    try:
        _io_pool.submit(_safe)
    except Exception as exc:
        # Pool is shutting down (process exit) — fine to drop the write.
        log.debug("mlflow pool unavailable: %s", exc)


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
            # SQLite backend (MLflow 3.12+ requires SQL for the new Traces /
            # Datasets UI tabs; FileStore returns 500s on those endpoints).
            # Both the SQLite file and the artifact root are anchored to the
            # repo root so `mlflow ui` started from any CWD sees the same data.
            from .mlflow_prompts import _tracking_uri, _ensure_experiment
            mlflow.set_tracking_uri(_tracking_uri())
            _ensure_experiment(mlflow, _EXPERIMENT)
            # Defensive: if a previous request leaked an active run (e.g.
            # a Studio trial that didn't end cleanly, or any other code path
            # that opened a run without a context manager), close it first.
            # Without this, mlflow.start_run() raises "Run with UUID X is
            # already active" and the call is never recorded.
            leaked = mlflow.active_run()
            if leaked is not None:
                log.warning("ending leaked active mlflow run %s before start",
                            leaked.info.run_id)
                mlflow.end_run()
            self._run = mlflow.start_run(
                run_name=f"{transport}-{self._call_id[:8]}"
            )
            # Persist run_id so the analyzer (separate request, after we
            # remove ourselves from _active) can find and append to this run.
            try:
                from . import db as _db
                _db.update_call(self._call_id, mlflow_run_id=self._run.info.run_id)
            except Exception as _exc:
                log.warning("could not persist mlflow_run_id to db: %s", _exc)
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
            log.error("mlflow start FAILED for call=%s: %s",
                      self._call_id, exc, exc_info=True)

    def log_turn(self, speaker: str, text: str) -> None:
        """Append one conversation turn and queue an MLflow artifact update.

        Critical: this method is called from inside the Pipecat frame
        processor on the audio path. The in-memory append is synchronous
        (always works), but the MLflow IO is submitted to a background
        executor so MLflow slowness or failure CANNOT delay the next TTS
        chunk. If the process crashes mid-call, the latest queued write
        may be lost — acceptable; the DB transcripts table is the
        durable source of truth."""
        if not _ENABLED or self._run is None:
            return
        from datetime import datetime, timezone
        self._turns.append({
            "ts": datetime.now(tz=timezone.utc).isoformat(),
            "speaker": speaker,
            "text": text,
        })
        run_id = self._run.info.run_id
        # Snapshot the turns list so the background thread can't see a
        # half-mutated list if another turn lands while it's serialising.
        turns_snapshot = list(self._turns)
        _fire(self._write_turn_artifact, run_id, turns_snapshot)

    @staticmethod
    def _write_turn_artifact(run_id: str, turns: list[dict[str, str]]) -> None:
        """Background-thread worker: re-upload transcript.json + bump
        turn_count metric. Runs under its own start_run context so it
        never interferes with whatever run the main thread has active."""
        import mlflow
        with mlflow.start_run(run_id=run_id):
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "transcript.json"
                path.write_text(json.dumps(turns, ensure_ascii=False, indent=2))
                mlflow.log_artifact(str(path))
            mlflow.log_metric("turn_count", float(len(turns)))

    def log_analysis(self, analysis: dict[str, Any]) -> None:
        """Queue post-call analyzer output (metrics + tags + artifact) on
        the background thread."""
        if not _ENABLED or self._run is None:
            return
        run_id = self._run.info.run_id
        _fire(self._write_analysis, run_id, dict(analysis))

    @staticmethod
    def _write_analysis(run_id: str, analysis: dict[str, Any]) -> None:
        import mlflow
        metrics: dict[str, float] = {}
        for key in ("interest_level", "objection_intensity", "follow_up_priority"):
            val = analysis.get(key)
            if isinstance(val, (int, float)):
                metrics[key] = float(val)
        tags: dict[str, str] = {}
        if analysis.get("score"):
            tags["score"] = str(analysis["score"])
        if analysis.get("sentiment"):
            tags["sentiment"] = str(analysis["sentiment"])
        if analysis.get("next_action"):
            tags["next_action"] = str(analysis["next_action"])[:250]
        with mlflow.start_run(run_id=run_id):
            if metrics:
                mlflow.log_metrics(metrics)
            if tags:
                mlflow.set_tags(tags)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "analysis.json"
                path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2))
                mlflow.log_artifact(str(path))

    def end(self, duration_seconds: int | None = None,
            status: str = "FINISHED") -> None:
        """Queue final transcript upload, metrics, and run close on the
        background thread. Returns immediately so call teardown isn't
        delayed by MLflow IO."""
        if not _ENABLED or self._run is None:
            return
        run_id = self._run.info.run_id
        turns_snapshot = list(self._turns)
        _fire(self._finalize, run_id, self._call_id, turns_snapshot,
              duration_seconds, status)
        _active.pop(self._call_id, None)
        self._run = None

    @staticmethod
    def _finalize(run_id: str, call_id: str,
                  turns: list[dict[str, str]],
                  duration_seconds: int | None, status: str) -> None:
        """Background-thread worker for end()."""
        import mlflow
        user_turns = sum(1 for t in turns if t["speaker"] == "user")
        agent_turns = sum(1 for t in turns if t["speaker"] == "agent")
        metrics: dict[str, float] = {
            "turn_count":  float(len(turns)),
            "user_turns":  float(user_turns),
            "agent_turns": float(agent_turns),
        }
        if duration_seconds is not None:
            metrics["duration_seconds"] = float(duration_seconds)
        with mlflow.start_run(run_id=run_id):
            mlflow.log_metrics(metrics)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "transcript.json"
                path.write_text(json.dumps(turns, ensure_ascii=False, indent=2))
                mlflow.log_artifact(str(path))
        # Use the client API for end_run to avoid touching the global
        # active-run state from this background thread.
        mlflow.MlflowClient().set_terminated(run_id, status=status)
        log.info("mlflow run ended: %s (call=%s status=%s turns=%d)",
                 run_id, call_id, status, len(turns))

    # ── helpers ────────────────────────────────────────────────────────────────

    def _log_dict_artifact(self, data: Any, filename: str) -> None:
        import mlflow
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / filename
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
            mlflow.log_artifact(str(path))
