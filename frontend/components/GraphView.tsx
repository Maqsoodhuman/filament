"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import { Share2, Circle, PenLine, Eye } from "lucide-react";
import {
  useStore,
  KIND_META,
  topThreads,
  clusterColorOf,
  type Connection,
  type Note,
  type Cluster,
} from "@/lib/store";
import ConnectionCard from "./ConnectionCard";
import ThreadCard from "./ThreadCard";

// Knowledge graph (docs/COHESIVE_DESIGN.md §3): Filament's dark d3 force stage,
// but the edges are REAL KIND-typed connections — amber `same mechanism`
// filaments glow brightest, indigo `same dynamic`, faint slate `same topic`;
// thickness/opacity ∝ q. Right panel has two tabs: Connections (selected node's
// links) and Insights (the intersections feed). A focus toggle collapses to the
// selected node's local neighbourhood to avoid the hairball at scale.

type GNode = Note & { degree: number; color: string };
type GLink = { source: string; target: string; kind: Connection["kind"]; q: number; conn: Connection };

function buildGraph(notes: Note[], connections: Connection[], clusters: Cluster[]) {
  const degree: Record<string, number> = {};
  const links: GLink[] = [];
  for (const c of connections) {
    if (!notes.find((n) => n.id === c.a_id) || !notes.find((n) => n.id === c.b_id)) continue;
    degree[c.a_id] = (degree[c.a_id] ?? 0) + 1;
    degree[c.b_id] = (degree[c.b_id] ?? 0) + 1;
    links.push({ source: c.a_id, target: c.b_id, kind: c.kind, q: c.q, conn: c });
  }
  const nodes: GNode[] = notes.map((n) => ({
    ...n,
    degree: degree[n.id] ?? 0,
    color: clusterColorOf(n.id, clusters),
  }));
  return { nodes, links };
}

