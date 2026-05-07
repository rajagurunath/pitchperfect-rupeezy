"use client";

// Pricing page. Three tiers, all with "Talk to sales" CTAs (no self-serve
// checkout, intentionally — this is enterprise-priced software). Same
// editorial dark + electric-teal aesthetic as the rest of the site.

import Link from "next/link";
import {
  ArrowRight, Check, Sparkles, Phone, Building2, ShieldCheck,
  Mic, Languages, BarChart3, Workflow, HeadphonesIcon, Wand2, Users,
} from "lucide-react";

const TIERS = [
  {
    name: "Pilot",
    eyebrow: "TRY IT",
    tagline: "See it work on your leads.",
    price: "Free",
    priceSub: "30-day pilot · no card needed",
    cta: "Start a pilot",
    href: "/contact?tier=pilot",
    highlight: false,
    features: [
      "Up to 200 outbound calls",
      "Three Indian languages of your choice",
      "Single agent voice & persona",
      "CSV lead upload",
      "Operations dashboard",
      "Email support",
    ],
  },
  {
    name: "Growth",
    eyebrow: "MOST POPULAR",
    tagline: "For teams running active partner-program acquisition.",
    price: "Contact sales",
    priceSub: "scales with your call volume",
    cta: "Talk to sales",
    href: "/contact?tier=growth",
    highlight: true,
    features: [
      "Multi-thousand call volume",
      "All nine Indian languages",
      "Curated voice library + per-lead persona",
      "Native CRM connectors (Salesforce, LeadSquared, HubSpot)",
      "Live operations DAG + per-call analytics",
      "Score-based RM handoff workflow",
      "Priority support · response within an hour",
    ],
  },
  {
    name: "Enterprise",
    eyebrow: "FOR LARGE TEAMS",
    tagline: "Custom deployments for regulated, multi-team environments.",
    price: "Custom",
    priceSub: "annual contract",
    cta: "Talk to sales",
    href: "/contact?tier=enterprise",
    highlight: false,
    features: [
      "Unlimited calling volume",
      "Custom voice cloning per RM",
      "SSO, SCIM, role-based access",
      "Configurable retention & PII redaction",
      "Dedicated success manager",
      "24/7 SLA · 99.9% uptime",
      "On-prem / VPC deployment available",
      "Security review & DPA support",
    ],
  },
];

const COMPARE = [
  {
    section: "Reach",
    rows: [
      { label: "Indian languages",                values: ["3 of your choice", "All 9", "All 9 + custom dialects"] },
      { label: "Outbound call volume",            values: ["200 (pilot total)", "Multi-thousand / mo", "Unlimited"] },
      { label: "Auto-dial latency",               values: ["< 5 seconds", "< 5 seconds", "< 3 seconds"] },
    ],
  },
  {
    section: "Voice & persona",
    rows: [
      { label: "Curated voice library",           values: [true, true, true] },
      { label: "Per-lead voice selection",        values: [false, true, true] },
      { label: "Custom voice cloning per RM",     values: [false, false, true] },
      { label: "Custom system-prompt tuning",     values: [false, true, true] },
    ],
  },
  {
    section: "Integrations",
    rows: [
      { label: "CSV lead upload",                 values: [true, true, true] },
      { label: "Native CRM connectors",           values: [false, true, true] },
      { label: "Custom webhook / API",            values: [false, true, true] },
      { label: "Salesforce, HubSpot, LeadSquared", values: [false, true, true] },
    ],
  },
  {
    section: "Operations",
    rows: [
      { label: "Operations dashboard",            values: [true, true, true] },
      { label: "Score + summary on every call",   values: [true, true, true] },
      { label: "Recording + transcript review",   values: [true, true, true] },
      { label: "Live supervisor barge-in",        values: [false, "coming soon", true] },
    ],
  },
  {
    section: "Security & support",
    rows: [
      { label: "Encryption at rest & in transit", values: [true, true, true] },
      { label: "SSO + role-based access",         values: [false, true, true] },
      { label: "Configurable retention",          values: [false, false, true] },
      { label: "Dedicated success manager",       values: [false, false, true] },
      { label: "Support SLA",                     values: ["Email", "1-hour priority", "24/7 · 99.9% uptime"] },
    ],
  },
];

