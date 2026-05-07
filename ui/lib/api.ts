// Tiny typed API client. All paths are relative — Next's rewrites proxy
// /api/* to the FastAPI server. Every request carries the JWT from
// localStorage so the backend's require_user dependency is happy.

import { clearSession, getToken } from "@/lib/auth";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  language_pref: string | null;
  voice_id: string | null;
  notes: string | null;
  status: "queued" | "calling" | "done" | "dnd";
  created_at: string;
  updated_at: string;
};

export type Voice = { voice_id: string; name: string; description: string };
export type VoiceCatalog = { default_voice_id: string; voices: Voice[] };

export type CallEvent = {
  id: number;
  stage: string;
  detail: string | null;
  ts: string;
};

export type KpiBucket = {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  completed: number;
  avg_duration: number;
  pickup_rate: number;
};

export type Analytics = {
  stage_funnel: Record<string, number>;
  calls_by_day: { day: string; total: number; hot: number; warm: number; cold: number }[];
  score_split: { hot: number; warm: number; cold: number };
  kpi: { window_days: number; current: KpiBucket; previous: KpiBucket };
  language_breakdown: { language: string; total: number; hot: number; warm: number; cold: number }[];
  duration_by_score: { score: string; n: number; avg_duration: number }[];
  hour_of_day: { hour: number; total: number; completed: number }[];
};

export type Call = {
  id: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  twilio_sid: string | null;
  status: string;
  score: "HOT" | "WARM" | "COLD" | null;
  summary: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  // Latest stage event from call_events; used to render compact DAG pills
  // without N+1 calls. Null = no events yet (just queued).
  last_stage: string | null;
};

export type CallDetail = Call & {
  transcript: { id: number; speaker: "user" | "agent"; text: string; language: string | null; ts: string }[];
  events: CallEvent[];
};

export type FunnelMetrics = {
  leads_total: number;
  contacted: number;
  completed: number;
  hot: number;
  warm: number;
  cold: number;
};

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

async function asJson<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (r.status === 401) {
    // Session expired or no token — drop it and let the guard redirect.
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
    throw new Error("not authenticated");
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${body}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => asJson<{ status: string; agent_name: string; agent_brand: string; model: string }>(
    fetch("/api/health"),
  ),
  dashboard: () =>
    asJson<FunnelMetrics>(fetch("/api/dashboard", { cache: "no-store", headers: authHeaders() })),
  leads: (status?: string) =>
    asJson<Lead[]>(
      fetch(`/api/leads${status ? `?status=${status}` : ""}`, { cache: "no-store", headers: authHeaders() }),
    ),
  createLead: (body: { name: string; phone: string; language_pref?: string; voice_id?: string; notes?: string }) =>
    asJson<Lead>(
      fetch("/api/leads", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) }),
    ),
  voices: () => asJson<VoiceCatalog>(fetch("/api/voices", { headers: authHeaders() })),
  analytics: (days = 14) =>
    asJson<Analytics>(fetch(`/api/analytics?days=${days}`, { cache: "no-store", headers: authHeaders() })),
  uploadCsv: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return asJson<{ inserted: number; skipped: string[] }>(
      fetch("/api/leads/upload", { method: "POST", body: fd, headers: authHeaders() }),
    );
  },
  deleteLead: async (id: string) => {
    const r = await fetch(`/api/leads/${id}`, { method: "DELETE", headers: authHeaders() });
    if (r.status === 401) { clearSession(); window.location.replace("/login"); throw new Error("auth"); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  },
  callLead: (id: string) =>
    asJson<{ call_id: string; twilio_sid: string; lead_id: string }>(
      fetch(`/api/leads/${id}/call`, { method: "POST", headers: authHeaders() }),
    ),
  callBatch: (limit = 10) =>
    asJson<{ placed: any[] }>(
      fetch(`/api/calls/batch?limit=${limit}`, { method: "POST", headers: authHeaders() }),
    ),
  calls: (params?: { lead_id?: string; score?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return asJson<Call[]>(
      fetch(`/api/calls?${qs.toString()}`, { cache: "no-store", headers: authHeaders() }),
    );
  },
  call: (id: string) =>
    asJson<CallDetail>(fetch(`/api/calls/${id}`, { cache: "no-store", headers: authHeaders() })),
  analyze: (id: string) =>
    asJson<any>(fetch(`/api/calls/${id}/analyze`, { method: "POST", headers: authHeaders() })),
};
