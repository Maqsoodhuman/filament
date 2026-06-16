import AppShell from "@/components/AppShell";
import OrganizeView from "@/components/OrganizeView";

// Organized (docs/COHESIVE_DESIGN.md §3) — Filament's OneNote 3-pane with real
// AI clusters + per-page connections. The view reads the client store; task #7
// swaps the store's cluster/notes/connection sources for the engine API
// (/clusters /notes /connections) without touching this surface.
export default function OrganizePage() {
  return (
    <AppShell>
      <OrganizeView />
    </AppShell>
  );
}
