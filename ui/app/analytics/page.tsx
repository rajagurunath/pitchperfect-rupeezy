"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, Analytics } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const STAGE_ORDER = [
  "queued", "dialing", "ringing", "picked",
  "agent_spoke", "user_spoke", "completed",
];
const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  dialing: "Dialed",
  ringing: "Ringing",
  picked: "Picked up",
  agent_spoke: "Agent spoke",
  user_spoke: "Lead spoke",
  completed: "Completed",
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

  if (err) return <div className="text-hot text-sm">{err}</div>;
  if (!data) return <div className="text-ink-mute text-sm">Loading…</div>;

  const stageBars = STAGE_ORDER.map((s) => ({
    stage: STAGE_LABEL[s] ?? s,
    count: data.stage_funnel[s] ?? 0,
  }));

  const scorePie = [
    { name: "Hot",  value: data.score_split.hot,  fill: "#f87171" },
    { name: "Warm", value: data.score_split.warm, fill: "#fbbf24" },
    { name: "Cold", value: data.score_split.cold, fill: "#60a5fa" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-ink-mute mt-1">Last 14 days. Refreshes every 8 seconds.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Stage funnel</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={stageBars} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#23272f" vertical={false} />
                  <XAxis dataKey="stage" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_BG} cursor={{ fill: "#23272f" }} />
                  <Bar dataKey="count" fill="#5eead4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Score split</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={scorePie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {scorePie.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, color: "#8a92a0" }} />
                  <Tooltip contentStyle={TOOLTIP_BG} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Calls per day</CardTitle></CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data.calls_by_day} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#23272f" vertical={false} />
                <XAxis dataKey="day" stroke="#8a92a0" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8a92a0" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_BG} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8a92a0" }} />
                <Line type="monotone" dataKey="total" stroke="#5eead4" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="hot"   stroke="#f87171" strokeWidth={2} dot={false} name="Hot" />
                <Line type="monotone" dataKey="warm"  stroke="#fbbf24" strokeWidth={2} dot={false} name="Warm" />
                <Line type="monotone" dataKey="cold"  stroke="#60a5fa" strokeWidth={2} dot={false} name="Cold" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
