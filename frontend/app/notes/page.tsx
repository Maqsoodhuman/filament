"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import NoteEditor from "@/components/NoteEditor";
import ConnectionsPanel from "@/components/ConnectionsPanel";
import { useStore, plainPreview, type Note } from "@/lib/store";

// Notes surface (docs/COHESIVE_DESIGN.md §3): 288px note-list · 720px editor ·
// 320px Connections panel. The active note is the `?id=` query param so the
// topbar "New note" and connection-card "open" deep-link cleanly.

function NotesView() {
  const router = useRouter();
  const params = useSearchParams();
  const { notes, updateNote, createNote, connectionsFor } = useStore();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return notes
      .filter((n) => !s || n.title.toLowerCase().includes(s) || n.tags.some((t) => t.includes(s)))
      .sort((a, b) => b.updated - a.updated);
  }, [notes, q]);

  const activeId = params.get("id");
  const active: Note | undefined =
    notes.find((n) => n.id === activeId) ?? filtered[0] ?? notes[0];

  function select(id: string) {
    router.push(`/notes?id=${id}`);
  }
  function onNew() {
    const n = createNote();
    router.push(`/notes?id=${n.id}`);
  }

  return (
    <div className="notes-layout">
      <div className="note-list">
        <div className="nl-head">
          <h2>Notes</h2>
          <button className="nl-new" onClick={onNew} title="New note" aria-label="New note">
            <Plus size={18} />
          </button>
        </div>
        <div className="nl-search">
          <Search size={14} color="var(--text-faint)" />
          <input
            placeholder="Search notes & tags"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search notes and tags"
          />
        </div>
        {filtered.map((n) => {
          const conns = connectionsFor(n.id).filter((c) => c.q >= 3);
          return (
            <button
              key={n.id}
              className={`nl-item ${active?.id === n.id ? "on" : ""}`}
              onClick={() => select(n.id)}
            >
              <div className="row">
                <span className="emo">{n.emoji}</span>
                <span className="ti">{n.title || "Untitled"}</span>
                {conns.length > 0 && (
                  <span className="nl-conn" title={`${conns.length} connections`}>
                    ◆ {conns.length}
                  </span>
                )}
              </div>
              <p className="pv">{plainPreview(n)}</p>
              <div className="meta">
                <span>{n.tags.slice(0, 2).map((t) => "#" + t).join(" ") || n.source}</span>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 18, color: "var(--text-faint)", fontSize: 13 }}>
            No notes match “{q}”.
          </div>
        )}
      </div>

      {active ? (
        <>
          <NoteEditor key={active.id} note={active} onChange={updateNote} />
          <ConnectionsPanel note={active} />
        </>
      ) : (
        <div className="gp-empty" style={{ marginTop: 80 }}>
          No notes yet. Create one to begin.
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="gp-empty" style={{ marginTop: 80 }}>Loading…</div>}>
        <NotesView />
      </Suspense>
    </AppShell>
  );
}
