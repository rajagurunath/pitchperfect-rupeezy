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
  title: "Rupeezy AP Voice Agent — Calls inbound leads in 9 Indian languages",
  description:
    "An AI voice agent that auto-dials inbound AP partner leads, speaks 9 Indian languages natively, handles the 5 core objections, and scores every call HOT/WARM/COLD for the human RM.",
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
