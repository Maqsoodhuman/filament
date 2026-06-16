"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { components } from "@/lib/api-types";
import { KIND_META, KIND_ORDER, KindBadge } from "@/components/ConnectedNoteCard";

type NoteOut = components["schemas"]["NoteOut"];
type ConnectionOut = components["schemas"]["ConnectionOut"];
type Kind = ConnectionOut["kind"];

// LOCAL neighborhood graph (§4.4 / §6.4): the hub note centered, its directly
// connected PARTNER notes arranged on a deterministic radial ring (no physics,
// no sliders). One node per partner note — its multiple KINDs are aggregated
// onto the node, NOT drawn as duplicate nodes. Edges/labels are typed by KIND
// (icon + label + weight, never color alone); ONLY `same mechanism` draws blue
// (§1.1). Below `md` the radial SVG is illegible, so we render a vertical list
// of connections instead (readable-font-size).

const VIEW_W = 860;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const RADIUS = 210;

function partnerId(c: ConnectionOut, hubId: string): string {
  return c.a_id === hubId ? c.b_id : c.a_id;
}
function partnerTitle(c: ConnectionOut, hubId: string): string {
  return c.a_id === hubId ? c.b_title : c.a_title;
}

// Truncate a label so node text stays inside its pill.
function clip(s: string, n = 22): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// The strongest (most structural) KIND among a partner's edges decides the
// node/edge emphasis. KIND_ORDER puts `same mechanism` first.
function strongestKind(kinds: Kind[]): Kind {
  for (const k of KIND_ORDER) if (kinds.includes(k)) return k;
  return kinds[0];
}

type Partner = {
  id: string;
  title: string;
  kinds: Kind[];
  primary: Kind;
  // representative connection per kind, for the "why"/statement
  statements: { kind: Kind; statement: string }[];
};

