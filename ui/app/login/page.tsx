"use client";

// In production (DEMO_MODE) the backend isn't deployed — the login screen is
// purely a teaser. The form is shown so prospects can see what the console
// auth experience looks like, but submitting it sends them to /contact
// rather than calling a non-existent /api/auth/login.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PASSWORD,
  DEFAULT_USERNAME,
  DEMO_MODE,
  loginRequest,
  setSession,
  useAuth,
} from "@/lib/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthed, ready } = useAuth();
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready && isAuthed && !DEMO_MODE) router.replace("/operations");
  }, [ready, isAuthed, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (DEMO_MODE) {
      // No backend in demo mode — bounce to /contact with a friendly note.
      router.push("/contact?from=login");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const { token, profile } = await loginRequest(username.trim(), password);
      setSession(token, profile);
      router.replace("/operations");
    } catch (e: any) {
      setErr(e?.message ?? "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-ink text-ink-text">
      {/* atmospheric background */}
      <div className="absolute inset-0 -z-10 hero-halo" aria-hidden />
      <div className="absolute inset-0 -z-10 grid-overlay opacity-40" aria-hidden />

      {/* top brand bar */}
      <div className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accent/15 ring-1 ring-accent/40 flex items-center justify-center">
              <span className="font-serif italic text-accent text-lg leading-none">P</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold tracking-tight">PitchPerfect</div>
              <div className="text-[11px] text-ink-mute tracking-wider">Voice AI for partner programs</div>
            </div>
          </Link>
          <Link href="/" className="text-sm text-ink-mute hover:text-ink-text transition">
            ← Back to site
          </Link>
        </div>
      </div>

      <div className="min-h-screen flex items-center justify-center px-6 py-32">
        <div className="w-full max-w-md animate-fade-up">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.22em] gradient-text font-semibold mb-5">
              <Sparkles size={12} className="text-accent" />
              CUSTOMER CONSOLE
            </div>
            <h1 className="font-serif font-medium text-3xl md:text-4xl leading-tight tracking-tight">
              Sign in to your <em className="font-serif italic font-light text-accent">PitchPerfect</em> console.
            </h1>
            <p className="mt-3 text-sm text-ink-mute">
              {DEMO_MODE
                ? "The console is by invitation only — book a demo and we'll get you set up."
                : "Use the credentials your account manager sent you."}
            </p>
          </div>

          {DEMO_MODE && (
            <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-start gap-3">
              <ShieldCheck size={18} className="text-accent shrink-0 mt-0.5" />
              <div className="text-xs text-ink-text leading-relaxed">
                <span className="font-semibold">Invitation-only access.</span>{" "}
                <span className="text-ink-mute">
                  Existing customers can sign in here. New here?{" "}
                  <Link href="/contact" className="text-accent hover:underline">Talk to sales →</Link>
                </span>
              </div>
            </div>
          )}

          <Card className="border-ink-line bg-ink-card/80 backdrop-blur shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock size={16} className="text-accent" />
                Sign in
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Work email or username</Label>
                  <Input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                  />
                </div>
                {err && <div className="text-hot text-xs">{err}</div>}
                <Button type="submit" disabled={busy} className="w-full group">
                  {busy ? "Signing in…" : DEMO_MODE ? "Sign in" : "Sign in"}
                  {!busy && <ArrowRight size={14} className="ml-1 group-hover:translate-x-0.5 transition" />}
                </Button>
              </form>

              {DEMO_MODE ? (
                <div className="mt-6 pt-5 border-t border-ink-line text-center">
                  <div className="text-xs text-ink-mute mb-3">Don&apos;t have an account yet?</div>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-full bg-accent text-ink px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition shadow-[0_0_0_1px_rgba(94,234,212,0.4),0_8px_24px_-8px_rgba(94,234,212,0.6)]"
                  >
                    Book a demo
                    <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                (DEFAULT_USERNAME || DEFAULT_PASSWORD) && (
                  <div className="mt-5 rounded-md bg-ink border border-ink-line p-3 text-[11px] text-ink-mute leading-relaxed">
                    <div className="text-ink-text font-medium mb-1">Demo credentials</div>
                    {DEFAULT_USERNAME && <div>Username: <span className="font-mono text-ink-text">{DEFAULT_USERNAME}</span></div>}
                    {DEFAULT_PASSWORD && <div>Password: <span className="font-mono text-ink-text">{DEFAULT_PASSWORD}</span></div>}
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <div className="mt-6 text-center text-[11px] text-ink-mute">
            By signing in you agree to our <a href="#" className="hover:text-ink-text">Terms</a> and <a href="#" className="hover:text-ink-text">Privacy Policy</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
