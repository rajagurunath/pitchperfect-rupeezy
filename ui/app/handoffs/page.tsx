"use client";

// Handoffs — gallery of context cards delivered to the RM.
//
// Layout philosophy: stats walls are forgettable, so we keep this page
// visual. One headline chart at the top (the funnel that actually
// matters: Sent → Opened, split by HOT vs WARM), then a Pinterest-style
// gallery of tiles where each tile previews the card the RM received.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { api, Handoff } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, ScoreBadge } from "@/components/ui";
import { formatTime } from "@/lib/utils";

type Filter = "all" | "HOT" | "WARM" | "opened" | "failed";

export default function HandoffsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function refresh() {
    try {
      setErr(null);
      setHandoffs(await api.listHandoffs(30));
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  // One chart: the funnel. Sent / Opened, split by HOT / WARM. That's
  // the only stat that actually answers "is the handoff loop working?"
  const funnel = useMemo(() => {
    const hot = handoffs.filter((h) => h.score === "HOT");
    const warm = handoffs.filter((h) => h.score === "WARM");
    return [
      {
        stage: "Sent",
        HOT:  hot.filter((h) => h.status !== "pending").length,
        WARM: warm.filter((h) => h.status !== "pending").length,
      },
      {
        stage: "Opened",
        HOT:  hot.filter((h) => h.status === "opened").length,
        WARM: warm.filter((h) => h.status === "opened").length,
      },
    ];
  }, [handoffs]);

  const counts = useMemo(() => ({
    all:    handoffs.length,
    HOT:    handoffs.filter((h) => h.score === "HOT").length,
    WARM:   handoffs.filter((h) => h.score === "WARM").length,
    opened: handoffs.filter((h) => h.status === "opened").length,
    failed: handoffs.filter((h) => h.status === "failed").length,
  }), [handoffs]);

  const filtered = useMemo(() => {
    if (filter === "all") return handoffs;
    if (filter === "HOT" || filter === "WARM") {
      return handoffs.filter((h) => h.score === filter);
    }
    return handoffs.filter((h) => h.status === filter);
  }, [handoffs, filter]);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-mute">
            Workspace
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Handoffs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Context cards the agent sent to the human RM after HOT and WARM
            calls. Each card on this page is a real card the RM received.
          </p>
        </div>
      </header>

      {err && (
        <Card><CardContent className="text-hot text-sm">API error: {err}</CardContent></Card>
      )}

      {/* Single chart up top — the only stat that matters. */}
      <Card>
        <CardHeader>
          <CardTitle>Open-through funnel · last 30 days</CardTitle>
          <p className="text-xs text-ink-mute mt-1">
            How many cards were delivered to the RM, and how many they
            actually opened. A wide gap between bars means the RM isn't
            reading the briefing — flag a workflow issue, not a model one.
          </p>
        </CardHeader>
        <CardContent>
          {handoffs.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-sm text-ink-mute">
              No handoffs yet. They appear automatically when a call is
              scored HOT or WARM.
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                  <XAxis dataKey="stage" stroke="#8a92a0" fontSize={11} />
                  <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      background: "#13161b", border: "1px solid #23272f",
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#8a92a0" }}
                    iconType="circle"
                  />
                  <Bar dataKey="HOT"  fill="#ef4444" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="WARM" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter chips + gallery */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}
                      label="All" count={counts.all} />
          <FilterChip active={filter === "HOT"} onClick={() => setFilter("HOT")}
                      label="Hot" count={counts.HOT} tone="hot" />
          <FilterChip active={filter === "WARM"} onClick={() => setFilter("WARM")}
                      label="Warm" count={counts.WARM} tone="warm" />
          <FilterChip active={filter === "opened"} onClick={() => setFilter("opened")}
                      label="Opened by RM" count={counts.opened} />
          <FilterChip active={filter === "failed"} onClick={() => setFilter("failed")}
                      label="Failed" count={counts.failed} />
        </div>

        {filtered.length === 0 ? (
          handoffs.length === 0 && filter === "all" ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-mute">
                No handoffs sent yet. Here's what one looks like — real cards
                appear in this gallery once an agent scores a call HOT or WARM.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <HandoffTile h={SAMPLE_HANDOFF} sample />
              </div>
            </div>
          ) : (
            <Card><CardContent className="text-sm text-ink-mute">
              No handoffs in this view.
            </CardContent></Card>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((h) => <HandoffTile key={h.id} h={h} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// ── tile ─────────────────────────────────────────────────────────────────────

function HandoffTile({ h, sample = false }: { h: Handoff; sample?: boolean }) {
  const isHot = h.score === "HOT";
  const cardHref = sample ? "/handoff/sample" : `/handoff/${h.card_token}`;
  const teaser =
    h.key_signal
    || (h.call_summary ? truncate(h.call_summary, 160) : null);

  return (
    <div
      className={
        "relative rounded-xl border bg-ink-card shadow-card overflow-hidden " +
        "hover:border-accent/40 transition-colors group " +
        (sample
          ? "border-dashed border-accent/40"
          : isHot ? "border-hot/30" : "border-ink-line")
      }
    >
      {sample && (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-widest bg-accent-soft text-accent border border-accent/30">
          Sample
        </div>
      )}
      {/* score stripe down the side */}
      <div
        className={
          "absolute left-0 top-0 bottom-0 w-1 " +
          (isHot ? "bg-hot" : "bg-warm")
        }
      />

      <div className="p-4 pl-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-text">
              {h.lead_name ?? "Lead"}
            </div>
            <div className="text-[11px] text-ink-mute font-mono mt-0.5">
              {h.lead_phone ?? "—"}
            </div>
          </div>
          <ScoreBadge score={h.score} />
        </div>

        {teaser && (
          <p className="text-[13px] text-ink-text leading-snug line-clamp-3">
            {teaser}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-mute">
          <span className="capitalize">
            {h.channel === "call" ? "Call back" : "WhatsApp"}
          </span>
          <span>·</span>
          <span>{prettyLang(h.language_pref)}</span>
          {typeof h.interest_level === "number" && (
            <>
              <span>·</span>
              <span>Interest {h.interest_level}/10</span>
            </>
          )}
          {h.agent_name && (
            <>
              <span>·</span>
              <span>{h.agent_name}</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-ink-line">
          <div className="flex items-center gap-2 text-[11px]">
            <StatusDot status={h.status} />
            <span className="text-ink-mute capitalize">{h.status}</span>
            {h.sent_at && (
              <>
                <span className="text-ink-mute">·</span>
                <span className="text-ink-mute">{formatTime(h.sent_at)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Link
              href={cardHref}
              target="_blank"
              className="text-accent hover:underline"
            >
              {sample ? "Preview card" : "Card"}
            </Link>
            {!sample && (
              <>
                <span className="text-ink-mute">·</span>
                <Link
                  href={`/calls/${h.call_id}`}
                  className="text-accent hover:underline"
                >
                  Call
                </Link>
              </>
            )}
          </div>
        </div>

        {h.status === "failed" && h.error && (
          <p className="text-[11px] text-hot pt-1 border-t border-ink-line">
            {truncate(h.error, 120)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Handoff["status"] }) {
  const colors: Record<Handoff["status"], string> = {
    pending: "bg-ink-mute",
    sent:    "bg-accent",
    opened:  "bg-hot",
    failed:  "bg-cold",
  };
  return (
    <span className={"inline-block h-2 w-2 rounded-full " + colors[status]} />
  );
}

function FilterChip({
  active, onClick, label, count, tone,
}: {
  active: boolean; onClick: () => void; label: string; count: number;
  tone?: "hot" | "warm";
}) {
  const toneClass = tone === "hot"
    ? "border-hot/30 text-hot"
    : tone === "warm"
      ? "border-warm/30 text-warm"
      : "border-ink-line text-ink-text";
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12.5px] " +
        "transition-colors hover:bg-ink-line/60 " +
        (active ? "bg-ink-line " + toneClass : "bg-ink-card " + toneClass)
      }
    >
      <span>{label}</span>
      <span className="text-ink-mute font-mono">{count}</span>
    </button>
  );
}

function prettyLang(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "hi-IN": "Hindi", "en-IN": "English", "ta-IN": "Tamil",
    "te-IN": "Telugu", "mr-IN": "Marathi", "gu-IN": "Gujarati",
    "bn-IN": "Bengali", "kn-IN": "Kannada", "ml-IN": "Malayalam",
    "pa-IN": "Punjabi",
  };
  return map[code] ?? code;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

// ── sample tile ─────────────────────────────────────────────────────────────
// Rendered in the empty state so RMs can see the shape of a card without
// waiting for the first real handoff. Matches the SAMPLE_CARD on the public
// /handoff/sample preview page so they tell a consistent story.

const SAMPLE_HANDOFF: Handoff = {
  id: "hand_sample",
  call_id: "call_sample",
  lead_id: "lead_sample",
  agent_id: null,
  agent_name: "Priya",
  score: "HOT",
  channel: "call",
  rm_phone: null,
  card_token: "sample",
  status: "sent",
  error: null,
  twilio_sid: null,
  created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  sent_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  opened_at: null,
  lead_name: "Rajesh Kumar",
  lead_phone: "+91 98765 43210",
  language_pref: "hi-IN",
  call_summary: null,
  duration_seconds: 272,
  key_signal:
    "Asked twice about how soon he can start — and mentioned a friend who "
    + "also wants to join.",
  interest_level: 8,
  sentiment: "positive",
};
