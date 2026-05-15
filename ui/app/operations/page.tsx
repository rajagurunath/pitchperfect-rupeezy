"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Analytics, Call, FunnelMetrics, Handoff } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, ScoreBadge, Button } from "@/components/ui";
import { MiniDAG, PipelineDAG } from "@/components/pipeline";
import { formatDuration, formatTime } from "@/lib/utils";

export default function Operations() {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [handoffsToday, setHandoffsToday] = useState<number>(0);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setErr(null);
      const [m, a, c, ht, hs] = await Promise.all([
        api.dashboard(),
        api.analytics(14),
        api.calls(),
        api.handoffsToday().catch(() => ({ count: 0 })),
        api.listHandoffs(7).catch(() => [] as Handoff[]),
      ]);
      setMetrics(m);
      setAnalytics(a);
      setCalls(c);
      setHandoffsToday(ht.count);
      setHandoffs(hs);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-sm text-ink-mute mt-1">
            Live pipeline — refreshes every 5 seconds.
          </p>
        </div>
      </div>

      {err && (
        <Card><CardContent className="text-hot text-sm">API error: {err}</CardContent></Card>
      )}

      <section className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Metric label="Leads"      value={metrics?.leads_total ?? "—"} />
        <Metric label="Contacted"  value={metrics?.contacted ?? "—"} />
        <Metric label="Completed"  value={metrics?.completed ?? "—"} />
        <Metric label="Hot"  value={metrics?.hot ?? "—"}  tone="hot" />
        <Metric label="Warm" value={metrics?.warm ?? "—"} tone="warm" />
        <Metric label="Cold" value={metrics?.cold ?? "—"} tone="cold" />
        <Metric label="RM handoffs today" value={handoffsToday} tone="hot" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Call pipeline</CardTitle>
          <p className="text-xs text-ink-mute mt-1">
            Aggregate flow of all calls through the lifecycle stages. Hover any
            block for what it means. Failure branches appear below when
            calls drop off.
          </p>
        </CardHeader>
        <CardContent>
          <PipelineDAG counts={analytics?.stage_funnel ?? {}} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent calls</CardTitle>
          <Link href="/calls" className="text-xs text-accent hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {calls.length === 0 ? (
            <div className="p-6 text-sm text-ink-mute">
              No calls yet. <Link href="/leads" className="text-accent hover:underline">Upload some leads</Link> to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-ink-mute text-xs">
                <tr className="border-b border-ink-line">
                  <th className="px-4 py-2 font-medium">Lead</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Stage path</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {calls.slice(0, 12).map((c) => (
                  <tr key={c.id} className="border-b border-ink-line hover:bg-ink-line/40">
                    <td className="px-4 py-2.5">{c.lead_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.lead_phone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <MiniDAG lastStage={c.last_stage} />
                    </td>
                    <td className="px-4 py-2.5"><ScoreBadge score={c.score} /></td>
                    <td className="px-4 py-2.5 text-ink-mute">{formatDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-2.5 text-ink-mute">{formatTime(c.started_at ?? c.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/calls/${c.id}`} className="text-accent hover:underline text-xs">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Recent RM handoffs</CardTitle>
            <p className="text-xs text-ink-mute mt-1">
              Latest context cards sent to the human RM. Full gallery on the
              Handoffs page.
            </p>
          </div>
          <Link href="/handoffs" className="text-xs text-accent hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {handoffs.length === 0 ? (
            <div className="p-6 text-sm text-ink-mute">
              No handoffs yet. They appear automatically when a call is scored
              HOT or WARM.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-ink-mute text-xs">
                <tr className="border-b border-ink-line">
                  <th className="px-4 py-2 font-medium">Lead</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Agent</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {handoffs.slice(0, 5).map((h) => (
                  <tr key={h.id} className="border-b border-ink-line hover:bg-ink-line/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/calls/${h.call_id}`} className="hover:text-accent">
                        {h.lead_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><ScoreBadge score={h.score} /></td>
                    <td className="px-4 py-2.5 text-ink-mute capitalize">
                      {h.channel === "call" ? "Call back" : "WhatsApp"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-mute">
                      {h.agent_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <HandoffStatusPill status={h.status} />
                    </td>
                    <td className="px-4 py-2.5 text-ink-mute">
                      {h.sent_at ? formatTime(h.sent_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HandoffStatusPill({ status }: { status: Handoff["status"] }) {
  const styles: Record<Handoff["status"], string> = {
    pending: "bg-ink-line text-ink-mute",
    sent:    "bg-accent-soft text-accent border border-accent/30",
    opened:  "bg-hot-soft text-hot border border-hot/30",
    failed:  "bg-cold-soft text-cold border border-cold/30",
  };
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium " +
        (styles[status] ?? "bg-ink-line")
      }
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "hot" | "warm" | "cold" }) {
  const toneCls =
    tone === "hot" ? "text-hot" :
    tone === "warm" ? "text-warm" :
    tone === "cold" ? "text-cold" : "text-ink-text";
  return (
    <Card>
      <CardContent>
        <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
