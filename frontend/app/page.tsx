import TopNav from "@/components/TopNav";
import NoteCard from "@/components/NoteCard";
import { timelineNotes } from "@/lib/fixtures";

// Timeline (home) — design system §4.2.
// Reverse-chron feed of flat NoteCards, wide margins, hairline separation,
// low density. The ConnectionCountBadge is the only accent on the screen.
// TODO(phase3): replace fixture with fetch("/notes") against the live API.
export default function TimelinePage() {
  const notes = [...timelineNotes].sort(
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