export default function GraphView({
  notes,
  connections,
}: {
  notes: NoteOut[];
  connections: ConnectionOut[];
}) {
  const router = useRouter();
  const [hubId, setHubId] = useState<string>(notes[0]?.id ?? "");

  const notesById = useMemo(() => {
    const m = new Map<string, NoteOut>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const hub = notesById.get(hubId) ?? notes[0] ?? null;

  // Edges incident to the hub, aggregated into ONE partner per note (dedupe).
  const partners: Partner[] = useMemo(() => {
    const byPartner = new Map<string, Partner>();
    for (const c of connections) {
      if (c.a_id !== hubId && c.b_id !== hubId) continue;
      const pid = partnerId(c, hubId);
      const existing = byPartner.get(pid);
      if (existing) {
        if (!existing.kinds.includes(c.kind)) existing.kinds.push(c.kind);
        if (!existing.statements.some((s) => s.kind === c.kind))
          existing.statements.push({ kind: c.kind, statement: c.statement });
      } else {
        byPartner.set(pid, {
          id: pid,
          title: partnerTitle(c, hubId),
          kinds: [c.kind],
          primary: c.kind,
          statements: [{ kind: c.kind, statement: c.statement }],
        });
      }
    }
    const list = [...byPartner.values()].map((p) => ({
      ...p,
      primary: strongestKind(p.kinds),
      kinds: [...p.kinds].sort(
        (a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b),
      ),
      statements: [...p.statements].sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
      ),
    }));
    // Deterministic: structural partners first, then by id.
    list.sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.primary);
      const kb = KIND_ORDER.indexOf(b.primary);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [connections, hubId]);

  // Deterministic radial layout: evenly spaced around the ring, starting at top.
  const placed = partners.map((p, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(partners.length, 1);
    return {
      p,
      x: CX + RADIUS * Math.cos(angle),
      y: CY + RADIUS * Math.sin(angle),
      angle,
    };
  });

  const count = partners.length;

  function goTo(id: string) {
    router.push(`/notes/${id}`);
  }

  return (
    <div className="flex flex-col">
      {/* Hub selector — "center graph on this note" (§4.4 palette verb). */}
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline border-border-hairline px-4 py-3">
        <label className="text-meta text-text-secondary" htmlFor="hub-select">
          Centered on
        </label>
        <select
          id="hub-select"
          value={hubId}
          onChange={(e) => setHubId(e.target.value)}
          className="min-h-[44px] max-w-full rounded-sm border border-hairline border-border-hairline bg-surface px-2 py-1 text-ui text-text-primary"
        >
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || "Untitled"}
            </option>
          ))}
        </select>
        {/* Count is connection signal → blue when non-zero (§1.1), else neutral. */}
        <span
          className={
            "ml-auto rounded-pill px-2 py-[2px] text-meta " +
            (count > 0
              ? "bg-accent-ai-tint text-accent-ai"
              : "text-text-secondary")
          }
        >
          {count} {count === 1 ? "connection" : "connections"}
        </span>
      </div>

      {/* Screen-reader list of the neighborhood (sr-only) — the SVG is decorative
          for AT, this is the accessible equivalent (aria-labels / voiceover-sr). */}
      <ul className="sr-only">
        <li>
          Centered on {hub?.title || "Untitled"}, {count}{" "}
          {count === 1 ? "connection" : "connections"}.
        </li>
        {partners.map((p) => (
          <li key={`sr-${p.id}`}>
            <a href={`/notes/${p.id}`}>
              {p.title} — {p.kinds.join(", ")}
            </a>
          </li>
        ))}
      </ul>

      {count === 0 ? (
        <div className="flex h-[400px] flex-col items-center justify-center px-4 text-center">
          <p className="text-ui text-text-secondary">
            No connections around this note yet
          </p>
          <p className="mt-1 max-w-[420px] text-meta text-text-tertiary">
            Run Find connections to scan the library for non-obvious links to
            this note.
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE (< md): vertical list — a scaled-down radial SVG is illegible. */}
          <ul
            className="flex flex-col gap-3 bg-surface px-4 py-4 md:hidden"
            aria-hidden="false"
          >
            <li className="rounded-md border border-hairline border-border-hairline bg-surface-hover px-3 py-2 text-h2 text-text-primary">
              {hub?.title || "Untitled"}
            </li>
            {partners.map((p) => (
              <li key={`m-${p.id}`}>
                <Link
                  href={`/notes/${p.id}`}
                  className="block rounded-md border border-hairline border-border-hairline bg-surface p-3 transition-colors duration-[120ms] ease-confirm hover:bg-surface-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-h2 text-text-primary">{p.title}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.kinds.map((k) => (
                      <KindBadge key={k} kind={k} />
                    ))}
                  </div>
                  <p className="mt-2 text-meta text-text-secondary">
                    {p.statements[0]?.statement}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* DESKTOP (>= md): the deterministic radial SVG. */}
          <div className="hidden bg-surface px-4 py-4 md:block">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              width="100%"
              className="block"
              role="img"
              aria-label={`Local connection neighborhood centered on ${hub?.title || "Untitled"}`}
            >
              {/* Edges first (under nodes). Non-mechanism edges use a darker
                  neutral (≥3:1, WCAG 1.4.11), mechanism is blue + thicker. */}
              {placed.map(({ p, x, y }) => {
                const blue = KIND_META[p.primary].blue;
                return (
                  <line
                    key={`edge-${p.id}`}
                    x1={CX}
                    y1={CY}
                    x2={x}
                    y2={y}
                    stroke={blue ? "var(--accent-ai)" : "var(--text-secondary)"}
                    strokeWidth={blue ? 2 : 1.25}
                  />
                );
              })}

              {/* KIND labels placed near the PARTNER end (just inside the node),
                  staggered radially so they clear the centered hub pill and each
                  other. One label group per node → no per-edge collisions. */}
              {placed.map(({ p, x, y, angle }) => {
                const blue = KIND_META[p.primary].blue;
                // Pull the label 56px back toward the hub from the node.
                const lx = CX + (RADIUS - 64) * Math.cos(angle);
                const ly = CY + (RADIUS - 64) * Math.sin(angle);
                const label = p.primary;
                const w = label.length * 6.2 + 30;
                return (
                  <g key={`label-${p.id}`}>
                    <rect
                      x={lx - w / 2}
                      y={ly - 11}
                      width={w}
                      height={22}
                      rx={11}
                      fill="var(--surface)"
                      stroke={
                        blue
                          ? "var(--accent-ai-border)"
                          : "var(--border-hairline)"
                      }
                      strokeWidth={1}
                    />
                    {/* tiny KIND glyph (icon, not color alone) */}
                    <KindGlyph
                      kind={p.primary}
                      x={lx - w / 2 + 10}
                      y={ly}
                    />
                    <text
                      x={lx + 7}
                      y={ly + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={p.primary === "same dynamic" ? 500 : 400}
                      fill={blue ? "var(--accent-ai)" : "var(--text-secondary)"}
                    >
                      {label}
                    </text>
                    {/* If the partner has more than one KIND, show a "+N" cue. */}
                    {p.kinds.length > 1 ? (
                      <text
                        x={lx + w / 2 + 8}
                        y={ly + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--text-secondary)"
                      >
                        +{p.kinds.length - 1}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* Partner nodes — interactive: click → /notes/{id}, ≥24px hit
                  area (28px circle), hover/focus ring, accessible name, tooltip. */}
              {placed.map(({ p, x, y }) => {
                const blue = KIND_META[p.primary].blue;
                return (
                  <a
                    key={`node-${p.id}`}
                    href={`/notes/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      goTo(p.id);
                    }}
                    aria-label={`${p.title}: ${p.kinds.join(", ")}`}
                    className="kg-graph-node cursor-pointer outline-none"
                  >
                    <title>{`${p.title} — ${p.kinds.join(", ")}`}</title>
                    {/* invisible larger hit target */}
                    <circle cx={x} cy={y} r={16} fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={7}
                      fill="var(--surface)"
                      stroke={blue ? "var(--accent-ai)" : "var(--text-secondary)"}
                      strokeWidth={2}
                    />
                    <text
                      x={x}
                      y={y + (y < CY ? -16 : 24)}
                      textAnchor="middle"
                      fontSize="13"
                      fill="var(--text-primary)"
                    >
                      {clip(p.title)}
                    </text>
                  </a>
                );
              })}

              {/* Hub node (center) — filled neutral pill, the subject note. */}
              <g>
                <rect
                  x={CX - 100}
                  y={CY - 18}
                  width={200}
                  height={36}
                  rx={18}
                  fill="var(--text-primary)"
                />
                <text
                  x={CX}
                  y={CY + 4}
                  textAnchor="middle"
                  fontSize="13"
                  fill="var(--surface)"
                  fontWeight={500}
                >
                  {clip(hub?.title ?? "", 26)}
                </text>
              </g>
            </svg>
          </div>
        </>
      )}

      {/* Legend — KIND key with icon + weight + label (color is secondary cue,
          never sole meaning; §10 color-not-only). */}
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline border-border-hairline px-4 py-3">
        {KIND_ORDER.map((k) => (
          <KindBadge key={k} kind={k as Kind} />
        ))}
      </div>
    </div>
  );
}

// Small inline KIND glyph for SVG edge labels (icon, not color alone).
function KindGlyph({ kind, x, y }: { kind: Kind; x: number; y: number }) {
  const blue = KIND_META[kind].blue;
  const stroke = blue ? "var(--accent-ai)" : "var(--text-secondary)";
  const common = {
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  // Render the matching Tabler path, translated to (x-6, y-6) at 12px.
  let path: React.ReactElement;
  if (kind === "same mechanism") {
    path = (
      <>
        <path d="M17 3v10" />
        <path d="M14 6l3 -3l3 3" />
        <path d="M7 21v-10" />
        <path d="M4 14l3 -3l3 3" />
      </>
    );
  } else if (kind === "same dynamic") {
    path = (
      <path d="M3 12c.667 -4 1.333 -6 4 -6c4 0 4 12 8 12c2.667 0 3.333 -2 4 -6" />
    );
  } else {
    path = (
      <>
        <path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
        <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z" />
      </>
    );
  }
  return (
    <g
      transform={`translate(${x - 6}, ${y - 6}) scale(0.5)`}
      {...common}
      aria-hidden="true"
    >
      {path}
    </g>
  );
}
