import TopNav from "@/components/TopNav";

// Graph tab — design system §4.4. The v1 graph is a LOCAL neighborhood view
// centered on the open note (deterministic radial, no physics), read straight
// from the connections edges. This is a design-system-compliant placeholder so
// the nav tab navigates instead of 404ing. EmptyState pattern (§3).
export default function GraphPage() {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Graph" />
      <main className="mx-auto max-w-[920px] px-6 py-12">
        <h1 className="text-h1 text-text-primary">Graph</h1>
        <p className="mt-1 text-meta text-text-secondary">
          The local neighborhood around a note.
        </p>
        <div className="mt-12 flex flex-col items-center justify-center rounded-md border border-hairline border-border-hairline bg-surface px-6 py-16 text-center">
          <p className="text-ui text-text-secondary">Coming soon</p>
          <p className="mt-1 max-w-[420px] text-meta text-text-tertiary">
            Open a note to see its connections laid out as a deterministic local
            graph, with structural links drawn in blue.
          </p>
        </div>
      </main>
    </div>
  );
}
