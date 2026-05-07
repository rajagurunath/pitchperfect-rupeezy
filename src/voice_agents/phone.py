"""End-to-end phone dialer in a single command.

Spawns the FastAPI Pipecat bot, opens an ngrok tunnel, places the Twilio
outbound call, waits for the call to end, and cleans up. No multi-terminal
juggling, no LiveKit, no Daily — just::

    uv run phone +919444531354
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import shutil
import signal
import sys
import time
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)-22s %(message)s")
log = logging.getLogger("phone")

PORT = int(os.getenv("TWILIO_BOT_PORT", "8765"))
NGROK_API = "http://127.0.0.1:4040/api/tunnels"
HEALTH_URL = f"http://127.0.0.1:{PORT}/healthz"


# ---------- subprocess lifecycle helpers --------------------------------------

class Backgrounded:
    """Manages a child process and ensures it's killed on exit."""

    def __init__(self, name: str, argv: list[str]) -> None:
        self.name = name
        self.argv = argv
        self.proc: asyncio.subprocess.Process | None = None

    async def start(self) -> None:
        log.info("starting %s: %s", self.name, " ".join(self.argv))
        self.proc = await asyncio.create_subprocess_exec(
            *self.argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        # Drain stdout so the buffer doesn't block; print under [name] prefix.
        asyncio.create_task(self._pump_output())

    async def _pump_output(self) -> None:
        assert self.proc and self.proc.stdout
        while True:
            line = await self.proc.stdout.readline()
            if not line:
                break
            sys.stdout.write(f"[{self.name}] {line.decode(errors='replace')}")
            sys.stdout.flush()

    async def stop(self) -> None:
        if not self.proc or self.proc.returncode is not None:
            return
        log.info("stopping %s (pid=%s)", self.name, self.proc.pid)
        try:
            self.proc.terminate()
            await asyncio.wait_for(self.proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            log.warning("%s didn't exit; killing", self.name)
            self.proc.kill()
            await self.proc.wait()


# ---------- readiness checks --------------------------------------------------

async def wait_for(url: str, label: str, timeout: float = 30.0) -> None:
    """Poll `url` until it returns 200 or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = await asyncio.to_thread(requests.get, url, timeout=2)
            if r.status_code == 200:
                log.info("%s ready", label)
                return
        except Exception:
            pass
        await asyncio.sleep(0.5)
    raise TimeoutError(f"{label} did not become ready at {url} within {timeout}s")


async def wait_for_ngrok_url(timeout: float = 30.0) -> str:
    """Return the first https tunnel public_url ngrok exposes."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = await asyncio.to_thread(requests.get, NGROK_API, timeout=2)
            if r.status_code == 200:
                for t in r.json().get("tunnels", []):
                    if t.get("public_url", "").startswith("https://"):
                        return t["public_url"]
        except Exception:
            pass
        await asyncio.sleep(0.5)
    raise TimeoutError("ngrok did not expose an https tunnel within timeout")


# ---------- Twilio call lifecycle --------------------------------------------

def place_call(client: Client, to: str, from_: str, ws_url: str) -> str:
    """Place the call with TwiML pointing at our WebSocket. Return call SID."""
    # The <Say> before <Connect> gives the user audible proof the trial gate
    # was passed, even if the WebSocket bridge fails after — so we can tell
    # "no audio at all" apart from "audio worked then bot died".
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response>'
        '<Pause length="1"/>'
        '<Say voice="Polly.Aditi" language="hi-IN">'
        'Connecting you to Priya from Rupeezy.'
        '</Say>'
        f'<Connect><Stream url="{ws_url}"/></Connect>'
        '</Response>'
    )
    try:
        call = client.calls.create(twiml=twiml, to=to, from_=from_)
    except TwilioRestException as e:
        log.error("twilio rest error %s: %s", e.code, e.msg)
        if e.code == 21219:
            log.error("→ destination not on verified caller-IDs list. Verify in Twilio console.")
        elif e.code in (21215, 13227):
            log.error("→ India geo-permission off. Voice → Settings → Geographic Permissions.")
        raise
    log.info("call queued: sid=%s status=%s  ws=%s", call.sid, call.status, ws_url)
    return call.sid


async def wait_for_call_end(client: Client, sid: str, max_seconds: float = 600.0) -> None:
    """Poll Twilio until call reaches a terminal state, then log final disposition."""
    terminal = {"completed", "failed", "canceled", "no-answer", "busy"}
    deadline = time.monotonic() + max_seconds
    last_status: str | None = None
    while time.monotonic() < deadline:
        call = await asyncio.to_thread(client.calls(sid).fetch)
        if call.status != last_status:
            log.info("call %s → %s", sid, call.status)
            last_status = call.status
        if call.status in terminal:
            log.info("final: status=%s duration=%ss price=%s %s",
                     call.status, call.duration, call.price, call.price_unit)
            return
        await asyncio.sleep(2)
    log.warning("max wait reached, leaving call %s alone", sid)


# ---------- main orchestrator -------------------------------------------------

async def run(phone_number: str, from_number: str) -> int:
    if not phone_number.startswith("+"):
        sys.exit(f"phone_number must be E.164, got {phone_number!r}")
    if not shutil.which("ngrok"):
        sys.exit("ngrok not found on PATH. Install: brew install ngrok")

    bot = Backgrounded("bot", ["uv", "run", "twilio-bot"])
    ngrok = Backgrounded("ngrok", ["ngrok", "http", str(PORT), "--log=stdout"])

    try:
        await bot.start()
        await ngrok.start()

        await wait_for(HEALTH_URL, "bot")
        public_url = await wait_for_ngrok_url()
        log.info("ngrok tunnel: %s", public_url)

        host = urlparse(public_url).netloc
        ws_url = f"wss://{host}/ws"

        client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
        log.info("dialing %s from %s", phone_number, from_number)
        sid = place_call(client, to=phone_number, from_=from_number, ws_url=ws_url)
        log.info("when the phone rings: press 1 to skip the trial gate, then talk")
        log.info("watch live: https://console.twilio.com/us1/monitor/logs/calls/%s", sid)

        await wait_for_call_end(client, sid)
        return 0
    finally:
        log.info("shutting down…")
        await ngrok.stop()
        await bot.stop()


def main() -> None:
    p = argparse.ArgumentParser(
        description="One-shot end-to-end phone dial: bot + ngrok + Twilio outbound, all in one command.",
    )
    p.add_argument("phone_number", help="E.164, e.g. +919444531354")
    p.add_argument(
        "--from-number",
        default=os.getenv("TWILIO_FROM_NUMBER"),
        help="Twilio caller-ID. Defaults to TWILIO_FROM_NUMBER from .env.",
    )
    args = p.parse_args()
    if not args.from_number:
        sys.exit("TWILIO_FROM_NUMBER not set in .env and --from-number not provided")

    # Ctrl-C handler so we still run the finally cleanup.
    loop = asyncio.new_event_loop()
    main_task = loop.create_task(run(args.phone_number, args.from_number))
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, main_task.cancel)
    try:
        sys.exit(loop.run_until_complete(main_task))
    except asyncio.CancelledError:
        log.info("interrupted")
        sys.exit(130)


if __name__ == "__main__":
    main()
