"use client";

import { useMemo, useState } from "react";
import type { components } from "@/lib/api-types";
import { KIND_META, KIND_ORDER } from "@/components/ConnectedNoteCard";

type NoteOut = components["schemas"]["NoteOut"];
type ConnectionOut = components["schemas"]["ConnectionOut"];
type Kind = ConnectionOut["kind"];

// LOCAL neighborhood graph (§4.4 / §6.4): the hub note centered, its directly
// connected notes arranged on a deterministic radial ring (no physics, no
// sliders). Edges are labeled + colored by KIND; ONLY `same mechanism` draws
// blue (§1.1) — the other kinds are hairline neutral, differentiated by a
// small KIND label at the edge midpoint.

const VIEW_W = 860;
const VIEW_H = 560;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const RADIUS = 200;

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

export default function GraphView({
  notes,
  connections,
}: {
  notes: NoteOut[];
  connections: ConnectionOut[];
}) {
  // Only notes that actually have at least one edge can be a useful hub; but we
  // allow centering on any note (an isolated note shows an empty neighborhood).
  const [hubId, setHubId] = useState<string>(notes[0]?.id ?? "");

  const notesById = useMemo(() => {
    const m = new Map<string, NoteOut>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const hub = notesById.get(hubId) ?? notes[0] ?? null;

  // Edges incident to the hub (mirrors GET /connections?note_id={hubId}).
  const edges = useMemo(
    () =>
      connections
        .filter((c) => c.a_id === hubId || c.b_id === hubId)
        // Deterministic ordering: structural KINDs first, then by partner id.
        .sort((a, b) => {
          const ka = KIND_ORDER.indexOf(a.kind);
          const kb = KIND_ORDER.indexOf(b.kind);
          if (ka !== kb) return ka - kb;
          return partnerId(a, hubId).localeCompare(partnerId(b, hubId));
        }),
    [connections, hubId],
  );

  // Deterministic radial layout: evenly spaced around the ring, starting at top.
  const placed = edges.map((c, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(edges.length, 1);
    return {
      c,
      x: CX + RADIUS * Math.cos(angle),
      y: CY + RADIUS * Math.sin(angle),
      title: partnerTitle(c, hubId),
    };
  });

  return (
    <div className="flex flex-col">
      {/* Hub selector — "center graph on this note" (§4.4 palette verb). */}
      <div className="flex items-center gap-3 border-b border-hairline border-border-hairline px-4 py-3">
        <label className="text-meta text-text-secondary" htmlFor="hub-select">
          Centered on
        </label>
        <select
          id="hub-select"
          value={hubId}
          onChange={(e) => setHubId(e.target.value)}
          className="rounded-sm border border-hairline border-border-hairline bg-surface px-2 py-1 text-ui text-text-primary"
        >
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || "Untitled"}
            </option>
          ))}
        </select>
        <span className="ml-auto text-meta text-text-tertiary">
          {edges.length} {edges.length === 1 ? "connection" : "connections"}
        </span>
      </div>

      <div className="bg-surface px-4 py-4">
        {edges.length === 0 ? (
          <div className="flex h-[400px] flex-col items-center justify-center text-center">
            <p className="text-ui text-text-secondary">
              No connections around this note yet
            </p>
            <p className="mt-1 max-w-[420px] text-meta text-text-tertiary">
              Run Find connections to scan the library for non-obvious links to
              this note.
            </p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            className="block"
            role="img"
            aria-label="Local connection neighborhood"
          >
            {/* Edges first (under nodes). */}
            {placed.map(({ c, x, y }) => {
              const blue = KIND_META[c.kind].blue;
              return (
                <line
                  key={`edge-${c.id}`}
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke={
                    blue ? "var(--accent-ai)" : "var(--border-hairline)"
                  }
                  strokeWidth={blue ? 1.5 : 1}
                />
              );
            })}

            {/* Edge KIND labels at midpoints. */}
            {placed.map(({ c, x, y }) => {
              const blue = KIND_META[c.kind].blue;
              const mx = (CX + x) / 2;
              const my = (CY + y) / 2;
              return (
                <g key={`label-${c.id}`}>
                  <rect
                    x={mx - 52}
                    y={my - 11}
                    width={104}
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
                  <text
                    x={mx}
                    y={my + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fill={
                      blue ? "var(--accent-ai)" : "var(--text-secondary)"
                    }
                  >
                    {c.kind}
                  </text>
                </g>
              );
            })}

            {/* Partner nodes. */}
            {placed.map(({ c, x, y, title }) => (
              <g key={`node-${c.id}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill="var(--surface)"
                  stroke="var(--text-secondary)"
                  strokeWidth={1.5}
                />
                <text
                  x={x}
                  y={y + (y < CY ? -14 : 22)}
                  textAnchor="middle"
                  fontSize="13"
                  fill="var(--text-primary)"
                >
                  {clip(title)}
                </text>
              </g>
            ))}

            {/* Hub node (center) — reuses the ConnectionChip styling cue: the
                centered note is the subject, drawn as a filled neutral pill. */}
            <g>
              <rect
                x={CX - 96}
                y={CY - 18}
                width={192}
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
        )}
      </div>

      {/* Legend — KIND key; blue is reserved for `same mechanism` only. */}
      <div className="flex flex-wrap items-center gap-4 border-t border-hairline border-border-hairline px-4 py-3">
        {KIND_ORDER.map((k) => {
          const blue = KIND_META[k as Kind].blue;
          return (
            <span key={k} className="flex items-center gap-2 text-meta">
              <span
                className="inline-block h-[2px] w-6"
                style={{
                  background: blue
                    ? "var(--accent-ai)"
                    : "var(--border-hairline)",
                }}
              />
              <span
                className={blue ? "text-accent-ai" : "text-text-secondary"}
              >
                {k}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
