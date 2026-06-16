"use client";

import { useState } from "react";
import Link from "next/link";
import type { components } from "@/lib/api-types";
import FirstInsightCallout from "@/components/FirstInsightCallout";

type ConnectionOut = components["schemas"]["ConnectionOut"];

// Onboarding / import → first-insight — design system §5 + the activation
// principle. A calm, near-empty screen that (a) offers import sources, (b) shows
// a quiet staged progress beat (notes → facets → connections), then (c) surfaces
// the single highest-q connection in the reserved-blue callout: "we found a
// connection you didn't ask for." No confetti; blue lives only on the insight.
//
// The "Scan my library" path is wired: it POSTs the engine's on-demand /scan
// (via the same-origin BFF proxy), animates the staged progress, then GETs
// /connections and picks the top-q row. Other sources are honest placeholders
// with a "connect" affordance (real OAuth is out of v0 scope).

type Phase = "idle" | "scanning" | "done" | "error";

// Calm, staged working states (§5: "the AI's working state is calm prose,
// never telemetry"). One line at a time, no progress-bar dashboard.
const STAGES = [
  "Reading your notes…",
  "Extracting structural facets…",
  "Looking for connections across your library…",
] as const;

const STAGE_MS = 900;

// Import sources. Only "Scan my library" is wired in v0; the rest carry a
// "connect" affordance so the activation path is honest about what's live.
const SOURCES: { key: string; label: string; wired: boolean }[] = [
  { key: "readwise", label: "Readwise", wired: false },
  { key: "kindle", label: "Kindle", wired: false },
  { key: "notion", label: "Notion", wired: false },
  { key: "upload", label: "Upload files", wired: false },
];

function topByQ(conns: ConnectionOut[]): ConnectionOut | null {
  if (conns.length === 0) return null;
  return conns.reduce((best, c) => (c.q > best.q ? c : best), conns[0]);
}

export default function OnboardingPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [insight, setInsight] = useState<ConnectionOut | null>(null);

  async function scanLibrary() {
    setPhase("scanning");
    setStage(0);
    setInsight(null);

    // Fire the real on-demand scan in parallel with the staged animation, so the
    // progress beat is honest about ordering (notes → facets → connections)
    // without blocking on the network.
    const scanPromise = fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ full: true }),
    });

    for (let i = 1; i < STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, STAGE_MS));
      setStage(i);
    }

    // Pull the surfaced connections and surface the single highest-q one.
    // We NEVER fabricate a connection: a real fetch failure becomes an error
    // state, and a genuinely empty result becomes an honest empty state
    // (product invariant — a forced insight destroys trust).
    try {
      const scanRes = await scanPromise;
      if (!scanRes.ok) throw new Error(`scan failed (${scanRes.status})`);
      await new Promise((r) => setTimeout(r, STAGE_MS));

      const res = await fetch("/api/connections", { cache: "no-store" });
      if (!res.ok) throw new Error(`connections fetch failed (${res.status})`);
      const conns = (await res.json()) as ConnectionOut[];
      setInsight(topByQ(conns)); // may be null → honest empty state
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <main className="mx-auto flex max-w-measure flex-col px-6 py-16">
        <h1 className="text-display text-text-primary">Bring in your library</h1>
        <p className="mt-2 text-body text-text-secondary">
          Import what you already read. We&apos;ll quietly look for connections
          across it — the kind topic search can&apos;t find.
        </p>

        {/* Import sources */}
        <div className="mt-10">
          <h2 className="text-meta uppercase tracking-wide text-text-secondary">
            Import from
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={phase === "scanning"}
                className="flex min-h-[44px] items-center justify-between rounded-card border border-border bg-bg-card px-4 py-3 text-left text-ui text-text-primary transition-colors duration-[120ms] ease-confirm hover:border-text-tertiary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{s.label}</span>
                <span className="text-meta text-text-tertiary">Connect</span>
              </button>
            ))}
          </div>
        </div>

        {/* Primary path — the wired on-demand scan */}
        <div className="mt-8">
          <button
            type="button"
            onClick={scanLibrary}
            disabled={phase === "scanning"}
            className="inline-flex min-h-[44px] items-center rounded-sm bg-btn-solid-bg px-4 py-[10px] text-ui text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "scanning" ? "Scanning…" : "Scan my library"}
          </button>
          <p className="mt-2 text-meta text-text-tertiary">
            Uses your existing notes. Nothing leaves your machine on the
            community edition.
          </p>
        </div>

        {/* Calm staged working state — one line of prose, no telemetry */}
        {phase === "scanning" ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <WorkingGlyph />
            <p className="mt-4 text-body text-text-secondary">
              {STAGES[stage]}
            </p>
          </div>
        ) : null}

        {/* First-insight callout — the single highest-q connection, in blue */}
        {phase === "done" && insight ? (
          <div className="mt-12">
            <FirstInsightCallout connection={insight} />
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-sm border border-border bg-bg-card px-4 py-[8px] text-ui text-text-primary transition-colors duration-[120ms] ease-confirm hover:bg-bg-active"
              >
                Go to your timeline
              </Link>
              <button
                type="button"
                onClick={scanLibrary}
                className="text-meta text-text-secondary hover:text-text-primary"
              >
                Scan again
              </button>
            </div>
          </div>
        ) : null}

        {/* Honest empty state — scan ran, nothing cleared the q≥3 bar. We never
            invent a connection (product invariant). */}
        {phase === "done" && !insight ? (
          <div className="mt-12 flex flex-col items-center text-center" role="status">
            <p className="text-body text-text-primary">
              No non-obvious connections yet.
            </p>
            <p className="mt-1 max-w-[420px] text-meta text-text-secondary">
              Nothing crossed the bar this time. Import more of your library, or
              scan again as it grows.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-sm border border-border bg-bg-card px-4 py-[8px] text-ui text-text-primary transition-colors duration-[120ms] ease-confirm hover:bg-bg-active"
              >
                Go to your timeline
              </Link>
              <button
                type="button"
                onClick={scanLibrary}
                className="text-meta text-text-secondary hover:text-text-primary"
              >
                Scan again
              </button>
            </div>
          </div>
        ) : null}

        {/* Distinct error state — the scan itself couldn't run. */}
        {phase === "error" ? (
          <div
            className="mt-12 flex flex-col items-center text-center"
            role="alert"
            aria-live="polite"
          >
            <p className="text-body text-text-primary">
              We couldn&apos;t reach the connection engine.
            </p>
            <p className="mt-1 max-w-[420px] text-meta text-text-secondary">
              The scan didn&apos;t complete. Check that the engine is running,
              then try again.
            </p>
            <button
              type="button"
              onClick={scanLibrary}
              className="mt-6 inline-flex min-h-[44px] items-center rounded-sm border border-hairline border-border-hairline bg-surface px-4 py-[8px] text-ui text-text-primary transition-colors duration-[120ms] ease-confirm hover:bg-surface-hover"
            >
              Try again
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// A single calm outline glyph for the working state (§5: "one centered Tabler
// icon"). Neutral, never blue — blue is reserved for the surfaced connection.
function WorkingGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-tertiary"
      aria-hidden="true"
    >
      <path d="M10 6h-4a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-4" />
      <path d="M14 4h6v6" />
      <path d="M14 10l6 -6" />
    </svg>
  );
}
