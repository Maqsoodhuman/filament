import TopNav from "@/components/TopNav";
import FindConnectionsButton from "@/components/FindConnectionsButton";
import ConnectedNoteCard, {
  KindBadge,
  KIND_ORDER,
} from "@/components/ConnectedNoteCard";
import { fallbackNoteDetail } from "@/lib/fixtures";
import type { components } from "@/lib/api-types";

type NoteDetail = components["schemas"]["NoteDetail"];
type ConnectionOut = components["schemas"]["ConnectionOut"];
type Kind = ConnectionOut["kind"];

// Fetch note detail from the engine (server-side, no CORS), falling back to the
// typed fixture if the API is unreachable. Types come from the generated
// contract (lib/api-types.ts) — never hand-written.
async function getNoteDetail(id: string): Promise<NoteDetail> {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/notes/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as NoteDetail;
  } catch {
    return fallbackNoteDetail(id);
  }
}

// Resolve the partner-note title: a connection lists both endpoints (a/b), so
// pick whichever is NOT the note we're viewing.
function partnerTitle(c: ConnectionOut, noteId: string): string {
  return c.a_id === noteId ? c.b_title : c.a_title;
}

// Note detail — design system §4.1 / §6.3.
// Left: the note (title + body). Right: a 300px connected-notes rail, grouped
// by KIND (structural `same mechanism` first), with KIND badges + statements.
export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { note, connections = [] } = await getNoteDetail(id);

  // Group connections by KIND, in the canonical structural-first order.
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: connections.filter((c) => c.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Timeline" />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 lg:grid-cols-[1fr_300px]">
        {/* The note */}
        <article>
          <h1 className="text-display text-text-primary">{note.title}</h1>
          <div className="mt-2 text-meta text-text-secondary">
            {note.source}
          </div>
          <div className="mt-6 max-w-measure whitespace-pre-wrap text-body text-text-primary">
            {note.body}
          </div>
          <div className="mt-8">
            <FindConnectionsButton noteId={note.id} />
          </div>
        </article>

        {/* Connected-notes rail */}
        <aside className="lg:w-[300px]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-h2 text-text-primary">Connections</h2>
            <span className="text-meta text-text-secondary">
              {connections.length}
            </span>
          </div>

          {grouped.length === 0 ? (
            <div className="mt-6 rounded-md border border-hairline border-border-hairline bg-surface p-6 text-center">
              <p className="text-ui text-text-secondary">
                No connections found yet
              </p>
              <p className="mt-1 text-meta text-text-tertiary">
                Run Find connections to scan the library for non-obvious links.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-6">
              {grouped.map((group) => (
                <section key={group.kind}>
                  <div className="mb-2 flex items-center gap-2">
                    <KindBadge kind={group.kind as Kind} />
                    <span className="text-meta text-text-tertiary">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.items.map((c) => (
                      <ConnectedNoteCard
                        key={c.id}
                        partnerTitle={partnerTitle(c, note.id)}
                        kind={c.kind}
                        statement={c.statement}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
