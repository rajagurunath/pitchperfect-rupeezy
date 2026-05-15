"use client";

// Campaign Studio — Simulator
// ────────────────────────────────────────────────────────────────────────────
// Three-pane layout (config / canvas / transcript). The RM previews an
// agent persona against themselves — no real call placed, no DB rows
// written. Two transports share the same prompts.py + LLM:
//   * Text mode  → POST /api/simulate/text  (stateless turn API)
//   * Voice mode → POST /api/simulate/voice/offer  (Pipecat SmallWebRTC)
//
// Voice mode uses @pipecat-ai/voice-ui-kit's PipecatAppBase to wire the
// browser to the FastAPI WebRTC endpoint. The kit gives us:
//   - <VoiceVisualizer> animated bars synced to bot audio
//   - <UserAudioControl> mic toggle + device picker
//   - usePipecatConversation() — streaming agent transcript

import { useEffect, useRef, useState } from "react";
import { api, agentsApi, studioApi, Agent, AgentVersion, SimulatePersona, StudioTrial } from "@/lib/api";
import { loadCampaigns, type Campaign } from "@/lib/campaigns";
import { getToken } from "@/lib/auth";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import {
  UserAudioControl,
  usePipecatConversation,
  usePipecatConnectionState,
  type ConversationMessage,
} from "@pipecat-ai/voice-ui-kit";
import { AuraVisualizer } from "@/components/aura-visualizer";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import {
  PipecatClientProvider,
  PipecatClientAudio,
  usePipecatClient,
} from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
// Voice-UI-Kit CSS is pulled in via app/globals.css (via @import) so its
// `@layer base` directive shares the Tailwind context — importing it from
// a client component in isolation breaks Next.js's per-chunk CSS pipeline.

// ── form types ───────────────────────────────────────────────────────────────

type Mode = "text" | "voice";

type ChatTurn = { role: "agent" | "lead"; content: string };

const DEFAULT_PERSONA: SimulatePersona = {
  agent_name: "Priya",
  brand: "Rupeezy",
  language_pref: "hi-IN",
  voice_id: "kavya",
  opener_variant: "benefits",
  custom_opener: "",
  lead_name: "",
  lead_notes: "",
};

const LANGUAGES = [
  { value: "hi-IN", label: "Hindi (hi-IN)" },
  { value: "en-IN", label: "English (en-IN)" },
  { value: "ta-IN", label: "Tamil (ta-IN)" },
  { value: "te-IN", label: "Telugu (te-IN)" },
  { value: "mr-IN", label: "Marathi (mr-IN)" },
  { value: "gu-IN", label: "Gujarati (gu-IN)" },
  { value: "bn-IN", label: "Bengali (bn-IN)" },
  { value: "kn-IN", label: "Kannada (kn-IN)" },
  { value: "ml-IN", label: "Malayalam (ml-IN)" },
  { value: "pa-IN", label: "Punjabi (pa-IN)" },
];


const OPENERS = [
  { value: "benefits", label: "Lead with benefits (100% brokerage + daily payout)" },
  { value: "social_proof", label: "Social proof (1000+ APs already onboarded)" },
  { value: "question", label: "Curiosity question (current brokerage rate?)" },
];

const TONE_VOICES: { gender: "F" | "M"; tone: string; voice: string }[] = [
  { gender: "F", tone: "warm",          voice: "kavya" },
  { gender: "F", tone: "neutral",       voice: "priya" },
  { gender: "F", tone: "bright",        voice: "neha" },
  { gender: "F", tone: "calm",          voice: "pooja" },
  { gender: "F", tone: "energetic",     voice: "ritu" },
  { gender: "M", tone: "neutral",       voice: "shubh" },
  { gender: "M", tone: "friendly",      voice: "rahul" },
  { gender: "M", tone: "authoritative", voice: "amit" },
  { gender: "M", tone: "warm",          voice: "kabir" },
];

function voiceLabel(voiceId: string | null | undefined): string {
  const entry = TONE_VOICES.find((t) => t.voice === voiceId);
  if (!entry) return voiceId ?? "";
  const gender = entry.gender === "F" ? "Female" : "Male";
  const tone = entry.tone.charAt(0).toUpperCase() + entry.tone.slice(1);
  return `${gender} · ${tone}`;
}

