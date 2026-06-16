"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// AppShell — design system §2.1 (v2, AUTHORITATIVE). A real application chrome,
// Capacities-inspired: a fixed left sidebar (≈240px) on warm cream + a workspace
// that ALWAYS fills the remaining width (no centered max-w column with dead
// side-margins — that was the v1 defect). Wraps every route. Below `lg` the
// sidebar collapses to a slide-over opened by a hamburger in the top strip.
//
// Active nav = a filled warm pill (--bg-active), NEVER blue. Blue stays reserved
// for surfaced connections only.

type Section = "Timeline" | "Organize" | "Graph" | null;

const NAV = [
  { label: "Timeline", href: "/timeline", match: (p: string) => p.startsWith("/timeline") || p.startsWith("/notes") },
  { label: "Organize", href: "/organize", match: (p: string) => p.startsWith("/organize") },
  { label: "Graph", href: "/graph", match: (p: string) => p.startsWith("/graph") },
] as const;

// Notebooks group — neutral identity dots, never blue (these are not connections).
const NOTEBOOKS = [
  { label: "Research library", dot: "#A89F90" },
  { label: "Reading", dot: "#7C766B" },
] as const;

function openPalette() {
  window.dispatchEvent(new Event("kg:open-command-palette"));
}

// --- Inline Tabler-style icons (stroke, neutral) -------------------------
function Icon({ name }: { name: "timeline" | "organize" | "graph" }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "timeline") {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h10" />
      </svg>
    );
  }
  if (name === "organize") {
    return (
      <svg {...common}>
        <path d="M4 4h6v6h-6z" />
        <path d="M14 4h6v6h-6z" />
        <path d="M4 14h6v6h-6z" />
        <path d="M14 14h6v6h-6z" />
      </svg>
    );
  }
  // graph
  return (
    <svg {...common}>
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.5 7.6l-3 7.4" />
      <path d="M13.5 7.6l3 7.4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M20 20l-4.5 -4.5" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function NavIcon({ label }: { label: string }) {
  if (label === "Timeline") return <Icon name="timeline" />;
  if (label === "Organize") return <Icon name="organize" />;
  return <Icon name="graph" />;
}

// --- Sidebar body (shared by fixed desktop rail + mobile slide-over) ------
function SidebarBody({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col px-3 py-4">
      {/* Logo — links to the app home (Timeline); the marketing site lives at /. */}
      <Link
        href="/timeline"
        onClick={onNavigate}
        className="flex items-center gap-2 px-2 py-1"
        aria-label="Knowledge graph — timeline"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-ai text-[13px] font-medium text-white">
          K
        </span>
        <span className="truncate text-ui font-medium text-text-primary">
          Knowledge graph
        </span>
      </Link>

      {/* Search / ⌘K */}
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openPalette();
        }}
        className="mt-4 flex min-h-[36px] w-full items-center gap-2 rounded-sm border border-border-sidebar bg-bg-card px-3 text-left text-ui text-text-secondary transition-colors duration-[120ms] ease-confirm hover:text-text-primary"
      >
        <SearchIcon />
        <span className="flex-1 truncate">Search…</span>
        <kbd className="font-mono text-meta text-text-tertiary">⌘K</kbd>
      </button>

      {/* Primary nav */}
      <nav className="mt-4 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-[36px] items-center gap-2.5 rounded-sm px-3 text-ui transition-colors duration-[120ms] ease-confirm " +
                (active
                  ? "bg-bg-active font-medium text-text-primary"
                  : "text-text-secondary hover:bg-bg-active/60 hover:text-text-primary")
              }
            >
              <NavIcon label={item.label} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Notebooks group */}
      <div className="mt-6">
        <div className="px-3 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          Notebooks
        </div>
        <div className="mt-1 flex flex-col gap-0.5">
          {NOTEBOOKS.map((nb) => (
            <Link
              key={nb.label}
              href="/organize"
              onClick={onNavigate}
              className="flex min-h-[32px] items-center gap-2.5 rounded-sm px-3 text-ui text-text-secondary transition-colors duration-[120ms] ease-confirm hover:bg-bg-active/60 hover:text-text-primary"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-pill"
                style={{ background: nb.dot }}
                aria-hidden="true"
              />
              <span className="truncate">{nb.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* New note — pinned to the bottom, solid neutral button */}
      <Link
        href="/new"
        onClick={onNavigate}
        className="mt-auto flex min-h-[44px] items-center justify-center gap-2 rounded-sm bg-btn-solid-bg px-3 text-ui font-medium text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90"
      >
        <span aria-hidden="true">+</span> New note
      </Link>
    </div>
  );
}

export default function AppShell({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const section: Section =
    (NAV.find((n) => n.match(pathname))?.label as Section) ?? null;
  const stripTitle = title ?? section ?? "Knowledge graph";

  return (
    <div className="min-h-screen bg-bg-app">
      {/* Fixed desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-border-sidebar bg-bg-sidebar lg:block">
        <SidebarBody pathname={pathname} />
      </aside>

      {/* Mobile slide-over */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] border-r border-border-sidebar bg-bg-sidebar shadow-[0_1px_2px_rgba(0,0,0,.08)]">
            <SidebarBody
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Workspace — fills the remaining width; offset for the fixed rail on lg+ */}
      <div className="lg:pl-[240px]">
        {/* Slim top strip */}
        <header className="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-border bg-bg-app/90 px-4 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm text-text-secondary transition-colors duration-[120ms] ease-confirm hover:bg-bg-active hover:text-text-primary lg:hidden"
          >
            <MenuIcon />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-h2 text-text-primary">
            {stripTitle}
          </h1>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>

        {/* Page content — fills the workspace. Long-prose surfaces apply their
            own internal reading width; feeds/panes use the full width. */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
