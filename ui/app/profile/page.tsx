"use client";

import { useEffect, useState } from "react";
import { Profile, fetchMe, readProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setProfile(readProfile());
    // Verify against backend so stale localStorage doesn't lie about the role.
    fetchMe().then(setProfile).catch((e) => setErr(e?.message ?? String(e)));
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-ink-mute mt-1">Currently signed-in admin.</p>
      </div>

      {err && <div className="text-hot text-sm">{err}</div>}

      <Card>
        <CardHeader className="flex items-center gap-3">
          <Avatar name={profile?.display_name ?? profile?.username ?? "?"} />
          <div>
            <CardTitle className="text-base">{profile?.display_name ?? "—"}</CardTitle>
            <div className="text-xs text-ink-mute">{profile?.role ?? "—"}</div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="text-sm divide-y divide-ink-line">
            <Row k="Username" v={profile?.username} />
            <Row k="Display name" v={profile?.display_name} />
            <Row k="Email" v={profile?.email} />
            <Row k="Role" v={profile?.role} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Note</CardTitle></CardHeader>
        <CardContent className="text-xs text-ink-mute leading-relaxed">
          Hackathon-grade single-admin auth. The credentials are defined in
          <span className="font-mono"> .env</span> (<span className="font-mono">ADMIN_USERNAME</span>,
          {" "}<span className="font-mono">ADMIN_PASSWORD</span>) and a JWT signed with
          {" "}<span className="font-mono">ADMIN_JWT_SECRET</span> is stored in your browser's
          localStorage. There is no signup, password reset, or per-user permission split yet.
        </CardContent>
      </Card>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="h-10 w-10 rounded-full bg-accent/20 ring-1 ring-accent/40 flex items-center justify-center text-accent font-bold">
      {initial}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  return (
    <div className="flex py-2">
      <dt className="w-32 shrink-0 text-ink-mute text-xs">{k}</dt>
      <dd className="text-ink-text">{v ?? "—"}</dd>
    </div>
  );
}
