"use client";

// The chrome wrapper: padded max-width container for authed app pages, and
// a full-bleed pass-through for the landing route. Header lives inside the
// constrained chrome so it sits flush with the page content.

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";

// Marketing routes bring their own nav/footer — render them full-bleed,
// without the admin-console chrome.
const FULL_BLEED = new Set(["/", "/pricing", "/contact", "/login"]);

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  if (FULL_BLEED.has(path)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Header />
      <main>{children}</main>
    </div>
  );
}
