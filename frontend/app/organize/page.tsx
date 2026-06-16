import AppShell from "@/components/AppShell";
import OrganizeView from "@/components/OrganizeView";
import { clusterFixtures, allNotesFixture } from "@/lib/fixtures";
import type { components } from "@/lib/api-types";

type ClusterOut = components["schemas"]["ClusterOut"];
type NoteOut = components["schemas"]["NoteOut"];

// Fetch sections (clusters) + all notes from the engine (server-side, no CORS),
// falling back to typed fixtures if the API is unreachable. Types come from the
// generated contract (lib/api-types.ts) — never hand-written.
async function getClusters(base: string): Promise<ClusterOut[]> {
  const res = await fetch(`${base}/clusters`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as ClusterOut[];
}

async function getNotes(base: string): Promise<NoteOut[]> {
  const res = await fetch(`${base}/notes`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as NoteOut[];
}

// Organize tab — design system §4.3 / §6.4.
// OneNote three-pane: Notebook → Section (AI cluster) → Page (note). Neutral
// and dense; no blue (no connection moments live on this surface).
export default async function OrganizePage() {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  let clusters: ClusterOut[];
  let notes: NoteOut[];
  try {
    [clusters, notes] = await Promise.all([getClusters(base), getNotes(base)]);
  } catch {
    clusters = clusterFixtures;
    notes = allNotesFixture;
  }

  return (
    <AppShell title="Organize">
      <div className="px-4 py-6 sm:px-8">
        <p className="text-meta text-text-secondary">
          Auto-clustered sections over your library.
        </p>
        <div className="mt-5 overflow-hidden rounded-card border border-border bg-bg-card">
          <OrganizeView clusters={clusters} notes={notes} />
        </div>
      </div>
    </AppShell>
  );
}
