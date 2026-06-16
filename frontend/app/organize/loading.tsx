import AppShell from "@/components/AppShell";
import OrganizeView from "@/components/OrganizeView";

// Route-level loading UI (Next.js Suspense boundary). Shown while the server
// component fetches sections + notes from the engine — a calm skeleton, not a
// telemetry dashboard (§5).
export default function OrganizeLoading() {
  return (
    <AppShell title="Organize">
      <div className="px-4 py-6 sm:px-8">
        <p className="text-meta text-text-secondary">
          Auto-clustered sections over your library.
        </p>
        <div className="mt-5 overflow-hidden rounded-card border border-border bg-bg-card">
          <OrganizeView clusters={[]} notes={[]} loading />
        </div>
      </div>
    </AppShell>
  );
}
