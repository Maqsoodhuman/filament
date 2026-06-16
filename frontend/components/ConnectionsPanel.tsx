"use client";

import { useState } from "react";
import { Sparkles, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStore, KIND_ORDER, type Note, type Connection } from "@/lib/store";
import ConnectionCard from "./ConnectionCard";

// The right-hand Connections panel — Filament's biggest gap, filled
// (docs/COHESIVE_DESIGN.md §3 Notes). The engine's KIND-grouped connections to
// THIS note: amber `same mechanism` first, then dynamic, then the quiet topic
// links. Find connections is an on-demand trigger (the engine never runs on
// every keystroke); while scanning we show a calm "looking for threads…", then
// cards reveal. An empty result is honest — we say so.

export default function ConnectionsPanel({ note }: { note: Note }) {
  const { connectionsFor, noteById } = useStore();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const conns = connectionsFor(note.id);
  // Surfaced discipline: q>=3 only (an authored note with no real thread stays
  // honestly empty). Topic links are shown but de-emphasised by ordering.
  const surfaced = conns.filter((c) => c.q >= 3 || c.kind === "same topic");

  async function findConnections() {
    setScanning(true);
    setScanned(false);
    // On-demand engine trigger. Task #7 swaps this for
    // POST /api/notes/{id}/find-connections + poll the job. The calm beat is
    // intentional — surfacing a real thread should feel considered.
    await new Promise((r) => setTimeout(r, 1100));
    setScanning(false);
    setScanned(true);
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: surfaced.filter((c) => c.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="conn-panel" aria-label="Connections">
      <div className="conn-head">
        <h3>
          <Link2 size={15} style={{ color: "var(--filament-deep)" }} />
          Connections
        </h3>
        <p className="sub">
          {surfaced.length > 0
            ? `${surfaced.length} surfaced for this note`
            : "Threads the engine found across your library"}
        </p>
      </div>

      <div className="conn-body">
        {scanning ? (
          <div className="scanning" role="status" aria-live="polite">
            <Sparkles size={16} className="spark" />
            Looking for threads…
          </div>
        ) : grouped.length > 0 ? (
          grouped.map((g) => (
            <div key={g.kind} className="kg-reveal" style={{ display: "contents" }}>
              <div className="conn-group-label">{g.kind}</div>
              {g.items.map((c: Connection) => (
                <ConnectionCard
                  key={c.id}
                  c={c}
                  partnerEmoji={noteById(c.b_id)?.emoji}
                  onOpen={() => router.push(`/notes?id=${c.b_id}`)}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="honest-empty">
            <p className="he-ti">No threads yet</p>
            <p>
              {scanned
                ? "The engine scanned and found nothing genuinely non-obvious here. An empty result is an honest result."
                : "Run a scan to look for non-obvious connections between this note and the rest of your library."}
            </p>
          </div>
        )}

        <button
          type="button"
          className="find-btn"
          onClick={findConnections}
          disabled={scanning}
          style={{ marginTop: 4 }}
        >
          <Sparkles size={15} />
          {scanning ? "Finding connections…" : "Find connections"}
        </button>
      </div>
    </aside>
  );
}
