import Link from "next/link";
import AppShell from "@/components/AppShell";
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
    <AppShell title="Timeline">
      {/* Workspace fills the full width; the feed itself keeps a comfortable
          reading column but is left-aligned (no centered dead margins). */}
      <div className="px-4 py-8 sm:px-8">
        <p className="text-meta text-text-secondary">
          Your library, newest first.
        </p>
        {notes.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <p className="text-body text-text-secondary">
              Your library is empty.
            </p>
            <Link
              href="/onboarding"
              className="mt-4 inline-flex items-center rounded-sm bg-btn-solid-bg px-4 py-[10px] text-ui text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90"
            >
              Import your library
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex max-w-3xl flex-col gap-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