// ── page shell ──────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const [mode, setMode] = useState<Mode>("text");
  const [persona, setPersona] = useState<SimulatePersona>(DEFAULT_PERSONA);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadedAgentId, setLoadedAgentId] = useState<string | null>(null);

  async function refreshAgents() {
    try { setAgents(await agentsApi.list()); }
    catch (e) { console.warn("agents list failed:", e); }
  }
  useEffect(() => { refreshAgents(); }, []);

  function loadAgent(a: Agent) {
    setLoadedAgentId(a.id);
    setPersona({
      agent_name:     a.agent_name ?? "",
      brand:          a.brand ?? "Rupeezy",
      voice_id:       a.voice_id ?? "kavya",
      language_pref:  a.language_pref ?? "hi-IN",
      opener_variant: (a.opener_variant as any) ?? "benefits",
      custom_opener:  a.custom_opener ?? "",
      lead_name:      persona.lead_name ?? "",
      lead_notes:     persona.lead_notes ?? "",
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-mute">
            Campaign Studio
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Simulator
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Train an agent end-to-end, save it, then assign it to leads from
            the Leads page. Same prompt, LLM, voice, and qualification logic
            production calls use — but no real lead is dialed.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-ink-line bg-ink p-1 text-sm">
          <ModeTab active={mode === "text"} onClick={() => setMode("text")}>
            Text chat
          </ModeTab>
          <ModeTab active={mode === "voice"} onClick={() => setMode("voice")}>
            Live voice
          </ModeTab>
        </div>
      </header>

      <AgentSwitcher
        agents={agents}
        loadedAgentId={loadedAgentId}
        persona={persona}
        onLoad={loadAgent}
        onAfterSave={async (a) => {
          await refreshAgents();
          setLoadedAgentId(a.id);
        }}
        onAfterDelete={async () => {
          setLoadedAgentId(null);
          await refreshAgents();
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PersonaSidebar persona={persona} onChange={setPersona} agents={agents} onLoadAgent={loadAgent} />

        {mode === "text" ? (
          <TextStage persona={persona} agentId={loadedAgentId} />
        ) : (
          <VoiceStage persona={persona} />
        )}
      </div>

      <RuntimePromptPreview persona={persona} />
      <PromptsPanel agentId={loadedAgentId} />
    </div>
  );
}

// ── agent switcher (load / save / delete) ───────────────────────────────────

function AgentSwitcher({
  agents,
  loadedAgentId,
  persona,
  onLoad,
  onAfterSave,
  onAfterDelete,
}: {
  agents: Agent[];
  loadedAgentId: string | null;
  persona: SimulatePersona;
  onLoad: (a: Agent) => void;
  onAfterSave: (a: Agent) => Promise<void>;
  onAfterDelete: () => Promise<void>;
}) {
  const loaded = agents.find((a) => a.id === loadedAgentId) ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // — create form state —
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [createGender, setCreateGender] = useState<"F" | "M">("F");
  const [createTone, setCreateTone] = useState("neutral");

  // — edit form state —
  const [showEdit, setShowEdit] = useState(false);
  const [editGender, setEditGender] = useState<"F" | "M">("F");
  const [editTone, setEditTone] = useState("neutral");

  const tonesForGender = TONE_VOICES.filter((t) => t.gender === createGender).map((t) => t.tone);
  const tonesForEditGender = TONE_VOICES.filter((t) => t.gender === editGender).map((t) => t.tone);

  const resolvedVoice = TONE_VOICES.find(
    (t) => t.gender === createGender && t.tone === createTone
  )?.voice ?? "kavya";
  const resolvedEditVoice = TONE_VOICES.find(
    (t) => t.gender === editGender && t.tone === editTone
  )?.voice ?? loaded?.voice_id ?? "kavya";

  function handleGenderChange(g: "F" | "M") {
    setCreateGender(g);
    setCreateTone(TONE_VOICES.find((t) => t.gender === g)?.tone ?? "neutral");
  }

  function handleEditGenderChange(g: "F" | "M") {
    setEditGender(g);
    setEditTone(TONE_VOICES.find((t) => t.gender === g)?.tone ?? "neutral");
  }

  function openEdit() {
    if (!loaded) return;
    const entry = TONE_VOICES.find((t) => t.voice === loaded.voice_id);
    setEditGender(entry?.gender ?? "F");
    setEditTone(entry?.tone ?? "neutral");
    setShowEdit(true);
  }

  function personaToAgentFields() {
    return {
      agent_name:     persona.agent_name || null,
      brand:          persona.brand || null,
      voice_id:       resolvedVoice,
      language_pref:  persona.language_pref || null,
      opener_variant: persona.opener_variant || null,
      custom_opener:  persona.custom_opener || null,
    };
  }

  async function createAgent() {
    setBusy(true); setErr(null);
    try {
      const created = await agentsApi.create({
        name: newName.trim(),
        ...personaToAgentFields(),
        is_default: makeDefault,
      });
      await onAfterSave(created);
      setShowCreate(false);
      setNewName("");
      setMakeDefault(false);
      setCreateGender("F");
      setCreateTone("neutral");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  async function updateAgent() {
    if (!loaded) return;
    setBusy(true); setErr(null);
    try {
      const updated = await agentsApi.update(loaded.id, {
        name: loaded.name,
        voice_id: resolvedEditVoice,
      });
      await onAfterSave(updated);
      setShowEdit(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  async function destroy() {
    if (!loaded) return;
    if (!confirm(`Delete agent "${loaded.name}"? Leads using it will fall back to the default agent.`)) return;
    setBusy(true); setErr(null);
    try {
      await agentsApi.remove(loaded.id);
      await onAfterDelete();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        {/* Select existing */}
        <div className="flex flex-col">
          <Label className="text-[10px] uppercase tracking-widest text-ink-mute">
            Select agent
          </Label>
          <select
            value={loadedAgentId ?? ""}
            onChange={(e) => {
              const a = agents.find((x) => x.id === e.target.value);
              if (a) onLoad(a);
            }}
            className="mt-1 min-w-[240px] rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
          >
            <option value="">— No agent loaded —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.is_default ? " ★" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grow" />

        <div className="flex items-center gap-2">
          {loaded && !showEdit && (
            <>
              <Button variant="secondary" disabled={busy} onClick={openEdit}>
                Edit
              </Button>
              <Button variant="ghost" disabled={busy} onClick={destroy} className="text-hot hover:text-hot">
                Delete
              </Button>
            </>
          )}
          {!showCreate && !showEdit && (
            <Button disabled={busy} onClick={() => setShowCreate(true)}>
              + New agent
            </Button>
          )}
        </div>

        {err && <div className="basis-full text-xs text-hot">{err}</div>}

        {showEdit && loaded && (
          <div className="basis-full pt-3 border-t border-ink-line/60 space-y-4">
            <div className="text-[10px] uppercase tracking-widest text-ink-mute">
              Editing: <span className="text-ink-text">{loaded.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs">
              <div className="flex flex-col">
                <Label className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">Gender</Label>
                <div className="flex rounded-md border border-ink-line overflow-hidden text-sm h-[38px]">
                  {(["F", "M"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleEditGenderChange(g)}
                      className={`flex-1 transition-colors ${
                        editGender === g
                          ? "bg-accent text-ink font-semibold"
                          : "bg-ink text-ink-mute hover:bg-ink-line"
                      }`}
                    >
                      {g === "F" ? "Female" : "Male"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col">
                <Label className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">Tone</Label>
                <select
                  value={editTone}
                  onChange={(e) => setEditTone(e.target.value)}
                  className="rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
                >
                  {tonesForEditGender.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button disabled={busy} onClick={updateAgent}>{busy ? "Saving…" : "Save changes"}</Button>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="basis-full pt-3 border-t border-ink-line/60 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Name */}
              <div className="flex flex-col lg:col-span-2">
                <Label className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">Agent name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Pooja"
                  autoFocus
                />
              </div>

              {/* Gender */}
              <div className="flex flex-col">
                <Label className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">Gender</Label>
                <div className="flex rounded-md border border-ink-line overflow-hidden text-sm h-[38px]">
                  {(["F", "M"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleGenderChange(g)}
                      className={`flex-1 transition-colors ${
                        createGender === g
                          ? "bg-accent text-ink font-semibold"
                          : "bg-ink text-ink-mute hover:bg-ink-line"
                      }`}
                    >
                      {g === "F" ? "Female" : "Male"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div className="flex flex-col">
                <Label className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">Tone</Label>
                <select
                  value={createTone}
                  onChange={(e) => setCreateTone(e.target.value)}
                  className="rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
                >
                  {tonesForGender.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-ink-text">
                <input
                  type="checkbox"
                  checked={makeDefault}
                  onChange={(e) => setMakeDefault(e.target.checked)}
                />
                Set as default agent for new leads
              </label>
              <div className="grow" />
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => { setShowCreate(false); setNewName(""); setMakeDefault(false); setCreateGender("F"); setCreateTone("neutral"); }}
              >
                Cancel
              </Button>
              <Button disabled={busy || !newName.trim()} onClick={createAgent}>
                {busy ? "Creating…" : "Create agent"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModeTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-1.5 rounded-md transition-colors " +
        (active
          ? "bg-accent text-ink shadow-sm"
          : "text-ink-mute hover:text-ink-text")
      }
    >
      {children}
    </button>
  );
}

// ── persona sidebar ─────────────────────────────────────────────────────────

function PersonaSidebar({
  persona,
  onChange,
  agents,
  onLoadAgent,
}: {
  persona: SimulatePersona;
  onChange: (p: SimulatePersona) => void;
  agents: Agent[];
  onLoadAgent: (a: Agent) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  useEffect(() => { setCampaigns(loadCampaigns()); }, []);

  function applyCampaign(id: string) {
    setSelectedCampaignId(id);
    if (!id) return;
    const c = campaigns.find((x) => x.id === id);
    if (!c) return;
    const context = [c.description, c.details].filter(Boolean).join("\n\n");
    onChange({ ...persona, lead_notes: context });
  }

  function set<K extends keyof SimulatePersona>(k: K, v: SimulatePersona[K]) {
    onChange({ ...persona, [k]: v });
  }

  return (
    <Card className="self-start sticky top-6">
      <CardHeader>
        <CardTitle>Campaign config</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Campaign">
          <Field label="Select campaign" hint="Loads campaign context into lead notes below.">
            <select
              value={selectedCampaignId}
              onChange={(e) => applyCampaign(e.target.value)}
              className="w-full rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
            >
              <option value="">— No campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Divider />

        <Section title="Persona">
          <Field label="Agent">
            <select
              value={agents.find((a) => a.agent_name === persona.agent_name)?.id ?? ""}
              onChange={(e) => {
                const a = agents.find((x) => x.id === e.target.value);
                if (a) onLoadAgent(a);
                else set("agent_name", "");
              }}
              className="w-full rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
            >
              <option value="">— Select agent —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.is_default ? " ★" : ""} · {voiceLabel(a.voice_id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <Select
              value={persona.language_pref ?? ""}
              onChange={(v) => set("language_pref", v)}
              options={LANGUAGES}
            />
          </Field>
        </Section>

        <Divider />

        <Section title="Script">
          <Field label="Opener style">
            <Select
              value={persona.opener_variant ?? "benefits"}
              onChange={(v) =>
                set("opener_variant", v as SimulatePersona["opener_variant"])
              }
              options={OPENERS}
            />
          </Field>
          <Field
            label="Custom opener"
            hint="If set, overrides the opener style above."
          >
            <Textarea
              rows={3}
              value={persona.custom_opener ?? ""}
              onChange={(e) => set("custom_opener", e.target.value)}
              placeholder="Namaste { name }, main Priya bol rahi hoon Rupeezy se…"
            />
          </Field>
        </Section>

        <Divider />

        <Section title="Lead context">
          <Field label="Lead name (optional)">
            <Input
              value={persona.lead_name ?? ""}
              onChange={(e) => set("lead_name", e.target.value)}
              placeholder="Mahima"
            />
          </Field>
          <Field
            label="Notes"
           
          >
            <Textarea
              rows={3}
              value={persona.lead_notes ?? ""}
              onChange={(e) => set("lead_notes", e.target.value)}
              placeholder="Existing trading account holder, signed up from Diwali campaign"
            />
          </Field>
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-widest text-ink-mute">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-ink-line" />;
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md bg-ink border border-ink-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── text stage ──────────────────────────────────────────────────────────────

function TextStage({
  persona,
  agentId,
}: {
  persona: SimulatePersona;
  agentId: string | null;
}) {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // One MLflow run per chat session — the id is generated on first send and
  // reused for every subsequent turn; reset/unmount closes the run.
  const trialIdRef = useRef<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, busy]);

  // Close the MLflow trial when the user leaves the page or switches mode.
  useEffect(() => {
    return () => {
      if (trialIdRef.current) {
        api.simulateTextEnd(trialIdRef.current);
        trialIdRef.current = null;
      }
    };
  }, []);

  async function send(message?: string) {
    setBusy(true);
    setErr(null);
    const userMsg = (message ?? input).trim();
    const nextHistory: ChatTurn[] = userMsg
      ? [...history, { role: "lead", content: userMsg }]
      : history;
    if (userMsg) {
      setHistory(nextHistory);
      setInput("");
    }
    if (!trialIdRef.current) {
      trialIdRef.current = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    try {
      const res = await api.simulateText({
        persona,
        history: nextHistory,
        message: undefined,  // message already appended to history
        trial_id: trialIdRef.current,
        agent_id: agentId ?? undefined,
      });
      setHistory([...nextHistory, { role: "agent", content: res.reply }]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setHistory([]);
    setErr(null);
    if (trialIdRef.current) {
      api.simulateTextEnd(trialIdRef.current);
      trialIdRef.current = null;
    }
  }

  const empty = history.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-h-[520px] flex flex-col">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Live conversation</CardTitle>
            <p className="text-xs text-ink-mute mt-0.5">
              You play the lead. Agent uses the configured persona + script.
            </p>
          </div>
          <Button variant="secondary" onClick={reset} disabled={empty}>
            Reset
          </Button>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-[320px] max-h-[60vh]">
            {empty ? (
              <EmptyState
                hint="Click Start to have the agent open the call in your configured language and persona."
                action={
                  <Button onClick={() => send()} disabled={busy}>
                    {busy ? "Starting…" : "Start conversation ▶"}
                  </Button>
                }
              />
            ) : (
              history.map((t, i) => <ChatBubble key={i} turn={t} />)
            )}
            {busy && !empty && (
              <div className="flex gap-3">
                <div className="w-12 shrink-0 text-[11px] text-ink-mute mt-1">
                  AGENT
                </div>
                <div className="rounded-lg px-3 py-2 text-sm bg-accent-soft border border-accent/20 text-ink-mute italic">
                  …thinking
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {err && (
            <p className="mt-3 text-xs text-hot">Error: {err}</p>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim() && !busy) send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                empty
                  ? "Click Start to have the agent open, or type a first message…"
                  : "Reply as the lead — try in any language…"
              }
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <TextTimeline history={history} />
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isAgent = turn.role === "agent";
  return (
    <div className="flex gap-3">
      <div className="w-12 shrink-0 text-[11px] text-ink-mute mt-1">
        {isAgent ? "AGENT" : "LEAD"}
      </div>
      <div
        className={
          "rounded-lg px-3 py-2 text-sm flex-1 " +
          (isAgent
            ? "bg-accent-soft border border-accent/20 text-ink-text"
            : "bg-ink-line text-ink-text")
        }
      >
        {turn.content}
      </div>
    </div>
  );
}

function TextTimeline({ history }: { history: ChatTurn[] }) {
  return (
    <Card className="self-start sticky top-6">
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-xs text-ink-mute">
            Each turn the agent and lead take will appear here.
          </p>
        ) : (
          <ol className="space-y-2 text-xs">
            {history.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 shrink-0 text-ink-mute font-mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={
                    t.role === "agent"
                      ? "text-accent"
                      : "text-ink-text"
                  }
                >
                  {t.role === "agent" ? "Agent" : "Lead"}
                </span>
                <span className="text-ink-mute line-clamp-2">{t.content}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  hint,
  action,
}: {
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-4">
      <div className="h-10 w-10 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center">
        <span className="text-accent text-lg">▶</span>
      </div>
      <p className="max-w-sm text-sm text-ink-mute">{hint}</p>
      {action}
    </div>
  );
}

// ── voice stage ─────────────────────────────────────────────────────────────

function VoiceStage({ persona }: { persona: SimulatePersona }) {
  // PipecatClient + SmallWebRTCTransport touch browser-only APIs on
  // construction (RTCPeerConnection, MediaDevices, new Headers()). Next.js
  // SSR-pre-renders client components once, so we defer construction to a
  // browser-only effect. Until the client exists we show a one-line stub.
  const [client, setClient] = useState<PipecatClient | null>(null);

  useEffect(() => {
    const token = getToken();
    const transport = new SmallWebRTCTransport({
      webrtcRequestParams: {
        endpoint: "/api/simulate/voice/offer",
        headers: new Headers({
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        }),
        requestData: { persona } as any,
      },
    });
    const c = new PipecatClient({ transport });
    setClient(c);
    return () => {
      c.disconnect().catch(() => {});
    };
  }, [persona]);

  if (!client) {
    return (
      <Card className="min-h-[200px]">
        <CardContent className="text-sm text-ink-mute py-12 text-center">
          Initialising voice client…
        </CardContent>
      </Card>
    );
  }

  return (
    <PipecatClientProvider client={client}>
      <PipecatClientAudio />
      <VoiceCanvas />
    </PipecatClientProvider>
  );
}

function VoiceCanvas() {
  const { messages } = usePipecatConversation();
  const { state, isConnecting, isConnected } = usePipecatConnectionState();
  const client = usePipecatClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Agent turns arrive via the WebRTC app-message data channel (sent by
  // BotTranscriptBroadcaster on the server). We keep our own array and
  // merge it with the user turns from usePipecatConversation below.
  const [agentTurns, setAgentTurns] = useState<
    { text: string; ts: number }[]
  >([]);

  useEffect(() => {
    if (!client) return;
    const handler = (data: any) => {
      // data shape from RTVIEvent.ServerMessage is ServerMessageData = {data: any}.
      // The bot sends {type:"agent_turn", text:"..."}.
      const payload = data?.data ?? data;
      if (payload?.type === "agent_turn" && payload?.text) {
        setAgentTurns((prev) => [
          ...prev,
          { text: String(payload.text), ts: Date.now() },
        ]);
      }
    };
    client.on(RTVIEvent.ServerMessage, handler);
    return () => {
      client.off(RTVIEvent.ServerMessage, handler);
    };
  }, [client]);

  // Reset agent turns on (re)connect so a new session starts clean.
  useEffect(() => {
    if (!isConnected) setAgentTurns([]);
  }, [isConnected]);

  async function toggle() {
    if (!client) return;
    setBusy(true);
    setErr(null);
    try {
      if (isConnected) {
        await client.disconnect();
      } else {
        // initDevices() asks the browser for mic permission and primes the
        // local audio track. The kit's <ConnectButton> does this internally;
        // we replicate it so the button actually does something.
        try { await client.initDevices(); } catch (devErr) {
          // eslint-disable-next-line no-console
          console.warn("initDevices failed (continuing):", devErr);
        }
        await client.connect();
        // PipecatClient connects with the mic *muted* by default — the
        // user could see the agent speak but the agent heard silence and
        // the call appeared to "shut off". Unmute right after connect so
        // the conversation flows both ways immediately.
        try { client.enableMic(true); } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("enableMic failed:", e);
        }
      }
    } catch (e: any) {
      // Pipecat client sometimes rejects with non-Error objects ({status, body},
      // RTVIError, etc). Coerce to something humans can read AND dump the raw
      // object to the console so we can drill in.
      // eslint-disable-next-line no-console
      console.error("voice connect failed:", e);
      const msg =
        e?.message ??
        e?.body ??
        e?.statusText ??
        (typeof e === "string" ? e : null) ??
        (e ? JSON.stringify(e) : null) ??
        "connect failed (see browser console for details)";
      setErr(String(msg));
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = isConnected
    ? "Connected"
    : isConnecting
      ? "Connecting…"
      : "Disconnected";
  const stateColor = isConnected
    ? "bg-accent/80"
    : isConnecting
      ? "bg-amber-400/80"
      : "bg-ink-mute/60";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-h-[520px] flex flex-col">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Live voice preview</CardTitle>
            <p className="text-xs text-ink-mute mt-0.5">
              Pick up the phone — the agent speaks first, then responds to
              your voice in real time.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-mute">
            <span className={`h-1.5 w-1.5 rounded-full ${stateColor}`} />
            <span className="font-mono">{stateLabel}</span>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col items-center justify-between gap-6 py-8">
          <div className="w-full max-w-md">
            <div className="relative rounded-2xl bg-gradient-to-br from-ink to-ink-line/40 border border-ink-line p-6 flex flex-col items-center gap-2 overflow-hidden">
              {/* Soft radial glow behind the ring while the agent talks */}
              <div
                className={
                  "absolute inset-0 pointer-events-none transition-opacity duration-500 " +
                  (isConnected ? "opacity-100" : "opacity-30")
                }
                style={{
                  background:
                    "radial-gradient(circle at 50% 55%, rgba(94,234,212,0.18), transparent 60%)",
                }}
              />
              <div className="relative z-10 text-[10px] uppercase tracking-[0.3em] text-ink-mute">
                Agent
              </div>
              <div className="relative z-10 flex items-center justify-center">
                <AuraVisualizer size={280} color="#5eead4" />
              </div>
              <div className="relative z-10 text-[11px] text-ink-mute mt-1">
                {isConnected
                  ? "Speak naturally — the agent is listening"
                  : "Press Connect to begin"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={toggle}
              disabled={busy || !client}
              className={
                isConnected
                  ? "!bg-hot/90 hover:!bg-hot !text-ink min-w-[180px]"
                  : "min-w-[180px]"
              }
            >
              {busy
                ? isConnected
                  ? "Disconnecting…"
                  : "Connecting…"
                : isConnected
                  ? "End call"
                  : "Connect ▶"}
            </Button>
            <div className="vuk-scoped">
              <UserAudioControl />
            </div>
          </div>

          {err && (
            <p className="text-xs text-hot text-center max-w-sm">{err}</p>
          )}

          <p className="text-[11px] text-ink-mute text-center max-w-sm">
            {state === "connected"
              ? "Live. Disconnect to end the session."
              : isConnecting
                ? "Connecting… your browser may prompt for microphone access."
                : "Allow microphone access on first connect. Audio uses the same STT + LLM + TTS stack as real calls."}
          </p>
        </CardContent>
      </Card>

      <VoiceTimeline turns={mergedTurns(messages, agentTurns)} />
    </div>
  );
}

type MergedTurn = { role: "agent" | "user"; text: string; ts: number };

function partsToText(parts: ConversationMessage["parts"]): string {
  return parts
    .map((p) => {
      if (typeof p.text === "string") return p.text;
      if (p.text && typeof p.text === "object" && "text" in (p.text as any)) {
        return String((p.text as any).text ?? "");
      }
      return "";
    })
    .join(" ")
    .trim();
}

function mergedTurns(
  messages: ConversationMessage[],
  agentTurns: { text: string; ts: number }[],
): MergedTurn[] {
  // Take user turns from usePipecatConversation (Pipecat STT events).
  // Drop assistant entries — the kit doesn't fill them reliably and we
  // get them via the app-message channel instead.
  const userTurns: MergedTurn[] = messages
    .filter((m) => m.role === "user")
    .map((m) => {
      const text = partsToText(m.parts);
      const ts = new Date(m.createdAt || Date.now()).getTime();
      return { role: "user" as const, text, ts };
    })
    .filter((t) => t.text);
  const bot: MergedTurn[] = agentTurns.map((t) => ({
    role: "agent" as const,
    text: t.text,
    ts: t.ts,
  }));
  return [...userTurns, ...bot].sort((a, b) => a.ts - b.ts);
}

function VoiceTimeline({ turns }: { turns: MergedTurn[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  return (
    <Card className="self-start sticky top-6">
      <CardHeader>
        <CardTitle>Live transcript</CardTitle>
      </CardHeader>
      <CardContent>
        {turns.length === 0 ? (
          <p className="text-xs text-ink-mute">
            Once connected, every turn — yours and the agent's — streams
            here as it's spoken.
          </p>
        ) : (
          <div
            ref={ref}
            className="space-y-2 max-h-[60vh] overflow-y-auto pr-1"
          >
            {turns.map((t, i) => {
              const isAgent = t.role === "agent";
              return (
                <div
                  key={i}
                  className={
                    "flex " + (isAgent ? "justify-start" : "justify-end")
                  }
                >
                  <div
                    className={
                      "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed " +
                      (isAgent
                        ? "bg-accent-soft border border-accent/25 text-ink-text rounded-tl-sm"
                        : "bg-ink-line text-ink-text rounded-tr-sm")
                    }
                  >
                    <div
                      className={
                        "uppercase tracking-[0.2em] text-[9px] mb-1 " +
                        (isAgent ? "text-accent" : "text-ink-mute")
                      }
                    >
                      {isAgent ? "Agent" : "You"}
                    </div>
                    <div>{t.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ── runtime prompt preview (collapsible) ──────────────────────────────────
// Shows the EXACT system prompt currently being sent to the agent for the
// loaded persona. Refetches whenever the persona changes (debounced) while
// expanded, so the RM can see how opener / language / lead notes layer in.

function RuntimePromptPreview({ persona }: { persona: SimulatePersona }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Stable string of the persona to use as a debounce key.
  const personaKey = JSON.stringify(persona);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setErr(null);
    const t = setTimeout(async () => {
      try {
        const r = await api.simulatePreviewPrompt(persona);
        if (!cancelled) setPrompt(r.system_prompt);
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? "Failed to load prompt");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personaKey]);

  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <CardHeader className="flex items-center justify-between gap-4 hover:bg-ink-line/30 transition-colors">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-mute text-xs">
                {open ? "▼" : "▸"}
              </span>
              Runtime system prompt
            </CardTitle>
            <p className="text-xs text-ink-mute mt-0.5 ml-7">
              The exact instructions sent to the agent right now — opener,
              language rules, objections, lead context. Updates live as you
              change the persona.
            </p>
          </div>
          {open && (
            <span className="text-[11px] text-ink-mute font-mono">
              {prompt.length.toLocaleString()} chars
            </span>
          )}
        </CardHeader>
      </button>
      {open && (
        <CardContent>
          {err && <p className="text-xs text-hot mb-2">Error: {err}</p>}
          {busy && !prompt ? (
            <p className="text-sm text-ink-mute">Loading prompt…</p>
          ) : (
            <pre className="text-[11px] text-ink-text leading-relaxed whitespace-pre-wrap font-mono p-3 rounded-lg bg-ink border border-ink-line max-h-[60vh] overflow-y-auto">
              {prompt}
            </pre>
          )}
        </CardContent>
      )}
    </Card>
  );
}


// ── prompts panel (saved versions + preview history) ───────────────────────

function PromptsPanel({ agentId }: { agentId: string | null }) {
  const [tab, setTab] = useState<"versions" | "trials">("versions");
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [trials, setTrials] = useState<StudioTrial[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    if (!agentId) {
      // Trials are global without an agent — show them anyway.
      try { setTrials(await studioApi.trials()); } catch (e: any) { setErr(e.message); }
      setVersions([]);
      return;
    }
    setBusy(true);
    try {
      const [vs, ts] = await Promise.all([
        agentsApi.versions(agentId),
        studioApi.trials(agentId),
      ]);
      setVersions(vs);
      setTrials(ts);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [agentId]);

  async function openVersion(runId: string) {
    if (!agentId) return;
    if (open === runId) { setOpen(null); setPromptText(""); return; }
    setOpen(runId);
    setPromptText("Loading…");
    try {
      const r = await agentsApi.versionPrompt(agentId, runId);
      setPromptText(r.system_prompt || "(no system prompt artifact stored)");
    } catch (e: any) {
      setPromptText(`Failed: ${e.message}`);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>History</CardTitle>
          <p className="text-xs text-ink-mute mt-0.5">
            Every save creates a new version. Every text or voice preview
            is recorded so you can compare runs side by side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-line bg-ink p-1 text-xs">
            <button
              onClick={() => setTab("versions")}
              className={
                "px-3 py-1 rounded-md " +
                (tab === "versions" ? "bg-accent text-ink" : "text-ink-text")
              }
            >
              Versions {agentId ? `· ${versions.length}` : ""}
            </button>
            <button
              onClick={() => setTab("trials")}
              className={
                "px-3 py-1 rounded-md " +
                (tab === "trials" ? "bg-accent text-ink" : "text-ink-text")
              }
            >
              Previews · {trials.length}
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {err && <p className="text-xs text-hot mb-3">Error: {err}</p>}

        {tab === "versions" && !agentId && (
          <p className="text-sm text-ink-mute">
            Load a saved agent above to see its prompt-version history.
          </p>
        )}

        {tab === "versions" && agentId && versions.length === 0 && !busy && (
          <p className="text-sm text-ink-mute">
            No versions saved yet — save the agent to create v1.
          </p>
        )}

        {tab === "versions" && versions.length > 0 && (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.run_id}
                className="rounded-lg border border-ink-line bg-ink"
              >
                <button
                  onClick={() => openVersion(v.run_id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-ink-line/40"
                >
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-accent-soft text-accent border border-accent/30 min-w-[2.5rem] justify-center">
                    v{v.version}
                  </span>
                  <span className="text-xs text-ink-mute uppercase tracking-wide">
                    {v.change || "saved"}
                  </span>
                  <span className="text-xs text-ink-mute">
                    {v.voice_id || "—"} · {v.language_pref || "—"} ·
                    {" "}{v.opener_variant || "—"}
                  </span>
                  <span className="ml-auto text-[11px] text-ink-mute font-mono">
                    {new Date(v.started_at).toLocaleString()}
                  </span>
                </button>
                {open === v.run_id && (
                  <pre className="px-3 pb-3 pt-1 text-[11px] text-ink-text whitespace-pre-wrap font-mono leading-relaxed border-t border-ink-line">
                    {promptText}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "trials" && trials.length === 0 && !busy && (
          <p className="text-sm text-ink-mute">
            No previews yet — start a text or voice chat and it will appear here.
          </p>
        )}

        {tab === "trials" && trials.length > 0 && (
          <div className="grid gap-2">
            {trials.map((t) => (
              <div
                key={t.run_id}
                className="flex items-center gap-3 rounded-lg border border-ink-line bg-ink px-3 py-2 text-xs"
              >
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-ink-line text-ink-text">
                  {t.mode}
                </span>
                <span className="text-ink-text">
                  {t.agent_name || "(no agent)"}
                </span>
                <span className="text-ink-mute">
                  {t.voice_id || "—"} · {t.language_pref || "—"}
                </span>
                <span className="ml-auto text-ink-mute font-mono">
                  {t.turn_count} turns
                </span>
                <span className="text-ink-mute font-mono">
                  {new Date(t.started_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
