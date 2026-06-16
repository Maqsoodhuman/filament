import TopNav from "@/components/TopNav";
import OrganizeView from "@/components/OrganizeView";

// Route-level loading UI (Next.js Suspense boundary). Shown while the server
// component fetches sections + notes from the engine — a calm skeleton, not a
// telemetry dashboard (§5).
export default function OrganizeLoading() {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Organize" />
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <h1 className="text-h1 text-text-primary">Organize</h1>
        <p className="mt-1 text-meta text-text-secondary">
          Auto-clustered sections over your library.
        </p>
        <div className="mt-6 overflow-hidden rounded-md border border-hairline border-border-hairline bg-surface">
          <OrganizeView clusters={[]} notes={[]} loading />
        </div>
      </main>
    </div>
  );
}
