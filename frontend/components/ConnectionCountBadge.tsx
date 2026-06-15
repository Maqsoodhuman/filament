// ConnectionCountBadge — design system §3.
// The SINGLE blue accent on the timeline: a pill with --accent-ai-tint bg and
// blue text, format "N connections". Always visible, never hover-gated.
// This is the only element on a NoteCard permitted to draw blue.
//
// Blue must mean an ACTUAL connection (design system §1: "Blue means exactly
// one thing"). So a zero count renders NEUTRAL — secondary text, no tint — and
// only a non-zero count earns the reserved accent.
export default function ConnectionCountBadge({ count }: { count: number }) {
  const label = `${count} ${count === 1 ? "connection" : "connections"}`;
  const tone =
    count === 0
      ? "text-text-secondary"
      : "bg-accent-ai-tint text-accent-ai";
  return (
    <span
      className={
        "inline-flex items-center rounded-pill px-3 py-1 text-meta " + tone
      }
    >
      {label}
    </span>
  );
}
