import { ArrowLeftRight, Waves, Hash } from "lucide-react";
import type { Connection } from "@/lib/store";
import { KIND_META } from "@/lib/store";

// A single KIND-typed connection card — the engine's payoff rendered in
// Filament's hand (docs/COHESIVE_DESIGN.md §3). Partner emoji + title, the
// one-line *why*, the amber/indigo/slate KIND chip, and the q-weight as a mono
// chip. Amber `same mechanism` cards glow — the colour law.
//
// `c` must already be oriented so b_* is the partner (use store.connectionsFor
// or orientFrom). `partnerEmoji` is client metadata looked up by the caller.

function KindGlyph({ slug }: { slug: "mechanism" | "dynamic" | "topic" }) {
  if (slug === "mechanism") return <ArrowLeftRight size={12} />;
  if (slug === "dynamic") return <Waves size={12} />;
  return <Hash size={12} />;
}

export default function ConnectionCard({
  c,
  partnerEmoji = "📝",
  onOpen,
}: {
  c: Connection;
  partnerEmoji?: string;
  onOpen?: () => void;
}) {
  const meta = KIND_META[c.kind];
  return (
    <button
      type="button"
      className={`conn-card ${meta.slug}`}
      onClick={onOpen}
      aria-label={`Open connection to ${c.b_title}`}
    >
      <div className="cc-top">
        <span className="cc-emo">{partnerEmoji}</span>
        <span className="cc-ti">{c.b_title}</span>
      </div>
      <p className="cc-why">{c.statement}</p>
      <div className="cc-foot">
        <span className={`kind-chip ${meta.slug}`}>
          <KindGlyph slug={meta.slug} />
          {meta.label}
        </span>
        <span className="q-weight" title={`validity ${c.validity} · non-obviousness ${c.nonobviousness}`}>
          q<b>{c.q}</b>
        </span>
      </div>
    </button>
  );
}
