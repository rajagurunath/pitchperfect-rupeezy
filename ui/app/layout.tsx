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
  title: "PitchPerfect — Voice agents for Indian SMBs",
  description:
    "PitchPerfect is the self-serve voice-agent platform for Indian startups, with a catalog of vertical skills — lead conversion, cold outbound, COD confirmation, clinic appointment. Hinglish-native, INR-priced.",
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
