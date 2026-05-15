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
  agent_name: string | null;
  agent_id: string | null;
  notes: string | null;
  opening_line: string | null;
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
  createLead: (body: { name: string; phone: string; language_pref?: string; voice_id?: string; agent_name?: string; agent_id?: string; notes?: string; opening_line?: string }) =>
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
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null)
      ) as Record<string, string>
    );
    const search = qs.toString();
    return asJson<Call[]>(
      fetch(`/api/calls${search ? `?${search}` : ""}`, { cache: "no-store", headers: authHeaders() }),
    );
  },
  call: (id: string) =>
    asJson<CallDetail>(fetch(`/api/calls/${id}`, { cache: "no-store", headers: authHeaders() })),
  analyze: (id: string) =>
    asJson<any>(fetch(`/api/calls/${id}/analyze`, { method: "POST", headers: authHeaders() })),

  // ── Campaign Studio · Simulator ─────────────────────────────────────────
  simulateText: (body: {
    persona: SimulatePersona;
    history: { role: "agent" | "lead"; content: string }[];
    message?: string;
    trial_id?: string;
    agent_id?: string;
  }) =>
    asJson<{ reply: string; language: string | null; model: string; trial_id: string | null }>(
      fetch("/api/simulate/text", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      }),
    ),

  simulateTextEnd: (trial_id: string) =>
    fetch("/api/simulate/text/end", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ trial_id }),
    }).catch(() => undefined),

  simulatePreviewPrompt: (persona: SimulatePersona) =>
    asJson<{ system_prompt: string }>(
      fetch("/api/simulate/preview-prompt", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(persona),
      }),
    ),

  // ── Handoffs (RM context card) ──────────────────────────────────────────
  triggerHandoff: (callId: string) =>
    asJson<Handoff>(fetch(`/api/calls/${callId}/handoff`, {
      method: "POST", headers: authHeaders(),
    })),
  listHandoffs: (sinceDays?: number) =>
    asJson<Handoff[]>(fetch(
      sinceDays ? `/api/handoffs?since_days=${sinceDays}` : "/api/handoffs",
      { cache: "no-store", headers: authHeaders() },
    )),
  handoffsToday: () =>
    asJson<{ count: number }>(fetch("/api/handoffs/today", {
      cache: "no-store", headers: authHeaders(),
    })),
  whatsappConfig: () =>
    asJson<{ from_number: string }>(fetch("/api/whatsapp/config", { headers: authHeaders() })),
  sendWhatsApp: (body: { from_number: string; to_number: string; message: string }) =>
    asJson<{ sid: string; status: string }>(
      fetch("/api/whatsapp/send", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) }),
    ),
};

export type Handoff = {
  id: string;
  call_id: string;
  lead_id: string;
  agent_id: string | null;
  agent_name: string | null;
  score: "HOT" | "WARM" | null;
  channel: "call" | "whatsapp";
  rm_phone: string | null;
  card_token: string;
  status: "pending" | "sent" | "failed" | "opened";
  error: string | null;
  twilio_sid: string | null;
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  language_pref?: string | null;
  // Joined from the originating call's analysis — used by the Handoffs gallery
  call_summary?: string | null;
  duration_seconds?: number | null;
  key_signal?: string | null;
  interest_level?: number | null;
  sentiment?: "positive" | "neutral" | "negative" | null;
};

export type SimulatePersona = {
  agent_name?: string;
  brand?: string;
  language_pref?: string;
  voice_id?: string;
  lead_name?: string;
  lead_notes?: string;
  opener_variant?: "benefits" | "social_proof" | "question";
  custom_opener?: string;
};

// ── Campaign Studio · Saved agents ────────────────────────────────────────
export type Agent = {
  id: string;
  name: string;
  description: string | null;
  agent_name: string | null;
  brand: string | null;
  voice_id: string | null;
  language_pref: string | null;
  opener_variant: "benefits" | "social_proof" | "question" | null;
  custom_opener: string | null;
  system_prompt: string | null;
  version: number;
  is_default: 0 | 1;
  mlflow_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentInput = Partial<
  Omit<
    Agent,
    "id" | "version" | "mlflow_run_id" | "created_at" | "updated_at" | "is_default"
  >
> & {
  name: string;
  is_default?: boolean;
};

export const agentsApi = {
  list: () => asJson<Agent[]>(fetch("/api/agents", {
    cache: "no-store", headers: authHeaders(),
  })),
  get: (id: string) => asJson<Agent>(fetch(`/api/agents/${id}`, {
    cache: "no-store", headers: authHeaders(),
  })),
  create: (body: AgentInput) => asJson<Agent>(fetch("/api/agents", {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify(body),
  })),
  update: (id: string, body: AgentInput) => asJson<Agent>(fetch(`/api/agents/${id}`, {
    method: "PUT", headers: jsonHeaders(), body: JSON.stringify(body),
  })),
  remove: async (id: string) => {
    const r = await fetch(`/api/agents/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  },
  versions: (id: string) =>
    asJson<AgentVersion[]>(fetch(`/api/agents/${id}/versions`, {
      cache: "no-store", headers: authHeaders(),
    })),
  versionPrompt: (id: string, runId: string) =>
    asJson<{ run_id: string; system_prompt: string }>(
      fetch(`/api/agents/${id}/versions/${runId}/prompt`, {
        cache: "no-store", headers: authHeaders(),
      }),
    ),
};

// ── Studio prompt history (MLflow-backed) ─────────────────────────────────
export type AgentVersion = {
  run_id: string;
  run_name: string;
  started_at: number;
  version: number;
  change: string;
  voice_id: string;
  language_pref: string;
  opener_variant: string;
};

export type StudioTrial = {
  run_id: string;
  started_at: number;
  mode: "text" | "voice" | string;
  agent_id: string;
  agent_name: string;
  language_pref: string;
  voice_id: string;
  turn_count: number;
};

export const studioApi = {
  trials: (agent_id?: string) =>
    asJson<StudioTrial[]>(
      fetch(
        agent_id
          ? `/api/studio/trials?agent_id=${encodeURIComponent(agent_id)}`
          : "/api/studio/trials",
        { cache: "no-store", headers: authHeaders() },
      ),
    ),
};
