import type { components } from "@/lib/api-types";
import { KindBadge } from "./ConnectedNoteCard";

type ConnectionOut = components["schemas"]["ConnectionOut"];

// FirstInsightCallout — design system §5 (Onboarding) + §1 (the reserved blue).
// The single moment that earns the accent: the engine surfaced a connection the
// user never asked for. It reuses the `same mechanism` blue treatment (tint bg,
// blue border) regardless of KIND, because THIS is the activation insight — the
// "this product noticed something" beat. Calm: a soft fade+lift (240ms), no
// confetti, blue confined to this one block.
export default function FirstInsightCallout({
  connection,
}: {
  connection: ConnectionOut;
}) {
  return (
    <article
      className="kg-reveal rounded-md border border-accent-ai-border bg-accent-ai-tint p-6"
      role="status"
      aria-live="polite"
    >
      <p className="text-meta font-medium text-accent-ai">
        We found a connection you didn&apos;t ask for
      </p>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h2 className="text-h2 text-text-primary">{connection.a_title}</h2>
        <span className="shrink-0 text-meta text-text-secondary">paired with</span>
      </div>
      <h2 className="mt-1 text-h2 text-text-primary">{connection.b_title}</h2>
      <div className="mt-3">
        <KindBadge kind={connection.kind} />
      </div>
      <p className="mt-3 text-body text-text-primary">{connection.statement}</p>
    </article>
  );
}
