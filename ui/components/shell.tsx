"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

const FULL_BLEED = new Set(["/", "/pricing", "/contact", "/login"]);
const FULL_BLEED_PREFIXES = ["/handoff/"];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";

  if (FULL_BLEED.has(path) || FULL_BLEED_PREFIXES.some((p) => path.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
