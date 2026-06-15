import TopNav from "@/components/TopNav";

// Organize tab — design system §4.3. Compact left tree + multi-view main area
// ship in v1; this is a design-system-compliant placeholder so the nav tab
// navigates instead of 404ing. EmptyState pattern (§3): centered, one sentence,
// wide whitespace, no illustration.
export default function OrganizePage() {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Organize" />
      <main className="mx-auto max-w-[920px] px-6 py-12">
        <h1 className="text-h1 text-text-primary">Organize</h1>
        <p className="mt-1 text-meta text-text-secondary">
          Auto-clustered sections over your library.
        </p>
        <div className="mt-12 flex flex-col items-center justify-center rounded-md border border-hairline border-border-hairline bg-surface px-6 py-16 text-center">
          <p className="text-ui text-text-secondary">Coming soon</p>
          <p className="mt-1 max-w-[420px] text-meta text-text-tertiary">
            The Organize tab will group notes into AI-built sections you can view
            as pages, a table, or a board.
          </p>
        </div>
      </main>
    </div>
  );
}
