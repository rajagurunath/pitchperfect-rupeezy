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
    agent_name TEXT,                -- per-lead agent persona name; NULL → use AGENT_NAME env
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
    analysis_json TEXT,                      -- full JSON from post-call analyzer
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

-- Saved agents — the Campaign Studio writes here. Each row is one named
-- "trained agent": persona + script + qualification rules baked together.
-- Leads point at an agent via leads.agent_id; the dial path loads the
-- agent and uses its persona / voice / system_prompt for the call.
CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    agent_name      TEXT,             -- spoken persona (e.g. "Priya"); NULL → AGENT_NAME env
    brand           TEXT,             -- e.g. "Rupeezy"
    voice_id        TEXT,             -- Sarvam speaker name
    language_pref   TEXT,             -- e.g. "hi-IN"
    opener_variant  TEXT,             -- benefits | social_proof | question
    custom_opener   TEXT,
    system_prompt   TEXT,             -- full prompt override; NULL → prompts.py default
    version         INTEGER NOT NULL DEFAULT 1,
    is_default      INTEGER NOT NULL DEFAULT 0,
    mlflow_run_id   TEXT,             -- prompt-versioning run for this snapshot
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agents_default_idx ON agents(is_default);

-- Handoffs: every HOT / WARM call generates one handoff to the human RM,
-- delivered as a WhatsApp message with a link to a public context card.
-- The card URL is HMAC-signed (card_token). agent_id + agent_name are
-- captured at send time so analytics can answer "which trained agent
-- drove the most handoffs" even after the agent is renamed/deleted.
CREATE TABLE IF NOT EXISTS handoffs (
    id            TEXT PRIMARY KEY,
    call_id       TEXT NOT NULL,
    lead_id       TEXT NOT NULL,
    agent_id      TEXT,
    agent_name    TEXT,
    score         TEXT,                 -- HOT | WARM (we don't hand off COLD)
    channel       TEXT NOT NULL,        -- 'call' (HOT) | 'whatsapp' (WARM)
    rm_phone      TEXT,                 -- E.164; whom the WhatsApp went to
    card_token    TEXT NOT NULL UNIQUE, -- HMAC-signed; opens the public card
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed|opened
    error         TEXT,
    twilio_sid    TEXT,                 -- WhatsApp message SID, if delivered
    created_at    TEXT NOT NULL,
    sent_at       TEXT,
    opened_at     TEXT,
    FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS handoffs_call_idx  ON handoffs(call_id);
CREATE INDEX IF NOT EXISTS handoffs_lead_idx  ON handoffs(lead_id);
CREATE INDEX IF NOT EXISTS handoffs_token_idx ON handoffs(card_token);
CREATE INDEX IF NOT EXISTS handoffs_agent_idx ON handoffs(agent_id);
"""


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply additive ALTER TABLE migrations for existing DBs that pre-date
    new columns. Each step is wrapped in its own try so re-running is safe."""
    try:
        conn.execute("ALTER TABLE leads ADD COLUMN voice_id TEXT")
    except sqlite3.OperationalError:
        pass  # column already exists
    try:
        conn.execute("ALTER TABLE leads ADD COLUMN agent_name TEXT")
    except sqlite3.OperationalError:
        pass  # column already exists
    # Add analysis_json column if missing (added with enhanced scorer)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(calls)")}
    if "analysis_json" not in cols:
        conn.execute("ALTER TABLE calls ADD COLUMN analysis_json TEXT")
    # Foreign-key from leads → agents (Campaign Studio). Nullable; NULL
    # means "use server defaults" (agent_name env, etc.).
    lead_cols = {r[1] for r in conn.execute("PRAGMA table_info(leads)")}
    if "agent_id" not in lead_cols:
        conn.execute("ALTER TABLE leads ADD COLUMN agent_id TEXT")
    if "opening_line" not in lead_cols:
        conn.execute("ALTER TABLE leads ADD COLUMN opening_line TEXT")


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
                notes: str | None = None, voice_id: str | None = None,
                agent_name: str | None = None,
                agent_id: str | None = None,
                opening_line: str | None = None) -> str:
    lid = new_id("lead")
    ts = now_iso()
    with with_conn() as c:
        c.execute(
            "INSERT INTO leads(id,name,phone,language_pref,voice_id,agent_name,"
            "agent_id,notes,opening_line,status,created_at,updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (lid, name, phone, language_pref, voice_id, agent_name,
             agent_id, notes, opening_line, "queued", ts, ts),
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


def update_call_analysis(call_id: str, analysis_json: str) -> None:
    with with_conn() as c:
        c.execute(
            "UPDATE calls SET analysis_json=? WHERE id=?",
            (analysis_json, call_id),
        )


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


def kpi_summary(days: int = 14) -> dict[str, Any]:
    """Current period totals + matching previous period for delta charts.

    The two buckets are *half* of the requested window each, so a 14-day
    page shows a "last 7 days vs prior 7 days" delta. That's more
    actionable than 14 vs 14 (which decays slowly) and works with seed
    data that only covers the chart window.
    """
    half = max(1, days // 2)

    def _bucket(start: str, end: str) -> dict[str, Any]:
        with with_conn() as c:
            r = c.execute(
                """
                SELECT
                  COUNT(*)                                       AS total,
                  SUM(CASE WHEN score='HOT'  THEN 1 ELSE 0 END)  AS hot,
                  SUM(CASE WHEN score='WARM' THEN 1 ELSE 0 END)  AS warm,
                  SUM(CASE WHEN score='COLD' THEN 1 ELSE 0 END)  AS cold,
                  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
                  ROUND(AVG(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds END), 1) AS avg_duration,
                  ROUND(100.0 * SUM(CASE WHEN status IN ('completed','in-progress') THEN 1 ELSE 0 END)
                              / NULLIF(COUNT(*), 0), 1) AS pickup_rate
                FROM calls
                WHERE date(created_at) >= date('now', ?)
                  AND date(created_at) <  date('now', ?)
                """,
                (start, end),
            ).fetchone()
        return {k: (r[k] or 0) for k in r.keys()}

    return {
        "window_days": half,
        "current":  _bucket(f"-{half} days",     "+1 days"),
        "previous": _bucket(f"-{2*half} days", f"-{half} days"),
    }


def language_breakdown(days: int = 14) -> list[dict[str, Any]]:
    """Calls grouped by the lead's language preference."""
    with with_conn() as c:
        rows = c.execute(
            """
            SELECT
              COALESCE(leads.language_pref, 'Unknown') AS language,
              COUNT(*) AS total,
              SUM(CASE WHEN calls.score='HOT'  THEN 1 ELSE 0 END) AS hot,
              SUM(CASE WHEN calls.score='WARM' THEN 1 ELSE 0 END) AS warm,
              SUM(CASE WHEN calls.score='COLD' THEN 1 ELSE 0 END) AS cold
            FROM calls
            LEFT JOIN leads ON leads.id = calls.lead_id
            WHERE date(calls.created_at) >= date('now', ?)
            GROUP BY language
            ORDER BY total DESC
            """,
            (f"-{days} days",),
        ).fetchall()
    return [dict(r) for r in rows]


def duration_by_score(days: int = 14) -> list[dict[str, Any]]:
    """Avg call duration by score bucket — HOT calls are typically longer."""
    with with_conn() as c:
        rows = c.execute(
            """
            SELECT
              COALESCE(score, 'UNSCORED') AS score,
              COUNT(*) AS n,
              ROUND(AVG(duration_seconds), 1) AS avg_duration
            FROM calls
            WHERE date(created_at) >= date('now', ?)
              AND duration_seconds IS NOT NULL
            GROUP BY score
            """,
            (f"-{days} days",),
        ).fetchall()
    return [dict(r) for r in rows]


def hour_of_day_volume(days: int = 14) -> list[dict[str, Any]]:
    """Call volume bucketed by hour-of-day (0-23). Useful for picking
    an outbound dial window."""
    with with_conn() as c:
        rows = c.execute(
            """
            SELECT
              CAST(strftime('%H', started_at) AS INTEGER) AS hour,
              COUNT(*) AS total,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed
            FROM calls
            WHERE started_at IS NOT NULL
              AND date(created_at) >= date('now', ?)
            GROUP BY hour
            ORDER BY hour ASC
            """,
            (f"-{days} days",),
        ).fetchall()
    return [dict(r) for r in rows]


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


# ----- agents (Campaign Studio) -----------------------------------------------

_AGENT_COLS = (
    "id", "name", "description", "agent_name", "brand", "voice_id",
    "language_pref", "opener_variant", "custom_opener", "system_prompt",
    "version", "is_default", "mlflow_run_id", "created_at", "updated_at",
)


def list_agents() -> list[dict[str, Any]]:
    with with_conn() as c:
        rows = c.execute(
            f"SELECT {','.join(_AGENT_COLS)} FROM agents "
            "ORDER BY is_default DESC, datetime(updated_at) DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_agent(agent_id: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            f"SELECT {','.join(_AGENT_COLS)} FROM agents WHERE id=?",
            (agent_id,),
        ).fetchone()
    return dict(r) if r else None


def get_default_agent() -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            f"SELECT {','.join(_AGENT_COLS)} FROM agents WHERE is_default=1 "
            "ORDER BY datetime(updated_at) DESC LIMIT 1"
        ).fetchone()
    return dict(r) if r else None


def insert_agent(**fields: Any) -> str:
    aid = new_id("agent")
    ts = now_iso()
    fields = {**fields, "id": aid, "version": 1, "created_at": ts, "updated_at": ts}
    fields.setdefault("is_default", 0)
    cols = [k for k in _AGENT_COLS if k in fields]
    placeholders = ",".join("?" * len(cols))
    with with_conn() as c:
        if fields.get("is_default"):
            c.execute("UPDATE agents SET is_default=0")
        c.execute(
            f"INSERT INTO agents({','.join(cols)}) VALUES ({placeholders})",
            tuple(fields[k] for k in cols),
        )
    return aid


def update_agent(agent_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields = {k: v for k, v in fields.items() if k in _AGENT_COLS and k not in {"id", "created_at"}}
    fields["updated_at"] = now_iso()
    sets = ", ".join(f"{k}=?" for k in fields)
    with with_conn() as c:
        if fields.get("is_default"):
            c.execute("UPDATE agents SET is_default=0 WHERE id<>?", (agent_id,))
        # Bump version when a content-bearing field changes.
        meaningful = {"agent_name", "brand", "voice_id", "language_pref",
                      "opener_variant", "custom_opener", "system_prompt"}
        if meaningful & set(fields):
            c.execute("UPDATE agents SET version=version+1 WHERE id=?", (agent_id,))
        c.execute(
            f"UPDATE agents SET {sets} WHERE id=?",
            tuple(fields[k] for k in fields) + (agent_id,),
        )


def delete_agent(agent_id: str) -> None:
    with with_conn() as c:
        c.execute("UPDATE leads SET agent_id=NULL WHERE agent_id=?", (agent_id,))
        c.execute("DELETE FROM agents WHERE id=?", (agent_id,))


def set_lead_agent(lead_id: str, agent_id: str | None) -> None:
    with with_conn() as c:
        c.execute(
            "UPDATE leads SET agent_id=?, updated_at=? WHERE id=?",
            (agent_id, now_iso(), lead_id),
        )


# ----- handoffs (RM context-card delivery) ------------------------------------

_HANDOFF_COLS = (
    "id", "call_id", "lead_id", "agent_id", "agent_name", "score", "channel",
    "rm_phone", "card_token", "status", "error", "twilio_sid",
    "created_at", "sent_at", "opened_at",
)


def insert_handoff(call_id: str, lead_id: str, score: str, channel: str,
                   card_token: str, rm_phone: str | None,
                   agent_id: str | None = None,
                   agent_name: str | None = None,
                   handoff_id: str | None = None) -> str:
    hid = handoff_id or new_id("hand")
    with with_conn() as c:
        c.execute(
            "INSERT INTO handoffs("
            "id, call_id, lead_id, agent_id, agent_name, score, channel,"
            " rm_phone, card_token, status, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (hid, call_id, lead_id, agent_id, agent_name, score, channel,
             rm_phone, card_token, "pending", now_iso()),
        )
    return hid


def mark_handoff_sent(handoff_id: str, twilio_sid: str | None) -> None:
    with with_conn() as c:
        c.execute(
            "UPDATE handoffs SET status='sent', sent_at=?, twilio_sid=? "
            "WHERE id=?",
            (now_iso(), twilio_sid, handoff_id),
        )


def mark_handoff_failed(handoff_id: str, error: str) -> None:
    with with_conn() as c:
        c.execute(
            "UPDATE handoffs SET status='failed', error=? WHERE id=?",
            (error[:500], handoff_id),
        )


def mark_handoff_opened(handoff_id: str) -> None:
    with with_conn() as c:
        c.execute(
            "UPDATE handoffs SET status='opened', opened_at=COALESCE(opened_at, ?) "
            "WHERE id=?",
            (now_iso(), handoff_id),
        )


def get_handoff(handoff_id: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            f"SELECT {','.join(_HANDOFF_COLS)} FROM handoffs WHERE id=?",
            (handoff_id,),
        ).fetchone()
    return dict(r) if r else None


def get_handoff_by_token(token: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            f"SELECT {','.join(_HANDOFF_COLS)} FROM handoffs WHERE card_token=?",
            (token,),
        ).fetchone()
    return dict(r) if r else None


def get_latest_handoff_for_call(call_id: str) -> dict[str, Any] | None:
    with with_conn() as c:
        r = c.execute(
            f"SELECT {','.join(_HANDOFF_COLS)} FROM handoffs "
            "WHERE call_id=? ORDER BY datetime(created_at) DESC LIMIT 1",
            (call_id,),
        ).fetchone()
    return dict(r) if r else None


def list_handoffs(limit: int = 100,
                  since_days: int | None = None) -> list[dict[str, Any]]:
    """Returns handoffs joined with the originating call's summary + analysis
    so the Handoffs gallery can render each tile without a second hop."""
    sql = (
        f"SELECT h.{', h.'.join(_HANDOFF_COLS)}, "
        "  l.name AS lead_name, l.phone AS lead_phone, l.language_pref, "
        "  c.summary AS call_summary, c.analysis_json AS analysis_json, "
        "  c.duration_seconds AS duration_seconds "
        "FROM handoffs h "
        "LEFT JOIN leads l ON l.id = h.lead_id "
        "LEFT JOIN calls c ON c.id = h.call_id "
        "WHERE 1=1 "
    )
    args: list = []
    if since_days is not None:
        sql += " AND date(h.created_at) >= date('now', ?)"
        args.append(f"-{since_days} days")
    sql += " ORDER BY datetime(h.created_at) DESC LIMIT ?"
    args.append(limit)
    import json as _json
    out: list[dict[str, Any]] = []
    with with_conn() as c:
        for r in c.execute(sql, args).fetchall():
            row = dict(r)
            raw = row.pop("analysis_json", None)
            analysis: dict[str, Any] = {}
            if raw:
                try:
                    analysis = _json.loads(raw)
                except Exception:
                    pass
            # Pluck the fields the gallery actually needs — keeping the
            # payload small for fast renders.
            row["key_signal"] = analysis.get("key_signal")
            row["interest_level"] = analysis.get("interest_level")
            row["sentiment"] = analysis.get("sentiment")
            out.append(row)
    return out


def handoffs_today_count() -> int:
    with with_conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM handoffs "
            "WHERE date(created_at) = date('now')"
        ).fetchone()[0]


def handoffs_by_agent(days: int = 14) -> list[dict[str, Any]]:
    """Per-agent handoff leaderboard for analytics."""
    with with_conn() as c:
        rows = c.execute(
            """
            SELECT
              COALESCE(agent_name, '(default)') AS agent_name,
              agent_id,
              COUNT(*) AS total,
              SUM(CASE WHEN score='HOT'  THEN 1 ELSE 0 END) AS hot,
              SUM(CASE WHEN score='WARM' THEN 1 ELSE 0 END) AS warm,
              SUM(CASE WHEN status='opened' THEN 1 ELSE 0 END) AS opened
            FROM handoffs
            WHERE date(created_at) >= date('now', ?)
            GROUP BY agent_id, agent_name
            ORDER BY total DESC
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
