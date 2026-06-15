import type { components } from "@/lib/api-types";

type ConnectionOut = components["schemas"]["ConnectionOut"];
type Kind = ConnectionOut["kind"];

// Connection-KIND metadata — design system §2 ("Connection-KIND colors").
// KIND is encoded by icon + label ALWAYS; color is the secondary cue and obeys
// the one-accent rule: ONLY `same mechanism` (structural) draws blue. The other
// two differentiate by icon + medium/secondary weight, never a second hue.
// Icons are inline Tabler glyphs (recycle / wave-sine / tag) so no dependency.
type KindMeta = {
  label: Kind;
  /** structural mechanism is the only blue KIND */
  blue: boolean;
  Icon: () => React.ReactElement;
};

function ArrowsTransferIcon() {
  // tabler arrows-transfer-up — structural transfer (mechanism)
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3v10" />
      <path d="M14 6l3 -3l3 3" />
      <path d="M7 21v-10" />
      <path d="M4 14l3 -3l3 3" />
    </svg>
  );
}

function WaveSineIcon() {
  // tabler wave-sine — recurring dynamic
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12c.667 -4 1.333 -6 4 -6c4 0 4 12 8 12c2.667 0 3.333 -2 4 -6" />
    </svg>
  );
}

function TagIcon() {
  // tabler tag — commodity topical link
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z" />
    </svg>
  );
}

export const KIND_META: Record<Kind, KindMeta> = {
  "same mechanism": { label: "same mechanism", blue: true, Icon: ArrowsTransferIcon },
  "same dynamic": { label: "same dynamic", blue: false, Icon: WaveSineIcon },
  "same topic": { label: "same topic", blue: false, Icon: TagIcon },
};

// KIND ordering — structural (blue) outranks commodity everywhere (§1.3).
export const KIND_ORDER: Kind[] = ["same mechanism", "same dynamic", "same topic"];

// KindBadge — the typed pill (§3 KindPill). Blue ONLY for `same mechanism`;
// `same dynamic` is neutral medium-weight, `same topic` neutral secondary.
export function KindBadge({ kind }: { kind: Kind }) {
  const meta = KIND_META[kind];
  const tone = meta.blue
    ? "bg-accent-ai-tint text-accent-ai border-accent-ai-border"
    : kind === "same dynamic"
      ? "text-text-primary font-medium border-border-hairline"
      : "text-text-secondary border-border-hairline";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-[2px] text-meta " +
        tone
      }
    >
      <meta.Icon />
      {meta.label}
    </span>
  );
}

// ConnectedNoteCard (rail) — design system §3 / §4.1.
// Partner-note title (h2) + KIND badge + the connection statement (the "why",
// the evidence excerpt the AI used). Flat, hairline, no shadow.
export default function ConnectedNoteCard({
  partnerTitle,
  kind,
  statement,
}: {
  partnerTitle: string;
  kind: Kind;
  statement: string;
}) {
  return (
    <article className="rounded-md border border-hairline border-border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-h2 text-text-primary">{partnerTitle}</h3>
      </div>
      <div className="mt-2">
        <KindBadge kind={kind} />
      </div>
      <p className="mt-2 text-meta text-text-secondary">{statement}</p>
    </article>
  );
}
