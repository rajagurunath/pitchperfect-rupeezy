"use client";

// Operational pipeline / DAG visualization.
//
// Two views in this file:
//   * `<PipelineDAG>` — aggregate horizontal flow across all calls. Each
//      stage is a block with the count of calls that reached it; arrows
//      connect them. Failure stages (dropped_early / no_answer / busy /
//      failed / canceled) branch off as a second row.
//   * `<MiniDAG>` — per-call compact pill row. Given a `last_stage`,
//      we infer which stages were reached on the happy path and render
//      green pills up to that point, plus a red terminal pill for failures.
//
// Stage hints / labels mirror /calls/[id] so the visual language is
// consistent across the app.

import { cn } from "@/lib/utils";

const HAPPY_PATH = [
  "queued", "dialing", "ringing", "picked",
  "agent_spoke", "user_spoke", "completed",
];

const FAILURE_PATH = ["dropped_early", "no_answer", "busy", "failed", "canceled"];

const LABEL: Record<string, string> = {
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

const HINT: Record<string, string> = {
  queued: "Created in DB; no dial attempted yet.",
  dialing: "Twilio API accepted the dial.",
  ringing: "Phone is ringing on the lead's side.",
  picked: "Lead answered — bot WebSocket connected.",
  agent_spoke: "Agent's first audible response.",
  user_spoke: "Lead actually engaged — said something.",
  completed: "Call ended cleanly with engagement.",
  dropped_early: "Lead picked up but never spoke — engagement failure.",
  no_answer: "Lead never picked up.",
  busy: "Line was busy.",
  failed: "Twilio reported a failure.",
  canceled: "Caller-side cancel.",
};

// ---------- Aggregate pipeline (top of Operations page) ----------------------

export function PipelineDAG({ counts }: { counts: Record<string, number> }) {
  const happy = HAPPY_PATH.map((s) => ({ stage: s, n: counts[s] ?? 0 }));
  const fails = FAILURE_PATH
    .map((s) => ({ stage: s, n: counts[s] ?? 0 }))
    .filter((x) => x.n > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {happy.map((h, i) => (
          <div key={h.stage} className="flex items-center gap-1 shrink-0">
            <StageBlock
              label={LABEL[h.stage]}
              hint={HINT[h.stage]}
              count={h.n}
              tone={h.n > 0 ? "ok" : "muted"}
            />
            {i < happy.length - 1 && <Arrow active={h.n > 0} />}
          </div>
        ))}
      </div>

      {fails.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-mute mb-2">
            Drop-off branches
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {fails.map((f) => (
              <StageBlock
                key={f.stage}
                label={LABEL[f.stage]}
                hint={HINT[f.stage]}
                count={f.n}
                tone="bad"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StageBlock({
  label, hint, count, tone,
}: { label: string; hint: string; count: number; tone: "ok" | "bad" | "muted" }) {
  const cls =
    tone === "ok"
      ? "bg-accent-soft border-accent/40 text-accent"
      : tone === "bad"
      ? "bg-hot-soft border-hot/40 text-hot"
      : "bg-ink-card border-ink-line text-ink-mute";
  return (
    <div
      title={hint}
      className={cn(
        "min-w-[112px] rounded-lg border px-3 py-2 text-center select-none",
        cls,
      )}
    >
      <div className="text-2xl font-semibold leading-none">{count}</div>
      <div className="mt-1 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <svg
      width="22" height="14" viewBox="0 0 22 14"
      className={cn("shrink-0", active ? "text-accent/70" : "text-ink-line")}
      aria-hidden
    >
      <path
        d="M0 7 H17 M13 3 L17 7 L13 11"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- Per-call mini-DAG (one row in the recent-calls table) -----------

export function MiniDAG({ lastStage }: { lastStage: string | null }) {
  const reached = computeReached(lastStage);
  const failure = lastStage && FAILURE_PATH.includes(lastStage) ? lastStage : null;

  // Always render the 7 happy-path nodes as compact dots/pills. If the
  // call ended on a failure stage, append it as a small red badge.
  return (
    <div className="flex items-center gap-1">
      {HAPPY_PATH.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span
            title={`${LABEL[s]} — ${HINT[s]}`}
            className={cn(
              "h-2 w-2 rounded-full",
              reached.has(s) ? "bg-accent" : "bg-ink-line",
            )}
          />
          {i < HAPPY_PATH.length - 1 && (
            <span
              className={cn(
                "h-px w-3",
                reached.has(HAPPY_PATH[i + 1]) || (reached.has(s) && reached.has(HAPPY_PATH[i + 1]))
                  ? "bg-accent/40"
                  : "bg-ink-line",
              )}
            />
          )}
        </span>
      ))}
      {failure && (
        <span
          title={`${LABEL[failure]} — ${HINT[failure]}`}
          className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-hot-soft text-hot border border-hot/30 text-[10px] font-semibold uppercase tracking-wide"
        >
          {LABEL[failure]}
        </span>
      )}
    </div>
  );
}

function computeReached(lastStage: string | null): Set<string> {
  const reached = new Set<string>();
  if (!lastStage) return reached;
  // If on the happy path, mark all stages up to and including last_stage.
  const idx = HAPPY_PATH.indexOf(lastStage);
  if (idx >= 0) {
    for (let i = 0; i <= idx; i++) reached.add(HAPPY_PATH[i]);
    return reached;
  }
  // Failure stages: assume the call at least reached `picked` (the bot
  // wouldn't fire other events otherwise) and possibly later stages.
  // Conservative: dropped_early implies picked was reached; the rest
  // (no_answer / busy / failed / canceled) imply ringing only.
  if (lastStage === "dropped_early") {
    ["queued", "dialing", "ringing", "picked"].forEach((s) => reached.add(s));
  } else if (FAILURE_PATH.includes(lastStage)) {
    ["queued", "dialing", "ringing"].forEach((s) => reached.add(s));
  }
  return reached;
}
