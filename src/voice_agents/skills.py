"""Skills resolver.

Stock skills live in ``<repo>/skills/<id>/`` and consist of seven files
(manifest, prompt, greeting, objections, rubric, tools, voice_defaults).

This module is the only place that knows how skills are stored on disk.
``resolve(...)`` is the contract the rest of the runtime consumes.

Tenant-side overrides + tool binding are intentionally NOT implemented
here yet — a later plan will add ``skill_installations`` DB lookup +
deep-merge on top of stock content. Today the resolver just applies the
``overrides`` dict directly into the prompt template with str.format().
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = ROOT / "skills"


class SkillNotFound(KeyError):
    """Raised when a skill id has no corresponding stock directory."""


class SkillMalformed(ValueError):
    """Raised when a stock skill is missing a required file or field."""


@dataclass(frozen=True)
class StockSkill:
    """A skill loaded from the filesystem with no tenant overrides applied."""
    id: str
    name: str
    category: str
    description: str
    default_language: str
    default_voice_provider: str
    default_voice_id: str
    estimated_call_duration_seconds: int
    tools: list[str]
    rubric_labels: list[str]
    compliance_tags: list[str]
    prompt_template: str
    greeting_template: str
    objections: list[dict[str, Any]]
    rubric: dict[str, Any]
    tools_spec: list[dict[str, Any]]
    voice_defaults: dict[str, Any]


@dataclass(frozen=True)
class ResolvedSkill:
    """A skill rendered for a specific call — prompt + greeting filled in,
    objections + rubric + voice config materialised."""
    skill_id: str
    system_prompt: str
    greeting: str
    objections: list[dict[str, Any]]
    rubric: dict[str, Any]
    voice: dict[str, Any]
    tools: list[str] = field(default_factory=list)


_REQUIRED_FILES = (
    "manifest.yaml",
    "prompt.md",
    "greeting.md",
    "objections.yaml",
    "rubric.yaml",
    "tools.yaml",
    "voice_defaults.yaml",
)


def list_stock_skills() -> list[str]:
    """Return the ids of every well-formed stock skill on disk."""
    if not SKILLS_DIR.exists():
        return []
    out: list[str] = []
    for entry in SKILLS_DIR.iterdir():
        if not entry.is_dir():
            continue
        if all((entry / f).exists() for f in _REQUIRED_FILES):
            out.append(entry.name)
    return sorted(out)


@lru_cache(maxsize=64)
def load_stock_skill(skill_id: str) -> StockSkill:
    """Read a stock skill from disk. Cached because skills don't change
    at runtime (a deploy resets the cache)."""
    folder = SKILLS_DIR / skill_id
    if not folder.is_dir():
        raise SkillNotFound(skill_id)
    for f in _REQUIRED_FILES:
        if not (folder / f).exists():
            raise SkillMalformed(f"{skill_id}: missing {f}")

    manifest = yaml.safe_load((folder / "manifest.yaml").read_text())
    if not isinstance(manifest, dict) or manifest.get("id") != skill_id:
        raise SkillMalformed(
            f"{skill_id}: manifest.yaml id does not match folder name"
        )

    return StockSkill(
        id=manifest["id"],
        name=manifest["name"],
        category=manifest["category"],
        description=manifest.get("description", "").strip(),
        default_language=manifest.get("default_language", "hinglish"),
        default_voice_provider=manifest.get("default_voice_provider", "sarvam"),
        default_voice_id=manifest.get("default_voice_id", ""),
        estimated_call_duration_seconds=int(
            manifest.get("estimated_call_duration_seconds", 90)
        ),
        tools=list(manifest.get("tools") or []),
        rubric_labels=list(manifest.get("rubric_labels") or []),
        compliance_tags=list(manifest.get("compliance_tags") or []),
        prompt_template=(folder / "prompt.md").read_text(),
        greeting_template=(folder / "greeting.md").read_text(),
        objections=yaml.safe_load((folder / "objections.yaml").read_text()) or [],
        rubric=yaml.safe_load((folder / "rubric.yaml").read_text()) or {},
        tools_spec=yaml.safe_load((folder / "tools.yaml").read_text()) or [],
        voice_defaults=yaml.safe_load(
            (folder / "voice_defaults.yaml").read_text()
        ) or {},
    )


def _verb_ending(pronouns: str | None) -> str:
    """Hindi verb conjugation for the speaker. 'rahi' for she/her, 'raha' otherwise."""
    p = (pronouns or "").lower()
    if "she" in p or "her" in p:
        return "i"  # bol rahi hoon
    return "a"  # bol raha hoon


class _SafeDict(dict):
    """A format-map dict that leaves un-substituted ``{placeholder}`` tokens
    in place instead of raising KeyError. Useful for partial rendering —
    e.g. ``{{customer_name}}`` Jinja-style escapes in stock prompts that
    the runtime fills in per-call, not per-install."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def resolve(
    *,
    skill_id: str,
    overrides: dict[str, Any] | None = None,
    lead_name: str | None = None,
    lead_notes: str | None = None,
) -> ResolvedSkill:
    """Render a skill for a specific call.

    ``overrides`` fills the ``{...}`` placeholders in the prompt and
    greeting templates. The skill's own ``voice_defaults`` provide
    ``agent_name`` / ``agent_pronouns`` if the caller doesn't override
    them. ``lead_name`` and ``lead_notes`` are appended as a
    "# THIS CALL" extras block, matching the legacy ``build_system_prompt``
    behaviour.
    """
    stock = load_stock_skill(skill_id)
    ov = dict(overrides or {})

    voice = {**stock.voice_defaults, **(ov.get("voice") or {})}
    agent_name = ov.get("agent_name") or voice.get("agent_name") or "Agent"
    pronouns = ov.get("agent_pronouns") or voice.get("agent_pronouns") or "they/them"

    fmt_ctx = {
        **ov,
        "agent_name": agent_name,
        "verb_ending": _verb_ending(pronouns),
    }

    system_prompt = stock.prompt_template.format_map(_SafeDict(fmt_ctx))
    greeting = stock.greeting_template.format_map(_SafeDict(fmt_ctx))

    extras: list[str] = []
    if lead_name:
        extras.append(
            f"The lead's name is **{lead_name}** — use it in the opener."
        )
    if lead_notes:
        extras.append(
            "Background notes from the operator about this lead — "
            "internalize and adapt your pitch around them. Do NOT read "
            "them out loud or quote them verbatim:\n\n"
            f"```\n{lead_notes.strip()}\n```"
        )
    if extras:
        system_prompt += "\n# THIS CALL\n\n" + "\n\n".join(extras) + "\n"

    return ResolvedSkill(
        skill_id=skill_id,
        system_prompt=system_prompt,
        greeting=greeting,
        objections=list(stock.objections),
        rubric=dict(stock.rubric),
        voice={**voice, "agent_name": agent_name, "agent_pronouns": pronouns},
        tools=list(stock.tools),
    )
