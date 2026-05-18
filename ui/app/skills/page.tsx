"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Languages, Phone, Wrench, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { api, SkillSummary } from "@/lib/api";

const CATEGORY_LABEL: Record<string, string> = {
  sales: "Sales",
  ecommerce_d2c: "E-commerce · D2C",
  healthcare: "Healthcare",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.skills()
      .then((body) => setSkills(body.skills))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.22em] text-ink-mute font-semibold mb-1">
            OPERATE · SKILLS CATALOG
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-ink-mute mt-1 max-w-2xl">
            Each skill is a packaged voice agent for a specific Indian use
            case — prompt, objection library, scoring rubric, and tool
            requirements. Install a skill, point it at your leads, dial.
          </p>
        </div>
        <div className="text-xs text-ink-mute font-mono">
          {skills ? `${skills.length} available` : "loading…"}
        </div>
      </div>

      {err && (
        <Card>
          <CardContent className="text-sm text-red-400">
            Failed to load skills: {err}
          </CardContent>
        </Card>
      )}

      {!skills && !err && (
        <div className="text-sm text-ink-mute">Loading catalog…</div>
      )}

      {skills && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {skills.map((s) => (
            <SkillCard key={s.id} skill={s} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About the catalog</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-ink-mute space-y-2 leading-relaxed">
          <p>
            Stock skills live as filesystem directories in{" "}
            <code className="font-mono text-ink-text">skills/&lt;id&gt;/</code>.
            Each contains a manifest, system prompt, greeting, objections,
            scoring rubric, tool declarations, and voice defaults. The
            runtime loads and renders them on every call.
          </p>
          <p>
            Authoring a new skill = adding a folder of YAML/Markdown to the
            repo. Tenant overrides (per-org prompt + objection tweaks) land
            in a follow-up release; today the bootstrap org uses{" "}
            <code className="font-mono text-ink-text">lead_conversion</code>{" "}
            implicitly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillSummary }) {
  const cat = CATEGORY_LABEL[skill.category] ?? skill.category;
  const minutes = Math.round(skill.estimated_call_duration_seconds / 60 * 10) / 10;
  const agentName = skill.voice_defaults?.agent_name ?? "—";
  return (
    <Card className="hover:border-accent/40 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Boxes size={14} className="text-accent" />
              <div className="text-[10px] tracking-[0.18em] text-ink-mute font-semibold uppercase">
                {cat}
              </div>
            </div>
            <CardTitle className="text-lg">{skill.name}</CardTitle>
            <div className="text-[11px] text-ink-mute font-mono mt-1">
              {skill.id}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-ink-mute">avg call</div>
            <div className="text-lg font-semibold font-mono tabular-nums">
              {minutes}m
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-text/85 leading-relaxed">
          {skill.description}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Spec icon={<Languages size={12} />} label="Language">
            {skill.default_language}
          </Spec>
          <Spec icon={<Phone size={12} />} label="Agent">
            {agentName}
          </Spec>
          <Spec icon={<Wrench size={12} />} label="Tools">
            {skill.tools.length}
          </Spec>
          <Spec icon={<ShieldCheck size={12} />} label="Objections">
            {skill.objection_count}
          </Spec>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-1.5">
            Outcomes scored
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.rubric_labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-ink-card border border-ink-line text-[11px] text-ink-text font-mono"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {skill.compliance_tags?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-1.5">
              Compliance
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skill.compliance_tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 border border-accent/30 text-[11px] text-accent font-mono"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-ink-line flex items-center justify-between">
          <Link
            href={`/skills/${skill.id}`}
            className="text-xs text-accent hover:underline"
          >
            View full spec →
          </Link>
          <span className="text-[11px] text-ink-mute font-mono">
            ships with bootstrap org
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Spec({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-ink-mute">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">
          {label}
        </div>
        <div className="text-sm font-medium truncate">{children}</div>
      </div>
    </div>
  );
}
