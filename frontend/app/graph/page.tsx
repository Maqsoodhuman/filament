import TopNav from "@/components/TopNav";
import GraphView from "@/components/GraphView";
import {
  allNotesFixture,
  noteDetailFixtures,
} from "@/lib/fixtures";
import type { components } from "@/lib/api-types";

type NoteOut = components["schemas"]["NoteOut"];
type ConnectionOut = components["schemas"]["ConnectionOut"];

// Fetch notes + connections from the engine (server-side, no CORS), falling
// back to typed fixtures if the API is unreachable. The graph then filters the
// edges down to the selected hub note client-side (mirrors
// GET /connections?note_id={id}). Types come from the generated contract.
async function getNotes(base: string): Promise<NoteOut[]> {
  const res = await fetch(`${base}/notes`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as NoteOut[];
}

async function getConnections(base: string): Promise<ConnectionOut[]> {
  // No note_id → the engine returns every surfaced connection; the client view
  // filters per hub. (Same endpoint as GET /connections?note_id={id}.)
  const res = await fetch(`${base}/connections`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as ConnectionOut[];
}

// Aggregate unique connections from the note-detail fixtures (offline fallback).
function fixtureConnections(): ConnectionOut[] {
  const seen = new Map<string, ConnectionOut>();
  for (const detail of Object.values(noteDetailFixtures)) {
    for (const c of detail.connections ?? []) seen.set(c.id, c);
  }
  return [...seen.values()];
}

// Graph tab — design system §4.4 / §6.4.
// LOCAL neighborhood: one note centered, its connected notes on a deterministic
// radial ring, edges labeled + colored by KIND (blue = same mechanism only).
export default async function GraphPage() {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  let notes: NoteOut[];
  let connections: ConnectionOut[];
  try {
    [notes, connections] = await Promise.all([
      getNotes(base),
      getConnections(base),
    ]);
  } catch {
    notes = allNotesFixture;
    connections = fixtureConnections();
  }

  // Prefer to center on a note that actually has connections, so the default
  // view is non-empty.
  const connectedIds = new Set<string>();
  for (const c of connections) {
    connectedIds.add(c.a_id);
    connectedIds.add(c.b_id);
  }
  const ordered = [
    ...notes.filter((n) => connectedIds.has(n.id)),
    ...notes.filter((n) => !connectedIds.has(n.id)),
  ];

  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Graph" />
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <h1 className="text-h1 text-text-primary">Graph</h1>
        <p className="mt-1 text-meta text-text-secondary">
          The local neighborhood around a note.
        </p>
        <div className="mt-6 overflow-hidden rounded-md border border-hairline border-border-hairline bg-surface">
          <GraphView notes={ordered} connections={connections} />
        </div>
      </main>
    </div>
  );
}
