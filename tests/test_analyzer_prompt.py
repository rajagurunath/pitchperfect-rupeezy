"""Tests for the analyzer prompt builder routed through skills."""
from __future__ import annotations

from voice_agents import analyzer


def test_build_analyzer_prompt_defaults_to_lead_conversion():
    out = analyzer.build_analyzer_prompt(brand="Acme")
    assert "Acme" in out
    assert "HOT" in out
    assert "WARM" in out
    assert "COLD" in out
    # Schema indicator (the JSON output shape) must still be present
    assert '"score"' in out
    assert '"summary"' in out


def test_build_analyzer_prompt_for_cod_confirmation():
    out = analyzer.build_analyzer_prompt(
        brand="Acme",
        skill_id="cod_confirmation",
    )
    # cod_confirmation rubric labels — these are different from HOT/WARM/COLD
    assert "confirmed" in out
    assert "cancelled" in out
    # The cod_confirmation rubric description references RTO / Cash-on-Delivery
    assert "RTO" in out or "Cash-on-Delivery" in out


def test_build_analyzer_prompt_brand_substitution():
    out_acme = analyzer.build_analyzer_prompt(brand="Acme")
    out_zenith = analyzer.build_analyzer_prompt(brand="Zenith")
    assert "Acme" in out_acme and "Zenith" not in out_acme
    assert "Zenith" in out_zenith and "Acme" not in out_zenith
