"use client";

// One-time cleanup for stray service workers / caches left behind by older
// apps that ran on localhost:3000. A leftover SW intercepts fetch and breaks
// POST /api/auth/login (and every other API call) silently.

import { useEffect } from "react";

export function SwCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => {
          if (regs.length === 0) return;
          // eslint-disable-next-line no-console
          console.log(`[sw-cleanup] unregistering ${regs.length} service worker(s)`);
          return Promise.all(regs.map((r) => r.unregister()));
        })
        .catch(() => { /* ignore */ });
    }

    if (typeof caches !== "undefined") {
      caches.keys()
        .then((names) => {
          if (names.length === 0) return;
          // eslint-disable-next-line no-console
          console.log(`[sw-cleanup] purging ${names.length} cache(s):`, names);
          return Promise.all(names.map((n) => caches.delete(n)));
        })
        .catch(() => { /* ignore */ });
    }
  }, []);

  return null;
}
