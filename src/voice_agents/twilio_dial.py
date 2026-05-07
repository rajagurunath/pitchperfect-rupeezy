"""Place an outbound call that bridges into our Twilio Media Streams bot.

Workflow::

    # terminal A — bot
    uv run twilio-bot

    # terminal B — expose it
    ngrok http 8765

    # terminal C — dial. --public-url is the ngrok https URL.
    uv run twilio-dial +919444531354 --public-url https://abc123.ngrok-free.app

If you omit ``--public-url``, this script tries to auto-detect ngrok by
querying its local API at http://127.0.0.1:4040/api/tunnels.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voice-agents.twilio_dial")


def _autodetect_ngrok() -> str | None:
    """Query ngrok's local agent for an https tunnel."""
    try:
        r = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=2)
        r.raise_for_status()
    except Exception as e:
        log.debug("ngrok autodetect failed: %s", e)
        return None
    for tunnel in r.json().get("tunnels", []):
        url = tunnel.get("public_url", "")
        if url.startswith("https://"):
            return url
    return None


def main() -> None:
    p = argparse.ArgumentParser(description="Dial a phone via Twilio + Pipecat Media Streams.")
    p.add_argument("phone_number", help="E.164, e.g. +919444531354")
    p.add_argument(
        "--public-url",
        default=None,
        help="Public https URL of the running bot (e.g. ngrok). "
        "If omitted, will try to autodetect a running ngrok tunnel.",
    )
    p.add_argument(
        "--from-number",
        default=os.getenv("TWILIO_FROM_NUMBER"),
        help="Twilio caller-ID. Defaults to TWILIO_FROM_NUMBER from .env.",
    )
    args = p.parse_args()

    if not args.phone_number.startswith("+"):
        sys.exit(f"phone_number must be E.164, got {args.phone_number!r}")
    if not args.from_number:
        sys.exit("Twilio caller-ID required (TWILIO_FROM_NUMBER in .env or --from-number).")

    public_url = args.public_url or _autodetect_ngrok()
    if not public_url:
        sys.exit(
            "no --public-url given and ngrok not detected on :4040. "
            "Start ngrok with `ngrok http 8765` and rerun."
        )

    host = urlparse(public_url).netloc
    ws_url = f"wss://{host}/ws"

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        '<Pause length="1"/>'
        f'<Connect><Stream url="{ws_url}"/></Connect>'
        '</Response>'
    )

    client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    log.info("dialing %s from %s — ws=%s", args.phone_number, args.from_number, ws_url)

    try:
        call = client.calls.create(
            twiml=twiml,
            to=args.phone_number,
            from_=args.from_number,
        )
    except TwilioRestException as e:
        log.error("twilio error %s: %s", e.code, e.msg)
        if e.code == 21219:
            log.error("destination not on verified caller-IDs list. "
                      "Verify it in Twilio console first.")
        elif e.code in (21215, 13227):
            log.error("geo permissions issue — enable India in "
                      "Voice → Settings → Geographic Permissions.")
        sys.exit(1)

    log.info("call queued: sid=%s status=%s", call.sid, call.status)
    log.info("watch live: https://console.twilio.com/us1/monitor/logs/calls/%s", call.sid)
    log.info("on the phone: press any digit to skip the trial-account gate, "
             "then talk to Priya")


if __name__ == "__main__":
    main()
