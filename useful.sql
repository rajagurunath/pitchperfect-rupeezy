-- =============================================================================
-- Useful SQL for inspecting the Rupeezy AP voice-agent database.
--
-- Open the DB with:
--     sqlite3 data/voice_agents.db
--
-- Or run a single query non-interactively:
--     sqlite3 data/voice_agents.db < useful.sql
--     sqlite3 data/voice_agents.db "SELECT * FROM leads;"
--
-- Tip: run `.headers on` and `.mode column` (or `.mode box`) first for
-- readable output. Both are set at the top of this file.
-- =============================================================================

.headers on
.mode column

-- ---------------------------------------------------------------------------
-- 1. Schema reminder
-- ---------------------------------------------------------------------------

-- List tables.
.tables

-- Schema of each table.
.schema leads
.schema calls
.schema transcripts


-- ---------------------------------------------------------------------------
-- 2. Quick health check — row counts per table
-- ---------------------------------------------------------------------------

SELECT 'leads'       AS tbl, COUNT(*) AS rows FROM leads
UNION ALL SELECT 'calls',       COUNT(*) FROM calls
UNION ALL SELECT 'transcripts', COUNT(*) FROM transcripts;


-- ---------------------------------------------------------------------------
-- 3. Leads
-- ---------------------------------------------------------------------------

-- Newest first.
SELECT id, name, phone, status, language_pref, created_at
FROM leads
ORDER BY datetime(created_at) DESC;

-- Only queued (haven't been called yet).
SELECT id, name, phone, language_pref, created_at
FROM leads
WHERE status = 'queued'
ORDER BY datetime(created_at) DESC;

-- Distribution by status.
SELECT status, COUNT(*) AS n
FROM leads
GROUP BY status
ORDER BY n DESC;


-- ---------------------------------------------------------------------------
-- 4. Calls
-- ---------------------------------------------------------------------------

-- Most-recent calls with lead info.
SELECT
    c.id              AS call_id,
    l.name            AS lead,
    l.phone           AS phone,
    c.twilio_sid      AS twilio,
    c.status          AS status,
    c.score           AS score,
    c.duration_seconds AS dur_s,
    c.created_at      AS created
FROM calls c
LEFT JOIN leads l ON l.id = c.lead_id
ORDER BY datetime(c.created_at) DESC;

-- Funnel breakdown (mirrors GET /api/dashboard).
SELECT
    (SELECT COUNT(*) FROM leads)                                                                                AS leads_total,
    (SELECT COUNT(DISTINCT lead_id) FROM calls WHERE status IN ('completed','in-progress','failed','no-answer')) AS contacted,
    (SELECT COUNT(*) FROM calls WHERE status = 'completed')                                                     AS completed,
    (SELECT COUNT(*) FROM calls WHERE score = 'HOT')                                                            AS hot,
    (SELECT COUNT(*) FROM calls WHERE score = 'WARM')                                                           AS warm,
    (SELECT COUNT(*) FROM calls WHERE score = 'COLD')                                                           AS cold;

-- Calls that produced a recording.
SELECT id, lead_id, twilio_sid, duration_seconds, recording_url
FROM calls
WHERE recording_url IS NOT NULL
ORDER BY datetime(created_at) DESC;

-- Hot leads — feed these to the human RM.
SELECT
    l.name           AS lead,
    l.phone          AS phone,
    c.duration_seconds AS dur_s,
    c.summary        AS summary,
    c.recording_url  AS recording
FROM calls c
JOIN leads l ON l.id = c.lead_id
WHERE c.score = 'HOT'
ORDER BY datetime(c.created_at) DESC;


-- ---------------------------------------------------------------------------
-- 5. Transcripts
-- ---------------------------------------------------------------------------

-- All turns for one specific call (replace the call_id literal as needed).
-- Uncomment and edit:
--
-- SELECT speaker, language, text, ts
-- FROM transcripts
-- WHERE call_id = 'call_xxxxxxxxxxxx'
-- ORDER BY id;

-- Latest transcript turn for each call (sample preview).
SELECT
    t.call_id,
    l.name AS lead,
    t.speaker,
    t.language,
    SUBSTR(t.text, 1, 80) AS text_preview,
    t.ts
FROM transcripts t
JOIN (
    SELECT call_id, MAX(id) AS last_id
    FROM transcripts
    GROUP BY call_id
) m ON m.call_id = t.call_id AND m.last_id = t.id
LEFT JOIN calls  c ON c.id = t.call_id
LEFT JOIN leads  l ON l.id = c.lead_id
ORDER BY datetime(t.ts) DESC;

-- Per-call turn counts split by speaker.
SELECT
    t.call_id,
    l.name AS lead,
    SUM(CASE WHEN t.speaker = 'agent' THEN 1 ELSE 0 END) AS agent_turns,
    SUM(CASE WHEN t.speaker = 'user'  THEN 1 ELSE 0 END) AS user_turns,
    COUNT(*) AS total_turns
FROM transcripts t
LEFT JOIN calls c ON c.id = t.call_id
LEFT JOIN leads l ON l.id = c.lead_id
GROUP BY t.call_id
ORDER BY total_turns DESC;

-- Detected language distribution across user turns (good for reporting
-- "x% of leads engaged in Hindi vs English vs Tamil").
SELECT
    COALESCE(language, 'unknown') AS lang,
    COUNT(*) AS user_turns
FROM transcripts
WHERE speaker = 'user'
GROUP BY lang
ORDER BY user_turns DESC;


-- ---------------------------------------------------------------------------
-- 6. Dangerous — only when you really mean it.  Comment lines start with --
-- ---------------------------------------------------------------------------

-- Wipe everything (e.g. before a fresh demo). KEEP COMMENTED until needed.
--
-- DELETE FROM transcripts;
-- DELETE FROM calls;
-- DELETE FROM leads;
-- VACUUM;

-- Reset one specific lead so you can re-call them.
--
-- UPDATE leads SET status = 'queued' WHERE id = 'lead_xxxxxxxxxxxx';
-- DELETE FROM transcripts WHERE call_id IN (SELECT id FROM calls WHERE lead_id = 'lead_xxxxxxxxxxxx');
-- DELETE FROM calls WHERE lead_id = 'lead_xxxxxxxxxxxx';

-- Force-set a Hot/Warm/Cold score on one call (useful for testing the RM
-- hand-off UI without re-running the analyzer).
--
-- UPDATE calls SET score = 'HOT', summary = 'Manually marked for testing.'
-- WHERE id = 'call_xxxxxxxxxxxx';
