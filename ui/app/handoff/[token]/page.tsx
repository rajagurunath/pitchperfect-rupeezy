"use client";

// Public RM context card — opened from the WhatsApp link the human RM
// receives after a HOT/WARM call. No auth: the URL token is HMAC-signed
// server-side. Surfaces lead, score, key signal, objections handled,
// buying signal, recommended opener, sentiment + a transcript view.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Objection = { objection: string; resolution: string };

type CardData = {
  score: "HOT" | "WARM" | null;
  channel: "call" | "whatsapp" | null;
  agent_name: string | null;
  sent_at: string | null;
  opened_at: string | null;
  lead: {
    name: string | null;
    phone: string | null;
    language_pref: string | null;
    notes: string | null;
  };
  call: {
    id: string | null;
    duration_seconds: number | null;
    summary: string | null;
  };
  analysis: {
    score?: "HOT" | "WARM" | "COLD";
    summary?: string;
    sentiment?: "positive" | "neutral" | "negative";
    interest_level?: number;
    objection_intensity?: number;
    follow_up_priority?: number;
    buying_signals?: string[];
    objections_raised?: string[];
    objections_handled?: Objection[];
    key_signal?: string;
    recommended_opener?: string;
    next_action?: string;
  };
  transcript: { id: number; speaker: "user" | "agent"; text: string; ts: string }[];
};

