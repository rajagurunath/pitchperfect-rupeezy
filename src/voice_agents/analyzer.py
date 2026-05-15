"""Post-call analyzer.

Runs after a call ends. Reads the transcript from SQLite, asks Kimi-K2.6 to
produce a short structured summary + Hot/Warm/Cold score, persists both
to the ``calls`` row. Reasoning is intentionally LEFT ON here (we have no
real-time pressure) so the model can think harder about qualification.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from . import db

log = logging.getLogger("voice-agents.analyzer")


_ANALYZER_PROMPT = """\
You are an expert sales analyst reviewing a phone call between {brand}'s AI
relationship manager and a prospective Authorized Person (AP) partner lead.

Output ONLY valid JSON matching this schema (no prose, no markdown fences):

{{
  "score": "HOT" | "WARM" | "COLD",
  "summary": "<3–5 sentence summary: lead profile, what they asked, objections raised, where conversation landed, concrete next step>",
  "sentiment": "positive" | "neutral" | "negative",
  "interest_level": <integer 1–10>,
  "objection_intensity": <integer 1–10>,
  "follow_up_priority": <integer 1–10>,
  "buying_signals": ["<exact quote or paraphrase>", ...],
  "objections_raised": ["<short label>", ...],
  "objections_handled": [
    {{"objection": "<short label>", "resolution": "<one phrase: how the agent resolved it on the call>"}}
  ],
  "key_signal": "<one short sentence — the single strongest moment the human RM should know about>",
  "recommended_opener": "<one line, in the lead's language, that the human RM can say to re-open the conversation, referencing what the AI agent already discussed>",
  "next_action": "<one concrete sentence for the human RM>"
}}

Scoring rubric:
HOT  — explicit interest; asked about commission / sign-up / onboarding timeline;
       has existing client base; said "kab start kar sakte hain", "send the link",
       "ready hu". Human RM callback within 30 minutes.
WARM — engaged but non-committal; asked general questions; "send details" / "let
       me think". Eligible for WhatsApp follow-up.
COLD — dismissive, wrong number, "do not call", or simply not interested.

