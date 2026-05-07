import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // LiveKit-inspired neutral palette: deep ink, soft cyan accent, warm
        // hot/cold/warm signal colors. Dark-mode-first; we ship dark by default.
        ink: {
          DEFAULT: "#0b0d10",
          card: "#13161b",
          line: "#23272f",
          mute: "#8a92a0",
          text: "#e6e8ec",
        },
        accent: { DEFAULT: "#5eead4", soft: "#0d2f2a" }, // teal-300
        hot:  { DEFAULT: "#f87171", soft: "#3b1414" },
        warm: { DEFAULT: "#fbbf24", soft: "#3a2a05" },
        cold: { DEFAULT: "#60a5fa", soft: "#0d1d3a" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont",
          "Inter", "Segoe UI", "Roboto", "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
};
export default config;
