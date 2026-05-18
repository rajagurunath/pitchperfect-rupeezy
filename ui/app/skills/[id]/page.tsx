"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { api, SkillDetail } from "@/lib/api";

const CATEGORY_LABEL: Record<string, string> = {
  sales: "Sales",
  ecommerce_d2c: "E-commerce · D2C",
  healthcare: "Healthcare",
};

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.skillDetail(id)
      .then((s) => setSkill(s))
      .catch((e) => setErr(String(e)));
  }, [id]);

  if (err) {
    return (
      <Card>
        <CardContent className="text-sm text-red-400 py-6">{err}</CardContent>
      </Card>
    );
  }
  if (!skill) return <div className="text-sm text-ink-mute">Loading…</div>;

  const cat = CATEGORY_LABEL[skill.category] ?? skill.category;
  const minutes = Math.round(skill.estimated_call_duration_seconds / 60 * 10) / 10;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/skills" className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-accent">
        <ArrowLeft size={12} /> Back to skills
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Boxes size={14} className="text-accent" />
          <div className="text-[10px] tracking-[0.22em] text-ink-mute font-semibold uppercase">
            OPERATE · SKILLS · {cat}
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{skill.name}</h1>
        <div className="text-[12px] text-ink-mute font-mono mt-1">{skill.id}</div>
        <p className="text-sm text-ink-text/85 mt-3 max-w-3xl leading-relaxed">
          {skill.description}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Language" value={skill.default_language} />
        <Stat label="Agent" value={skill.voice_defaults?.agent_name ?? "—"} />
        <Stat label="Avg call" value={`${minutes} min`} />
        <Stat label="Objections" value={String(skill.objections.length)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Scoring rubric</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {skill.rubric?.description && (
            <p className="text-ink-mute italic">{skill.rubric.description}</p>
          )}
          {Object.entries(skill.rubric?.labels ?? {}).map(([label, info]) => (
            <div key={label} className="border-l-2 border-accent/40 pl-3 py-1">
              <div className="text-xs font-mono font-semibold text-accent">{label}</div>
              {info?.criteria && (
                <div className="text-sm text-ink-text/85 mt-0.5 leading-relaxed">
                  {info.criteria}
                </div>
              )}
              {info?.action && (
                <div className="text-xs text-ink-mute mt-1">
                  <span className="uppercase tracking-wider">Action:</span> {info.action}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Objection library ({skill.objections.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {skill.objections.map((o) => (
            <div key={o.label} className="border border-ink-line rounded-md p-3">
              <div className="text-xs font-mono text-accent mb-1.5">{o.label}</div>
              {o.trigger_phrases && o.trigger_phrases.length > 0 && (
                <div className="text-[11px] text-ink-mute mb-2">
                  Triggers: <span className="font-mono">{o.trigger_phrases.join(" · ")}</span>
                </div>
              )}
              <div className="text-sm leading-relaxed text-ink-text/85">{o.rebuttal}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Tools ({skill.tools_spec.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {skill.tools_spec.map((t) => (
            <div key={t.id} className="border border-ink-line rounded-md p-3">
              <div className="text-xs font-mono text-accent mb-1">{t.id}</div>
              {t.description && (
                <div className="text-sm text-ink-text/85 leading-relaxed">{t.description}</div>
              )}
              {t.required_params && (
                <pre className="text-[11px] font-mono text-ink-mute mt-2 overflow-x-auto">
{JSON.stringify(t.required_params, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">System prompt template</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-[11px] font-mono whitespace-pre-wrap bg-ink-card border border-ink-line rounded-md p-3 leading-relaxed max-h-[40rem] overflow-y-auto">
{skill.prompt_template}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Greeting instruction</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-[11px] font-mono whitespace-pre-wrap bg-ink-card border border-ink-line rounded-md p-3 leading-relaxed">
{skill.greeting_template}
          </pre>
        </CardContent>
      </Card>

      {skill.compliance_tags?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Compliance tags</CardTitle></CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-line bg-ink-card p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
        {label}
      </div>
      <div className="text-base font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}