const FAQ = [
  {
    q: "Why isn't there a self-serve price?",
    a: "Voice volume varies wildly across customers — some run 200 calls a week, some run 200 a day. Pricing scales with that, plus the integrations and language coverage you actually need. A 15-minute call gets you a real number for your team, not a list-price estimate.",
  },
  {
    q: "What's actually in the pilot?",
    a: "A 30-day window with up to 200 calls in three languages of your choice, on your real lead pipeline. We help you set up the script, pick a voice, and review the first 20 calls together. At the end you have real numbers — pickup rate, score split, conversion lift — to decide on Growth.",
  },
  {
    q: "Do you support our compliance setup?",
    a: "Yes. The platform supports configurable retention, PII redaction, and on-prem / VPC deployment for regulated customers. SOC 2 review and DPA support are part of the Enterprise tier. We have customers in stockbroking, lending, and insurance — happy to share the security review pack.",
  },
  {
    q: "Which Indian languages are covered?",
    a: "Hindi, Hinglish, English, Tamil, Telugu, Marathi, Gujarati, Bengali, and Punjabi. All nine are auto-detected mid-call — the agent matches the lead's language without you having to pick one upfront.",
  },
  {
    q: "How long does onboarding take?",
    a: "Pilot: same-day. Growth: typically 1–2 weeks including CRM integration and script tuning. Enterprise: depends on security review and deployment model, usually 4–8 weeks.",
  },
];

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden bg-ink text-ink-text min-h-screen">
      <Nav />

      <Hero />

      <TierGrid />

      <CompareTable />

      <Faq />

      <Cta />

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Nav() {
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
            <div className="text-sm font-semibold tracking-tight">Rupeezy AP Agent</div>
            <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm text-ink-mute">
          <Link href="/#how"      className="hover:text-ink-text transition">Product</Link>
          <Link href="/#features" className="hover:text-ink-text transition">Why us</Link>
          <Link href="/pricing"   className="text-ink-text">Pricing</Link>
          <Link href="/#use-cases" className="hover:text-ink-text transition">Use cases</Link>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex text-sm text-ink-mute hover:text-ink-text px-3 py-2 transition">
            Sign in
          </Link>
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-4 py-2 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_8px_24px_-8px_rgba(94,234,212,0.6)]"
          >
            Book a demo
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="relative isolate hero-halo grain pt-36 pb-20 md:pt-44 md:pb-24">
      <div className="absolute inset-0 -z-10 grid-overlay opacity-50" aria-hidden />

      <div className="mx-auto max-w-7xl px-6 text-center animate-fade-up">
        <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.22em] gradient-text font-semibold mb-7">
          <Sparkles size={12} className="text-accent" />
          PRICING
        </div>
        <h1 className="font-serif font-medium text-4xl md:text-6xl leading-[1.05] tracking-tight max-w-3xl mx-auto">
          Priced to <em className="font-serif italic font-light text-accent">match</em> your call volume — not your team size.
        </h1>
        <p className="mt-6 mx-auto max-w-2xl text-base md:text-lg text-ink-mute leading-relaxed">
          Start with a free 30-day pilot on your real lead pipeline. Move to
          Growth when the numbers prove themselves. Upgrade to Enterprise when
          security and scale matter most.
        </p>
      </div>
    </header>
  );
}

function TierGrid() {
  return (
    <section className="relative pb-24 md:pb-32">
      <div className="mx-auto max-w-7xl px-6 grid gap-6 md:grid-cols-3 items-stretch">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={
              "relative rounded-3xl p-8 flex flex-col " +
              (t.highlight
                ? "border border-accent/40 bg-gradient-to-b from-accent/10 to-ink-card shadow-[0_30px_60px_-30px_rgba(94,234,212,0.4),0_0_0_1px_rgba(94,234,212,0.2)]"
                : "border border-ink-line bg-ink-card")
            }
          >
            {t.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-ink text-[10px] font-bold tracking-[0.18em] shadow-md">
                {t.eyebrow}
              </div>
            )}
            {!t.highlight && (
              <div className="text-[10px] tracking-[0.22em] text-accent font-semibold mb-2">{t.eyebrow}</div>
            )}

            <div className={t.highlight ? "mt-2" : ""}>
              <h3 className="font-serif text-3xl text-ink-text font-medium">{t.name}</h3>
              <p className="mt-2 text-sm text-ink-mute leading-relaxed">{t.tagline}</p>
            </div>

            <div className="mt-7 pb-7 border-b border-ink-line">
              <div className={"font-serif " + (t.price === "Free" ? "text-5xl text-accent" : t.price === "Custom" ? "text-4xl text-ink-text" : "text-3xl text-ink-text")}>
                {t.price}
              </div>
              <div className="mt-2 text-xs text-ink-mute">{t.priceSub}</div>
            </div>

            <ul className="mt-7 space-y-3 flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-ink-text">
                  <Check size={16} className="text-accent mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={t.href}
              className={
                "mt-8 group inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition " +
                (t.highlight
                  ? "bg-accent text-ink hover:opacity-90 shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
                  : "border border-ink-line bg-ink-card hover:border-accent/40 text-ink-text")
              }
            >
              {t.cta}
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition" />
            </Link>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-7xl px-6 mt-10 text-center">
        <div className="text-xs text-ink-mute">
          All tiers include encrypted recordings, SOC 2-aligned controls, and the operations console.
        </div>
      </div>
    </section>
  );
}

