"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutGrid, Users, Phone, BarChart2,
  Wand2, Settings, ChevronLeft, LogOut, User,
} from "lucide-react";
import { clearSession, useAuth } from "@/lib/auth";

const STORAGE_KEY = "pitchperfect_sidebar_collapsed";

const WORKSPACE_NAV = [
  { href: "/operations", label: "Operations", Icon: LayoutGrid },
  { href: "/leads",      label: "Leads",      Icon: Users },
  { href: "/calls",      label: "Calls",      Icon: Phone },
  { href: "/analytics",  label: "Analytics",  Icon: BarChart2 },
];

const TOOLS_NAV = [
  { href: "/studio",  label: "Studio",   Icon: Wand2 },
  { href: "/profile", label: "Settings", Icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { profile, isAuthed } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  function logout() {
    clearSession();
    router.replace("/login");
  }

  const initial = (profile?.display_name || profile?.username || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  // Avoid width flash on first render before localStorage is read
  const w = !mounted ? "w-[220px]" : collapsed ? "w-14" : "w-[220px]";

  if (!isAuthed) return null;

  return (
    <aside
      className={`${w} shrink-0 flex flex-col h-screen bg-ink-card border-r border-ink-line overflow-hidden transition-[width] duration-200 ease-in-out`}
    >
      {/* Logo + toggle */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-ink-line min-h-[60px]">
        <Link
          href="/operations"
          className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "opacity-0 w-0 pointer-events-none" : "opacity-100"} transition-opacity duration-150`}
        >
          <div className="h-8 w-8 shrink-0 rounded-lg bg-accent/20 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="text-accent font-bold text-sm">P</span>
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold tracking-tight whitespace-nowrap">PitchPerfect</div>
            <div className="text-[10px] text-ink-mute whitespace-nowrap">Admin console · Rupeezy</div>
          </div>
        </Link>

        {/* Collapsed state: just the P icon */}
        {collapsed && (
          <div className="h-8 w-8 mx-auto rounded-lg bg-accent/20 ring-1 ring-accent/40 flex items-center justify-center">
            <span className="text-accent font-bold text-sm">P</span>
          </div>
        )}

        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`shrink-0 h-6 w-6 flex items-center justify-center rounded-md border border-ink-line text-ink-mute hover:bg-ink-line hover:text-ink-text transition-all duration-200 ${collapsed ? "rotate-180 mx-auto mt-0" : ""}`}
        >
          <ChevronLeft size={13} strokeWidth={2.2} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-hidden">
        {!collapsed && (
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-ink-mute">
            Workspace
          </p>
        )}
        {collapsed && <div className="h-4" />}

        {WORKSPACE_NAV.map(({ href, label, Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={path === href || path?.startsWith(href + "/")}
            collapsed={collapsed}
          />
        ))}

        <div className="my-2 h-px bg-ink-line" />

        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-mute">
            Tools
          </p>
        )}

        {TOOLS_NAV.map(({ href, label, Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={path === href || path?.startsWith(href + "/")}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Profile / logout */}
      <div className="border-t border-ink-line px-2 py-3">
        <div className="group relative">
          <button
            onClick={logout}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-ink-mute hover:bg-ink-line hover:text-ink-text transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            <div className="h-7 w-7 shrink-0 rounded-full bg-accent/20 ring-1 ring-accent/40 flex items-center justify-center text-accent font-bold text-xs">
              {initial}
            </div>
            {!collapsed && (
              <div className="flex-1 text-left overflow-hidden">
                <div className="text-[12.5px] font-medium text-ink-text truncate">
                  {profile?.display_name ?? profile?.username ?? "—"}
                </div>
                <div className="text-[10px] text-ink-mute truncate">{profile?.role ?? "—"}</div>
              </div>
            )}
            {!collapsed && <LogOut size={13} className="shrink-0 opacity-50" />}
          </button>
          {collapsed && (
            <Tooltip>Sign out</Tooltip>
          )}
        </div>

        {!collapsed && (
          <Link
            href="/profile"
            className="mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-ink-mute hover:bg-ink-line hover:text-ink-text transition-colors"
          >
            <User size={13} />
            View profile
          </Link>
        )}
      </div>
    </aside>
  );
}

function NavItem({
  href, label, Icon, active, collapsed,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          active
            ? "bg-accent/10 text-accent"
            : "text-ink-mute hover:bg-ink-line hover:text-ink-text"
        }`}
      >
        <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
        {!collapsed && <span>{label}</span>}
      </Link>
      {collapsed && <Tooltip>{label}</Tooltip>}
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 hidden group-hover:block">
      <div className="bg-ink-line text-ink-text text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-lg border border-ink-line/60">
        {children}
      </div>
    </div>
  );
}
