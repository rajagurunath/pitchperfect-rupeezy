"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { clearSession, useAuth } from "@/lib/auth";

export function Header() {
  const router = useRouter();
  const path = usePathname();
  const { profile, isAuthed } = useAuth();
  const onLogin = path === "/login";

  return (
    <header className="mb-10 flex items-center justify-between">
      <Link href={isAuthed ? "/" : "/login"} className="flex items-center gap-3 group">
        <div className="h-8 w-8 rounded-lg bg-accent/20 ring-1 ring-accent/40 flex items-center justify-center">
          <span className="text-accent font-bold text-sm">R</span>
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">Rupeezy AP Agent</div>
          <div className="text-[11px] text-ink-mute">Admin console</div>
        </div>
      </Link>

      {isAuthed && !onLogin && (
        <div className="flex items-center gap-1">
          <nav className="flex gap-1 text-sm mr-2">
            <NavLink href="/">Operations</NavLink>
            <NavLink href="/leads">Leads</NavLink>
            <NavLink href="/calls">Calls</NavLink>
            <NavLink href="/analytics">Analytics</NavLink>
          </nav>
          <ProfileMenu />
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path?.startsWith(href));
  return (
    <Link
      href={href}
      className={
        "px-3 py-1.5 rounded-md text-ink-text hover:bg-ink-line " +
        (active ? "bg-ink-line" : "")
      }
    >
      {children}
    </Link>
  );
}

function ProfileMenu() {
  const router = useRouter();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const initial = (profile?.display_name || profile?.username || "?").trim().charAt(0).toUpperCase();

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full bg-accent/20 ring-1 ring-accent/40 hover:ring-accent flex items-center justify-center text-accent font-bold"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-ink-line bg-ink-card shadow-card z-20 p-3">
            <div className="px-2 py-2 border-b border-ink-line">
              <div className="text-sm font-medium">{profile?.display_name ?? "—"}</div>
              <div className="text-[11px] text-ink-mute">{profile?.email ?? "—"}</div>
              <div className="text-[11px] text-ink-mute mt-0.5">{profile?.role ?? "—"}</div>
            </div>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block px-2 py-2 rounded-md text-sm hover:bg-ink-line text-ink-text"
            >
              View profile
            </Link>
            <button
              onClick={logout}
              className="w-full text-left px-2 py-2 rounded-md text-sm hover:bg-ink-line text-hot"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
