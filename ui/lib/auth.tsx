"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

// ----- shape ----------------------------------------------------------------

export type Profile = {
  username: string;
  display_name: string;
  email: string;
  role: string;
};

const TOKEN_KEY = "rupeezy_token";
const PROFILE_KEY = "rupeezy_profile";

// Defaults shown on the login screen — read from a public Next env var so
// the same .env values that drive the backend are surfaced to the user.
// Falls back to sensible hackathon defaults if the env vars aren't set.
export const DEFAULT_USERNAME =
  process.env.NEXT_PUBLIC_DEFAULT_USERNAME || "admin";
export const DEFAULT_PASSWORD =
  process.env.NEXT_PUBLIC_DEFAULT_PASSWORD || "rupeezy123";

// ----- token storage --------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, profile: Profile) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("rupeezy-auth-changed"));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new Event("rupeezy-auth-changed"));
}

export function readProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

// ----- API helpers (login + me) ---------------------------------------------

export async function loginRequest(username: string, password: string) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${body || "login failed"}`);
  }
  return r.json() as Promise<{ token: string; profile: Profile }>;
}

export async function fetchMe(): Promise<Profile> {
  const t = getToken();
  if (!t) throw new Error("not logged in");
  const r = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ----- React hook for auth state --------------------------------------------

export function useAuth() {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setProfile(readProfile());
    setReady(true);
    const onChange = () => setProfile(readProfile());
    window.addEventListener("rupeezy-auth-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("rupeezy-auth-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { profile, ready, isAuthed: !!profile };
}

// ----- AuthGuard: redirects to /login when no session -----------------------

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { ready, isAuthed } = useAuth();

  React.useEffect(() => {
    if (!ready) return;
    if (path === "/login") return; // login page is public
    if (!isAuthed) router.replace("/login");
  }, [ready, isAuthed, path, router]);

  if (!ready) return null;
  if (!isAuthed && path !== "/login") return null;
  return <>{children}</>;
}
