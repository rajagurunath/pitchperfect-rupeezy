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
You are an analyst reviewing the transcript of a phone call between
{brand}'s AI relationship manager and a prospective Authorized Person
(AP) partner. Output strictly the following JSON, no prose:

{{
  "score": "HOT" | "WARM" | "COLD",
  "summary": "<3–5 sentence summary covering: lead's profile, what they
              asked, which objections they raised, where the conversation
              landed, and what the next concrete action should be>",
  "objections_raised": ["<short label>", "..."],
  "next_action": "<one-sentence concrete recommendation for the human RM>"
}}

Scoring rubric:
* HOT  — explicit interest; asked about commission / sign-up / onboarding
         timeline; has client base; said things like "kab start kar sakte hain",
         "send the link", "ready hu". Should be called back by a human RM
         within 30 minutes.
* WARM — engaged but non-committal; asked general questions; said "send
         details" or "let me think". Eligible for WhatsApp follow-up.
* COLD — dismissive, wrong number, "do not call", or simply not interested.
         No further outreach.
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
    """Strip ``json fences and parse. Tolerant of leading/trailing prose."""
    if not text:
        return None
    cleaned = text.strip()
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

    payload = {
        "model": model,
        "messages": _build_messages(brand, transcript),
        "temperature": 0.2,
        "max_tokens": 600,
    }
    # We DO want reasoning on for the analyzer — quality > latency.
    if os.getenv("ANALYZER_DISABLE_THINKING", "0") == "1":
        payload["chat_template_kwargs"] = {"thinking": False}

    log.info("analyze_call: posting to %s/chat/completions for %s", base_url, call_id)
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if r.status_code != 200:
        log.error("analyzer LLM failed: %d %s", r.status_code, r.text[:300])
        return None
    raw = r.json()["choices"][0]["message"].get("content") or ""
    parsed = _extract_json(raw)
    if not parsed:
        log.error("analyzer: could not parse JSON from: %s", raw[:300])
        return None

    score = parsed.get("score")
    if score not in {"HOT", "WARM", "COLD"}:
        log.warning("analyzer: bad score %r — defaulting to WARM", score)
        score = "WARM"
    summary = parsed.get("summary", "")
    db.update_call(call_id, score=score, summary=summary)
    log.info("analyze_call: %s → %s", call_id, score)
    parsed["score"] = score
    return parsed