export default function GraphView() {
  const router = useRouter();
  const { notes, connections, clusters, connectionsFor, noteById } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const d3State = useRef<{ link?: d3.Selection<any, any, any, any>; node?: d3.Selection<any, any, any, any>; sim?: d3.Simulation<any, any> }>({});
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"insights" | "note">("insights");
  const [focus, setFocus] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      if (wrapRef.current) setDim({ w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const graph = useMemo(() => buildGraph(notes, connections, clusters), [notes, connections, clusters]);

  useEffect(() => {
    if (!svgRef.current || dim.w < 10) return;
    const { w, h } = dim;
    const nodes = graph.nodes.map((d) => ({ ...d })) as (GNode & d3.SimulationNodeDatum)[];
    const links = graph.links.map((d) => ({ ...d })) as (GLink & d3.SimulationLinkDatum<any>)[];
    const r = (d: GNode) => 10 + d.degree * 2.6;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const defs = svg.append("defs");
    const f = defs.append("filter").attr("id", "glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    f.append("feGaussianBlur").attr("stdDeviation", 3.4).attr("result", "b");
    const m = f.append("feMerge");
    m.append("feMergeNode").attr("in", "b");
    m.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.4, 3]).on("zoom", (e) => g.attr("transform", e.transform)) as any,
    );

    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => KIND_META[d.kind].edge)
      .attr("stroke-opacity", (d) => 0.25 + d.q * 0.14)
      .attr("stroke-width", (d) => 0.8 + d.q * 0.7)
      .attr("stroke-dasharray", (d) => (d.kind === "same topic" ? "2 6" : "3 5"))
      .attr("filter", (d) => (d.kind === "same mechanism" ? "url(#glow)" : null))
      .style("animation", (d) => (d.kind === "same mechanism" ? "flow 6s linear infinite" : "none"));

    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_e, d) => {
        setSelected(d.id);
        setTab("note");
        // pin the clicked node and freeze the layout so it stabilises for reading
        d.fx = d.x;
        d.fy = d.y;
        sim.stop();
      });

    node
      .append("circle")
      .attr("r", r)
      .attr("fill", (d) => d.color)
      .attr("filter", "url(#glow)")
      .attr("stroke", "#0E1019")
      .attr("stroke-width", 1.5);

    node
      .append("text")
      .text((d) => d.emoji)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => r(d) * 0.34)
      .attr("font-size", (d) => r(d) * 0.95)
      .style("pointer-events", "none");

    node
      .append("text")
      .attr("class", "node-label")
      .text((d) => d.title || "Untitled")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => -r(d) - 8);

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3.forceLink<any, any>(links).id((d: any) => d.id).distance((d: any) => 150 - d.q * 12).strength(0.4),
      )
      .force("charge", d3.forceManyBody().strength(-360))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide<any>().radius((d: any) => r(d) + 30))
      .on("tick", () => {
        link
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y);
        node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
      });

    const drag = d3
      .drag<any, any>()
      .on("start", (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on("end", (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag as any);

    d3State.current = { link, node, sim };
    return () => {
      sim.stop();
    };
  }, [graph, dim]);

  // highlight / focus the selected node's neighbourhood
  useEffect(() => {
    const { link, node } = d3State.current;
    if (!link || !node) return;
    if (!selected) {
      node.style("opacity", 1).style("display", null);
      link.style("opacity", null).style("display", null);
      return;
    }
    const nbr = new Set<string>([selected]);
    graph.links.forEach((l) => {
      if (l.source === selected) nbr.add(l.target);
      if (l.target === selected) nbr.add(l.source);
    });
    node
      .style("display", (d: any) => (focus && !nbr.has(d.id) ? "none" : null))
      .style("opacity", (d: any) => (nbr.has(d.id) ? 1 : 0.16));
    link
      .style("display", (d: any) => {
        const inc = d.source.id === selected || d.target.id === selected;
        return focus && !inc ? "none" : null;
      })
      .style("opacity", (d: any) => {
        const inc = d.source.id === selected || d.target.id === selected;
        return inc ? 1 : 0.06;
      });
  }, [selected, focus, graph]);

  const selNote = selected ? notes.find((n) => n.id === selected) : null;
  const selConns = selected ? connectionsFor(selected).filter((c) => c.q >= 3 || c.kind === "same topic") : [];
  const threads = useMemo(() => topThreads(connections, 5), [connections]);
  const orphans = graph.nodes.filter((n) => n.degree === 0);
  const componentsCount = useMemo(() => countComponents(graph.nodes, graph.links), [graph]);

  return (
    <div className="graph-wrap">
      <div className="graph-stage" ref={wrapRef}>
        <svg
          ref={svgRef}
          onClick={(e) => {
            if ((e.target as Element).tagName === "svg") {
              setSelected(null);
              // let the graph relax again when you click away to deselect
              d3State.current.sim?.alpha(0.3).restart();
            }
          }}
        />
        {selected && (
          <button className="graph-toggle" onClick={() => setFocus((v) => !v)}>
            <Eye size={14} />
            {focus ? "Show whole library" : "Focus neighbourhood"}
          </button>
        )}
        <div className="graph-legend">
          <span className="lg"><i style={{ background: KIND_META["same mechanism"].edge }} />same mechanism</span>
          <span className="lg"><i style={{ background: KIND_META["same dynamic"].edge }} />same dynamic</span>
          <span className="lg"><i style={{ background: KIND_META["same topic"].edge }} />same topic</span>
        </div>
        <div className="graph-hint">drag nodes · scroll to zoom · click a note to focus its threads</div>
      </div>

      <div className="gpanel">
        <div className="gp-tabhead">
          <button className={`gp-tab ${tab === "insights" ? "on" : ""}`} onClick={() => setTab("insights")}>Insights</button>
          <button className={`gp-tab ${tab === "note" ? "on" : ""}`} onClick={() => setTab("note")}>Selected</button>
        </div>

        {tab === "insights" && (
          <div className="gp-body">
            <div className="label" style={{ marginBottom: 12 }}>Where your ideas meet</div>
            {threads.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {threads.map((c) => (
                  <ThreadCard
                    key={c.id}
                    c={c}
                    aEmoji={noteById(c.a_id)?.emoji}
                    bEmoji={noteById(c.b_id)?.emoji}
                    kicker={c.kind === "same mechanism" ? "Structural thread" : "Recurring dynamic"}
                    onOpen={() => router.push(`/notes?id=${c.a_id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="honest-empty">
                <p className="he-ti">No intersections yet</p>
                <p>The engine hasn&apos;t found a genuinely non-obvious thread across your library. An empty feed is honest.</p>
              </div>
            )}

            <div className="insight" style={{ marginTop: 16 }}>
              <div className="ih"><span className="ii" style={{ background: "var(--indigo)" }}><Share2 size={14} /></span>Network shape</div>
              <div className="big">{componentsCount} {componentsCount === 1 ? "cluster" : "clusters"}</div>
              <p>{graph.nodes.length} notes joined by {graph.links.length} surfaced connections.</p>
            </div>

            <div className="insight">
              <div className="ih"><span className="ii" style={{ background: "var(--c-coral)" }}><Circle size={13} /></span>Loose threads</div>
              {orphans.length ? (
                <>
                  <p style={{ marginTop: 2 }}>No connections surfaced yet:</p>
                  <div className="tagrow">
                    {orphans.map((o) => (
                      <span key={o.id} className="subtle-link" onClick={() => { setSelected(o.id); setTab("note"); }}>
                        {o.emoji} {o.title || "Untitled"}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p>Every note connects to at least one other.</p>
              )}
            </div>
          </div>
        )}

        {tab === "note" &&
          (selNote ? (
            <div className="gp-body">
              <div className="gp-note-emo">{selNote.emoji}</div>
              <div className="gp-note-ti">{selNote.title || "Untitled"}</div>
              <div className="label" style={{ margin: "16px 0 10px" }}>
                Connections ({selConns.length})
              </div>
              {selConns.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selConns.map((c) => (
                    <ConnectionCard key={c.id} c={c} partnerEmoji={noteById(c.b_id)?.emoji} onOpen={() => setSelected(c.b_id)} />
                  ))}
                </div>
              ) : (
                <div className="honest-empty">
                  <p className="he-ti">No threads yet</p>
                  <p>No non-obvious connection surfaced for this note.</p>
                </div>
              )}
              <button className="gp-open" onClick={() => router.push(`/notes?id=${selNote.id}`)}>
                <PenLine size={15} /> Open in editor
              </button>
            </div>
          ) : (
            <div className="gp-empty">Click any node in the graph to inspect its connections.</div>
          ))}
      </div>
    </div>
  );
}

function countComponents(nodes: GNode[], links: GLink[]): number {
  const parent: Record<string, string> = {};
  nodes.forEach((n) => (parent[n.id] = n.id));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  links.forEach((l) => {
    const a = find(l.source);
    const b = find(l.target);
    if (a !== b) parent[a] = b;
  });
  return new Set(nodes.map((n) => find(n.id))).size;
}
