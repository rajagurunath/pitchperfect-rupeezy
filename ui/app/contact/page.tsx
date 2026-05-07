"use client";

// Contact / Book a demo page. Backend-less: the form opens a pre-filled
// mailto so a real human reads it. Designed to feel like a polished SaaS
// "Talk to sales" page rather than a contact form.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowRight, CheckCircle2, Clock, Sparkles, Mail, Phone, Globe,
  ShieldCheck,
} from "lucide-react";

const TIER_LABEL: Record<string, string> = {
  pilot: "Pilot",
  growth: "Growth",
  enterprise: "Enterprise",
};

const VOLUMES = [
  "Just exploring",
  "Under 500 calls / month",
  "500 – 5,000 calls / month",
  "5,000 – 50,000 calls / month",
  "50,000+ calls / month",
];

const TIMELINES = [
  "ASAP — within 30 days",
  "This quarter",
  "Next quarter",
  "Just researching",
];

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactInner />
    </Suspense>
  );
}

function ContactInner() {
  const params = useSearchParams();
  const tier = params.get("tier");
  const fromLogin = params.get("from") === "login";

  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole]       = useState("");
  const [volume, setVolume]   = useState(VOLUMES[2]);
  const [timeline, setTimeline] = useState(TIMELINES[1]);
  const [message, setMessage] = useState("");
  const [tierLabel, setTierLabel] = useState<string>("");

  useEffect(() => {
    if (tier && TIER_LABEL[tier]) setTierLabel(TIER_LABEL[tier]);
  }, [tier]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const subject = `Rupeezy AP Agent — ${tierLabel || "Demo"} request from ${company || name}`;
    const body =
      `Hi Rupeezy team,\n\n` +
      `I'd like to talk to sales about Rupeezy AP Agent.\n\n` +
      `Name:     ${name}\n` +
      `Email:    ${email}\n` +
      `Company:  ${company}\n` +
      `Role:     ${role}\n` +
      (tierLabel ? `Tier:     ${tierLabel}\n` : "") +
      `Volume:   ${volume}\n` +
      `Timeline: ${timeline}\n\n` +
      (message ? `Notes:\n${message}\n\n` : "") +
      `Thanks!`;
    window.location.href =
      `mailto:hello@rupeezy.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="relative overflow-hidden bg-ink text-ink-text min-h-screen">
      <Nav />

      {/* atmospheric background */}
      <div className="absolute inset-0 -z-10 hero-halo" aria-hidden />
      <div className="absolute inset-0 -z-10 grid-overlay opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-6 pt-32 md:pt-40 pb-24 grid lg:grid-cols-12 gap-12">
        {/* LEFT — pitch */}
        <div className="lg:col-span-5 animate-fade-up">
          <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.22em] gradient-text font-semibold mb-7">
            <Sparkles size={12} className="text-accent" />
            {fromLogin ? "REQUEST ACCESS" : "TALK TO SALES"}
          </div>
          <h1 className="font-serif font-medium text-4xl md:text-6xl leading-[0.98] tracking-tight">
            Let&apos;s show you the agent on <em className="font-serif italic font-light text-accent">your</em> leads.
          </h1>

          <p className="mt-6 text-base md:text-lg text-ink-mute leading-relaxed max-w-md">
            Tell us a little about your team and we&apos;ll set up a 30-minute
            walkthrough. Your account manager will run the agent live on a
            sample of your real lead data — in your script, your voice, and
            your language mix.
          </p>

          {tierLabel && (
            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
              <CheckCircle2 size={14} />
              <span className="font-semibold">{tierLabel}</span>
              <span className="text-ink-mute">tier selected</span>
            </div>
          )}

          <div className="mt-10 space-y-4">
            {[
              { icon: <Clock size={18} className="text-accent" />, t: "30-minute walkthrough", b: "We focus on your use case, not generic slides." },
              { icon: <ShieldCheck size={18} className="text-accent" />, t: "Real call on your data", b: "Optional: bring 5–10 sample leads, we'll run them live." },
              { icon: <CheckCircle2 size={18} className="text-accent" />, t: "Real quote, fast", b: "Pricing for your volume and stack within one business day." },
            ].map((i) => (
              <div key={i.t} className="flex items-start gap-4">
                <div className="h-9 w-9 shrink-0 rounded-xl bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center">
                  {i.icon}
                </div>
                <div>
                  <div className="font-semibold text-ink-text">{i.t}</div>
                  <div className="text-sm text-ink-mute">{i.b}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-7 border-t border-ink-line space-y-3 text-sm">
            <a href="mailto:hello@rupeezy.com" className="flex items-center gap-3 text-ink-text hover:text-accent transition">
              <Mail size={16} className="text-accent" />
              hello@rupeezy.com
            </a>
            <a href="tel:+919999999999" className="flex items-center gap-3 text-ink-text hover:text-accent transition">
              <Phone size={16} className="text-accent" />
              +91 99999 99999
            </a>
            <div className="flex items-center gap-3 text-ink-mute">
              <Globe size={16} className="text-accent" />
              Bengaluru · Mumbai · Remote-first
            </div>
          </div>
        </div>

        {/* RIGHT — form card */}
        <div className="lg:col-span-7">
          <form
            onSubmit={onSubmit}
            className="relative rounded-3xl border border-ink-line bg-ink-card/80 backdrop-blur p-7 md:p-10 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(94,234,212,0.08)] animate-fade-up [animation-delay:120ms]"
          >
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/5 blur-3xl" aria-hidden />

            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Your name" required>
                <input
                  required value={name} onChange={(e)=>setName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="form-input"
                />
              </Field>
              <Field label="Work email" required>
                <input
                  required type="email" value={email} onChange={(e)=>setEmail(e.target.value)}
                  placeholder="priya@company.com"
                  className="form-input"
                />
              </Field>
              <Field label="Company">
                <input
                  value={company} onChange={(e)=>setCompany(e.target.value)}
                  placeholder="Rupeezy Holdings"
                  className="form-input"
                />
              </Field>
              <Field label="Role">
                <input
                  value={role} onChange={(e)=>setRole(e.target.value)}
                  placeholder="Head of AP / Partnerships"
                  className="form-input"
                />
              </Field>
              <Field label="Monthly call volume">
                <select
                  value={volume} onChange={(e)=>setVolume(e.target.value)}
                  className="form-input"
                >
                  {VOLUMES.map((v) => <option key={v} value={v} className="bg-ink">{v}</option>)}
                </select>
              </Field>
              <Field label="Timeline">
                <select
                  value={timeline} onChange={(e)=>setTimeline(e.target.value)}
                  className="form-input"
                >
                  {TIMELINES.map((v) => <option key={v} value={v} className="bg-ink">{v}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <Field label="What would you like to know?">
                <textarea
                  rows={4}
                  value={message} onChange={(e)=>setMessage(e.target.value)}
                  placeholder="We're launching an AP onboarding push next quarter — interested in language coverage and CRM integration."
                  className="form-input resize-none"
                />
              </Field>
            </div>

            <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <div className="text-xs text-ink-mute leading-relaxed">
                We&apos;ll only use your details to respond to this enquiry. No
                marketing spam — promise.
              </div>
              <button
                type="submit"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-accent text-ink px-6 py-3 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_12px_32px_-12px_rgba(94,234,212,0.7)] whitespace-nowrap"
              >
                Send to sales
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </form>

          <div className="mt-5 text-center text-[11px] text-ink-mute">
            Prefer email? <a href="mailto:hello@rupeezy.com" className="text-accent hover:underline">hello@rupeezy.com</a>
          </div>
        </div>
      </div>

      <Footer />

      {/* Form input styling — extracted so it stays consistent */}
      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          background: rgba(11, 13, 16, 0.6);
          border: 1px solid #23272f;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
          color: #e6e8ec;
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        :global(.form-input::placeholder) { color: #5b6573; }
        :global(.form-input:focus) {
          border-color: rgba(94, 234, 212, 0.5);
          box-shadow: 0 0 0 3px rgba(94, 234, 212, 0.12);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] tracking-[0.18em] text-ink-mute font-semibold mb-2 uppercase">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function Nav() {
  return (
    <nav className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-9 w-9 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="font-serif italic text-accent text-lg leading-none">R</span>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight">Rupeezy AP Agent</div>
            <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
          </div>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-ink-mute">
          <Link href="/#how"      className="hover:text-ink-text transition">Product</Link>
          <Link href="/#features" className="hover:text-ink-text transition">Why us</Link>
          <Link href="/pricing"   className="hover:text-ink-text transition">Pricing</Link>
        </div>
        <Link href="/" className="text-sm text-ink-mute hover:text-ink-text transition">← Back to site</Link>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-line">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[11px] text-ink-mute">
        <div>© {new Date().getFullYear()} Rupeezy. All rights reserved.</div>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-ink-text transition">Privacy</a>
          <a href="#" className="hover:text-ink-text transition">Terms</a>
          <a href="#" className="hover:text-ink-text transition">Security</a>
        </div>
      </div>
    </footer>
  );
}
