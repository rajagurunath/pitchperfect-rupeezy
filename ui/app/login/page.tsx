"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PASSWORD,
  DEFAULT_USERNAME,
  loginRequest,
  setSession,
  useAuth,
} from "@/lib/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthed, ready } = useAuth();
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready && isAuthed) router.replace("/operations");
  }, [ready, isAuthed, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Sign in to the admin console</CardTitle>
          <p className="mt-1 text-xs text-ink-mute">
            Default credentials are pre-filled — just hit Sign in.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {err && <div className="text-hot text-xs">{err}</div>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            {(DEFAULT_USERNAME || DEFAULT_PASSWORD) && (
              <div className="rounded-md bg-ink border border-ink-line p-3 text-[11px] text-ink-mute leading-relaxed">
                <div className="text-ink-text font-medium mb-1">Demo credentials</div>
                {DEFAULT_USERNAME && <div>Username: <span className="font-mono text-ink-text">{DEFAULT_USERNAME}</span></div>}
                {DEFAULT_PASSWORD && <div>Password: <span className="font-mono text-ink-text">{DEFAULT_PASSWORD}</span></div>}
              </div>
            )}
            <div className="text-[11px] text-ink-mute leading-relaxed">
              Credentials are loaded from your <span className="font-mono">.env</span>:
              {" "}<span className="font-mono">ADMIN_USERNAME</span> /
              {" "}<span className="font-mono">ADMIN_PASSWORD</span>.
              {" "}Optionally set <span className="font-mono">NEXT_PUBLIC_DEFAULT_USERNAME</span> /
              {" "}<span className="font-mono">NEXT_PUBLIC_DEFAULT_PASSWORD</span> to pre-fill this form.
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
