import Link from "next/link";
import type { components } from "@/lib/api-types";
import ConnectionCountBadge from "./ConnectionCountBadge";

type NoteOut = components["schemas"]["NoteOut"];

// NoteCard (timeline) — design system §3 / §4.2.
// Flat white card, hairline border, no shadow/gradient. Title (h2, 500) +
// 1-2 line body preview (secondary text) + created date (meta). The lone blue
// element is the ConnectionCountBadge; everything else stays neutral.
// The whole card is a Link to the note detail route — the core product moment.
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NoteCard({ note }: { note: NoteOut }) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="block rounded-card border border-border bg-bg-card p-4 transition-colors duration-[120ms] ease-confirm hover:border-text-tertiary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-h2 text-text-primary">{note.title}</h2>
        <div className="shrink-0">
          <ConnectionCountBadge count={note.connection_count} />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-ui text-text-secondary">
        {note.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-meta text-text-secondary">
        {note.source ? (
          <span className="inline-flex items-center rounded-pill bg-tag-bg px-2 py-[2px] text-tag-text">
            {note.source}
          </span>
        ) : null}
        <span>{formatDate(note.created_at)}</span>
      </div>
    </Link>
  );
}
