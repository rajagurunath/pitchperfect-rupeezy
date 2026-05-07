"use client";

// Public landing page for the Rupeezy AP Voice Agent.
// Editorial dark + electric-teal aesthetic. Big serif headlines, asymmetric
// layouts, ambient gradient halos, a live-looking waveform and rotating
// language switch in the hero. Fully static — no API calls — so it loads
// instantly and works without the backend running.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Phone, Languages, Brain, ShieldCheck, Sparkles,
  ArrowRight, Activity, Mic, Headphones, Wand2, BarChart3,
  CloudUpload, Bot, Workflow, LineChart,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Hero greetings — rotates through Indian languages
// ---------------------------------------------------------------------------

const GREETINGS: { lang: string; word: string; tag: string }[] = [
  { lang: "Hindi",     word: "नमस्ते",         tag: "हिन्दी" },
  { lang: "Tamil",     word: "வணக்கம்",        tag: "தமிழ்"  },
  { lang: "Telugu",    word: "నమస్తే",          tag: "తెలుగు"  },
  { lang: "Marathi",   word: "नमस्कार",        tag: "मराठी"  },
  { lang: "Gujarati",  word: "નમસ્તે",         tag: "ગુજરાતી" },
  { lang: "Bengali",   word: "নমস্কার",        tag: "বাংলা"   },
  { lang: "Punjabi",   word: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ",  tag: "ਪੰਜਾਬੀ"  },
  { lang: "Hinglish",  word: "Hello ji 👋",    tag: "Hinglish" },
  { lang: "English",   word: "Hello there",   tag: "English"  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const { isAuthed } = useAuth();
  const ctaHref  = isAuthed ? "/operations" : "/login";
  const ctaLabel = isAuthed ? "Open the console" : "Sign in to console";

  return (
    <div className="relative overflow-hidden bg-ink text-ink-text">
      <LandingNav ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <Hero ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <LanguageMarquee />

      <Section
        eyebrow="THE GAP"
        title={<>Inbound leads leak <em className="font-serif italic font-normal text-accent/90">before</em> a human can call them.</>}
        kicker="Rupeezy's AP partner program has a top-of-funnel problem: leads come in fast, but humans pick up the phone slowly — and when they do, half the time they don't share a language with the partner."
      >
        <ProblemCards />
      </Section>

      <Section
        eyebrow="HOW IT WORKS"
        anchor="how"
        title={<>From CSV upload to a <em className="font-serif italic font-normal text-accent/90">scored</em> conversation in one pass.</>}
        kicker="One unified pipeline. Lead lands → Twilio dials → Pipecat routes → Kimi reasons in-language → analyzer scores. The whole thing happens before a human RM could even open their dialer."
      >
        <Pipeline />
      </Section>

      <Section
        eyebrow="LIVE CONVERSATION"
        title={<>The agent <em className="font-serif italic font-normal text-accent/90">listens</em>, responds, and remembers.</>}
        kicker="A real call captured from the demo — translated for clarity. Auto-detected language, native pronunciation, objection handling baked into the system prompt."
      >
        <ConversationPreview />
      </Section>

      <Section
        eyebrow="WHAT'S SHIPPED"
        anchor="features"
        title={<>A console the RM team can <em className="font-serif italic font-normal text-accent/90">actually run on</em>.</>}
        kicker="Six dashboards, one auth boundary, zero spreadsheet exports. Everything an operator needs to upload leads, watch dials happen, and review what was said."
      >
        <FeatureGrid />
      </Section>

      <Section
        eyebrow="WHAT'S NEXT"
        anchor="roadmap"
        title={<>Built in a hackathon. <em className="font-serif italic font-normal text-accent/90">Designed</em> to ship.</>}
        kicker="MVP today. Revenue-grade infrastructure tomorrow. Here's where the roadmap is pointed."
      >
        <Roadmap />
      </Section>

      <CtaBlock ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top nav (landing-only)
// ---------------------------------------------------------------------------

function LandingNav({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <nav className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-9 w-9 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="font-serif italic text-accent text-lg leading-none">R</span>
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent animate-ping-soft" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight">Rupeezy AP Voice Agent</div>
            <div className="text-[11px] text-ink-mute font-mono tracking-wider">THEME 7 · MVP</div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm text-ink-mute">
          <a href="#how" className="hover:text-ink-text transition">How it works</a>
          <a href="#features" className="hover:text-ink-text transition">Features</a>
          <a href="#roadmap" className="hover:text-ink-text transition">Roadmap</a>
        </div>

        <Link
          href={ctaHref}
          className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-4 py-2 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_8px_24px_-8px_rgba(94,234,212,0.6)]"
        >
          {ctaLabel}
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition" />
        </Link>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % GREETINGS.length), 2200);
    return () => clearInterval(t);
  }, []);
  const g = GREETINGS[idx];

  return (
    <header className="relative isolate hero-halo grain pt-36 pb-24 md:pt-44 md:pb-32">
      <div className="absolute inset-0 -z-10 grid-overlay opacity-60" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-40 -z-10 bg-gradient-to-b from-transparent to-ink" aria-hidden />

      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 animate-fade-up">
          <div className="flex items-center gap-3 mb-7">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] gradient-text">
              <Sparkles size={12} className="text-accent" />
              THEME 7  ·  RUPEEZY AP PARTNER PROGRAM
            </span>
          </div>

          <h1 className="font-serif font-medium text-[clamp(2.5rem,7vw,5.25rem)] leading-[0.95] tracking-tight">
            AI that picks up <br />
            the phone <span className="font-serif italic font-light text-accent">—</span> <br />
            in your <span className="relative inline-block align-baseline">
              <span
                key={idx}
                className="inline-block font-serif italic font-light text-accent animate-fade-up"
                style={{ animationDuration: "500ms" }}
              >
                {g.tag}
              </span>
              <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-accent/40" />
            </span>.
          </h1>

          <p className="mt-8 max-w-xl text-base md:text-lg text-ink-mute leading-relaxed">
            A multilingual voice-agent platform that calls inbound AP partner leads
            <em className="text-ink-text not-italic font-medium"> instantly</em>,
            speaks <em className="text-ink-text not-italic font-medium">9 Indian languages</em> natively,
            handles the 5 core objections, and scores every conversation
            <em className="text-ink-text not-italic font-medium"> HOT / WARM / COLD </em>
            for the human RM.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 items-center">
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-6 py-3 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
            >
              {ctaLabel}
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-card/50 backdrop-blur px-6 py-3 text-sm font-semibold text-ink-text hover:border-accent/40 transition"
            >
              See how it works
            </a>
          </div>

          <HeroStats />
        </div>

        <div className="lg:col-span-5">
          <DialCard greeting={g} />
        </div>
      </div>
    </header>
  );
}

