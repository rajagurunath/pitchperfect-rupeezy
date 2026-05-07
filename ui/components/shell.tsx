"use client";

// The chrome wrapper: padded max-width container for authed app pages, and
// a full-bleed pass-through for the landing route. Header lives inside the
// constrained chrome so it sits flush with the page content.

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const fullBleed = path === "/";

  if (fullBleed) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Header />
      <main>{children}</main>
    </div>
  );
}
