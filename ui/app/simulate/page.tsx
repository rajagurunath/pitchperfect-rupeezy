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

import { useEffect, useMemo, useRef, useState } from "react";
import { api, SimulatePersona } from "@/lib/api";
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
  VoiceVisualizer,
  UserAudioControl,
  usePipecatConversation,
  usePipecatConnectionState,
  type ConversationMessage,
} from "@pipecat-ai/voice-ui-kit";
import { PipecatClient } from "@pipecat-ai/client-js";
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

const VOICES = [
  { value: "kavya",  label: "Kavya · F · warm" },
  { value: "priya",  label: "Priya · F · neutral" },
  { value: "neha",   label: "Neha · F · bright" },
  { value: "pooja",  label: "Pooja · F · calm" },
  { value: "ritu",   label: "Ritu · F · energetic" },
  { value: "shubh",  label: "Shubh · M · neutral" },
  { value: "rahul",  label: "Rahul · M · friendly" },
  { value: "amit",   label: "Amit · M · authoritative" },
  { value: "kabir",  label: "Kabir · M · warm" },
];

const OPENERS = [
  { value: "benefits", label: "Lead with benefits (100% brokerage + daily payout)" },
  { value: "social_proof", label: "Social proof (1000+ APs already onboarded)" },
  { value: "question", label: "Curiosity question (current brokerage rate?)" },
];

// ── page shell ──────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const [mode, setMode] = useState<Mode>("text");
  const [persona, setPersona] = useState<SimulatePersona>(DEFAULT_PERSONA);

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
            Preview an agent persona end-to-end before activating a campaign.
            The agent uses the exact prompt, LLM, voice, and qualification
            logic that production calls run — but no real lead is dialed.
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

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PersonaSidebar persona={persona} onChange={setPersona} />

        {mode === "text" ? (
          <TextStage persona={persona} />
        ) : (
          <VoiceStage persona={persona} />
        )}
      </div>
    </div>
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
}: {
  persona: SimulatePersona;
  onChange: (p: SimulatePersona) => void;
}) {
  function set<K extends keyof SimulatePersona>(k: K, v: SimulatePersona[K]) {
    onChange({ ...persona, [k]: v });
  }

  return (
    <Card className="self-start sticky top-6">
      <CardHeader>
        <CardTitle>Campaign config</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Persona">
          <Field label="Agent name">
            <Input
              value={persona.agent_name ?? ""}
              onChange={(e) => set("agent_name", e.target.value)}
            />
          </Field>
          <Field label="Voice">
            <Select
              value={persona.voice_id ?? ""}
              onChange={(v) => set("voice_id", v)}
              options={VOICES}
            />
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
            hint="Background only — never read out loud."
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

function TextStage({ persona }: { persona: SimulatePersona }) {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, busy]);

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
    try {
      const res = await api.simulateText({
        persona,
        history: nextHistory,
        message: undefined,  // message already appended to history
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
        <CardTitle>Turn timeline</CardTitle>
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
          <div className="vuk-scoped w-full max-w-md">
            <div className="rounded-2xl bg-ink border border-ink-line p-6 flex flex-col items-center gap-6">
              <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                Agent · live waveform
              </div>
              <div className="w-full h-32 flex items-center justify-center">
                <VoiceVisualizer
                  participantType="bot"
                  barCount={48}
                  barGap={3}
                  barWidth={3}
                  barMaxHeight={120}
                />
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

      <VoiceTimeline messages={messages} />
    </div>
  );
}

function VoiceTimeline({ messages }: { messages: ConversationMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Flatten ConversationMessagePart[] into a single string per turn.
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

  return (
    <Card className="self-start sticky top-6">
      <CardHeader>
        <CardTitle>Live transcript</CardTitle>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <p className="text-xs text-ink-mute">
            Once connected, every turn — yours and the agent's — streams
            here as it's spoken.
          </p>
        ) : (
          <div
            ref={ref}
            className="space-y-3 max-h-[60vh] overflow-y-auto pr-1"
          >
            {messages.map((m, i) => {
              const text = partsToText(m.parts);
              if (!text) return null;
              const isAgent = m.role === "assistant";
              return (
                <div key={i} className="flex gap-2">
                  <div
                    className={
                      "w-1 shrink-0 rounded-full " +
                      (isAgent ? "bg-accent/60" : "bg-ink-mute/40")
                    }
                  />
                  <div className="flex-1 text-xs">
                    <div
                      className={
                        "uppercase tracking-widest text-[10px] " +
                        (isAgent ? "text-accent" : "text-ink-mute")
                      }
                    >
                      {isAgent ? "Agent" : "You"}
                    </div>
                    <div className="text-ink-text mt-0.5">{text}</div>
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
