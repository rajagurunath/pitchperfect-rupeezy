import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_TARGET = process.env.API_PROXY_TARGET || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this directory.
  // Without this, Next.js sees ~/ionet/repos/package-lock.json (a separate
  // Solana/Anchor project one level up) and infers /ionet/repos/ as the
  // workspace root. Its dev-time file watcher then tries to index every
  // sibling repo on disk, overflows macOS fsevents, and gets SIGKILL'd by
  // the kernel after ~10 seconds — leaving the browser tab blank.
  outputFileTracingRoot: __dirname,

  // Proxy /api/* to the FastAPI backend so the browser only ever talks to :3000.
  // Override the target with API_PROXY_TARGET env var if the backend lives
  // elsewhere (e.g. when running the UI against a deployed staging API).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
    ];
  },
};

export default nextConfig;
