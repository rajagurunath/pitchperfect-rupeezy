"""Sanity check — does this Twilio account deliver WhatsApp end-to-end?

Sends a one-off WhatsApp text from the Twilio Sandbox sender to a
recipient. Mirrors ``scripts/test_twilio_call.py`` for voice.

Run::

    uv run python scripts/test_whatsapp.py
    # or override the destination:
    uv run python scripts/test_whatsapp.py +919876543210

Important notes (read once, then forget):

  * Twilio does NOT let you send WhatsApp from your own personal number.
    The ``From`` MUST be the shared Sandbox sender (``whatsapp:+14155238886``)
    or a WhatsApp Sender you've registered with Meta. ``+919445162399`` and
    other personal numbers cannot be used as the ``From``. ``Verified
    Caller IDs`` is a voice-only trial concept and is irrelevant here.

  * The recipient must opt-in FIRST. From the destination handset, open
    WhatsApp and message ``join <your-sandbox-code>`` to ``+1 415 523 8886``.
    The two-word code is shown in the Twilio Console at Messaging → Try it
    out → Send a WhatsApp message. Without this, Twilio accepts the API
    call but the message is silently dropped (status flips to ``undelivered``).

  * Free-form ``Body`` only works inside the 24h session window (i.e. after
    the user messages you). Outside that window you must send a pre-approved
    Content Template via ``content_sid``. For the sandbox + a freshly opted-in
    number, you're inside the window, so ``Body`` works.

Common error codes this script will surface:
  * 63007 — Channel not found / sender not provisioned
  * 63016 — Outside 24h window, Body not allowed (use a template)
  * 63018 — Recipient hasn't joined the sandbox
  * 21211 — Invalid 'To' phone number
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
FROM_WHATSAPP = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
DEFAULT_TO = os.getenv("TEST_WHATSAPP_TO", "+919444531354")
DEFAULT_BODY = (
    "Namaste! Yeh ek test message hai Rupeezy partner program ki taraf se. "
    "Agar aap yeh dekh rahe hain, toh WhatsApp delivery theek kaam kar rahi hai."
)


def to_whatsapp(number: str) -> str:
    return number if number.startswith("whatsapp:") else f"whatsapp:{number}"


def main() -> None:
    to_raw = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TO
    if not to_raw.startswith("+"):
        sys.exit(f"to-number must be E.164, got {to_raw!r}")

    to = to_whatsapp(to_raw)
    body = os.getenv("TEST_WHATSAPP_BODY", DEFAULT_BODY)

    client = Client(ACCOUNT_SID, AUTH_TOKEN)
    print(f"sending whatsapp: {FROM_WHATSAPP}  →  {to}")
    try:
        msg = client.messages.create(from_=FROM_WHATSAPP, to=to, body=body)
    except TwilioRestException as e:
        print(f"twilio error {e.code}: {e.msg}")
        if e.code == 63007:
            print("→ sender not provisioned. Set TWILIO_WHATSAPP_FROM to the "
                  "sandbox sender (whatsapp:+14155238886) or your approved Sender.")
        elif e.code == 63016:
            print("→ outside the 24h session window. Send a Content Template "
                  "(content_sid=HXxxxx) instead of free-form Body.")
        elif e.code == 63018:
            print(f"→ recipient hasn't joined the sandbox. From {to_raw}, "
                  "WhatsApp 'join <code>' to +14155238886. Find the code at "
                  "Messaging → Try it out → Send a WhatsApp message.")
        sys.exit(1)

    print(f"queued: sid={msg.sid} status={msg.status}")
    print("watch delivery live: https://console.twilio.com/us1/monitor/logs/sms")
    print("(if status stays 'queued' or flips to 'undelivered', the recipient "
          "almost certainly hasn't joined the sandbox)")


if __name__ == "__main__":
    main()
