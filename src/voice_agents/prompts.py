"""System prompt + greeting instruction — thin shim over the skills resolver.

Historically this module held the full Rupeezy AP system prompt as a
hard-coded Python string. v0.2 moved that content into the stock skill
``skills/lead_conversion/`` and turned this module into a backward-
compatible shim so existing callsites (twilio_bot, pipecat_bot, agent,
api/server.py) keep working.

New call paths should call ``voice_agents.skills.resolve(...)`` directly
and pass the resolved skill into the runtime explicitly. This shim is
retained for legacy callers and module-level constants.
"""
from __future__ import annotations

import os

from . import skills as _skills

# Configurable persona — override via .env or process env. Used as the
# bootstrap-org defaults when callers don't pass per-call values.
AGENT_NAME = os.getenv("AGENT_NAME", "Priya")
AGENT_BRAND = os.getenv("AGENT_BRAND", "Rupeezy")
AGENT_PRONOUNS = os.getenv("AGENT_PRONOUNS", "she/her")

# The bootstrap-org installs lead_conversion with these overrides. They
# mirror the historical Rupeezy AP build so existing behaviour is
# preserved.
_BOOTSTRAP_LEAD_CONVERSION_OVERRIDES = {
    "program_name": "Authorized Person (AP) Partner Program",
    "program_context": (
        "{brand} runs a partner program where Mutual Fund Distributors, "
        "financial advisors, insurance agents, and finance influencers "
        "onboard retail clients under {brand}'s broker license as "
        "Authorized Persons (APs)."
    ),
    "offer_bullets": (
        "  1. **Zero joining fee** — completely free to onboard. "
        "No setup cost, no annual fee.\n"
        "  2. **100% brokerage share** — industry standard is 60–70%; "
        "{brand} passes 100% of the brokerage to the partner.\n"
        "  3. **Daily payouts via the RISE Portal** — most brokers pay "
        "monthly; {brand} settles to your bank every single day."
    ),
    "trust_signals": (
        "SEBI-registered, the same broker license powers tens of "
        "thousands of active traders, dedicated AP support desk 7 days "
        "a week in Hindi and English"
    ),
    "trust_volume_phrase": "tens of thousands of active traders",
}


def _apply_bootstrap_overrides(skill_id: str, overrides: dict) -> dict:
    """For lead_conversion, fill in the AP-specific placeholders so the
    prompt renders identically to the pre-resolver Rupeezy build."""
    if skill_id != "lead_conversion":
        return overrides
    for k, v in _BOOTSTRAP_LEAD_CONVERSION_OVERRIDES.items():
        overrides.setdefault(k, v)
    # The {brand} appears inside the bootstrap overrides themselves
    # (program_context, trust_signals etc.) — pre-substitute so the
    # final format_map call doesn't see un-substituted tokens.
    b = overrides["brand"]
    for k in ("program_context", "offer_bullets", "trust_signals",
              "trust_volume_phrase"):
        v = overrides.get(k)
        if isinstance(v, str):
            overrides[k] = v.replace("{brand}", b)
    return overrides


def build_system_prompt(
    *,
    skill_id: str = "lead_conversion",
    agent_name: str | None = None,
    brand: str | None = None,
    pronouns: str | None = None,
    lead_name: str | None = None,
    lead_notes: str | None = None,
) -> str:
    """Render the system prompt for a specific persona and (optional) lead.

    Default ``skill_id`` is ``lead_conversion`` — i.e. the historical
    behaviour. Callers wanting a different skill pass ``skill_id=...``.
    """
    overrides: dict[str, object] = {
        "brand": brand or AGENT_BRAND,
        "agent_name": agent_name or AGENT_NAME,
        "agent_pronouns": pronouns or AGENT_PRONOUNS,
    }
    overrides = _apply_bootstrap_overrides(skill_id, overrides)
    resolved = _skills.resolve(
        skill_id=skill_id,
        overrides=overrides,
        lead_name=lead_name,
        lead_notes=lead_notes,
    )
    return resolved.system_prompt


def build_greeting_instruction(
    *,
    skill_id: str = "lead_conversion",
    agent_name: str | None = None,
    brand: str | None = None,
    pronouns: str | None = None,
) -> str:
    overrides: dict[str, object] = {
        "brand": brand or AGENT_BRAND,
        "agent_name": agent_name or AGENT_NAME,
        "agent_pronouns": pronouns or AGENT_PRONOUNS,
    }
    overrides = _apply_bootstrap_overrides(skill_id, overrides)
    resolved = _skills.resolve(skill_id=skill_id, overrides=overrides)
    return resolved.greeting


# Default-rendered prompts for callers that just want a global system
# prompt without thinking about skills. Production code paths should call
# build_system_prompt(lead_name=...) per call so the opener is personal.
SYSTEM_PROMPT = build_system_prompt()
GREETING_INSTRUCTION = build_greeting_instruction()
