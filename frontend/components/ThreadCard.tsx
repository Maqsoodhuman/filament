import { Sparkles, ArrowRight } from "lucide-react";
import type { Connection } from "@/lib/store";
import { KIND_META } from "@/lib/store";

// The Intersection / Thread card (docs/COHESIVE_DESIGN.md §3 Intersections) —
// the proactive "where your ideas meet." Amber-framed, the *why* phrased as a
// sentence. Reused by the graph Insights tab, the Threads-this-week feed, and
// the onboarding first-insight moment. One component, three homes.

export default function ThreadCard({
  c,
  aEmoji = "📝",
  bEmoji = "📝",
  kicker = "Threads this week",
  onOpen,
}: {
  c: Connection;
  aEmoji?: string;
  bEmoji?: string;
  kicker?: string;
  onOpen?: () => void;
}) {
  const meta = KIND_META[c.kind];
  return (
    <article className="thread-card kg-reveal">
      <span className="tc-kicker">
        <Sparkles size={13} /> {kicker}
      </span>
      <p className="tc-why">{c.statement}</p>
      <div className="tc-pair">
        <span>
          {aEmoji} <b>{c.a_title}</b>
        </span>
        <ArrowRight size={14} style={{ color: "var(--text-faint)" }} />
        <span>
          {bEmoji} <b>{c.b_title}</b>
        </span>
        <span className={`kind-chip ${meta.slug}`} style={{ marginLeft: "auto" }}>
          {meta.label}
        </span>
        <span className="q-weight">
          q<b>{c.q}</b>
        </span>
      </div>
      {onOpen && (
        <button
          type="button"
          className="subtle-link"
          style={{ marginTop: 12, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={onOpen}
        >
          Follow the thread <ArrowRight size={13} />
        </button>
      )}
    </article>
  );
}