export default function HandoffPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<CardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isSample = token === "sample";

  useEffect(() => {
    if (!token) return;
    if (isSample) {
      setData(SAMPLE_CARD);
      return;
    }
    fetch(`/api/public/handoff/${token}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${body.slice(0, 120)}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [token, isSample]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-ink-text">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Link expired or invalid</h1>
          <p className="text-sm text-ink-mute">{err}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-mute text-sm">
        Loading…
      </div>
    );
  }

  const score = data.score ?? data.analysis.score ?? "WARM";
  const isHot = score === "HOT";
  const a = data.analysis;
  const fire = isHot ? "🔥" : "🟡";
  const action = isHot
    ? "Call back within 30 min"
    : "WhatsApp follow-up";
  const dur = data.call.duration_seconds
    ? `${Math.floor(data.call.duration_seconds / 60)}m ${data.call.duration_seconds % 60}s`
    : "—";

  return (
    <div className="min-h-screen bg-ink text-ink-text">
      <div className="mx-auto max-w-2xl px-5 py-8 space-y-6">
        {isSample && (
          <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] text-accent flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold uppercase tracking-widest text-[10px] mr-2">
                Sample
              </span>
              This is a demo card. Real cards open from the Handoffs gallery.
            </span>
          </div>
        )}

        {/* Headline */}
        <header className="space-y-2">
          <div
            className={
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest border " +
              (isHot
                ? "bg-hot-soft text-hot border-hot/30"
                : "bg-warm-soft text-warm border-warm/30")
            }
          >
            <span>{fire}</span>
            <span>{score} LEAD</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {data.lead.name ?? "Lead"}
          </h1>
          <div className="text-sm text-ink-mute font-mono">
            {data.lead.phone ?? "—"}
          </div>
          <div className="text-xs text-ink-mute mt-1">{action}</div>
        </header>

        {/* Snapshot strip */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="Language" value={prettyLang(data.lead.language_pref)} />
          <Stat label="Duration" value={dur} />
          <Stat
            label="Interest"
            value={a.interest_level ? `${a.interest_level}/10` : "—"}
          />
          <Stat
            label="Sentiment"
            value={titleCase(a.sentiment) ?? "—"}
            valueClass={sentimentColor(a.sentiment)}
          />
        </section>

        {/* Key signal */}
        {a.key_signal && (
          <section className="rounded-xl border border-accent/30 bg-accent-soft p-4">
            <div className="text-[10px] uppercase tracking-widest text-accent mb-1">
              Key signal
            </div>
            <p className="text-sm text-ink-text leading-relaxed">
              {a.key_signal}
            </p>
          </section>
        )}

        {/* Objections handled */}
        {a.objections_handled && a.objections_handled.length > 0 && (
          <Card title="Objections handled">
            <ul className="space-y-3">
              {a.objections_handled.map((o, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium">"{o.objection}"</div>
                  <div className="text-ink-mute mt-0.5">
                    → resolved with {o.resolution}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Buying signals */}
        {a.buying_signals && a.buying_signals.length > 0 && (
          <Card title="Buying signal">
            <ul className="space-y-1 text-sm italic">
              {a.buying_signals.map((q, i) => (
                <li key={i}>"{q}"</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Recommended opener */}
        {a.recommended_opener && (
          <Card title="Recommended opener">
            <p className="text-sm leading-relaxed">{a.recommended_opener}</p>
          </Card>
        )}

        {/* Summary */}
        {a.summary && (
          <Card title="Call summary">
            <p className="text-sm text-ink-text leading-relaxed whitespace-pre-wrap">
              {a.summary}
            </p>
            {a.next_action && (
              <p className="mt-3 text-sm text-ink-mute">
                <span className="text-ink-text font-medium">Next action:</span>{" "}
                {a.next_action}
              </p>
            )}
          </Card>
        )}

        {/* Lead notes */}
        {data.lead.notes && (
          <Card title="Lead notes">
            <p className="text-sm text-ink-mute leading-relaxed whitespace-pre-wrap">
              {data.lead.notes}
            </p>
          </Card>
        )}

        {/* Transcript */}
        {data.transcript.length > 0 && (
          <Card title={`Transcript · ${data.transcript.length} turns`}>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {data.transcript.map((t) => (
                <div key={t.id} className="text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-0.5">
                    {t.speaker === "agent" ? "AI Agent" : data.lead.name ?? "Lead"}
                  </div>
                  <div className="leading-relaxed">{t.text}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <footer className="pt-3 text-[11px] text-ink-mute text-center">
          Context card{" "}
          {data.sent_at && (
            <>
              · sent {new Date(data.sent_at).toLocaleString()}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-line bg-ink-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-line bg-ink-card px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-ink-mute">
        {label}
      </div>
      <div className={"text-sm font-medium mt-0.5 " + valueClass}>{value}</div>
    </div>
  );
}

function prettyLang(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "hi-IN": "Hindi",
    "en-IN": "English",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "bn-IN": "Bengali",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "pa-IN": "Punjabi",
  };
  return map[code] ?? code;
}

function titleCase(s: string | undefined | null): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentimentColor(s: string | undefined): string {
  if (s === "positive") return "text-hot";
  if (s === "negative") return "text-cold";
  return "text-ink-text";
}

// ── sample (demo) card ─────────────────────────────────────────────────────
// Rendered when token === "sample" so the Handoffs gallery can link to a
// realistic preview before any real handoff has been sent.

const SAMPLE_CARD: CardData = {
  score: "HOT",
  channel: "call",
  agent_name: "Priya",
  sent_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  opened_at: null,
  lead: {
    name: "Rajesh Kumar",
    phone: "+91 98765 43210",
    language_pref: "hi-IN",
    notes:
      "Sub-broker in Pune for 6 years. Currently with Zerodha. Earlier "
      + "mentioned switching due to brokerage cut. Active in F&O.",
  },
  call: {
    id: "call_sample",
    duration_seconds: 272,
    summary:
      "Rajesh is a Pune-based sub-broker with a ~120 client book on Zerodha. "
      + "On the call he asked specifically about commission share, onboarding "
      + "timeline, and the RISE Portal payout cycle. Asked twice about how "
      + "soon he could start. Comfortable in Hindi; switched to English when "
      + "comparing brokerage numbers. Said he has a friend who would also "
      + "join. Ready for an RM follow-up today.",
  },
  analysis: {
    score: "HOT",
    summary:
      "Rajesh is a Pune-based sub-broker with a ~120 client book on Zerodha. "
      + "On the call he asked specifically about commission share, onboarding "
      + "timeline, and the RISE Portal payout cycle.",
    sentiment: "positive",
    interest_level: 8,
    objection_intensity: 3,
    follow_up_priority: 9,
    key_signal:
      "Asked twice about how soon he can start — and mentioned a friend who "
      + "also wants to join.",
    recommended_opener:
      "Rajesh ji, Priya se baat hui thi — aapke dost ke baare mein bhi "
      + "baat karte hain.",
    buying_signals: [
      "Kab start kar sakta hu?",
      "Mera ek dost bhi join karna chahta hai",
      "Send me the link",
    ],
    objections_raised: ["Already with another broker"],
    objections_handled: [
      {
        objection: "Already with another broker",
        resolution:
          "100% brokerage share comparison + daily payout vs Zerodha's "
          + "T+1 settlement",
      },
    ],
    next_action:
      "Call back within 30 min. Confirm 100% brokerage and walk through "
      + "RISE Portal onboarding live. Ask about the friend during the same "
      + "call.",
  },
  transcript: [
    {
      id: 1,
      speaker: "agent",
      ts: new Date().toISOString(),
      text:
        "Namaste Rajesh ji, main Priya bol rahi hu Rupeezy se. Aap abhi kis "
        + "broker ke saath sub-broker ke roop mein kaam kar rahe hain?",
    },
    {
      id: 2,
      speaker: "user",
      ts: new Date().toISOString(),
      text: "Zerodha ke saath hu, lekin brokerage kaafi cut ho jaata hai.",
    },
    {
      id: 3,
      speaker: "agent",
      ts: new Date().toISOString(),
      text:
        "Bilkul samajh sakti hu. Rupeezy aap ko 100% brokerage share deta hai "
        + "aur payout daily — agle din wait nahi karna padega.",
    },
    {
      id: 4,
      speaker: "user",
      ts: new Date().toISOString(),
      text: "Achha. Aur kab start kar sakta hu?",
    },
    {
      id: 5,
      speaker: "agent",
      ts: new Date().toISOString(),
      text:
        "Aaj hi shuru kar sakte hain. RISE Portal pe sign-up sirf 10 minutes "
        + "ka hai. RM call karke poora process walk-through karenge.",
    },
    {
      id: 6,
      speaker: "user",
      ts: new Date().toISOString(),
      text:
        "Mera ek dost bhi join karna chahta hai — uske liye bhi same hoga?",
    },
    {
      id: 7,
      speaker: "agent",
      ts: new Date().toISOString(),
      text:
        "Haan, aapke dost ke liye bhi same offer. Aap dono ko aaj hi link "
        + "share kar deti hu — aur RM 30 minute ke andar call karenge.",
    },
  ],
};