function CompareTable() {
  return (
    <section className="relative py-20 border-t border-ink-line">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-12">
          <div className="text-[11px] tracking-[0.22em] text-accent font-semibold mb-4">EVERY DETAIL</div>
          <h2 className="font-serif font-medium text-3xl md:text-5xl leading-[1.05] tracking-tight">
            Compare the <em className="font-serif italic font-light text-accent">tiers</em>.
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-ink-line bg-ink-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-line">
                <th className="text-left p-5 text-[11px] tracking-[0.18em] text-ink-mute font-semibold uppercase">Feature</th>
                {TIERS.map((t) => (
                  <th key={t.name} className="text-left p-5 min-w-[180px]">
                    <div className="font-serif text-lg text-ink-text font-medium">{t.name}</div>
                    <div className="text-[11px] text-ink-mute mt-0.5">{t.price === "Free" ? "Free pilot" : t.price === "Custom" ? "Custom" : "Talk to sales"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.flatMap((sec) => [
                <tr key={`${sec.section}-h`} className="bg-ink/40">
                  <td colSpan={4} className="px-5 py-3 text-[11px] tracking-[0.22em] text-accent font-semibold uppercase">
                    {sec.section}
                  </td>
                </tr>,
                ...sec.rows.map((row) => (
                  <tr key={`${sec.section}-${row.label}`} className="border-b border-ink-line/60 last:border-0">
                    <td className="p-5 text-ink-text">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="p-5 text-sm">
                        {v === true ? (
                          <Check size={18} className="text-accent" />
                        ) : v === false ? (
                          <span className="text-ink-line">—</span>
                        ) : (
                          <span className="text-ink-text">{v}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-12">
          <div className="text-[11px] tracking-[0.22em] text-accent font-semibold mb-4">QUESTIONS WE ALWAYS GET</div>
          <h2 className="font-serif font-medium text-3xl md:text-5xl leading-[1.05] tracking-tight">
            Frequently <em className="font-serif italic font-light text-accent">asked</em>.
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-ink-line bg-ink-card hover:border-accent/40 transition">
              <summary className="cursor-pointer list-none p-6 flex items-start gap-4">
                <span className="font-serif text-lg text-ink-text font-medium flex-1">{f.q}</span>
                <span className="text-accent text-2xl leading-none transition group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-6 text-sm text-ink-mute leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative overflow-hidden border-t border-ink-line">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[60%] rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 text-center">
        <div className="text-[11px] tracking-[0.22em] text-accent font-semibold mb-6">READY?</div>
        <h2 className="font-serif font-medium text-4xl md:text-6xl tracking-tight leading-[1.05] mx-auto max-w-3xl">
          Get a price built for <em className="font-serif italic font-light text-accent">your</em> book.
        </h2>
        <p className="mt-6 mx-auto max-w-xl text-ink-mute leading-relaxed">
          Tell us your monthly call volume, language mix, and CRM stack — we&apos;ll
          come back with a real quote within one business day.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-full bg-accent text-ink px-7 py-3.5 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)]"
          >
            Talk to sales
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-card/50 backdrop-blur px-7 py-3.5 text-sm font-semibold text-ink-text hover:border-accent/40 transition"
          >
            Back to product
          </Link>
        </div>
      </div>
    </section>
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
            <div className="font-semibold tracking-tight">Rupeezy AP Agent</div>
            <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
          </div>
        </div>
        <div className="text-[11px] text-ink-mute">© {new Date().getFullYear()} Rupeezy. All rights reserved.</div>
      </div>
    </footer>
  );
}
