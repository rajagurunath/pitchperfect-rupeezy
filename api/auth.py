"""Tiny single-user auth for the admin console.

Hackathon-grade: one predefined admin loaded from environment variables,
HS256 JWTs signed with ``ADMIN_JWT_SECRET``. The intent is to keep the
admin pages from being trivially reachable when the dev server is exposed
via ngrok — *not* to be a production auth system.

Public routes (no token required):
  * ``/api/health``       — liveness for the UI before it has a token
  * ``/api/auth/login``   — to obtain a token
  * ``/twiml`` and ``/ws`` — Twilio's webhooks have no JWT
  * ``/api/calls/{id}/recording`` — audio element can't easily send a
    Bearer header; the call_id is long+opaque, treated as a capability.

Everything else under ``/api/*`` requires ``Authorization: Bearer <jwt>``.
"""

from __future__ import annotations

import os
import time
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request


def _admin_profile() -> dict[str, str]:
    return {
        "username": os.getenv("ADMIN_USERNAME", "admin"),
        "display_name": os.getenv("ADMIN_DISPLAY_NAME", "Admin"),
        "email": os.getenv("ADMIN_EMAIL", "admin@local"),
        "role": os.getenv("ADMIN_ROLE", "Admin"),
    }


def _secret() -> str:
    return os.getenv("ADMIN_JWT_SECRET", "change-me-rupeezy-hackathon-secret")


def verify_credentials(username: str, password: str) -> dict[str, str] | None:
    expected_user = os.getenv("ADMIN_USERNAME", "admin")
    expected_pass = os.getenv("ADMIN_PASSWORD", "rupeezy123")
    if username == expected_user and password == expected_pass:
        return _admin_profile()
    return None


def issue_token(profile: dict[str, str], ttl_seconds: int = 60 * 60 * 8) -> str:
    """Sign an HS256 JWT carrying the user profile. Default 8-hour expiry."""
    now = int(time.time())
    payload = {
        "sub": profile["username"],
        "name": profile["display_name"],
        "email": profile["email"],
        "role": profile["role"],
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, _secret(), algorithms=["HS256"])


def current_user(request: Request) -> dict[str, Any]:
    """FastAPI dependency: pull JWT from Authorization header, validate, return claims."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    try:
        return decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"invalid token: {e}")


# Convenience alias for use in endpoint signatures: ``user = Depends(require_user)``
require_user = current_user
