"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, Link2, PenLine, RefreshCw } from "lucide-react";
import { useStore, formatDay, formatFull, type Cluster, type Note } from "@/lib/store";
import { ReadBlock, readNumbers } from "./ReadBlocks";
import ConnectionCard from "./ConnectionCard";

// Organized (docs/COHESIVE_DESIGN.md §3): Filament's OneNote 3-pane, but the
// sections are REAL AI clusters (names + live counts + colour dots, multi-
// section membership) from the engine's /clusters — not static categories. The
// content pane shows the page on ruled paper PLUS its KIND-typed connections,
// and a full-screen toggle opens the page node full.

export default function OrganizeView() {
  const router = useRouter();
  const { clusters, notes, connectionsFor, noteById, recluster } = useStore();
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [reclustering, setReclustering] = useState(false);

  async function onRecluster() {
    setReclustering(true);
    await recluster();
    setReclustering(false);
  }

  const activeCluster: Cluster | undefined =
    clusters.find((c) => c.id === clusterId) ?? clusters[0];

  const pages: Note[] = useMemo(() => {
    if (!activeCluster) return [];
    return activeCluster.note_ids
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is Note => Boolean(n))
      .sort((a, b) => b.updated - a.updated);
  }, [activeCluster, notes]);

  useEffect(() => {
    if (!pages.find((p) => p.id === pageId)) setPageId(pages[0]?.id ?? null);
  }, [pages, pageId]);

  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const numbers = useMemo(() => (page ? readNumbers(page.blocks) : {}), [page]);

  // which other clusters this page also belongs to (multi-section membership)
  const alsoIn = useMemo(() => {
    if (!page || !activeCluster) return [];
    return clusters
      .filter((c) => c.id !== activeCluster.id && c.note_ids.includes(page.id))
      .map((c) => c.label);
  }, [page, activeCluster, clusters]);

  const conns = page ? connectionsFor(page.id).filter((c) => c.q >= 3) : [];

  if (!activeCluster) {
    return (
      <div className="gp-empty" style={{ marginTop: 80 }}>
        No clusters yet. Write or import a few notes and the engine will group them.
      </div>
    );
  }

  return (
    <div className={`one-layout ${full ? "full" : ""}`}>
      {/* rail — AI notebooks / clusters */}
      <div className="one-rail">
        <div className="one-nb">
          <span className="cube" />
          Research library
        </div>
        {clusters.map((c) => (
          <button
            key={c.id}
            className={`one-sec ${activeCluster.id === c.id ? "on" : ""}`}
            style={activeCluster.id === c.id ? { borderLeftColor: c.color } : undefined}
            onClick={() => setClusterId(c.id)}
          >
            <span className="tab-c" style={{ background: c.color }} />
            <span className="txt">{c.label}</span>
            <span className="ct">{c.note_count}</span>
          </button>
        ))}
        <button
          className="one-sec"
          onClick={onRecluster}
          disabled={reclustering}
          title="New notes join existing sections automatically; this rebuilds all sections from scratch."
          style={{ marginTop: 8, opacity: reclustering ? 0.6 : 1, color: "var(--text-soft)" }}
        >
          <RefreshCw size={13} className={reclustering ? "spin" : undefined} />
          <span className="txt">{reclustering ? "Re-clustering…" : "Re-cluster"}</span>
        </button>
      </div>

      {/* pages */}
      <div className="one-pages">
        <div className="one-pages-head">
          <span>Pages</span>
          <span>{pages.length}</span>
        </div>
        {pages.map((p) => (
          <button
            key={p.id}
            className={`one-page ${page?.id === p.id ? "on" : ""}`}
            style={{ ["--seccolor" as string]: activeCluster.color }}
            onClick={() => setPageId(p.id)}
          >
            <div className="pg-ti">
              <span>{p.emoji}</span>
              <span>{p.title || "Untitled"}</span>
            </div>
            <div className="pg-dt">{formatDay(p.updated)}</div>
          </button>
        ))}
        {pages.length === 0 && (
          <div style={{ padding: 18, color: "var(--text-faint)", fontSize: 13 }}>No pages here yet.</div>
        )}
      </div>

      {/* content */}
      <div className="one-content">
        <div className="one-bar">
          <span className="ctag" style={{ color: activeCluster.color }}>
            ● {activeCluster.label}
            {alsoIn.length > 0 && (
              <span style={{ color: "var(--text-faint)" }}> · also in {alsoIn.join(", ")}</span>
            )}
          </span>
          <span className="grow" />
          <button className="one-full-btn" onClick={() => setFull((v) => !v)}>
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {full ? "Exit full screen" : "Open full"}
          </button>
        </div>

        {page ? (
          <>
            <div className="one-page-body">
              <h1 className="one-title">
                <span>{page.emoji}</span>
                {page.title || "Untitled"}
              </h1>
              <p className="one-date">{formatFull(page.updated)}</p>
              {page.blocks.map((b) => (
                <ReadBlock key={b.id} block={b} num={numbers[b.id]} />
              ))}
            </div>

            {/* the page's connections — the engine grafted into Organize */}
            <div className="one-conns">
              <p className="label">
                <Link2 size={13} style={{ color: "var(--filament-deep)" }} /> Connections
              </p>
              {conns.length > 0 ? (
                <div className="one-conns-grid">
                  {conns.map((c) => (
                    <ConnectionCard
                      key={c.id}
                      c={c}
                      partnerEmoji={noteById(c.b_id)?.emoji}
                      onOpen={() => router.push(`/notes?id=${c.b_id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="honest-empty">
                  <p className="he-ti">No threads yet</p>
                  <p>The engine found nothing genuinely non-obvious for this page. An empty result is honest.</p>
                </div>
              )}
              <button
                className="find-btn"
                style={{ marginTop: 14, maxWidth: 260 }}
                onClick={() => router.push(`/notes?id=${page.id}`)}
              >
                <PenLine size={15} /> Open in editor
              </button>
            </div>
          </>
        ) : (
          <div className="gp-empty" style={{ marginTop: 60 }}>Pick a section to read its pages.</div>
        )}
      </div>
    </div>
  );
}