function HeroStats() {
  const stats = [
    { v: "18% → 40%+", l: "AP CONVERSION GOAL" },
    { v: "9",          l: "INDIAN LANGUAGES"   },
    { v: "<5s",        l: "TIME TO FIRST DIAL" },
  ];
  return (
    <dl className="mt-12 grid grid-cols-3 gap-3 max-w-xl">
      {stats.map((s) => (
        <div key={s.l} className="border-l border-ink-line pl-4">
          <dt className="text-[10px] font-mono tracking-[0.2em] text-ink-mute">{s.l}</dt>
          <dd className="mt-1 font-serif text-2xl md:text-3xl text-accent">{s.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DialCard({ greeting }: { greeting: typeof GREETINGS[number] }) {
  return (
    <div className="relative animate-fade-up [animation-delay:200ms]">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-2xl" aria-hidden />

      <div className="relative rounded-3xl border border-ink-line bg-ink-card/80 backdrop-blur p-6 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(94,234,212,0.08)]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-ping-soft" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-accent">LIVE CALL</span>
          </div>
          <div className="font-mono text-[10px] tracking-wider text-ink-mute">{greeting.lang.toUpperCase()}</div>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div className="h-12 w-12 rounded-2xl bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center">
            <Headphones size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Rupeezy AP Agent</div>
            <div className="text-xs text-ink-mute truncate font-mono">+91 ●●●●● ●●●●● — auto-dial</div>
          </div>
          <div className="text-xs text-ink-mute font-mono tabular-nums">00:14</div>
        </div>

        <Waveform />

        <div className="mt-6 grid gap-2.5">
          <div className="self-start max-w-[88%] rounded-2xl rounded-bl-sm bg-ink/60 ring-1 ring-ink-line px-4 py-3">
            <div className="font-mono text-[10px] tracking-[0.18em] text-ink-mute mb-1">AGENT · {greeting.lang.toUpperCase()}</div>
            <div className="font-serif text-xl text-accent leading-snug">{greeting.word}</div>
            <div className="text-xs text-ink-mute mt-1">Detected · auto-routing to matching voice</div>
          </div>
          <div className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-accent/15 ring-1 ring-accent/30 px-4 py-3 text-sm">
            <span className="text-ink-text">Yes, I am the partner. Tell me what you have.</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-mute">ENGAGEMENT</span>
          <div className="flex items-center gap-2">
            <ScoreChip label="HOT"  active />
            <ScoreChip label="WARM" />
            <ScoreChip label="COLD" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreChip({ label, active }: { label: string; active?: boolean }) {
  const tone =
    label === "HOT"  ? "text-hot ring-hot/40"  :
    label === "WARM" ? "text-warm ring-warm/40" : "text-cold ring-cold/40";
  return (
    <span className={`font-mono text-[10px] tracking-[0.16em] px-2 py-1 rounded-md ring-1 ${tone} ${active ? "bg-hot/10" : "opacity-50"}`}>
      {label}
    </span>
  );
}

function Waveform() {
  const heights = [22, 38, 60, 82, 50, 68, 30, 18, 42, 90, 78, 54, 32, 24, 70, 86, 60, 36, 22, 48, 74, 92, 64, 40, 26, 52, 80, 58, 34, 20, 44, 72, 88, 50, 28, 42];
  return (
    <div className="relative h-20 rounded-xl bg-ink/70 ring-1 ring-ink-line overflow-hidden flex items-center gap-[3px] px-3">
      {heights.map((h, i) => (
        <span
          key={i}
          className="block w-[3.5px] rounded-full bg-accent/80 origin-center animate-wave"
          style={{
            height: `${h}%`,
            animationDelay: `${(i % 12) * 90}ms`,
            opacity: 0.55 + (h / 200),
          }}
        />
      ))}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent/15 to-transparent animate-shimmer" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language marquee
// ---------------------------------------------------------------------------

function LanguageMarquee() {
  const langs = [
    "हिन्दी", "தமிழ்", "తెలుగు", "मराठी", "ગુજરાતી", "বাংলা",
    "ਪੰਜਾਬੀ", "Hinglish", "English",
  ];
  const items = [...langs, ...langs];
  return (
    <div className="relative border-y border-ink-line bg-ink-card/30 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-ink to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-ink to-transparent z-10 pointer-events-none" />
      <div className="marquee-track flex items-center gap-12 py-6 whitespace-nowrap">
        {items.map((l, i) => (
          <div key={i} className="flex items-center gap-12">
            <span className="font-serif text-3xl md:text-4xl text-ink-mute hover:text-accent transition">{l}</span>
            <span className="text-accent/30 text-2xl">·</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section primitive
// ---------------------------------------------------------------------------

function Section({
  eyebrow, title, kicker, children, anchor,
}: {
  eyebrow: string;
  title: React.ReactNode;
  kicker: string;
  children: React.ReactNode;
  anchor?: string;
}) {
  const id = anchor ?? eyebrow.toLowerCase().replace(/\s+/g, "-");
  return (
    <section id={id} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-8 mb-12">
          <div className="lg:col-span-3">
            <div className="font-mono text-[11px] tracking-[0.22em] text-accent">
              {eyebrow}
            </div>
          </div>
          <div className="lg:col-span-9">
            <h2 className="font-serif font-medium text-3xl md:text-5xl leading-[1.05] tracking-tight">
              {title}
            </h2>
            <p className="mt-5 max-w-2xl text-ink-mute leading-relaxed">
              {kicker}
            </p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problem cards
// ---------------------------------------------------------------------------

function ProblemCards() {
  const items = [
    {
      stat: "18%",  label: "today's AP conversion",
      body: "Best-case under current human-only outreach. Most leads are talked to days late, if at all.",
      icon: <LineChart size={22} className="text-accent" />,
    },
    {
      stat: "<5min", label: "before a hot lead cools",
      body: "Industry data on inbound finance leads. Human dialers can't beat this clock at scale.",
      icon: <Activity size={22} className="text-accent" />,
    },
    {
      stat: "9", label: "languages partners speak",
      body: "Hindi · Hinglish · English · Tamil · Telugu · Marathi · Gujarati · Bengali · Punjabi.",
      icon: <Languages size={22} className="text-accent" />,
    },
  ];
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="group relative rounded-2xl border border-ink-line bg-ink-card p-7 hover:border-accent/40 hover:bg-ink-card/80 transition">
          <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
          <div className="flex items-start justify-between mb-6">
            <div className="h-11 w-11 rounded-xl bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
              {it.icon}
            </div>
            <span className="font-mono text-[10px] tracking-[0.18em] text-ink-mute">PAIN</span>
          </div>
          <div className="font-serif text-5xl md:text-6xl font-medium text-accent leading-none mb-3">
            {it.stat}
          </div>
          <div className="text-sm font-semibold text-ink-text mb-2">{it.label}</div>
          <p className="text-sm text-ink-mute leading-relaxed">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How-it-works pipeline
// ---------------------------------------------------------------------------

function Pipeline() {
  const stages = [
    { icon: <CloudUpload size={20} className="text-accent" />, title: "INGEST", body: "CSV / form upload\nLeads → SQLite" },
    { icon: <Phone       size={20} className="text-accent" />, title: "DIAL",   body: "Twilio Programmable\nVoice via REST" },
    { icon: <Bot         size={20} className="text-accent" />, title: "AGENT",  body: "Pipecat 1.1 +\nTwilio Media Stream" },
    { icon: <Brain       size={20} className="text-accent" />, title: "REASON", body: "Kimi-K2.6 vLLM\nthinking off (low-lat)" },
    { icon: <LineChart   size={20} className="text-accent" />, title: "SCORE",  body: "Analyzer pass:\nHOT / WARM / COLD" },
  ];
  return (
    <>
      <div className="relative grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stages.map((s, i) => (
          <div key={s.title} className="relative">
            <div className="rounded-2xl border border-ink-line bg-ink-card hover:border-accent/40 transition p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="h-9 w-9 rounded-lg bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
                  {s.icon}
                </div>
                <span className="font-mono text-[9px] tracking-[0.18em] text-ink-mute">0{i+1}</span>
              </div>
              <div className="font-mono text-[11px] tracking-[0.18em] text-accent mb-2">{s.title}</div>
              <p className="text-xs text-ink-mute leading-relaxed whitespace-pre-line">{s.body}</p>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight
                size={18}
                className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-accent/40 z-10 bg-ink rounded-full"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-ink-line bg-ink-card p-5">
        <div className="font-mono text-[10px] tracking-[0.2em] text-ink-mute mb-4">
          CALL LIFECYCLE — recorded as events, rendered live in the operations DAG
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["queued", "dialing", "ringing", "picked", "agent_spoke", "user_spoke", "completed"].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase rounded-md bg-accent/10 ring-1 ring-accent/35 text-accent px-2.5 py-1.5">
                {s}
              </span>
              {i < arr.length - 1 && <span className="text-ink-line">·</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          "Pipecat 1.1", "Twilio Media Streams", "ngrok",
          "ElevenLabs Scribe v2", "Kimi-K2.6 (vLLM)", "ElevenLabs Turbo v2.5",
          "Silero VAD (ONNX)", "FastAPI", "SQLite", "Next.js 15 + React 19",
        ].map((c) => (
          <span key={c} className="font-mono text-[11px] text-ink-mute rounded-full border border-ink-line px-3 py-1 bg-ink-card/50">
            {c}
          </span>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Conversation preview
// ---------------------------------------------------------------------------

function ConversationPreview() {
  const lines: { who: "agent" | "user"; lang: string; text: string; gloss?: string }[] = [
    { who: "agent", lang: "Hindi",   text: "नमस्ते, मैं Rupeezy की प्रिया बोल रही हूँ। क्या मैं आपसे एक मिनट बात कर सकती हूँ?", gloss: "Hello, this is Priya from Rupeezy. May I take a minute of your time?" },
    { who: "user",  lang: "Hindi",   text: "हाँ बोलिए, क्या बात है?", gloss: "Yes, go ahead — what is it?" },
    { who: "agent", lang: "Hinglish", text: "AP partner program ke baare mein call kar rahi hoon. Aap apne current broker ke saath kitne saal se hain?", gloss: "I'm calling about the AP partner program. How long have you been with your current broker?" },
    { who: "user",  lang: "Hindi",    text: "अभी तीन साल हो गए। आपकी कमीशन कैसी है?", gloss: "Three years now. How is your commission?" },
    { who: "agent", lang: "Hinglish", text: "Industry-best 50–60% lifetime payout, plus 6 lakh ka monthly cap nahi hai. Main details WhatsApp pe bhej dungi?", gloss: "Industry-best 50–60% lifetime payout, no monthly cap. Shall I send the details on WhatsApp?" },
  ];

  const summary = {
    summary: "Engaged partner, currently with competitor for 3 years. Asked about commission. Open to receiving details. Strong fit.",
    objections: ["Commission concern (addressed: 50–60% payout)"],
    next: "Send WhatsApp brochure + RM follow-up within 24h",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7 rounded-3xl border border-ink-line bg-ink-card p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-50 animate-ping-soft" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-accent">LIVE TRANSCRIPT</span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-mute">CALL #4012</span>
        </div>
        <div className="space-y-4">
          {lines.map((l, i) => (
            <div key={i} className={l.who === "agent" ? "flex justify-start" : "flex justify-end"}>
              <div className={
                "max-w-[88%] rounded-2xl px-4 py-3 " +
                (l.who === "agent"
                  ? "bg-ink/60 ring-1 ring-ink-line rounded-bl-sm"
                  : "bg-accent/15 ring-1 ring-accent/30 rounded-br-sm")
              }>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={
                    "font-mono text-[9px] tracking-[0.18em] " +
                    (l.who === "agent" ? "text-accent" : "text-ink-mute")
                  }>
                    {l.who === "agent" ? "AGENT" : "LEAD"}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] text-ink-mute">·  {l.lang.toUpperCase()}</span>
                </div>
                <div className="text-sm leading-relaxed text-ink-text">{l.text}</div>
                {l.gloss && (
                  <div className="text-[11px] text-ink-mute italic mt-1.5">{l.gloss}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-5 rounded-3xl border border-ink-line bg-gradient-to-b from-ink-card to-ink-card/40 p-6 md:p-8">
        <div className="font-mono text-[10px] tracking-[0.22em] text-accent mb-3">POST-CALL ANALYSIS</div>
        <div className="flex items-center gap-3 mb-6">
          <span className="font-serif text-5xl text-hot leading-none">HOT</span>
          <span className="text-xs text-ink-mute font-mono tracking-wider">scored by Kimi analyzer</span>
        </div>
        <div className="space-y-5 text-sm">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-mute mb-1.5">SUMMARY</div>
            <p className="leading-relaxed text-ink-text">{summary.summary}</p>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-mute mb-1.5">OBJECTIONS</div>
            <ul className="space-y-1">
              {summary.objections.map((o) => (
                <li key={o} className="text-ink-text leading-relaxed">— {o}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-mute mb-1.5">NEXT ACTION</div>
            <p className="leading-relaxed text-ink-text">{summary.next}</p>
          </div>
        </div>
        <div className="mt-7 pt-5 border-t border-ink-line flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-mute">DURATION</span>
          <span className="font-mono text-sm text-ink-text">02:48</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature grid
// ---------------------------------------------------------------------------

function FeatureGrid() {
  const cards = [
    { icon: <Workflow size={20} className="text-accent" />, title: "Live operations DAG",
      body: "Aggregate funnel + per-call mini-DAGs. Drop-off branches surface failed dials in real time." },
    { icon: <Mic size={20} className="text-accent" />, title: "Call review with waveform",
      body: "WaveSurfer.js audio scrubbing, full transcript, stage timeline, and AI summary side-by-side." },
    { icon: <CloudUpload size={20} className="text-accent" />, title: "Bulk lead upload",
      body: "CSV import, voice picker per lead, RM notes flowing straight into the system prompt." },
    { icon: <Wand2 size={20} className="text-accent" />, title: "Per-lead voice + persona",
      body: "Curated 10-voice ElevenLabs catalogue. Agent name, brand, pronouns all set via .env." },
    { icon: <BarChart3 size={20} className="text-accent" />, title: "Analytics dashboards",
      body: "Recharts views: stage funnel, calls/day, score split. Refresh-driven, no extra cron." },
    { icon: <ShieldCheck size={20} className="text-accent" />, title: "JWT-secured admin",
      body: "Single predefined operator from .env, HS256-signed sessions, 401 auto-redirects to login." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="group relative rounded-2xl border border-ink-line bg-ink-card p-6 hover:border-accent/40 transition overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
              {c.icon}
            </div>
            <h3 className="font-semibold text-base text-ink-text">{c.title}</h3>
          </div>
          <p className="text-sm text-ink-mute leading-relaxed">{c.body}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

function Roadmap() {
  const items = [
    { tag: "Q3", title: "WhatsApp follow-up after every call",
      body: "Auto-send the call summary + brochure in the partner's language seconds after hang-up." },
    { tag: "Q3", title: "Realtime supervisor barge-in",
      body: "RM can take over the call mid-flight when the agent flags a HOT signal." },
    { tag: "Q4", title: "Voice cloning per RM",
      body: "Each RM can train a 30-second clone so reassigned calls feel continuous." },
    { tag: "Q4", title: "CRM + Salesforce sync",
      body: "Two-way sync of leads, transcripts, and scores. No more spreadsheet exports." },
    { tag: "'27", title: "Multi-tenant for adjacent programs",
      body: "Same engine for any inbound-heavy partner pipeline — insurance, lending, B2B SaaS." },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="relative rounded-3xl border border-ink-line bg-ink-card p-8 md:p-10 overflow-hidden">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="font-mono text-[11px] tracking-[0.22em] text-accent mb-6">PROJECTED IMPACT</div>
        <div className="flex items-baseline gap-4 md:gap-6 mb-6">
          <span className="font-serif text-6xl md:text-7xl text-ink-mute leading-none">18%</span>
          <ArrowRight size={32} className="text-accent" />
          <span className="font-serif text-6xl md:text-7xl text-accent leading-none">40%+</span>
        </div>
        <p className="text-ink-text leading-relaxed text-base">
          AP partner conversion rate target — driven by zero-latency dialing,
          native-language rapport, and a scoring layer the RM team
          <em className="text-accent not-italic font-semibold"> trusts</em>.
        </p>
      </div>

      <ol className="relative">
        <span className="absolute left-3.5 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent" aria-hidden />
        {items.map((it) => (
          <li key={it.title} className="relative pl-12 pb-7 last:pb-0">
            <span className="absolute left-0 top-0.5 h-7 w-7 rounded-full bg-ink ring-1 ring-accent/40 flex items-center justify-center">
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] tracking-[0.18em] text-accent">{it.tag}</span>
              <h4 className="font-semibold text-base text-ink-text">{it.title}</h4>
            </div>
            <p className="mt-1.5 text-sm text-ink-mute leading-relaxed">{it.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final CTA + footer
// ---------------------------------------------------------------------------

function CtaBlock({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-8">
          <div className="font-mono text-[11px] tracking-[0.22em] text-accent mb-5">RUN IT</div>
          <h2 className="font-serif font-medium text-4xl md:text-6xl tracking-tight leading-[1.05]">
            Three terminals.<br />
            Three commands. <span className="font-serif italic font-light text-accent">Live.</span>
          </h2>
          <p className="mt-5 max-w-xl text-ink-mute leading-relaxed">
            Sign in with the demo credentials, upload a CSV of leads, hit
            <em className="text-ink-text not-italic font-semibold"> Call all queued</em>,
            and watch the operations DAG light up.
          </p>
        </div>
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-ink-line bg-ink-card p-5 font-mono text-sm">
            <Cmd cmd="uv run api"        sub="FastAPI + Pipecat /ws"  />
            <Cmd cmd="ngrok http 8000"   sub="Public WS for Twilio"   />
            <Cmd cmd="cd ui && npm run dev" sub="Next.js admin :3000" last />
          </div>
          <Link
            href={ctaHref}
            className="mt-6 group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-6 py-3 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
          >
            {ctaLabel}
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Cmd({ cmd, sub, last }: { cmd: string; sub: string; last?: boolean }) {
  return (
    <div className={"py-3 " + (last ? "" : "border-b border-ink-line")}>
      <div className="text-accent">$ {cmd}</div>
      <div className="text-ink-mute text-[11px] tracking-wide mt-1">{sub}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-line">
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="font-serif italic text-accent">R</span>
          </div>
          <div className="text-sm">
            <div className="font-semibold tracking-tight">Rupeezy AP Voice Agent</div>
            <div className="text-[11px] text-ink-mute font-mono tracking-wider">THEME 7  ·  HACKATHON 2026</div>
          </div>
        </div>
        <div className="text-xs text-ink-mute leading-relaxed">
          Built with Pipecat 1.1 · Twilio · ElevenLabs · Kimi-K2.6 · FastAPI · Next.js 15
        </div>
      </div>
    </footer>
  );
}
