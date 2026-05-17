"""Tests for the backward-compatible prompts.py shim that routes through
the skills resolver."""
from __future__ import annotations

from voice_agents import prompts


def test_build_system_prompt_default_uses_lead_conversion():
    out = prompts.build_system_prompt()
    # Default brand is "Rupeezy" for the bootstrap org per spec §3 migration
    assert "Rupeezy" in out
    # Default agent name is "Priya" (from skill voice_defaults)
    assert "Priya" in out


def test_build_system_prompt_explicit_brand_overrides_default():
    out = prompts.build_system_prompt(brand="Acme", agent_name="Rohit")
    assert "Acme" in out
    assert "Rohit" in out
    assert "Rupeezy" not in out


def test_build_system_prompt_skill_arg_selects_skill():
    out = prompts.build_system_prompt(skill_id="cod_confirmation")
    # cod_confirmation prompt mentions Cash-on-Delivery / RTO
    assert "RTO" in out or "Cash-on-Delivery" in out or "Return-To-Origin" in out


def test_build_system_prompt_lead_name_in_extras():
    out = prompts.build_system_prompt(
        lead_name="Rohit",
        lead_notes="Has been a Zerodha client for 5 years; might be price-sensitive.",
    )
    assert "Rohit" in out
    assert "Zerodha client for 5 years" in out
    assert "# THIS CALL" in out


def test_build_greeting_instruction_default():
    out = prompts.build_greeting_instruction()
    assert "Priya" in out
    assert "Rupeezy" in out


def test_build_greeting_instruction_explicit_brand_overrides():
    out = prompts.build_greeting_instruction(brand="Acme", agent_name="Aarav")
    assert "Acme" in out
    assert "Aarav" in out


def test_system_prompt_module_constant_exists():
    """The module-level SYSTEM_PROMPT constant is consumed by twilio_bot
    and pipecat_bot — must not regress."""
    assert isinstance(prompts.SYSTEM_PROMPT, str)
    assert len(prompts.SYSTEM_PROMPT) > 500


def test_greeting_instruction_module_constant_exists():
    assert isinstance(prompts.GREETING_INSTRUCTION, str)
    assert len(prompts.GREETING_INSTRUCTION) > 50
