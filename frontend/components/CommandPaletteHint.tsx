"use client";

// The "⌘K" hint in the TopNav. Clicking it opens the global CommandPalette via
// a custom window event (the palette listens for "kg:open-command-palette").
// Isolated as a tiny client island so TopNav itself stays a server component.
export default function CommandPaletteHint() {
  return (
    <button
      type="button"
      aria-label="Open command palette"
      onClick={() => window.dispatchEvent(new Event("kg:open-command-palette"))}
      className="hidden shrink-0 text-meta text-text-secondary transition-colors duration-[120ms] ease-confirm hover:text-text-primary sm:inline"
    >
      ⌘K
    </button>
  );
}
