"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { FlaskConical, Highlighter, CalendarDays, Cpu, Users, Lightbulb } from "lucide-react";

// The hero IS the product: the floating product-chips are graph NODES, and amber
// filaments connect them — straight dashed chains down each side PLUS arcs that
// sweep over the top and under the bottom, wrapping the headline in a loop of
// connections (never crossing the text). Filaments march (animated dashes) and
// the whole dark block breathes. Edges are drawn in measured pixels (SVG paths
// can't take %), recomputed on resize; the chips position by % and render
// server-side, the edge layer mounts client-side (no hydration mismatch).

type Node = {
  x: number; y: number; side: "left" | "right";
  body: React.ReactNode;
};

// the floating chips are the kinds of things in your library — note categories,
// not engine internals (Capacities-style). Exact left/right symmetry: left x=12
// ↔ right x=88, shared y.
const NODES: Node[] = [
  { x: 12, y: 20, side: "left", body: (<><FlaskConical size={14} style={{ color: "var(--c-teal)" }} />Research<span className="fc-sub">· 24</span></>) },
  { x: 12, y: 50, side: "left", body: (<><Highlighter size={14} style={{ color: "var(--filament-deep)" }} />Reading highlights<span className="fc-sub">· 58</span></>) },
  { x: 12, y: 80, side: "left", body: (<><CalendarDays size={14} style={{ color: "var(--c-violet)" }} />Daily notes<span className="fc-sub">· 31</span></>) },
  { x: 88, y: 20, side: "right", body: (<><Cpu size={14} style={{ color: "var(--indigo)" }} />Technology<span className="fc-sub">· 19</span></>) },
  { x: 88, y: 50, side: "right", body: (<><Users size={14} style={{ color: "var(--c-coral)" }} />Meeting notes<span className="fc-sub">· 12</span></>) },
  { x: 88, y: 80, side: "right", body: (<><Lightbulb size={14} style={{ color: "var(--c-rose)" }} />Ideas<span className="fc-sub">· 9</span></>) },
];

// straight vertical chains down each margin (a above b, same x)
const CHAINS: [number, number][] = [[0, 1], [1, 2], [3, 4], [4, 5]];

export default function HeroField() {
  const ref = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setDim({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const px = (n: Node) => ({ x: (n.x / 100) * (dim?.w ?? 0), y: (n.y / 100) * (dim?.h ?? 0) });

  return (
    <div className="floaters" ref={ref} aria-hidden="true">
      {dim && (
        <svg className="hero-field" width={dim.w} height={dim.h}>
          {/* straight dashed chains in the side margins */}
          {CHAINS.map(([a, b], i) => {
            const A = px(NODES[a]), B = px(NODES[b]);
            const gap = 26;
            const d = `M ${A.x} ${A.y + gap} L ${B.x} ${B.y - gap}`;
            return (
              <g key={`c${i}`}>
                <path className="hf-edge-base" d={d} />
                <path className="hf-edge" d={d} style={{ animationDelay: `${(i * 0.2).toFixed(2)}s` }} />
              </g>
            );
          })}

          {/* arc over the top: top-left node → top-right node, sweeping above the
              eyebrow/headline through the empty top margin */}
          {(() => {
            const A = px(NODES[0]), B = px(NODES[3]);
            const d = `M ${A.x} ${A.y - 14} Q ${dim.w / 2} ${-dim.h * 0.16} ${B.x} ${B.y - 14}`;
            return (
              <g>
                <path className="hf-edge-base" d={d} fill="none" />
                <path className="hf-edge" d={d} fill="none" style={{ animationDelay: "0.4s" }} />
              </g>
            );
          })()}

          {/* arc under the bottom: bottom-left node → bottom-right node, sweeping
              below the CTAs through the empty bottom margin */}
          {(() => {
            const A = px(NODES[2]), B = px(NODES[5]);
            const d = `M ${A.x} ${A.y + 14} Q ${dim.w / 2} ${dim.h * 1.14} ${B.x} ${B.y + 14}`;
            return (
              <g>
                <path className="hf-edge-base" d={d} fill="none" />
                <path className="hf-edge" d={d} fill="none" style={{ animationDelay: "0.6s" }} />
              </g>
            );
          })()}
        </svg>
      )}

      {NODES.map((n, i) => (
        <div
          key={i}
          className={`hf-node ${n.side}`}
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          <span className="float-card" style={{ animation: "none" }}>
            {n.body}
          </span>
        </div>
      ))}
    </div>
  );
}
