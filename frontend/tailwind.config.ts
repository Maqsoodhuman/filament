import type { Config } from "tailwindcss";

// Design tokens transcribed from docs/DESIGN_SYSTEM.md (§2).
// Colors are wired to CSS variables (see app/globals.css) so a future dark
// theme is a variable swap, not a config change.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-sunken": "var(--surface-sunken)",
        "surface-hover": "var(--surface-hover)",
        "border-hairline": "var(--border-hairline)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        // Reserved blue — AI / connection moments ONLY.
        "accent-ai": "var(--accent-ai)",
        "accent-ai-tint": "var(--accent-ai-tint)",
        "accent-ai-border": "var(--accent-ai-border)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Type scale: size / line-height. Two weights only (400 / 500).
      fontSize: {
        display: ["28px", { lineHeight: "34px", fontWeight: "500" }],
        h1: ["20px", { lineHeight: "28px", fontWeight: "500" }],
        h2: ["16px", { lineHeight: "24px", fontWeight: "500" }],
        body: ["15px", { lineHeight: "26px", fontWeight: "400" }],
        ui: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        meta: ["13px", { lineHeight: "18px", fontWeight: "400" }],
      },
      // 4px spacing grid.
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
        "16": "64px",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        pill: "999px",
      },
      borderWidth: {
        hairline: "0.5px",
      },
      maxWidth: {
        measure: "680px",
      },
      transitionTimingFunction: {
        confirm: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
