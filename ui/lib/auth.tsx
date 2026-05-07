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

// Optional pre-fills shown on the login screen — read from public Next env
// vars. Empty strings by default so credentials are never baked into the
// shipped bundle. Set NEXT_PUBLIC_DEFAULT_USERNAME / _PASSWORD locally if
// you want the demo form to come pre-filled.
export const DEFAULT_USERNAME =
  process.env.NEXT_PUBLIC_DEFAULT_USERNAME || "";
export const DEFAULT_PASSWORD =
  process.env.NEXT_PUBLIC_DEFAULT_PASSWORD || "";

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

// ----- AuthGuard: redirects to /login when no session ----------------------
// `/`, `/login`, `/pricing`, and `/contact` are always public.
//
// In DEMO_MODE (NEXT_PUBLIC_DEMO_MODE=1) the backend isn't deployed, so all
// authed routes (/operations, /leads, /calls, /analytics, /profile) bounce
// back to the landing page instead of hanging on a missing API.

const PUBLIC_PATHS = new Set(["/", "/login", "/pricing", "/contact"]);

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { ready, isAuthed } = useAuth();
  const isPublic = PUBLIC_PATHS.has(path ?? "");

  React.useEffect(() => {
    if (!ready) return;
    if (isPublic) return;
    if (DEMO_MODE) {
      // No backend in demo mode — push every authed route back to the landing.
      router.replace("/");
      return;
    }
    if (!isAuthed) router.replace("/login");
  }, [ready, isAuthed, isPublic, router]);

  if (!ready) return null;
  if (!isAuthed && !isPublic) return null;
  if (DEMO_MODE && !isPublic) return null;
  return <>{children}</>;
}
