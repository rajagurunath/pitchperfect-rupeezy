"""RM context-card handoff.

After the post-call analyzer scores a call HOT or WARM, we create a
handoff record and send the RM a WhatsApp message containing a link to
a signed public card page (``/handoff/<token>``).

Channels:

* **HOT**  → "call" handoff. RM should call back within 30 minutes. The
  WhatsApp message is the *briefing* the RM reads on the way to the dial.
* **WARM** → "whatsapp" handoff. RM should follow up via WhatsApp chat
  using the recommended opener from the card.

Delivery uses Twilio Programmable WhatsApp. In the Twilio sandbox the
sender is ``whatsapp:+14155238886``; in production set
``TWILIO_WHATSAPP_FROM`` to your approved sender.

The card link is a public, HMAC-signed token so the RM can open it on
their phone without authenticating. Tokens are not enumerable; tampering
with the embedded handoff id breaks the signature.
"""

from __future__ import annotations

import hmac
import hashlib
import logging
import os
from typing import Any

from . import db

log = logging.getLogger("voice-agents.handoff")


def _secret() -> str:
    """HMAC secret. Falls back to the admin JWT secret so a single .env
    entry is enough for a single-tenant deployment."""
    return (os.getenv("HANDOFF_SECRET")
            or os.getenv("ADMIN_JWT_SECRET")
            or "dev-handoff-secret-change-me")


def make_card_token(handoff_id: str) -> str:
    """Format: ``<handoff_id>.<hex_hmac>``. Stable per handoff so resends
    reuse the same URL."""
    sig = hmac.new(_secret().encode(), handoff_id.encode(),
                   hashlib.sha256).hexdigest()[:32]
    return f"{handoff_id}.{sig}"


def parse_card_token(token: str) -> str | None:
    """Returns handoff_id if the signature matches, else None."""
    if not token or "." not in token:
        return None
    handoff_id, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret().encode(), handoff_id.encode(),
                        hashlib.sha256).hexdigest()[:32]
    if hmac.compare_digest(sig, expected):
        return handoff_id
    return None


def channel_for_score(score: str) -> str:
    """HOT → call back; WARM/COLD → WhatsApp."""
    return "call" if score == "HOT" else "whatsapp"


def _public_base_url() -> str:
    """The URL the RM's phone will hit to open the card. Defaults to
    ngrok if discoverable, else PUBLIC_APP_URL, else localhost."""
    explicit = os.getenv("PUBLIC_APP_URL")
    if explicit:
        return explicit.rstrip("/")
    # ngrok already exposes the FastAPI server on port 8000; the Next.js
    # frontend lives on a separate origin during dev. Operators set
    # PUBLIC_APP_URL once we have a real domain.
    try:
        import urllib.request
        import json as _json
        with urllib.request.urlopen(
            "http://127.0.0.1:4040/api/tunnels", timeout=0.5,
        ) as r:
            data = _json.loads(r.read())
        for t in data.get("tunnels", []):
            if t.get("public_url", "").startswith("https://"):
                return t["public_url"].rstrip("/")
    except Exception:
        pass
    return "http://localhost:3000"


def card_url(token: str) -> str:
    return f"{_public_base_url()}/handoff/{token}"


def _build_message(score: str, lead: dict[str, Any],
                   analysis: dict[str, Any], url: str) -> str:
    """The plain-text body of the WhatsApp message. Kept short — the link
    is what actually carries the context."""
    emoji = "🔥" if score == "HOT" else "🟡" if score == "WARM" else "🔵"
    label = f"{score} LEAD"
    name = lead.get("name") or "Lead"
    phone = lead.get("phone") or ""
    interest = analysis.get("interest_level")
    interest_line = f"Interest {interest}/10 · " if interest else ""
    key = (analysis.get("key_signal") or analysis.get("next_action")
           or analysis.get("summary") or "").strip()
    if len(key) > 220:
        key = key[:217] + "…"
    action = ("Call back within 30 min." if score == "HOT"
              else "WhatsApp follow-up." if score == "WARM"
              else "No follow-up needed.")
    return (
        f"{emoji} {label} — {name} ({phone})\n"
        f"{interest_line}{action}\n"
        f"{key}\n\n"
        f"Open context card: {url}"
    )


