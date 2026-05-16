"""MLflow helpers for prompt versioning + Studio trial tracking.

Three concerns live here:

1. ``log_agent_version`` — saving an Agent in Studio creates one MLflow run
   under experiment ``agent-prompts``. The system prompt is uploaded as a
   markdown artifact so version diffs are inspectable in the MLflow UI and
   via the ``list_agent_versions`` reader below.

2. ``log_runtime_prompt`` — every outbound Twilio dial composes a final
   system prompt (persona + lead notes + opener variant + agent overrides).
   We attach that exact text to the call's CallTracker run so post-mortem
   can answer "what did the model actually see?".

3. ``StudioTrial`` — RM trials in the Studio simulator (text + voice) are
   their own experiment ``studio-trials``. Each trial = one run with the
   persona snapshot + transcript artifact.

All functions are best-effort: any failure is logged at WARNING and
swallowed. MLflow being absent or misconfigured never breaks the call path.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any

log = logging.getLogger("voice-agents.mlflow-prompts")

_ENABLED = os.getenv("MLFLOW_ENABLED", "1") == "1"

_AGENT_EXPERIMENT = "agent-prompts"
_STUDIO_EXPERIMENT = "studio-trials"


_REPO_ROOT = Path(__file__).resolve().parents[2]


def _tracking_uri() -> str:
    # SQLite backend (required by MLflow 3.12+ for Traces/Datasets UI tabs).
    # FileStore still works for basic Runs but spams 500s on the new tabs.
    return os.getenv(
        "MLFLOW_TRACKING_URI",
        "sqlite:///" + str(_REPO_ROOT / "mlflow.db"),
    )


def _artifact_root() -> str:
    # Anchored to repo root so artifacts land in one place regardless of CWD.
    return os.getenv(
        "MLFLOW_ARTIFACT_ROOT",
        "file://" + str(_REPO_ROOT / "mlartifacts"),
    )


def _configure() -> Any | None:
    """Import mlflow and set the tracking URI. Returns the module or None."""
    if not _ENABLED:
        return None
    try:
        import mlflow
        mlflow.set_tracking_uri(_tracking_uri())
        return mlflow
    except Exception as exc:
        log.warning("mlflow import/configure failed: %s", exc)
        return None


def _ensure_experiment(mlflow: Any, name: str) -> str:
    """set_experiment but with an explicit absolute artifact_location, so
    artifacts land in the repo-anchored mlartifacts/ dir even when the
    server's CWD differs from repo root."""
    exp = mlflow.get_experiment_by_name(name)
    if exp is None:
        exp_id = mlflow.create_experiment(name, artifact_location=_artifact_root() + "/" + name)
    else:
        exp_id = exp.experiment_id
    mlflow.set_experiment(experiment_id=exp_id)
    return exp_id


# ── 1. Agent versions ────────────────────────────────────────────────────────

def log_agent_version(agent_row: dict[str, Any], change: str) -> str | None:
    """One run per Studio save. Logs the full system prompt as a markdown
    artifact so the Prompts tab can show diff history. Returns run_id."""
    mlflow = _configure()
    if not mlflow:
        return None
    try:
        _ensure_experiment(mlflow, _AGENT_EXPERIMENT)
        run_name = f"{agent_row['name']}-v{agent_row['version']}"
        with mlflow.start_run(run_name=run_name) as r:
            mlflow.log_params({
                "agent_id":       agent_row["id"],
                "agent_name":     agent_row.get("agent_name") or "",
                "brand":          agent_row.get("brand") or "",
                "voice_id":       agent_row.get("voice_id") or "",
                "language_pref":  agent_row.get("language_pref") or "",
                "opener_variant": agent_row.get("opener_variant") or "",
                "version":        agent_row["version"],
                "change":         change,
            })
            # Tag agent_id explicitly — `list_agent_versions` searches by
            # this tag so the param-prefix `params.agent_id` works too.
            mlflow.set_tags({
                "agent_id":   agent_row["id"],
                "agent_name": agent_row["name"],
            })
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                # Full row for completeness.
                (tmp_path / "agent.json").write_text(
                    json.dumps(agent_row, indent=2, ensure_ascii=False)
                )
                # System prompt as a separate readable artifact — this is
                # what the Studio Prompts tab fetches when expanding a version.
                sp = (agent_row.get("system_prompt") or "").strip()
                if sp:
                    (tmp_path / "system_prompt.md").write_text(sp)
                custom_opener = (agent_row.get("custom_opener") or "").strip()
                if custom_opener:
                    (tmp_path / "custom_opener.md").write_text(custom_opener)
                mlflow.log_artifact(str(tmp_path / "agent.json"))
                if sp:
                    mlflow.log_artifact(str(tmp_path / "system_prompt.md"))
                if custom_opener:
                    mlflow.log_artifact(str(tmp_path / "custom_opener.md"))
            return r.info.run_id
    except Exception as exc:
        log.warning("log_agent_version failed (non-fatal): %s", exc)
        return None


