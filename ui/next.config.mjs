/** @type {import('next').NextConfig} */

// In DEMO_MODE the marketing site is deployed without a backend (e.g. on
// Vercel for the public landing). Skip the /api/* rewrites so requests
// don't hang trying to reach localhost:8000.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (DEMO_MODE) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
