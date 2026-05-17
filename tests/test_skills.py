"""Tests for voice_agents.skills resolver."""
from __future__ import annotations

import pytest

from voice_agents import skills as skills_mod


def test_list_stock_skills_returns_all_four():
    """All four v1 stock skills must be discoverable."""
    ids = sorted(skills_mod.list_stock_skills())
    assert ids == [
        "clinic_appointment",
        "cod_confirmation",
        "cold_outbound",
        "lead_conversion",
    ]


def test_load_lead_conversion_has_required_fields():
    s = skills_mod.load_stock_skill("lead_conversion")
    assert s.id == "lead_conversion"
    assert s.name == "Lead Conversion"
    assert s.category == "sales"
    assert s.default_language == "hinglish"
    assert "lookup_lead" in s.tools
    assert "HOT" in s.rubric_labels
    assert "WARM" in s.rubric_labels
    assert "COLD" in s.rubric_labels
    # prompt body must contain the canonical agent placeholder
    assert "{agent_name}" in s.prompt_template
    assert "{brand}" in s.prompt_template
    # greeting placeholder hygiene
    assert "{agent_name}" in s.greeting_template
    # objections are a non-empty list of dicts with label + rebuttal
    assert len(s.objections) >= 3
    for o in s.objections:
        assert "label" in o and "rebuttal" in o
    # rubric has labels mapping to {criteria, action}
    for label in s.rubric_labels:
        assert label in s.rubric["labels"]


def test_load_unknown_skill_raises():
    with pytest.raises(skills_mod.SkillNotFound):
        skills_mod.load_stock_skill("does_not_exist")


def test_resolve_with_no_overrides_returns_stock_content():
    """Resolver applied to a stock-only context renders the prompt with
    the skill's own voice_defaults as the persona."""
    r = skills_mod.resolve(
        skill_id="lead_conversion",
        overrides={
            "brand": "Acme",
            "program_name": "Channel Partner Program",
            "program_context": "Acme runs a channel partner program for resellers.",
            "offer_bullets": "  1. Zero joining fee\n  2. 80% commission\n  3. Monthly payouts",
            "trust_signals": "ISO certified, 10k+ active partners",
            "trust_volume_phrase": "tens of thousands of active partners",
        },
    )
    assert r.skill_id == "lead_conversion"
    assert "Acme" in r.system_prompt
    assert "Channel Partner Program" in r.system_prompt
    # The greeting also renders
    assert "Acme" in r.greeting
    # Persona defaults flow through
    assert r.voice["agent_name"] == "Priya"
    # Objections come back as the merged list
    assert any(o["label"] == "already_with_competitor" for o in r.objections)


def test_resolve_passes_lead_context_into_extras():
    r = skills_mod.resolve(
        skill_id="lead_conversion",
        overrides={
            "brand": "Acme",
            "program_name": "X",
            "program_context": "—",
            "offer_bullets": "—",
            "trust_signals": "—",
            "trust_volume_phrase": "—",
        },
        lead_name="Rohit",
        lead_notes="Has been with competitor for 3 years; price-sensitive.",
    )
    assert "Rohit" in r.system_prompt
    assert "competitor for 3 years" in r.system_prompt


def test_all_four_skills_load_without_error():
    for skill_id in skills_mod.list_stock_skills():
        s = skills_mod.load_stock_skill(skill_id)
        assert s.id == skill_id
        assert s.prompt_template
        assert s.greeting_template
        assert s.rubric_labels
        assert s.rubric["labels"]