def _send_whatsapp(to_phone: str, body: str) -> tuple[bool, str | None, str | None]:
    """Returns (ok, twilio_sid, error_message)."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    sender = (os.getenv("TWILIO_WHATSAPP_FROM")
              or "whatsapp:+14155238886")  # Twilio sandbox sender
    if not sender.startswith("whatsapp:"):
        sender = f"whatsapp:{sender}"
    if not sid or not token:
        return False, None, "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set"
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        to = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone}"
        msg = client.messages.create(from_=sender, to=to, body=body)
        return True, msg.sid, None
    except Exception as exc:
        return False, None, str(exc)[:500]


async def dispatch_handoff(call_id: str) -> dict[str, Any] | None:
    """Create + send a handoff for ``call_id`` if its score is HOT or WARM.

    Idempotent on the create side — if a non-failed handoff already exists
    for this call we resend rather than create a second one. Returns the
    handoff row (with status) so callers can surface it in the UI."""
    call = db.get_call(call_id)
    if not call:
        log.warning("dispatch_handoff: call %s missing", call_id)
        return None
    score = call.get("score")
    if not score:
        log.info("dispatch_handoff: %s no score yet — skipping", call_id)
        return None

    rm_phone = os.getenv("RM_WHATSAPP_NUMBER", "").strip() or None
    lead = db.get_lead(call["lead_id"]) or {}
    agent_id = lead.get("agent_id")
    agent_row = db.get_agent(agent_id) if agent_id else None
    agent_name = (agent_row or {}).get("name") or (agent_row or {}).get("agent_name")

    # Reuse an existing handoff so the card URL is stable across resends.
    existing = db.get_latest_handoff_for_call(call_id)
    if existing and existing.get("status") != "failed":
        handoff_id = existing["id"]
        token = existing["card_token"]
    else:
        handoff_id = db.new_id("hand")
        token = make_card_token(handoff_id)
        db.insert_handoff(
            call_id=call_id, lead_id=call["lead_id"], score=score,
            channel=channel_for_score(score), card_token=token,
            rm_phone=rm_phone, agent_id=agent_id, agent_name=agent_name,
            handoff_id=handoff_id,
        )

    import json as _json
    analysis: dict[str, Any] = {}
    if call.get("analysis_json"):
        try:
            analysis = _json.loads(call["analysis_json"])
        except Exception:
            pass

    lead_phone = call.get("lead_phone") or lead.get("phone") or ""
    lead_name  = call.get("lead_name")  or lead.get("name")  or "there"

    # For WARM calls: send signup link directly to the lead.
    if score == "WARM" and lead_phone:
        signup_body = (
            f"It was nice talking to you, {lead_name}! "
            f"Here is the sign-up link to become Rupeezy's Authorised Person partner:\n\n"
            f"https://rupeezy.in/authorized-person\n\n"
            f"Feel free to reach out if you have any questions."
        )
        ok_lead, _, err_lead = _send_whatsapp(lead_phone, signup_body)
        if ok_lead:
            log.info("signup link sent to lead %s for call %s", lead_phone, call_id)
        else:
            log.warning("signup link to lead failed: call=%s err=%s", call_id, err_lead)

    body = _build_message(score, {"name": lead_name, "phone": lead_phone},
                          analysis, card_url(token))

    if not rm_phone:
        db.mark_handoff_failed(handoff_id, "RM_WHATSAPP_NUMBER not set")
        log.warning("dispatch_handoff: %s skipped — RM_WHATSAPP_NUMBER missing",
                    call_id)
        return db.get_handoff(handoff_id)

    ok, twilio_sid, err = _send_whatsapp(rm_phone, body)
    if ok:
        db.mark_handoff_sent(handoff_id, twilio_sid)
        log.info("handoff sent: call=%s score=%s rm=%s sid=%s",
                 call_id, score, rm_phone, twilio_sid)
    else:
        db.mark_handoff_failed(handoff_id, err or "unknown error")
        log.warning("handoff failed: call=%s err=%s", call_id, err)
    return db.get_handoff(handoff_id)
