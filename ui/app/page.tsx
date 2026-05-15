"use client";

// Public marketing site for PitchPerfect — voice AI for partner-program
// outreach. Editorial dark + electric-teal aesthetic; product-led copy that
// leads with outcomes (conversion lift, language reach, RM productivity)
// rather than implementation details. Rupeezy is featured as the launch
// customer in the trust strip, dial card, and conversation transcript.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Languages, ShieldCheck, Sparkles, ArrowRight, Activity, Mic, Headphones,
  Wand2, BarChart3, CloudUpload, Workflow, LineChart, Building2, Briefcase,
  HeartHandshake, PiggyBank, CheckCircle2, Clock, Users,
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
  const ctaLabel = isAuthed ? "Open console" : "Sign in";

  return (
    <div className="relative overflow-hidden bg-ink text-ink-text">
      <LandingNav ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <Hero ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <TrustStrip />

      <LanguageMarquee />

      <Section
        eyebrow="THE PROBLEM"
        title={<>Most inbound leads are <em className="font-serif italic font-normal text-accent/90">lost</em> before anyone calls them back.</>}
        kicker="Partner-program acquisition lives or dies in the first five minutes. Human RMs can't beat that clock — and when they reach the lead, they often don't share a language. Two failures, one funnel."
      >
        <ProblemCards />
      </Section>

      <Section
        eyebrow="HOW IT WORKS"
        anchor="how"
        title={<>Three steps from <em className="font-serif italic font-normal text-accent/90">lead</em> to a qualified conversation.</>}
        kicker="Designed to drop in next to your CRM. No engineering team required. No multi-week onboarding."
      >
        <HowItWorks />
      </Section>

      <Section
        eyebrow="LIVE CONVERSATION"
        title={<>The agent <em className="font-serif italic font-normal text-accent/90">listens</em>, responds, and remembers.</>}
        kicker="A real call from a partner pitch — translated for clarity. Auto-detected language, native pronunciation, objection handling tuned to your script."
      >
        <ConversationPreview />
      </Section>

      <Section
        eyebrow="WHY TEAMS PICK US"
        anchor="features"
        title={<>Everything an ops team needs. <em className="font-serif italic font-normal text-accent/90">Nothing</em> they don&apos;t.</>}
        kicker="Drop-in voice AI plus the operational console to actually run on it. Built for sales, ops, and compliance — not for tinkering."
      >
        <FeatureGrid />
      </Section>

      <UseCases />

      <Section
        eyebrow="WHAT'S NEXT"
        anchor="roadmap"
      >
        <Roadmap />
      </Section>

      <CtaBlock ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top nav
// ---------------------------------------------------------------------------

function LandingNav({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const { isAuthed } = useAuth();
  return (
    <nav className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-9 w-9 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="font-serif italic text-accent text-lg leading-none">P</span>
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent animate-ping-soft" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight">PitchPerfect</div>
            <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm text-ink-mute">
          <a href="#how"      className="hover:text-ink-text transition">Product</a>
          <a href="#features" className="hover:text-ink-text transition">Why us</a>
          <a href="#use-cases" className="hover:text-ink-text transition">Use cases</a>
          <Link href="/pricing" className="hover:text-ink-text transition">Pricing</Link>
        </div>

        <div className="flex items-center gap-2">
          {!isAuthed && (
            <Link href="/login" className="hidden sm:inline-flex text-sm text-ink-mute hover:text-ink-text px-3 py-2 transition">
              Sign in
            </Link>
          )}
          <Link
            href={isAuthed ? "/operations" : "/contact"}
            className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-4 py-2 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_8px_24px_-8px_rgba(94,234,212,0.6)]"
          >
            {isAuthed ? ctaLabel : "Book a demo"}
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition" />
          </Link>
        </div>
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
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] gradient-text font-semibold">
              <Sparkles size={12} className="text-accent" />
              VOICE AI FOR PARTNER PROGRAMS
            </span>
          </div>

          <h1 className="font-serif font-medium text-[clamp(2.5rem,7vw,5.25rem)] leading-[0.95] tracking-tight">
            Agent that picks up <br />
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
            Reach every inbound partner lead in seconds — in any of nine Indian
            languages. Your voice agent qualifies, handles objections, and
            hands every conversation back to your RM team
            <em className="text-ink-text not-italic font-medium"> scored, summarised, and ready to close</em>.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 items-center">
            <Link
              href="/contact"
              className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-6 py-3 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
            >
              Book a demo
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-card/50 backdrop-blur px-6 py-3 text-sm font-semibold text-ink-text hover:border-accent/40 transition"
            >
              See pricing
            </Link>
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
    { v: "2.2×",  l: "AVG. CONVERSION LIFT" },
    { v: "9",     l: "INDIAN LANGUAGES" },
    { v: "<5s",   l: "TIME TO FIRST DIAL" },
  ];
  return (
    <dl className="mt-12 grid grid-cols-3 gap-3 max-w-xl">
      {stats.map((s) => (
        <div key={s.l} className="border-l border-ink-line pl-4">
          <dt className="text-[10px] tracking-[0.2em] text-ink-mute font-semibold">{s.l}</dt>
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
            <span className="text-[10px] tracking-[0.2em] text-accent font-semibold">LIVE CALL</span>
          </div>
          <div className="text-[10px] tracking-wider text-ink-mute font-semibold">{greeting.lang.toUpperCase()}</div>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div className="h-12 w-12 rounded-2xl bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center">
            <Headphones size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Rupeezy AP Agent</div>
            <div className="text-xs text-ink-mute truncate">Calling partner — auto-dialed</div>
          </div>
          <div className="text-xs text-ink-mute font-mono tabular-nums">00:14</div>
        </div>

        <Waveform />

        <div className="mt-6 grid gap-2.5">
          <div className="self-start max-w-[88%] rounded-2xl rounded-bl-sm bg-ink/60 ring-1 ring-ink-line px-4 py-3">
            <div className="text-[10px] tracking-[0.18em] text-ink-mute font-semibold mb-1">AGENT · {greeting.lang.toUpperCase()}</div>
            <div className="font-serif text-xl text-accent leading-snug">{greeting.word}</div>
            <div className="text-xs text-ink-mute mt-1">Detected · matching native voice</div>
          </div>
          <div className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-accent/15 ring-1 ring-accent/30 px-4 py-3 text-sm">
            <span className="text-ink-text">Yes, I am the partner. Tell me what you have.</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
          <span className="text-[10px] tracking-[0.18em] text-ink-mute font-semibold">ENGAGEMENT</span>
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
    <span className={`text-[10px] tracking-[0.16em] px-2 py-1 rounded-md ring-1 font-semibold ${tone} ${active ? "bg-hot/10" : "opacity-50"}`}>
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
// Trust strip — placeholder logos / partner-program social proof
// ---------------------------------------------------------------------------

function TrustStrip() {
  const industries = [
    "Stockbroking",
    "Wealth & PMS",
    "Insurance",
    "Lending",
    "AMCs",
  ];
  return (
    <section className="relative -mt-12 pb-6">
      <div className="mx-auto max-w-7xl px-6">
        {/* Featured customer card */}
        <div className="mb-12 flex items-center justify-center">
          <div className="inline-flex items-center gap-5 rounded-full border border-accent/30 bg-accent/5 px-6 py-3.5 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-50 animate-ping-soft" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="text-[10px] tracking-[0.22em] text-accent font-semibold">LIVE WITH</span>
            </div>
            <div className="font-serif text-2xl text-ink-text font-medium">Rupeezy</div>
            <div className="hidden sm:block h-5 w-px bg-ink-line" />
            <div className="hidden sm:block text-xs text-ink-mute">
              powering AP partner outreach in 9 Indian languages
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[11px] tracking-[0.22em] text-ink-mute font-semibold mb-6">
            BUILT FOR PARTNER-LED ACQUISITION IN
          </div>
          <div className="flex items-center justify-center gap-8 md:gap-14 flex-wrap">
            {industries.map((it) => (
              <div key={it} className="font-serif text-xl md:text-2xl text-ink-mute hover:text-ink-text transition">
                {it}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
    <div className="relative border-y border-ink-line bg-ink-card/30 overflow-hidden mt-12">
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
  title?: React.ReactNode;
  kicker?: string;
  children: React.ReactNode;
  anchor?: string;
}) {
  const id = anchor ?? eyebrow.toLowerCase().replace(/\s+/g, "-");
  return (
    <section id={id} className="relative py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-6">
        {(title || kicker) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-8 mb-12">
            <div className="lg:col-span-3">
              <div className="text-[11px] tracking-[0.22em] text-accent font-semibold">
                {eyebrow}
              </div>
            </div>
            <div className="lg:col-span-9">
              {title && (
                <h2 className="font-serif font-medium text-3xl md:text-5xl leading-[1.05] tracking-tight">
                  {title}
                </h2>
              )}
              {kicker && (
                <p className="mt-5 max-w-2xl text-ink-mute leading-relaxed">
                  {kicker}
                </p>
              )}
            </div>
          </div>
        )}
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
      stat: "78%",  label: "of inbound leads go cold",
      body: "Most never get a call back within the window where they're still warm. Manual dialer queues simply can't scale to instant response.",
      icon: <Clock size={22} className="text-accent" />,
    },
    {
      stat: "9", label: "languages partners speak",
      body: "Your RM team probably speaks two. Hindi · Hinglish · English · Tamil · Telugu · Marathi · Gujarati · Bengali · Punjabi.",
      icon: <Languages size={22} className="text-accent" />,
    },
    {
      stat: "60%", label: "of an RM's day on dialing",
      body: "Hours lost on no-answers, voicemails, and unqualified leads — instead of closing the warm ones already in their pipeline.",
      icon: <Users size={22} className="text-accent" />,
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
            <span className="text-[10px] tracking-[0.18em] text-ink-mute font-semibold">PAIN</span>
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
// How it works — 3 buyer-facing steps
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      n: "01", icon: <CloudUpload size={22} className="text-accent" />,
      title: "Connect your leads",
      body: "Upload a CSV, plug into your CRM, or push leads via API. Tag each one with the language and persona you want the agent to use.",
    },
    {
      n: "02", icon: <Headphones size={22} className="text-accent" />,
      title: "Agent calls in seconds",
      body: "We dial the lead in their language, run your qualification script, handle the five core objections, and stay on tone — every time.",
    },
    {
      n: "03", icon: <BarChart3 size={22} className="text-accent" />,
      title: "RM closes the warm ones",
      body: "Each call is scored HOT / WARM / COLD with a summary, objections raised, and a recommended next action. Your RM only opens the ones that matter.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3 relative">
      {steps.map((s, i) => (
        <div key={s.n} className="relative">
          <div className="rounded-2xl border border-ink-line bg-ink-card p-7 h-full hover:border-accent/40 transition">
            <div className="flex items-center justify-between mb-5">
              <div className="h-12 w-12 rounded-xl bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
                {s.icon}
              </div>
              <span className="font-serif text-3xl text-accent/30">{s.n}</span>
            </div>
            <h3 className="font-serif text-2xl text-ink-text font-medium leading-tight mb-3">
              {s.title}
            </h3>
            <p className="text-sm text-ink-mute leading-relaxed">{s.body}</p>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight
              size={22}
              className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-accent/40 z-10 bg-ink rounded-full"
            />
          )}
        </div>
      ))}
    </div>
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
            <span className="text-[10px] tracking-[0.2em] text-accent font-semibold">LIVE TRANSCRIPT</span>
          </div>
          <span className="text-[10px] tracking-[0.18em] text-ink-mute font-semibold">CALL #4012</span>
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
                    "text-[9px] tracking-[0.18em] font-semibold " +
                    (l.who === "agent" ? "text-accent" : "text-ink-mute")
                  }>
                    {l.who === "agent" ? "AGENT" : "LEAD"}
                  </span>
                  <span className="text-[9px] tracking-[0.14em] text-ink-mute font-semibold">·  {l.lang.toUpperCase()}</span>
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
        <div className="text-[10px] tracking-[0.22em] text-accent font-semibold mb-3">POST-CALL ANALYSIS</div>
        <div className="flex items-center gap-3 mb-6">
          <span className="font-serif text-5xl text-hot leading-none">HOT</span>
          <span className="text-xs text-ink-mute tracking-wider">qualification score</span>
        </div>
        <div className="space-y-5 text-sm">
          <div>
            <div className="text-[10px] tracking-[0.2em] text-ink-mute font-semibold mb-1.5">SUMMARY</div>
            <p className="leading-relaxed text-ink-text">{summary.summary}</p>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] text-ink-mute font-semibold mb-1.5">OBJECTIONS</div>
            <ul className="space-y-1">
              {summary.objections.map((o) => (
                <li key={o} className="text-ink-text leading-relaxed">— {o}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] text-ink-mute font-semibold mb-1.5">NEXT ACTION</div>
            <p className="leading-relaxed text-ink-text">{summary.next}</p>
          </div>
        </div>
        <div className="mt-7 pt-5 border-t border-ink-line flex items-center justify-between">
          <span className="text-[10px] tracking-[0.2em] text-ink-mute font-semibold">DURATION</span>
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
    { icon: <Languages size={20} className="text-accent" />, title: "Multilingual by default",
      body: "Nine Indian languages auto-detected mid-call. The agent matches the lead's language without you ever picking one." },
    { icon: <Wand2 size={20} className="text-accent" />, title: "Sounds like your brand",
      body: "Pick from a curated voice library or clone your top RM. Persona, tone, and pitch tuned per campaign." },
    { icon: <Workflow size={20} className="text-accent" />, title: "Live operations console",
      body: "Watch every call land in real time. Funnel views, drop-off branches, and per-call DAGs surface what's working — and what isn't." },
    { icon: <Mic size={20} className="text-accent" />, title: "Replayable transcripts",
      body: "Every call is captured with full audio, transcript, stage timeline, and AI-generated summary side-by-side." },
    { icon: <BarChart3 size={20} className="text-accent" />, title: "Score-driven handoff",
      body: "HOT / WARM / COLD scoring on every call so your RM team can spend time on the leads that actually convert." },
    { icon: <ShieldCheck size={20} className="text-accent" />, title: "Built for compliance",
      body: "Role-based access, encrypted recordings, configurable retention, and audit logs. Ready for your security review." },
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
// Use cases
// ---------------------------------------------------------------------------

function UseCases() {
  const items = [
    {
      icon: <Building2 size={22} className="text-accent" />,
      industry: "Stockbroking",
      title: "Authorised Person & sub-broker outreach",
      body: "Onboard new APs, qualify them across commission, AUM, and trading focus — in their first language.",
    },
    {
      icon: <PiggyBank size={22} className="text-accent" />,
      industry: "Wealth & PMS",
      title: "RIA and IFA partner pipelines",
      body: "Reach independent advisors at scale. Discuss minimums, payouts, and platform fit without a single human dialer.",
    },
    {
      icon: <HeartHandshake size={22} className="text-accent" />,
      industry: "Insurance",
      title: "POSP and agent recruitment",
      body: "Run high-volume recruitment outreach across Tier-2 and Tier-3 markets in the language candidates actually speak.",
    },
    {
      icon: <Briefcase size={22} className="text-accent" />,
      industry: "Lending",
      title: "DSA and channel partner activation",
      body: "Re-activate dormant DSAs, qualify new ones, and route hot leads to the right RM — same day.",
    },
  ];
  return (
    <section id="use-cases" className="relative py-12 md:py-16 border-t border-ink-line bg-gradient-to-b from-ink to-ink-card/20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-8 mb-12">
          <div className="lg:col-span-3">
            <div className="text-[11px] tracking-[0.22em] text-accent font-semibold">USE CASES</div>
          </div>
          <div className="lg:col-span-9">
            <h2 className="font-serif font-medium text-3xl md:text-5xl leading-[1.05] tracking-tight">
              Made for any partner-led <em className="font-serif italic font-normal text-accent/90">acquisition</em> motion.
            </h2>
            <p className="mt-5 max-w-2xl text-ink-mute leading-relaxed">
              Wherever your business depends on calling intermediaries quickly,
              accurately, and in the right language — we replace the manual queue.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl border border-ink-line bg-ink-card p-7 flex gap-5 hover:border-accent/40 transition">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-accent/10 ring-1 ring-accent/25 flex items-center justify-center">
                {it.icon}
              </div>
              <div>
                <div className="text-[10px] tracking-[0.22em] text-accent font-semibold mb-1.5">{it.industry.toUpperCase()}</div>
                <h3 className="font-serif text-2xl text-ink-text font-medium leading-tight mb-2">{it.title}</h3>
                <p className="text-sm text-ink-mute leading-relaxed">{it.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Roadmap (now: "What's next" — directional, not dated)
// ---------------------------------------------------------------------------

function Roadmap() {
  const items = [
    {
      tag: "9 LANGUAGES",
      title: "Dialect tuning + more languages",
      body: "Beyond the 9 launch languages: dialect-aware voice models, Bhojpuri, Odia, Assamese, and per-RM voice cloning so every reassigned call sounds continuous.",
    },
    {
      tag: "SUB-5s DIAL",
      title: "WhatsApp follow-up, seconds after hang-up",
      body: "The same speed that gets us into the call gets the summary out. Brochure, next steps, and call recap delivered in the partner's language before they hang up the mental context.",
    },
    {
      tag: "SCORING",
      title: "RM priority queue + live barge-in",
      body: "A ranked inbox that puts HOT leads at the top — and lets an RM join any live call the moment the agent flags strong intent, without dropping the lead.",
    },
    {
      tag: "CONSOLE",
      title: "Native CRM connectors",
      body: "Salesforce, HubSpot, LeadSquared, Zoho. Leads flow in; transcripts, scores, and next actions flow back out. No exports, no copy-paste.",
    },
    {
      tag: "NEXT",
      title: "Voice cloning per RM",
      body: "Let each RM record a 30-second clone so reassigned calls feel continuous to the partner.",
    },
    {
      tag: "LATER",
      title: "Multi-channel orchestration",
      body: "Voice + WhatsApp + email, sequenced automatically per persona — so no lead falls through the cracks.",
    },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="relative rounded-3xl border border-ink-line bg-ink-card p-8 md:p-10 overflow-hidden">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="text-[11px] tracking-[0.22em] text-accent font-semibold mb-6">YOUR NORTH STAR</div>
        <div className="font-serif text-3xl md:text-4xl text-ink-text leading-tight font-medium mb-6">
          Every inbound lead reached, in their language, while they&apos;re still warm.
        </div>
        <p className="text-ink-mute leading-relaxed">
          Speed-to-lead, multilingual reach, and a scoring layer your RM team
          can <em className="text-accent not-italic font-semibold">trust</em> —
          the three things that turn an acquisition channel from a leaky bucket
          into a compounding one.
        </p>
        <ul className="mt-7 space-y-2.5">
          {[
            "9 Indian languages out of the box",
            "Sub-5-second auto-dial on lead arrival",
            "Per-call score with summary and next action",
            "Drop-in console, no engineering team needed",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-ink-text">
              <CheckCircle2 size={16} className="text-accent mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <ol className="relative">
        <span className="absolute left-3.5 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent" aria-hidden />
        {items.map((it) => (
          <li key={it.title} className="relative pl-12 pb-7 last:pb-0">
            <span className="absolute left-0 top-0.5 h-7 w-7 rounded-full bg-ink ring-1 ring-accent/40 flex items-center justify-center">
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] tracking-[0.22em] text-accent font-semibold">{it.tag}</span>
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
// Final CTA
// ---------------------------------------------------------------------------

function CtaBlock(_: { ctaHref: string; ctaLabel: string }) {
  return (
    <section id="book" className="relative overflow-hidden border-t border-ink-line">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[60%] rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 text-center">
        <div className="text-[11px] tracking-[0.22em] text-accent font-semibold mb-6">SEE IT ON YOUR LEADS</div>
        <h2 className="font-serif font-medium text-4xl md:text-6xl tracking-tight leading-[1.05] mx-auto max-w-3xl">
          Stop losing partners to <em className="font-serif italic font-light text-accent">slow callbacks</em>.
        </h2>
        <p className="mt-6 mx-auto max-w-xl text-ink-mute leading-relaxed">
          Book a 30-minute walkthrough. We&apos;ll run a sample lead set through the
          agent live — in your script, your voice, and your language mix.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-7 py-3.5 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
          >
            Book a demo
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-card/50 backdrop-blur px-7 py-3.5 text-sm font-semibold text-ink-text hover:border-accent/40 transition"
          >
            See pricing
          </Link>
        </div>
        <div className="mt-8 text-xs text-ink-mute">
          No commitment. We&apos;ll show you a working call in under fifteen minutes.
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-ink-line">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
              <span className="font-serif italic text-accent">P</span>
            </div>
            <div>
              <div className="font-semibold tracking-tight">PitchPerfect</div>
              <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
            </div>
          </div>
          <p className="mt-5 text-sm text-ink-mute leading-relaxed max-w-sm">
            Reach every inbound lead, in any of nine Indian languages, while
            they&apos;re still warm — and let your RM team spend their time on the
            ones that actually close.
          </p>
         
        </div>

        <div className="md:col-span-2">
          <div className="text-[11px] tracking-[0.22em] text-ink-mute font-semibold mb-4">PRODUCT</div>
          <ul className="space-y-2 text-sm">
            <li><a href="#how"        className="text-ink-text hover:text-accent transition">How it works</a></li>
            <li><a href="#features"   className="text-ink-text hover:text-accent transition">Why us</a></li>
            <li><a href="#use-cases"  className="text-ink-text hover:text-accent transition">Use cases</a></li>
            <li><Link href="/pricing" className="text-ink-text hover:text-accent transition">Pricing</Link></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <div className="text-[11px] tracking-[0.22em] text-ink-mute font-semibold mb-4">COMPANY</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/contact" className="text-ink-text hover:text-accent transition">Contact sales</Link></li>
            <li><Link href="/login" className="text-ink-text hover:text-accent transition">Sign in</Link></li>
          </ul>
        </div>

        <div className="md:col-span-3">
          <div className="text-[11px] tracking-[0.22em] text-ink-mute font-semibold mb-4">GET IN TOUCH</div>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-accent/10 ring-1 ring-accent/40 text-accent px-4 py-2 text-sm font-semibold hover:bg-accent/15 transition"
          >
            Book a demo
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <div className="border-t border-ink-line">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[11px] text-ink-mute">
          <div>© {new Date().getFullYear()} PitchPerfect. All rights reserved.</div>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-ink-text transition">Privacy</a>
            <a href="#" className="hover:text-ink-text transition">Terms</a>
            <a href="#" className="hover:text-ink-text transition">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
