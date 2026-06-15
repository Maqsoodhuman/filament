import TopNav from "@/components/TopNav";
import NoteCard from "@/components/NoteCard";
import { timelineNotes } from "@/lib/fixtures";
import type { components } from "@/lib/api-types";

type NoteOut = components["schemas"]["NoteOut"];

// Phase 3 integration: fetch the live timeline from the engine API (server-side,
// so no CORS), falling back to the typed fixture if the API is unreachable
// (offline dev / static build). Types come from the generated contract.
async function getNotes(): Promise<NoteOut[]> {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/notes`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as NoteOut[];
  } catch {
    return timelineNotes; // graceful fallback — keeps the screen rendering offline
  }
}

// Timeline (home) — design system §4.2.
// Reverse-chron feed of flat NoteCards. The ConnectionCountBadge is the only accent.
export default async function TimelinePage() {
  const notes = (await getNotes()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Timeline" />
      <main className="mx-auto max-w-[920px] px-6 py-12">
        <h1 className="text-h1 text-text-primary">Timeline</h1>
        <p className="mt-1 text-meta text-text-secondary">
          Your library, newest first.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      </main>
    </div>
  );
}
