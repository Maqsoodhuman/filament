// ConnectionCountBadge — design system §3.
// The SINGLE blue accent on the timeline: a pill with --accent-ai-tint bg and
// blue text, format "N connections". Always visible, never hover-gated.
// This is the only element on a NoteCard permitted to draw blue.
export default function ConnectionCountBadge({ count }: { count: number }) {
  const label = `${count} ${count === 1 ? "connection" : "connections"}`;
  return (
    <span className="inline-flex items-center rounded-pill bg-accent-ai-tint px-3 py-1 text-meta text-accent-ai">
      {label}
    </span>
  );
}
