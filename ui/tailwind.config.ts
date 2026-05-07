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
          "var(--font-dm-sans)",
          "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont",
          "Segoe UI", "Roboto", "sans-serif",
        ],
        serif: [
          "var(--font-fraunces)",
          "ui-serif", "Georgia", "serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace", "SFMono-Regular", "Menlo", "monospace",
        ],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "wave-bar": {
          "0%, 100%": { transform: "scaleY(0.25)" },
          "50%":      { transform: "scaleY(1)" },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "rotate-slow": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "ping-soft": {
          "0%":   { transform: "scale(1)",   opacity: "0.55" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        "fade-up":     "fade-up 700ms cubic-bezier(.2,.9,.3,1) both",
        "wave":        "wave-bar 1100ms ease-in-out infinite",
        "shimmer":     "shimmer 2.4s linear infinite",
        "rotate-slow": "rotate-slow 22s linear infinite",
        "ping-soft":   "ping-soft 1.6s cubic-bezier(0,0,0.2,1) infinite",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
};
export default config;
