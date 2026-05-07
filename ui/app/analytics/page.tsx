"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { api, Analytics, KpiBucket } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const STAGE_ORDER = [
  "queued", "dialing", "ringing", "picked",
  "agent_spoke", "user_spoke", "completed",
];
const STAGE_LABEL: Record<string, string> = {
  queued: "Queued", dialing: "Dialed", ringing: "Ringing", picked: "Picked up",
  agent_spoke: "Agent spoke", user_spoke: "Lead spoke", completed: "Completed",
};

const TOOLTIP_BG = { backgroundColor: "#13161b", border: "1px solid #23272f", borderRadius: 8 };

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api.analytics(14).then((d) => live && setData(d)).catch((e) => setErr(e?.message));
    load();
    const t = setInterval(load, 8000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (err)  return <div className="text-hot text-sm">{err}</div>;
  if (!data) return <div className="text-ink-mute text-sm">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-ink-mute mt-1">
            Last 14 days · KPI deltas compare last {data.kpi.window_days} days vs prior {data.kpi.window_days} · refreshes every 8 seconds
          </p>
        </div>
      </div>

      <KpiStrip kpi={data.kpi} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Calls per day</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <AreaChart data={data.calls_by_day} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#5eead4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5eead4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#23272f" vertical={false} />
                  <XAxis dataKey="day" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false}
                         tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_BG} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#8a92a0" }} />
                  <Area type="monotone" dataKey="total" stroke="#5eead4" strokeWidth={2}
                        fill="url(#totalGrad)" name="Total" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <ScoreDonut data={data} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <StageFunnel data={data} />
        <DurationByScore data={data} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <LanguageBreakdown data={data} />
        <HourOfDay data={data} />
      </div>
    </div>
  );
}

// ---------- KPI strip ------------------------------------------------------

