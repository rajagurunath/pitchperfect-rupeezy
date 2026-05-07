import type { Metadata } from "next";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthGuard } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { SwCleanup } from "@/components/sw-cleanup";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PitchPerfect — Voice AI for partner programs, in 9 Indian languages",
  description:
    "PitchPerfect builds voice AI for partner-led acquisition. We auto-dial inbound leads, speak 9 Indian languages natively, handle the core objections, and hand every call back to your RM team scored HOT / WARM / COLD.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${jetMono.variable}`}>
      <body className="min-h-screen bg-ink text-ink-text font-sans">
        <SwCleanup />
        <AuthGuard>
          <Shell>{children}</Shell>
        </AuthGuard>
      </body>
    </html>
  );
}
