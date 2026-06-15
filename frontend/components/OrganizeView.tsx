"use client";

import { useMemo, useState } from "react";
import type { components } from "@/lib/api-types";

type ClusterOut = components["schemas"]["ClusterOut"];
type NoteOut = components["schemas"]["NoteOut"];

// Deterministic neutral section dot. Sections are NOT connections, so they
// never draw the reserved blue (§1). Color is a quiet identity cue only —
// muted neutrals derived deterministically from the cluster id.
const SECTION_DOTS = ["#A8A29E", "#78716C", "#57534E", "#8C8A86", "#6B6660"];
function sectionDot(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SECTION_DOTS[h % SECTION_DOTS.length];
}

// Disclosure triangle (Tabler chevron) — left tree, compact 32px rows (§3).
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 120ms cubic-bezier(0.2,0,0,1)",
      }}
    >
      <path d="M9 6l6 6l-6 6" />
    </svg>
  );
}

// Small neutral sparkle/AI glyph marking a section as AI-clustered (§3
// SectionList: "section = AI cluster, marked with a small sparkle glyph,
// neutral"). Neutral, never blue.
function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" />
    </svg>
  );
}

// Organize — OneNote-style Notebook → Section → Page three-pane (§4.3 / §6.4).
// Neutral, dense. Sections = AI clusters; pages = the notes in the selected
// section; content = the selected note's title + body. Selection is local
// client state. No blue anywhere (this surface has no connection moments).
export default function OrganizeView({
  clusters,
  notes,
}: {
  clusters: ClusterOut[];
  notes: NoteOut[];
}) {
  const notesById = useMemo(() => {
    const m = new Map<string, NoteOut>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const [activeSection, setActiveSection] = useState<string | null>(
    clusters[0]?.id ?? null,
  );

  const section = clusters.find((c) => c.id === activeSection) ?? null;
  const pages: NoteOut[] = section
    ? section.note_ids
        .map((id) => notesById.get(id))
        .filter((n): n is NoteOut => Boolean(n))
    : [];

  const [activePage, setActivePage] = useState<string | null>(
    pages[0]?.id ?? null,
  );
  // If the active page isn't in the current section, default to its first page.
  const page =
    pages.find((p) => p.id === activePage) ?? pages[0] ?? null;

  return (
    <div className="flex flex-col">
      {/* Notebook strip (§6.4) — single "Research library" + new affordance. */}
      <div className="flex items-center gap-3 border-b border-hairline border-border-hairline px-4 py-2">
        <span className="rounded-sm bg-surface-hover px-3 py-1 text-ui font-medium text-text-primary">
          Research library
        </span>
        <button
          type="button"
          className="text-meta text-text-tertiary hover:text-text-secondary"
        >
          + New notebook
        </button>
      </div>

      {/* Three panes: sections | pages | content. */}
      <div className="grid min-h-[560px] grid-cols-[220px_260px_1fr]">
        {/* Sections (left) */}
        <div className="border-r border-hairline border-border-hairline">
          <div className="px-4 py-3 text-meta uppercase tracking-wide text-text-tertiary">
            Sections
          </div>
          <nav className="flex flex-col">
            {clusters.map((c) => {
              const isActive = c.id === activeSection;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(c.id);
                    setActivePage(null);
                  }}
                  className={
                    "flex h-[32px] items-center gap-2 px-4 text-left text-ui transition-colors duration-[120ms] ease-confirm " +
                    (isActive
                      ? "bg-surface-hover text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary")
                  }
                >
                  <Chevron open={isActive} />
                  <span
                    className="h-2 w-2 shrink-0 rounded-pill"
                    style={{ background: sectionDot(c.id) }}
                  />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto flex items-center gap-1 text-text-tertiary">
                    <SparkleIcon />
                    <span className="text-meta">{c.note_count}</span>
                  </span>
                </button>
              );
            })}
            {clusters.length === 0 && (
              <p className="px-4 py-3 text-meta text-text-tertiary">
                No sections yet.
              </p>
            )}
          </nav>
        </div>

        {/* Pages (middle) — section header carries Pages | Table | Board view
            tabs (§3 PageList / SectionViewTabs); Pages is the v1 active view. */}
        <div className="border-r border-hairline border-border-hairline">
          <div className="px-4 pt-3 text-meta uppercase tracking-wide text-text-tertiary">
            {section ? section.label : "Section"}
          </div>
          <div className="flex items-center gap-4 border-b border-hairline border-border-hairline px-4 pb-2 pt-2">
            <span className="text-meta font-medium text-text-primary [border-bottom:1.5px_solid_var(--text-primary)] pb-[2px]">
              Pages
            </span>
            <span className="text-meta text-text-tertiary">Table</span>
            <span className="text-meta text-text-tertiary">Board</span>
          </div>
          <nav className="flex flex-col">
            {pages.map((p) => {
              const isActive = page?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePage(p.id)}
                  className={
                    "flex h-[32px] items-center gap-2 px-4 text-left text-ui transition-colors duration-[120ms] ease-confirm " +
                    (isActive
                      ? "bg-surface-hover text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary")
                  }
                >
                  <span className="truncate">{p.title || "Untitled"}</span>
                </button>
              );
            })}
            {pages.length === 0 && (
              <p className="px-4 py-3 text-meta text-text-tertiary">
                Select a section.
              </p>
            )}
          </nav>
        </div>

        {/* Page content (right) */}
        <div className="bg-surface px-8 py-8">
          {page ? (
            <article>
              <h2 className="text-display text-text-primary">
                {page.title || "Untitled"}
              </h2>
              <div className="mt-2 text-meta text-text-secondary">
                {page.source}
              </div>
              <div className="mt-6 max-w-measure whitespace-pre-wrap text-body text-text-primary">
                {page.body}
              </div>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-ui text-text-tertiary">
                Select a page to read it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