function KpiStrip({ kpi }: { kpi: Analytics["kpi"] }) {
  const items: { label: string; key: keyof KpiBucket; format?: (v: number) => string; tone?: "hot" | "warm" }[] = [
    { label: "Total calls",     key: "total" },
    { label: "Hot leads",       key: "hot",          tone: "hot" },
    { label: "Warm leads",      key: "warm",         tone: "warm" },
    { label: "Pickup rate",     key: "pickup_rate",  format: (v) => `${v.toFixed(1)}%` },
    { label: "Avg call length", key: "avg_duration", format: (v) => fmtDur(v) },
    { label: "Completed",       key: "completed" },
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((it) => {
        const cur  = kpi.current[it.key]  ?? 0;
        const prev = kpi.previous[it.key] ?? 0;
        const display = it.format ? it.format(Number(cur)) : String(cur);
        const delta = computeDelta(Number(cur), Number(prev));
        return (
          <Card key={it.label}>
            <CardContent>
              <div className="text-[11px] uppercase tracking-wider text-ink-mute">{it.label}</div>
              <div className={
                "mt-1 text-2xl font-semibold " +
                (it.tone === "hot" ? "text-hot" : it.tone === "warm" ? "text-warm" : "text-ink-text")
              }>
                {display}
              </div>
              <DeltaPill delta={delta} prev={prev} format={it.format} />
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function DeltaPill({ delta, prev, format }: { delta: { dir: "up" | "down" | "flat"; pct: number; abs: number }; prev: number; format?: (v: number) => string }) {
  const tone =
    delta.dir === "up"  ? "text-accent"
  : delta.dir === "down" ? "text-hot"
  : "text-ink-mute";
  const Icon = delta.dir === "up" ? ArrowUp : delta.dir === "down" ? ArrowDown : Minus;
  const prevDisplay = format ? format(prev) : String(prev);
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
      <span className={`inline-flex items-center gap-0.5 ${tone} font-semibold`}>
        <Icon size={11} />
        {delta.pct === Infinity ? "new" : `${delta.pct.toFixed(0)}%`}
      </span>
      <span className="text-ink-mute">vs {prevDisplay}</span>
    </div>
  );
}

// ---------- Stage funnel with conversion % --------------------------------

function StageFunnel({ data }: { data: Analytics }) {
  const stages = STAGE_ORDER.map((s, i) => {
    const count = data.stage_funnel[s] ?? 0;
    const prev = i > 0 ? (data.stage_funnel[STAGE_ORDER[i - 1]] ?? 0) : count;
    const conversion = prev > 0 ? (count / prev) * 100 : 0;
    return { stage: STAGE_LABEL[s] ?? s, count, conversion: i === 0 ? 100 : conversion };
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Stage funnel</CardTitle>
        <p className="text-xs text-ink-mute mt-1">Step-to-step conversion across the call lifecycle.</p>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={stages} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#23272f" vertical={false} />
              <XAxis dataKey="stage" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_BG}
                cursor={{ fill: "#23272f" }}
                formatter={(v: any, name: string, p: any) =>
                  name === "count" ? [`${v} calls`, "Reached"] : [`${(p.payload.conversion as number).toFixed(0)}%`, "Conversion from previous"]
                }
              />
              <Bar dataKey="count" fill="#5eead4" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-mute">
          {stages.slice(1).map((s, i) => (
            <span key={s.stage}>
              <span className="text-ink-text">{STAGE_LABEL[STAGE_ORDER[i]]}</span>{" → "}
              <span className="text-ink-text">{s.stage}</span>:{" "}
              <span className="text-accent font-mono">{s.conversion.toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Score donut ---------------------------------------------------

function ScoreDonut({ data }: { data: Analytics }) {
  const pie = [
    { name: "Hot",  value: data.score_split.hot,  fill: "#f87171" },
    { name: "Warm", value: data.score_split.warm, fill: "#fbbf24" },
    { name: "Cold", value: data.score_split.cold, fill: "#60a5fa" },
  ].filter((d) => d.value > 0);
  const total = pie.reduce((a, b) => a + b.value, 0);

  return (
    <Card>
      <CardHeader><CardTitle>Score split</CardTitle></CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} isAnimationActive={false}>
                {pie.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12, color: "#8a92a0" }} />
              <Tooltip contentStyle={TOOLTIP_BG} formatter={(v: any) => [`${v} calls`, ""]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="-mt-6 text-center">
          <div className="text-[11px] uppercase tracking-wider text-ink-mute">Total scored</div>
          <div className="font-serif text-2xl text-ink-text">{total}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Duration by score --------------------------------------------

function DurationByScore({ data }: { data: Analytics }) {
  const ORDER = ["HOT", "WARM", "COLD", "UNSCORED"];
  const COLORS: Record<string, string> = { HOT: "#f87171", WARM: "#fbbf24", COLD: "#60a5fa", UNSCORED: "#475569" };
  const rows = ORDER.map((s) => data.duration_by_score.find((r) => r.score === s)).filter(Boolean) as Analytics["duration_by_score"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avg call length by score</CardTitle>
        <p className="text-xs text-ink-mute mt-1">Hot calls last longer — engagement correlates with conversion.</p>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#23272f" horizontal={false} />
              <XAxis type="number" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false}
                     tickFormatter={(v: any) => fmtDur(v)} />
              <YAxis type="category" dataKey="score" stroke="#8a92a0" fontSize={12} tickLine={false} axisLine={false} width={70} />
              <Tooltip contentStyle={TOOLTIP_BG}
                       formatter={(v: any, _n: string, p: any) => [`${fmtDur(Number(v))} (${p.payload.n} calls)`, "Avg length"]} />
              <Bar dataKey="avg_duration" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((r) => <Cell key={r.score} fill={COLORS[r.score] ?? "#5eead4"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Language breakdown ------------------------------------------

function LanguageBreakdown({ data }: { data: Analytics }) {
  const rows = data.language_breakdown.slice(0, 9);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Language mix</CardTitle>
        <p className="text-xs text-ink-mute mt-1">Calls grouped by lead language preference, with score split.</p>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#23272f" vertical={false} />
              <XAxis dataKey="language" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_BG} cursor={{ fill: "#23272f" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#8a92a0" }} />
              <Bar dataKey="hot"  stackId="a" fill="#f87171" name="Hot"  radius={[0, 0, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="warm" stackId="a" fill="#fbbf24" name="Warm" isAnimationActive={false} />
              <Bar dataKey="cold" stackId="a" fill="#60a5fa" name="Cold" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Hour-of-day --------------------------------------------------

function HourOfDay({ data }: { data: Analytics }) {
  // Fill in missing hours with zeros so the chart shows a continuous 0-23
  const filled: { hour: string; total: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const found = data.hour_of_day.find((r) => r.hour === h);
    filled.push({ hour: String(h).padStart(2, "0"), total: found?.total ?? 0 });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calls by hour</CardTitle>
        <p className="text-xs text-ink-mute mt-1">When pickups happen — pick your dial window.</p>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={filled} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#23272f" vertical={false} />
              <XAxis dataKey="hour" stroke="#8a92a0" fontSize={10} tickLine={false} axisLine={false}
                     interval={2} />
              <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_BG} cursor={{ fill: "#23272f" }}
                       formatter={(v: any, _n: string, p: any) => [`${v} calls at ${p.payload.hour}:00`, ""]} />
              <Bar dataKey="total" fill="#5eead4" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- helpers -------------------------------------------------------

function computeDelta(cur: number, prev: number): { dir: "up" | "down" | "flat"; pct: number; abs: number } {
  const abs = cur - prev;
  if (prev === 0 && cur === 0) return { dir: "flat", pct: 0, abs };
  if (prev === 0)              return { dir: "up",   pct: Infinity, abs };
  const pct = (abs / prev) * 100;
  if (Math.abs(pct) < 0.5)     return { dir: "flat", pct: 0, abs };
  return { dir: pct > 0 ? "up" : "down", pct: Math.abs(pct), abs };
}

function fmtDur(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
