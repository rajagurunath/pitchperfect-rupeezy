"""Sanity check — does this Twilio account dial India end-to-end?

Plays a short Hinglish greeting via Twilio's <Say> TwiML so we don't depend
on any LiveKit / Pipecat / SIP plumbing yet. If the phone rings and you
hear "Namaste, this is a test call from Rupeezy", the account is healthy
and we can move on to wiring Twilio as a SIP trunk for the real agent.

Run::

    uv run python scripts/test_twilio_call.py
    # or override the destination:
    uv run python scripts/test_twilio_call.py +919876543210

Trial-account gotchas this script will surface:
  * 21219 — number not verified  → verify in Twilio console
  * 21215 — geo-permission off   → enable India in Voice → Settings →
                                   Geographic Permissions
  * 13227 — Trial account caller-ID restriction
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ACCOUNT_SID = os.environ["TWILIO_ACCOUNT_SID"]
AUTH_TOKEN = os.environ["TWILIO_AUTH_TOKEN"]
FROM_NUMBER = os.environ["TWILIO_FROM_NUMBER"]
DEFAULT_TO = os.getenv("TEST_TO_NUMBER", "+919444531354")

# Inline TwiML — no external URL needed. <Say> uses Twilio's built-in voice;
# language="hi-IN" makes it pronounce Hinglish acceptably for a sanity check.
TWIML = (
    '<Response>'
    '<Pause length="1"/>'
    '<Say voice="Polly.Aditi" language="hi-IN">'
    'Namaste! Yeh ek test call hai Rupeezy partner program ki taraf se. '
    'Agar aap yeh sun rahe hain, toh sab kuch theek kaam kar raha hai. '
    'Dhanyavaad.'
    '</Say>'
    '<Pause length="1"/>'
    '</Response>'
)


def main() -> None:
    to = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TO
    if not to.startswith("+"):
        sys.exit(f"to-number must be E.164, got {to!r}")

    client = Client(ACCOUNT_SID, AUTH_TOKEN)
    print(f"placing call: {FROM_NUMBER}  →  {to}")
    try:
        call = client.calls.create(twiml=TWIML, to=to, from_=FROM_NUMBER)
    except TwilioRestException as e:
        print(f"twilio error {e.code}: {e.msg}")
        if e.code == 21219:
            print("→ destination is not on your verified caller-IDs list. "
                  "Add it in Twilio console: Phone Numbers → Manage → Verified Caller IDs.")
        elif e.code in (21215, 13227):
            print("→ geo permissions or trial caller-ID restriction. "
                  "Enable India in Voice → Settings → Geographic Permissions.")
        sys.exit(1)

    print(f"queued: sid={call.sid} status={call.status}")
    print("watch the call live: https://console.twilio.com/us1/monitor/logs/calls")


if __name__ == "__main__":
    main()
