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

// Disclosure triangle (Tabler chevron) — left tree, compact rows (§3).
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

// Back chevron for the mobile drill-down.
function BackChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 6l-6 6l6 6" />
    </svg>
  );
}

// Small neutral sparkle/AI glyph marking a section as AI-clustered (§3). Neutral.
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

// Calm loading skeleton (§5: skeleton over telemetry).
function OrganizeSkeleton() {
  return (
    <div className="px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your sections…</span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[20px] w-full max-w-[320px] animate-pulse rounded-sm bg-surface-hover"
          />
        ))}
      </div>
    </div>
  );
}

// Organize — Notebook → Section → Page (§4.3 / §6.4). Desktop: a 3-pane grid.
// Below `md`: a single-column drill-down (sections → pages → content, with a
// back control) so there is no horizontal overflow and every row is ≥44px on
// touch. Truncated labels carry a title= tooltip. Neutral; no blue here.
export default function OrganizeView({
  clusters,
  notes,
  loading = false,
}: {
  clusters: ClusterOut[];
  notes: NoteOut[];
  loading?: boolean;
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
  const page = pages.find((p) => p.id === activePage) ?? pages[0] ?? null;

  // Mobile drill-down level: which pane is showing.
  const [mobileLevel, setMobileLevel] = useState<"sections" | "pages" | "page">(
    "sections",
  );

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 border-b border-hairline border-border-hairline px-4 py-2">
          <span className="rounded-sm bg-surface-hover px-3 py-1 text-ui font-medium text-text-primary">
            Research library
          </span>
        </div>
        <OrganizeSkeleton />
      </div>
    );
  }

  // Zero-cluster: one centered empty state, not three half-empty panes
  // (empty-states — a single helpful message beats placeholder chrome).
  if (clusters.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 border-b border-hairline border-border-hairline px-4 py-2">
          <span className="truncate rounded-sm bg-surface-hover px-3 py-1 text-ui font-medium text-text-primary">
            Research library
          </span>
        </div>
        <div className="flex min-h-[400px] flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-ui text-text-secondary">No sections yet</p>
          <p className="mt-1 max-w-[420px] text-meta text-text-tertiary">
            Run Find connections to let the engine cluster your library into
            sections.
          </p>
        </div>
      </div>
    );
  }

  // Shared row renderers ---------------------------------------------------
  const sectionRows = (
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
              setMobileLevel("pages");
            }}
            title={c.label}
            className={
              "flex min-h-[44px] items-center gap-2 px-4 text-left text-ui transition-colors duration-[120ms] ease-confirm md:min-h-[36px] " +
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
            <span className="ml-auto flex shrink-0 items-center gap-1 text-text-tertiary">
              <SparkleIcon />
              <span className="text-meta">{c.note_count}</span>
            </span>
          </button>
        );
      })}
      {clusters.length === 0 && (
        <p className="px-4 py-3 text-meta text-text-secondary">
          No sections yet.
        </p>
      )}
    </nav>
  );

  const pageRows = (
    <nav className="flex flex-col">
      {pages.map((p) => {
        const isActive = page?.id === p.id;
        const title = p.title || "Untitled";
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setActivePage(p.id);
              setMobileLevel("page");
            }}
            title={title}
            className={
              "flex min-h-[44px] items-center gap-2 px-4 text-left text-ui transition-colors duration-[120ms] ease-confirm md:min-h-[36px] " +
              (isActive
                ? "bg-surface-hover text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary")
            }
          >
            <span className="truncate">{title}</span>
          </button>
        );
      })}
      {pages.length === 0 && (
        <p className="px-4 py-3 text-meta text-text-secondary">
          Select a section.
        </p>
      )}
    </nav>
  );

  const pageContent = page ? (
    <article>
      <h2 className="text-display text-text-primary">
        {page.title || "Untitled"}
      </h2>
      <div className="mt-2 text-meta text-text-secondary">{page.source}</div>
      <div className="mt-6 max-w-measure whitespace-pre-wrap text-body text-text-primary">
        {page.body}
      </div>
    </article>
  ) : (
    <div className="flex h-full items-center justify-center">
      <p className="text-ui text-text-secondary">Select a page to read it.</p>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Notebook strip (§6.4). */}
      <div className="flex items-center gap-3 border-b border-hairline border-border-hairline px-4 py-2">
        <span className="truncate rounded-sm bg-surface-hover px-3 py-1 text-ui font-medium text-text-primary">
          Research library
        </span>
        <button
          type="button"
          className="shrink-0 text-meta text-text-secondary hover:text-text-primary"
        >
          + New notebook
        </button>
      </div>

      {/* MOBILE (< md): single-column drill-down with a back control. */}
      <div className="md:hidden">
        {mobileLevel === "sections" && (
          <div>
            <div className="px-4 py-3 text-meta uppercase tracking-wide text-text-secondary">
              Sections
            </div>
            {sectionRows}
          </div>
        )}
        {mobileLevel === "pages" && (
          <div>
            <button
              type="button"
              onClick={() => setMobileLevel("sections")}
              className="flex min-h-[44px] w-full items-center gap-1 border-b border-hairline border-border-hairline px-4 text-left text-ui text-text-secondary hover:text-text-primary"
            >
              <BackChevron /> Sections
            </button>
            <div className="truncate px-4 py-3 text-meta uppercase tracking-wide text-text-secondary">
              {section ? section.label : "Section"}
            </div>
            {pageRows}
          </div>
        )}
        {mobileLevel === "page" && (
          <div>
            <button
              type="button"
              onClick={() => setMobileLevel("pages")}
              className="flex min-h-[44px] w-full items-center gap-1 border-b border-hairline border-border-hairline px-4 text-left text-ui text-text-secondary hover:text-text-primary"
            >
              <BackChevron /> {section ? section.label : "Pages"}
            </button>
            <div className="bg-surface px-5 py-6">{pageContent}</div>
          </div>
        )}
      </div>

      {/* DESKTOP (>= md): three panes. */}
      <div className="hidden min-h-[560px] grid-cols-[280px_320px_1fr] md:grid">
        <div className="border-r border-hairline border-border-hairline">
          <div className="px-4 py-3 text-meta uppercase tracking-wide text-text-secondary">
            Sections
          </div>
          {sectionRows}
        </div>

        <div className="border-r border-hairline border-border-hairline">
          <div
            className="break-words px-4 pt-3 text-meta uppercase tracking-wide text-text-secondary"
            title={section ? section.label : undefined}
          >
            {section ? section.label : "Section"}
          </div>
          {/* Only "Pages" is wired today. Table/Board are deferred, so we don't
              render inert tabs (dead affordance — forms/state-clarity). */}
          <div className="flex items-center gap-4 border-b border-hairline border-border-hairline px-4 pb-2 pt-2">
            <span className="text-meta font-medium text-text-primary [border-bottom:1.5px_solid_var(--text-primary)] pb-[2px]">
              Pages
            </span>
          </div>
          {pageRows}
        </div>

        <div className="bg-surface px-8 py-8">{pageContent}</div>
      </div>
    </div>
  );
}
