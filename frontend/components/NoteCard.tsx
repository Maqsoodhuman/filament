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
      className="block rounded-md border-hairline border border-border-hairline bg-surface p-4 transition-colors duration-[120ms] ease-confirm hover:bg-surface-hover"
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
      <div className="mt-3 text-meta text-text-secondary">
        {formatDate(note.created_at)}
      </div>
    </Link>
  );
}
