import type { Config } from "tailwindcss";

// Filament design tokens (docs/COHESIVE_DESIGN.md). The component layer lives in
// app/globals.css as Filament's CSS classes; these utilities back the engine
// grafts. Colours map to the CSS variables so a future theme is a var swap.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-soft": "var(--ink-soft)",
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        text: "var(--text)",
        "text-soft": "var(--text-soft)",
        "text-faint": "var(--text-faint)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        // the colour law — amber == structural connection
        filament: "var(--filament)",
        "filament-deep": "var(--filament-deep)",
        indigo: "var(--indigo)",
        "indigo-soft": "var(--indigo-soft)",
        "c-coral": "var(--c-coral)",
        "c-teal": "var(--c-teal)",
        "c-violet": "var(--c-violet)",
        "c-amber": "var(--c-amber)",
        "c-slate": "var(--c-slate)",
        "c-rose": "var(--c-rose)",
      },
      fontFamily: {
        brand: ["var(--font-brand)", "Space Grotesk", "system-ui", "sans-serif"],
        read: ["var(--font-read)", "Newsreader", "Georgia", "serif"],
        ui: ["var(--font-ui)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-ui)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "9px",
        md: "12px",
        card: "18px",
        pill: "999px",
      },
      maxWidth: {
        reading: "720px",
        measure: "760px",
      },
      transitionTimingFunction: {
        confirm: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
