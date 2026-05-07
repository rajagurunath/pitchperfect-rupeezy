"""SQLite persistence for leads, calls, and transcripts.

Single-file embedded DB at ``data/voice_agents.db`` (path overridable via
``VOICE_AGENTS_DB``). Three tables:

  * ``leads``       — uploaded leads, name + phone + status.
  * ``calls``       — one row per outbound dial attempt (Twilio call SID).
  * ``transcripts`` — per-turn rows; speaker, text, language.

Every write goes through ``with_conn()`` which opens a connection per call
(SQLite handles concurrency fine for our scale — a hackathon dashboard +
one or two live calls + a worker thread).
"""

from __future__ import annotations

import contextlib
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

# Anchor the DB to the repo root, NOT the current working directory.
# Otherwise running ``uv run api`` from ui/ vs the project root would
# silently create two separate databases — which is exactly what bit us
# the first time around.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DB = _REPO_ROOT / "data" / "voice_agents.db"
DB_PATH = Path(os.getenv("VOICE_AGENTS_DB", str(_DEFAULT_DB)))
_INIT_LOCK = threading.Lock()
_INITIALISED = False


SCHEMA = """\
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    language_pref TEXT,
    voice_id TEXT,                  -- ElevenLabs voice ID; NULL → use server default
    notes TEXT,
    -- queued | calling | done | dnd
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);

CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    twilio_sid TEXT,
    status TEXT NOT NULL DEFAULT 'queued',  -- queued | ringing | in-progress | completed | failed | no-answer | canceled
    score TEXT,                              -- HOT | WARM | COLD | null
    summary TEXT,                            -- post-call summary text
    duration_seconds INTEGER,
    recording_url TEXT,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS calls_lead_idx ON calls(lead_id);
CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);
CREATE INDEX IF NOT EXISTS calls_score_idx ON calls(score);
CREATE INDEX IF NOT EXISTS calls_twilio_idx ON calls(twilio_sid);

CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    speaker TEXT NOT NULL,    -- 'user' | 'agent'
    text TEXT NOT NULL,
    language TEXT,
    ts TEXT NOT NULL,
    FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS transcripts_call_idx ON transcripts(call_id, id);

-- Per-call lifecycle events: queued → dialing → ringing → picked
-- → agent_spoke → user_spoke → engaged → completed / dropped_early /
-- failed / no_answer / busy / canceled. UI renders this as a stage
-- timeline so an operator can spot calls that drop right after pick-up
-- vs ones that engage well but fail to convert.
CREATE TABLE IF NOT EXISTS call_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    detail TEXT,
    ts TEXT NOT NULL,
    FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS call_events_call_idx ON call_events(call_id, id);
"""


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply additive ALTER TABLE migrations for existing DBs that pre-date
    new columns. Each step is wrapped in its own try so re-running is safe."""
    try:
        conn.execute("ALTER TABLE leads ADD COLUMN voice_id TEXT")
    except sqlite3.OperationalError:
        pass  # column already exists


def _ensure_init() -> None:
    global _INITIALISED
    if _INITIALISED:
        return
    with _INIT_LOCK:
        if _INITIALISED:
            return
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(DB_PATH) as c:
            c.executescript(SCHEMA)
            _migrate(c)
        _INITIALISED = True


@contextlib.contextmanager
def with_conn() -> Iterator[sqlite3.Connection]:
    """Yields a connection with row_factory=Row. Auto-commits on exit."""
    _ensure_init()
    conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=10)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ----- leads ------------------------------------------------------------------

def insert_lead(name: str, phone: str, language_pref: str | None = None,
                notes: str | None = None, voice_id: str | None = None) -> str:
    lid = new_id("lead")
    ts = now_iso()
    with with_conn() as c:
        c.execute(
            "INSERT INTO leads(id,name,phone,language_pref,voice_id,notes,"
            "status,created_at,updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (lid, name, phone, language_pref, voice_id, notes,
             "queued", ts, ts),
        )
    return lid


def update_lead_status(lead_id: str, status: str) -> None:
    with with_conn() as c:
        c.execute("UPDATE leads SET status=?, updated_at=? WHERE id=?",
                  (status, now_iso(), lead_id))


def list_leads(limit: int = 200, status: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM leads"
    args: tuple = ()
    if status:
        sql += " WHERE status = ?"
        args = (status,)
    sql += " ORDER BY datetime(created_at) DESC LIMIT ?"
    args = args + (limit,)
    with with_conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def get_lead(lead_id: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    return dict(r) if r else None


# ----- calls ------------------------------------------------------------------

def insert_call(lead_id: str) -> str:
    cid = new_id("call")
    with with_conn() as c:
        c.execute(
            "INSERT INTO calls(id,lead_id,status,created_at) VALUES (?,?,?,?)",
            (cid, lead_id, "queued", now_iso()),
        )
    return cid


def attach_twilio_sid(call_id: str, twilio_sid: str) -> None:
    with with_conn() as c:
        c.execute("UPDATE calls SET twilio_sid=?, started_at=? WHERE id=?",
                  (twilio_sid, now_iso(), call_id))


def update_call(call_id: str, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    with with_conn() as c:
        c.execute(f"UPDATE calls SET {cols} WHERE id=?",
                  (*fields.values(), call_id))


def list_calls(limit: int = 200, lead_id: str | None = None,
               score: str | None = None) -> list[dict[str, Any]]:
    """List recent calls with the latest stage event per call attached.

    The latest stage is enough to render a DAG-style timeline because the
    linear path is well-known (queued → dialing → ringing → picked →
    agent_spoke → user_spoke → completed). Anything off the happy path
    (dropped_early / no_answer / busy / failed / canceled) is also a
    terminal stage so the latest one tells the full story.
    """
    sql = (
        "SELECT calls.*, leads.name AS lead_name, leads.phone AS lead_phone, "
        "  (SELECT stage FROM call_events "
        "   WHERE call_events.call_id = calls.id "
        "   ORDER BY call_events.id DESC LIMIT 1) AS last_stage "
        "FROM calls LEFT JOIN leads ON leads.id = calls.lead_id WHERE 1=1"
    )
    args: list = []
    if lead_id:
        sql += " AND calls.lead_id = ?"
        args.append(lead_id)
    if score:
        sql += " AND calls.score = ?"
        args.append(score)
    sql += " ORDER BY datetime(calls.created_at) DESC LIMIT ?"
    args.append(limit)
    with with_conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def get_call(call_id: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            "SELECT calls.*, leads.name AS lead_name, leads.phone AS lead_phone "
            "FROM calls LEFT JOIN leads ON leads.id = calls.lead_id "
            "WHERE calls.id = ?",
            (call_id,),
        ).fetchone()
    return dict(r) if r else None


def get_call_by_twilio_sid(twilio_sid: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute("SELECT * FROM calls WHERE twilio_sid=?", (twilio_sid,)).fetchone()
    return dict(r) if r else None


# ----- transcripts ------------------------------------------------------------

def append_turn(call_id: str, speaker: str, text: str,
                language: str | None = None) -> None:
    with with_conn() as c:
        c.execute(
            "INSERT INTO transcripts(call_id,speaker,text,language,ts)"
            " VALUES (?,?,?,?,?)",
            (call_id, speaker, text, language, now_iso()),
        )


def list_turns(call_id: str) -> list[dict[str, Any]]:
    with with_conn() as c:
        rows = c.execute(
            "SELECT id,speaker,text,language,ts FROM transcripts "
            "WHERE call_id=? ORDER BY id ASC",
            (call_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ----- call lifecycle events -------------------------------------------------

# Canonical stages — UI renders these as a fixed-order timeline so the
# operator can see at-a-glance how far each call progressed.
STAGES_ORDERED = [
    "queued",
    "dialing",
    "ringing",
    "picked",          # bot websocket connected (call answered)
    "agent_spoke",     # first LLM token streamed → user heard a voice
    "user_spoke",      # first finalized user transcript → real engagement
    "completed",
]
# Terminal stages mutually-exclusive with `completed`.
TERMINAL_STAGES = {"completed", "no_answer", "busy", "failed", "canceled",
                   "dropped_early"}


def record_event(call_id: str, stage: str, detail: str | None = None) -> None:
    with with_conn() as c:
        # Idempotency: don't duplicate the same stage in a row.
        last = c.execute(
            "SELECT stage FROM call_events WHERE call_id=? "
            "ORDER BY id DESC LIMIT 1",
            (call_id,),
        ).fetchone()
        if last and last[0] == stage:
            return
        c.execute(
            "INSERT INTO call_events(call_id,stage,detail,ts) VALUES (?,?,?,?)",
            (call_id, stage, detail, now_iso()),
        )


def list_events(call_id: str) -> list[dict[str, Any]]:
    with with_conn() as c:
        rows = c.execute(
            "SELECT id,stage,detail,ts FROM call_events "
            "WHERE call_id=? ORDER BY id ASC",
            (call_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def stage_funnel() -> dict[str, int]:
    """Count distinct calls that ever reached each stage. Used by analytics."""
    out: dict[str, int] = {}
    with with_conn() as c:
        for s in STAGES_ORDERED:
            out[s] = c.execute(
                "SELECT COUNT(DISTINCT call_id) FROM call_events WHERE stage=?",
                (s,),
            ).fetchone()[0]
    return out


def calls_by_day(days: int = 14) -> list[dict[str, Any]]:
    """Returns [{day:'2026-05-07', total:N, hot:N, warm:N, cold:N}, ...]"""
    with with_conn() as c:
        rows = c.execute(
            """
            SELECT
              substr(created_at, 1, 10) AS day,
              COUNT(*)                         AS total,
              SUM(CASE WHEN score='HOT'  THEN 1 ELSE 0 END) AS hot,
              SUM(CASE WHEN score='WARM' THEN 1 ELSE 0 END) AS warm,
              SUM(CASE WHEN score='COLD' THEN 1 ELSE 0 END) AS cold
            FROM calls
            WHERE date(created_at) >= date('now', ?)
            GROUP BY day ORDER BY day ASC
            """,
            (f"-{days} days",),
        ).fetchall()
    return [dict(r) for r in rows]


# ----- dashboard --------------------------------------------------------------

def funnel_metrics() -> dict[str, int]:
    """Counts for the dashboard: total leads, contacted, hot/warm/cold."""
    with with_conn() as c:
        leads_total = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        contacted = c.execute(
            "SELECT COUNT(DISTINCT lead_id) FROM calls "
            "WHERE status IN ('completed','in-progress','failed','no-answer')"
        ).fetchone()[0]
        hot = c.execute("SELECT COUNT(*) FROM calls WHERE score='HOT'").fetchone()[0]
        warm = c.execute("SELECT COUNT(*) FROM calls WHERE score='WARM'").fetchone()[0]
        cold = c.execute("SELECT COUNT(*) FROM calls WHERE score='COLD'").fetchone()[0]
        completed = c.execute("SELECT COUNT(*) FROM calls WHERE status='completed'").fetchone()[0]
    return {
        "leads_total": leads_total,
        "contacted": contacted,
        "completed": completed,
        "hot": hot,
        "warm": warm,
        "cold": cold,
    }
