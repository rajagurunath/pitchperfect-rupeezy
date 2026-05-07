"""Dispatch the agent and dial a lead's phone number.

Usage::

    uv run dial +919444531354
    uv run dial +919444531354 --name "Ravi Kumar"

This creates a fresh LiveKit room, dispatches the ``rupeezy-ap-agent``
worker into it with metadata containing the phone number, and the
agent's entrypoint then performs the SIP outbound dial.

Prerequisites
-------------
1. A LiveKit Cloud project (or self-hosted server) with SIP enabled.
2. ``LIVEKIT_URL`` / ``LIVEKIT_API_KEY`` / ``LIVEKIT_API_SECRET`` in ``.env``.
3. The agent worker running: ``uv run agent start`` in another terminal.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import time

from dotenv import load_dotenv
from livekit import api

load_dotenv()

logger = logging.getLogger("voice-agents.dispatch")
logging.basicConfig(level=logging.INFO)


AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "rupeezy-ap-agent")


async def dial(phone_number: str, lead_name: str | None = None) -> None:
    if not phone_number.startswith("+"):
        raise SystemExit(
            f"phone_number must be E.164 (e.g. +919444531354), got {phone_number!r}"
        )

    room_name = f"call-{phone_number.lstrip('+')}-{int(time.time())}"
    metadata = {"phone_number": phone_number}
    if lead_name:
        metadata["lead_name"] = lead_name

    lk = api.LiveKitAPI()
    try:
        dispatch = await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room_name,
                metadata=json.dumps(metadata),
            )
        )
        logger.info(
            "dispatched agent %s into room %s (dispatch_id=%s) — "
            "agent worker will now place the SIP call",
            AGENT_NAME, room_name, dispatch.id,
        )
    finally:
        await lk.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dial a lead and run the Rupeezy AP voice agent on the call.",
    )
    parser.add_argument("phone_number", help="E.164 phone number, e.g. +919444531354")
    parser.add_argument("--name", dest="lead_name", default=None,
                        help="Optional lead display name (passed to agent in metadata).")
    args = parser.parse_args()
    asyncio.run(dial(args.phone_number, args.lead_name))


if __name__ == "__main__":
    main()
