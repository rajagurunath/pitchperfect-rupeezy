import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "@/lib/auth";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Rupeezy AP Agent — Admin",
  description: "Voice agent operations console.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-ink-text">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Header />
          <AuthGuard>
            <main>{children}</main>
          </AuthGuard>
        </div>
      </body>
    </html>
  );
}