interest_level: 1 = completely disinterested, 10 = ready to sign up now.
objection_intensity: 1 = no objections, 10 = hostile / multiple hard objections.
follow_up_priority: 1 = no follow-up needed (COLD), 10 = call back within 30 min (HOT).
buying_signals: actual phrases or behaviours that indicate purchase intent. Empty list if COLD.
"""


def _build_messages(brand: str, transcript: list[dict[str, Any]]) -> list[dict[str, str]]:
    convo_lines = []
    for t in transcript:
        speaker = "AGENT" if t["speaker"] == "agent" else "LEAD"
        convo_lines.append(f"{speaker}: {t['text']}")
    convo = "\n".join(convo_lines) or "(no transcript captured)"
    return [
        {"role": "system", "content": _ANALYZER_PROMPT.format(brand=brand)},
        {"role": "user",
         "content": f"Transcript:\n\n{convo}\n\nReturn ONLY the JSON object."},
    ]


def _extract_json(text: str) -> dict[str, Any] | None:
    """Strip ``json fences / <think> blocks and parse. Tolerant of prose."""
    if not text:
        return None
    cleaned = text.strip()
    # Kimi-K2.6 with thinking on sometimes emits <think>...</think> in content
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # Find the outermost {...}
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    blob = cleaned[start:end + 1]
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        return None


async def analyze_call(call_id: str) -> dict[str, Any] | None:
    """Run the analyzer and persist results to the calls row.

    Returns the parsed analysis dict, or None on failure.
    """
    call = db.get_call(call_id)
    if not call:
        log.warning("analyze_call: %s not found", call_id)
        return None
    transcript = db.list_turns(call_id)
    if not transcript:
        log.info("analyze_call: %s has no transcript yet — skipping", call_id)
        return None

    base_url = os.getenv("OPENAI_BASE_URL", "").rstrip("/") or "https://api.openai.com/v1"
    model = os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY", "")
    brand = os.getenv("AGENT_BRAND", "Rupeezy")

    # Schema-driven extraction doesn't need chain-of-thought. With thinking
    # on, Kimi spends the token budget on reasoning_content and the JSON in
    # content gets truncated (we saw finish_reason=length on real calls).
    # Default OFF; set ANALYZER_DISABLE_THINKING=0 to flip it back.
    disable_thinking = os.getenv("ANALYZER_DISABLE_THINKING", "1") == "1"
    payload: dict[str, Any] = {
        "model": model,
        "messages": _build_messages(brand, transcript),
        "temperature": 0.2,
        # Bigger budget regardless — Kimi sometimes ignores the thinking-off
        # toggle on certain vLLM builds and we don't want a truncation here.
        "max_tokens": int(os.getenv("ANALYZER_MAX_TOKENS", "16384")),
    }
    if disable_thinking:
        # vLLM only forwards custom kwargs that live inside `extra_body`.
        # Top-level `chat_template_kwargs` is silently dropped.
        # Send both spellings — different Moonshot/vLLM builds honor different keys.
        payload["extra_body"] = {
            "chat_template_kwargs": {"thinking": False, "enable_thinking": False},
            "enable_thinking": False,
        }

    log.info("analyze_call: posting to %s/chat/completions for %s", base_url, call_id)
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if r.status_code != 200:
        log.error("analyzer LLM failed: %d %s", r.status_code, r.text[:300])
        return None
    body = r.json()
    choice = body["choices"][0]
    msg = choice["message"]
    raw = (msg.get("content") or "").strip()
    # Some vLLM builds split reasoning models' output: chain-of-thought into
    # `reasoning_content`, final answer into `content`. If content is empty
    # (model never finished thinking) the JSON is sometimes embedded in
    # reasoning_content as a last-line dump — try that as a fallback.
    if not _extract_json(raw):
        reasoning = (msg.get("reasoning_content") or "").strip()
        if reasoning:
            raw = (raw + "\n" + reasoning).strip()
    parsed = _extract_json(raw)
    if not parsed:
        finish = choice.get("finish_reason")
        usage = body.get("usage", {})
        msg_keys = sorted(msg.keys())
        reasoning_len = len((msg.get("reasoning_content") or ""))
        log.error(
            "analyzer: could not parse JSON "
            "(finish=%s, content_len=%d, reasoning_len=%d, msg_keys=%s, usage=%s) "
            "content_head=%r reasoning_head=%r",
            finish, len(msg.get("content") or ""), reasoning_len, msg_keys, usage,
            (msg.get("content") or "")[:300],
            (msg.get("reasoning_content") or "")[:300],
        )
        return None

    score = parsed.get("score")
    if score not in {"HOT", "WARM", "COLD"}:
        log.warning("analyzer: bad score %r — defaulting to WARM", score)
        score = "WARM"
    summary = parsed.get("summary", "")

    # Persist score + summary to existing columns (backward compat)
    db.update_call(call_id, score=score, summary=summary)

    # Persist full analysis JSON to new column
    import json as _json
    db.update_call_analysis(call_id, _json.dumps(parsed))

    # Push analysis to MLflow if a tracker is active for this call
    try:
        from .mlflow_tracker import get_tracker
        tracker = get_tracker(call_id)
        if tracker:
            tracker.log_analysis(parsed)
    except Exception as exc:
        log.warning("mlflow analysis log failed (non-fatal): %s", exc)

    # Snapshot the analyzer prompt + transcript-input + raw output so the
    # MLflow UI shows the full I/O chain next to the score.
    try:
        from .mlflow_prompts import log_analyzer_io
        log_analyzer_io(
            call_id=call_id,
            analyzer_prompt=_ANALYZER_PROMPT.format(brand=brand),
            transcript=transcript,
            raw_response=raw,
            parsed=parsed,
        )
    except Exception as exc:
        log.warning("mlflow analyzer io log failed (non-fatal): %s", exc)

    log.info(
        "analyze_call: %s → %s (interest=%s/10 priority=%s/10)",
        call_id, score,
        parsed.get("interest_level", "?"),
        parsed.get("follow_up_priority", "?"),
    )
    parsed["score"] = score

    # Auto-dispatch the RM context card for HOT / WARM. Failures here
    # never bubble up — the score is already persisted and the RM can
    # resend manually from the call detail page.
    if score in ("HOT", "WARM") and os.getenv("HANDOFF_AUTOSEND", "1") == "1":
        try:
            from .handoff import dispatch_handoff
            await dispatch_handoff(call_id)
        except Exception as exc:
            log.warning("handoff dispatch failed (non-fatal): %s", exc)

    return parsed
