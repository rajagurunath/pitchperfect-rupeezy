"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, CallDetail, CallEvent } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, ScoreBadge, StatusPill } from "@/components/ui";
import { formatDuration, formatTime } from "@/lib/utils";

// Stage timeline ----------------------------------------------------------------

const STAGE_ORDER = [
  "queued", "dialing", "ringing", "picked",
  "agent_spoke", "user_spoke", "completed",
];

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  dialing: "Dialing",
  ringing: "Ringing",
  picked: "Picked up",
  agent_spoke: "Agent spoke",
  user_spoke: "Lead spoke",
  completed: "Completed",
  dropped_early: "Dropped early",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
  canceled: "Canceled",
};

const STAGE_HINTS: Record<string, string> = {
  queued: "Created in DB.",
  dialing: "Twilio API accepted the dial.",
  ringing: "Phone is ringing on the lead's side.",
  picked: "Lead answered — bot WebSocket connected.",
  agent_spoke: "Agent's first audible response.",
  user_spoke: "Lead actually engaged — said something.",
  completed: "Call ended cleanly.",
  dropped_early: "Lead picked up but never spoke (engagement failure).",
  no_answer: "Lead never picked up.",
  busy: "Line was busy.",
  failed: "Twilio reported a failure.",
  canceled: "Caller-side cancel.",
};

function StageTimeline({ events }: { events: CallEvent[] }) {
  const reached = new Set(events.map((e) => e.stage));
  const last = events[events.length - 1]?.stage;
  const isTerminal = last && ["completed", "dropped_early", "no_answer", "busy", "failed", "canceled"].includes(last);

  // Use STAGE_ORDER as the visible chain; if a non-success terminal stage
  // fired, append it as a final red node.
  const chain = [...STAGE_ORDER];
  if (isTerminal && last !== "completed" && !chain.includes(last)) {
    chain.push(last);
  }

  // For each terminal stage we mark one of "completed" / "dropped_early" etc.
  // Treat the user_spoke stage as reached if we have any user transcript turn.

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {chain.map((stage, i) => {
        const hit = reached.has(stage);
        const isFailure = ["dropped_early", "no_answer", "busy", "failed", "canceled"].includes(stage);
        const cls = hit
          ? isFailure
            ? "bg-hot-soft border-hot/40 text-hot"
            : "bg-accent-soft border-accent/40 text-accent"
          : "bg-ink-line border-ink-line text-ink-mute";
        const ev = events.find((e) => e.stage === stage);
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <div
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border ${cls}`}
              title={STAGE_HINTS[stage] ?? stage}
            >
              <div>{STAGE_LABELS[stage] ?? stage}</div>
              {ev && (
                <div className="text-[10px] opacity-70 mt-0.5">
                  {new Date(ev.ts).toLocaleTimeString()}
                </div>
              )}
            </div>
            {i < chain.length - 1 && (
              <div className={`h-px w-3 ${hit ? "bg-accent/40" : "bg-ink-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Audio waveform via WaveSurfer (loads lazily so non-recording calls don't pull it)
function WaveformPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (cancelled || !ref.current) return;
      const ws = WaveSurfer.create({
        container: ref.current,
        height: 60,
        waveColor: "#3a3f49",
        progressColor: "#5eead4",
        cursorColor: "#5eead4",
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        url: src,
      });
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));
      wsRef.current = ws;
    })();
    return () => {
      cancelled = true;
      wsRef.current?.destroy();
    };
  }, [src]);

  return (
    <div className="space-y-2">
      <div ref={ref} className="rounded-md bg-ink border border-ink-line p-2" />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => wsRef.current?.playPause()}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <a
          className="text-xs text-ink-mute hover:text-accent self-center"
          href={src}
          target="_blank"
        >
          Open .mp3 ↗
        </a>
      </div>
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [call, setCall] = useState<CallDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try { setCall(await api.call(id)); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => {
    if (!id) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function reanalyze() {
    setBusy(true); setErr(null);
    try { await api.analyze(id); await refresh(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err) return <div className="text-hot text-sm">{err}</div>;
  if (!call) return <div className="text-ink-mute text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/calls" className="text-xs text-ink-mute hover:text-accent">← All calls</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {call.lead_name ?? "Unknown lead"}{" "}
          <span className="text-ink-mute font-normal text-base">— {call.lead_phone}</span>
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <StatusPill status={call.status} />
          <ScoreBadge score={call.score} />
          <span className="text-ink-mute">{formatDuration(call.duration_seconds)}</span>
          <span className="text-ink-mute">·</span>
          <span className="text-ink-mute">{formatTime(call.started_at ?? call.created_at)}</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Operations timeline</CardTitle></CardHeader>
        <CardContent>
          {call.events.length === 0 ? (
            <div className="text-sm text-ink-mute">No events recorded.</div>
          ) : (
            <>
              <StageTimeline events={call.events} />
              <p className="mt-3 text-[11px] text-ink-mute">
                Hover any stage for what it means.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
          <CardContent>
            {call.transcript.length === 0 ? (
              <div className="text-sm text-ink-mute">No transcript captured.</div>
            ) : (
              <div className="space-y-3">
                {call.transcript.map((t) => (
                  <div key={t.id} className="flex gap-3">
                    <div className="w-16 shrink-0 text-[11px] text-ink-mute mt-1">
                      {t.speaker === "agent" ? "AGENT" : "LEAD"}
                      {t.language ? <div className="text-ink-mute/70">{t.language}</div> : null}
                    </div>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm flex-1 ${
                        t.speaker === "agent"
                          ? "bg-accent-soft border border-accent/20 text-ink-text"
                          : "bg-ink-line text-ink-text"
                      }`}
                    >
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Summary</CardTitle>
              <Button variant="secondary" disabled={busy} onClick={reanalyze}>
                {busy ? "Running…" : "Re-analyze"}
              </Button>
            </CardHeader>
            <CardContent>
              {call.summary ? (
                <p className="text-sm leading-relaxed">{call.summary}</p>
              ) : (
                <p className="text-sm text-ink-mute">
                  No summary yet. The analyzer runs automatically on hangup; if it didn’t fire, click Re-analyze.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recording</CardTitle></CardHeader>
            <CardContent>
              {call.recording_url ? (
                /* Streamed through the backend so the browser doesn't get
                   prompted for Twilio basic-auth. WaveSurfer renders a
                   waveform + play/pause control. */
                <WaveformPlayer src={`/api/calls/${call.id}/recording`} />
              ) : (
                <p className="text-sm text-ink-mute">
                  Not recorded. Recordings are off by default (cost). Enable
                  with <span className="font-mono">TWILIO_RECORD_CALLS=1</span> in
                  <span className="font-mono"> .env</span>.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
            <CardContent>
              <dl className="text-xs text-ink-mute space-y-1">
                <Row k="Call ID" v={call.id} />
                <Row k="Twilio SID" v={call.twilio_sid} />
                <Row k="Lead ID" v={call.lead_id} />
                <Row k="Started" v={formatTime(call.started_at)} />
                <Row k="Ended" v={formatTime(call.ended_at)} />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0">{k}</dt>
      <dd className="font-mono text-ink-text break-all">{v ?? "—"}</dd>
    </div>
  );
}