def list_agent_versions(agent_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Read versions back out of the agent-prompts experiment for the
    Studio Prompts tab. Returns newest-first."""
    mlflow = _configure()
    if not mlflow:
        return []
    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient()
        exp = client.get_experiment_by_name(_AGENT_EXPERIMENT)
        if not exp:
            return []
        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=f"tags.agent_id = '{agent_id}'",
            order_by=["attributes.start_time DESC"],
            max_results=limit,
        )
        out: list[dict[str, Any]] = []
        for r in runs:
            p = r.data.params or {}
            out.append({
                "run_id":         r.info.run_id,
                "run_name":       r.info.run_name,
                "started_at":     int(r.info.start_time or 0),
                "version":        int(p.get("version") or 0),
                "change":         p.get("change") or "",
                "voice_id":       p.get("voice_id") or "",
                "language_pref": p.get("language_pref") or "",
                "opener_variant": p.get("opener_variant") or "",
            })
        return out
    except Exception as exc:
        log.warning("list_agent_versions failed: %s", exc)
        return []


def get_agent_version_prompt(run_id: str) -> str | None:
    """Fetch the system_prompt.md artifact for a specific version run."""
    mlflow = _configure()
    if not mlflow:
        return None
    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient()
        with tempfile.TemporaryDirectory() as tmp:
            local = client.download_artifacts(run_id, "system_prompt.md", tmp)
            return Path(local).read_text()
    except Exception as exc:
        log.info("get_agent_version_prompt: no system_prompt.md on %s (%s)",
                 run_id, exc)
        return None


# ── 2. Runtime composed prompt on each call ──────────────────────────────────

def log_runtime_prompt(
    call_id: str,
    system_prompt: str,
    agent_id: str | None,
    agent_name: str | None,
    lead_name: str | None,
    language: str | None,
    voice: str | None,
) -> None:
    """Attach the final composed system prompt to the call's active
    CallTracker run as a nested artifact. The call run is the parent; we
    write directly to it so the prompt lives next to the transcript and
    analyzer output for that call."""
    mlflow = _configure()
    if not mlflow:
        return
    try:
        from .mlflow_tracker import get_tracker
        tracker = get_tracker(call_id)
        active_run_id = (tracker._run.info.run_id  # noqa: SLF001
                         if tracker and tracker._run else None)
        # Tracker may not be in-memory (separate request); fall back to DB.
        if not active_run_id:
            try:
                from . import db as _db
                active_run_id = (_db.get_call(call_id) or {}).get("mlflow_run_id")
            except Exception:
                active_run_id = None
        if not active_run_id:
            # CallTracker hasn't started yet — write a standalone run instead
            # so the prompt is at least captured somewhere.
            _ensure_experiment(mlflow, "voice-agent-calls")
            with mlflow.start_run(run_name=f"prompt-{call_id[:8]}"):
                _log_prompt_artifact(mlflow, system_prompt, agent_id,
                                     agent_name, lead_name, language, voice)
            return
        # Append the prompt artifact into the call's run.
        with mlflow.start_run(run_id=active_run_id):
            _log_prompt_artifact(mlflow, system_prompt, agent_id,
                                 agent_name, lead_name, language, voice)
    except Exception as exc:
        log.warning("log_runtime_prompt failed (non-fatal): %s", exc)


def _log_prompt_artifact(mlflow: Any, system_prompt: str,
                         agent_id: str | None, agent_name: str | None,
                         lead_name: str | None, language: str | None,
                         voice: str | None) -> None:
    if agent_id:
        mlflow.set_tag("agent_id", agent_id)
    if agent_name:
        mlflow.set_tag("agent_name", agent_name)
    if voice:
        mlflow.set_tag("voice", voice)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "runtime_prompt.md"
        header = (
            f"# Runtime system prompt\n\n"
            f"- agent_id: `{agent_id or '-'}`\n"
            f"- agent_name: `{agent_name or '-'}`\n"
            f"- lead_name: `{lead_name or '-'}`\n"
            f"- language: `{language or '-'}`\n"
            f"- voice: `{voice or '-'}`\n\n---\n\n"
        )
        path.write_text(header + (system_prompt or ""))
        mlflow.log_artifact(str(path))


# ── 3. Analyzer runs ─────────────────────────────────────────────────────────

def log_analyzer_io(
    call_id: str,
    analyzer_prompt: str,
    transcript: list[dict[str, Any]],
    raw_response: str,
    parsed: dict[str, Any] | None,
) -> None:
    """Attach the analyzer prompt + transcript-input + raw LLM output to
    the call's CallTracker run. Lets a reviewer click into a call and see
    exactly what the analyzer was working from."""
    mlflow = _configure()
    if not mlflow:
        return
    try:
        from .mlflow_tracker import get_tracker
        tracker = get_tracker(call_id)
        run_id = (tracker._run.info.run_id  # noqa: SLF001
                  if tracker and tracker._run else None)
        # Tracker may have already been ended (analyzer can run from a
        # separate request, e.g. /api/calls/{id}/analyze). Fall back to
        # the run_id we persisted on the calls row at start() time.
        if not run_id:
            try:
                from . import db as _db
                row = _db.get_call(call_id) or {}
                run_id = row.get("mlflow_run_id") or None
            except Exception:
                run_id = None
        if run_id:
            ctx = mlflow.start_run(run_id=run_id)
        else:
            _ensure_experiment(mlflow, "voice-agent-calls")
            ctx = mlflow.start_run(run_name=f"analyzer-{call_id[:8]}")
        with ctx:
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                (tmp_path / "analyzer_prompt.md").write_text(analyzer_prompt or "")
                (tmp_path / "analyzer_input.json").write_text(
                    json.dumps(transcript, ensure_ascii=False, indent=2)
                )
                (tmp_path / "analyzer_raw.txt").write_text(raw_response or "")
                if parsed is not None:
                    (tmp_path / "analyzer_parsed.json").write_text(
                        json.dumps(parsed, ensure_ascii=False, indent=2)
                    )
                for name in ("analyzer_prompt.md", "analyzer_input.json",
                             "analyzer_raw.txt", "analyzer_parsed.json"):
                    p = tmp_path / name
                    if p.exists():
                        mlflow.log_artifact(str(p))
    except Exception as exc:
        log.warning("log_analyzer_io failed (non-fatal): %s", exc)


# ── 4. Studio trials (RM-side text + voice previews) ─────────────────────────

class StudioTrial:
    """One Studio simulator session = one MLflow run. The text endpoint
    creates and ends one in the same request; the voice path opens the
    run on offer-accept and closes it on disconnect.

    Usage::

        trial = StudioTrial.start(mode="text", persona=..., agent_id=...)
        trial.log_turn("user", "...")
        trial.log_turn("agent", "...")
        trial.end()
    """

    def __init__(self, mode: str, persona_snapshot: dict[str, Any],
                 agent_id: str | None) -> None:
        self.mode = mode
        self.persona = persona_snapshot
        self.agent_id = agent_id
        self.trial_id = uuid.uuid4().hex[:12]
        self._turns: list[dict[str, str]] = []
        self._run = None
        self._mlflow = None

    @classmethod
    def start(cls, mode: str, persona_snapshot: dict[str, Any],
              agent_id: str | None = None) -> "StudioTrial":
        t = cls(mode=mode, persona_snapshot=persona_snapshot, agent_id=agent_id)
        mlflow = _configure()
        if not mlflow:
            return t
        try:
            _ensure_experiment(mlflow, _STUDIO_EXPERIMENT)
            t._run = mlflow.start_run(run_name=f"{mode}-{t.trial_id}")
            t._mlflow = mlflow
            mlflow.log_params({
                "mode":           mode,
                "agent_id":       agent_id or "",
                "agent_name":     persona_snapshot.get("agent_name") or "",
                "brand":          persona_snapshot.get("brand") or "",
                "voice_id":       persona_snapshot.get("voice_id") or "",
                "language_pref":  persona_snapshot.get("language_pref") or "",
                "opener_variant": persona_snapshot.get("opener_variant") or "",
            })
            mlflow.set_tags({
                "mode":     mode,
                "agent_id": agent_id or "",
                "trial_id": t.trial_id,
            })
            mlflow.end_run()  # close active context — we'll reopen on log calls
        except Exception as exc:
            log.warning("StudioTrial.start failed (non-fatal): %s", exc)
            t._run = None
        return t

    def log_turn(self, speaker: str, text: str) -> None:
        if not text:
            return
        self._turns.append({"speaker": speaker, "text": text})

    def log_system_prompt(self, prompt: str) -> None:
        if not self._run or not self._mlflow:
            return
        try:
            with self._mlflow.start_run(run_id=self._run.info.run_id):
                with tempfile.TemporaryDirectory() as tmp:
                    p = Path(tmp) / "system_prompt.md"
                    p.write_text(prompt or "")
                    self._mlflow.log_artifact(str(p))
        except Exception as exc:
            log.warning("StudioTrial.log_system_prompt failed: %s", exc)

    def end(self, status: str = "FINISHED") -> None:
        if not self._run or not self._mlflow:
            return
        try:
            with self._mlflow.start_run(run_id=self._run.info.run_id):
                user_turns = sum(1 for t in self._turns if t["speaker"] == "user")
                agent_turns = sum(1 for t in self._turns if t["speaker"] == "agent")
                self._mlflow.log_metrics({
                    "turn_count":  float(len(self._turns)),
                    "user_turns":  float(user_turns),
                    "agent_turns": float(agent_turns),
                })
                with tempfile.TemporaryDirectory() as tmp:
                    p = Path(tmp) / "transcript.json"
                    p.write_text(
                        json.dumps(self._turns, ensure_ascii=False, indent=2)
                    )
                    self._mlflow.log_artifact(str(p))
                    p2 = Path(tmp) / "persona.json"
                    p2.write_text(
                        json.dumps(self.persona, ensure_ascii=False, indent=2)
                    )
                    self._mlflow.log_artifact(str(p2))
                self._mlflow.end_run(status=status)
        except Exception as exc:
            log.warning("StudioTrial.end failed (non-fatal): %s", exc)
        finally:
            self._run = None


def list_studio_trials(limit: int = 50,
                       agent_id: str | None = None) -> list[dict[str, Any]]:
    """For the Studio Prompts tab → Trials sub-section."""
    mlflow = _configure()
    if not mlflow:
        return []
    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient()
        exp = client.get_experiment_by_name(_STUDIO_EXPERIMENT)
        if not exp:
            return []
        filter_str = f"tags.agent_id = '{agent_id}'" if agent_id else ""
        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=filter_str,
            order_by=["attributes.start_time DESC"],
            max_results=limit,
        )
        out: list[dict[str, Any]] = []
        for r in runs:
            p = r.data.params or {}
            m = r.data.metrics or {}
            out.append({
                "run_id":     r.info.run_id,
                "started_at": int(r.info.start_time or 0),
                "mode":       p.get("mode") or "",
                "agent_id":   p.get("agent_id") or "",
                "agent_name": p.get("agent_name") or "",
                "language_pref": p.get("language_pref") or "",
                "voice_id":   p.get("voice_id") or "",
                "turn_count": int(m.get("turn_count") or 0),
            })
        return out
    except Exception as exc:
        log.warning("list_studio_trials failed: %s", exc)
        return []
