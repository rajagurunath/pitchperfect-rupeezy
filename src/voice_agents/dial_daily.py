"""Dispatcher for the Pipecat + Daily voice agent.

Creates a Daily room with dial-out enabled, mints an owner meeting token,
then spawns ``voice_agents.pipecat_bot`` as a subprocess with those
credentials and the target phone number. The bot joins the room and dials
the phone; this script waits for the subprocess to exit, then deletes the
room.

Usage::

    uv run dial-daily +919444531354
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
import uuid

import aiohttp
from dotenv import load_dotenv

from pipecat.runner.daily import (
    DailyRESTHelper,
    DailyRoomParams,
    DailyRoomProperties,
    DailyRoomSipParams,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voice-agents.dial_daily")


async def dial(phone_number: str) -> int:
    if not phone_number.startswith("+"):
        raise SystemExit(f"phone_number must be E.164 (e.g. +919444531354), got {phone_number!r}")

    daily_key = os.getenv("DAILY_API_KEY")
    if not daily_key:
        raise SystemExit("DAILY_API_KEY not set in .env")

    async with aiohttp.ClientSession() as session:
        helper = DailyRESTHelper(daily_api_key=daily_key, aiohttp_session=session)

        room_params = DailyRoomParams(
            name=f"rupeezy-{uuid.uuid4().hex[:8]}",
            properties=DailyRoomProperties(
                exp=time.time() + 60 * 30,  # auto-cleanup after 30 minutes
                enable_dialout=True,
                enable_chat=False,
                start_video_off=True,
                sip=DailyRoomSipParams(
                    display_name="Rupeezy AP Bot",
                    sip_mode="dial-in",
                    num_endpoints=1,
                ),
            ),
        )
        room = await helper.create_room(room_params)
        log.info("created Daily room: %s", room.url)

        token = await helper.get_token(room_url=room.url, expiry_time=60 * 30, owner=True)
        log.info("minted owner token (len=%d)", len(token))

        # Spawn the bot. Using uv ensures it runs inside our env regardless
        # of where this CLI is invoked from.
        cmd = [
            "uv", "run", "python", "-m", "voice_agents.pipecat_bot",
            "--room-url", room.url,
            "--token", token,
            "--phone-number", phone_number,
        ]
        log.info("spawning bot: %s", " ".join(cmd[:6] + ["...", "...", "--phone-number", phone_number]))
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        try:
            return await proc.wait()
        except KeyboardInterrupt:
            log.info("interrupted — terminating bot")
            proc.terminate()
            await proc.wait()
            return 130
        finally:
            try:
                await helper.delete_room_by_url(room.url)
                log.info("room deleted")
            except Exception as e:
                log.warning("room cleanup failed: %s", e)


def main() -> None:
    p = argparse.ArgumentParser(description="Dial an Indian phone number with the Pipecat+Daily Rupeezy agent.")
    p.add_argument("phone_number", help="E.164, e.g. +919444531354")
    args = p.parse_args()
    rc = asyncio.run(dial(args.phone_number))
    sys.exit(rc)


if __name__ == "__main__":
    main()
