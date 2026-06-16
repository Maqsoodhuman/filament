import AppShell from "@/components/AppShell";
import GraphView from "@/components/GraphView";

// Knowledge graph (docs/COHESIVE_DESIGN.md §3) — Filament's dark d3 stage fed
// with real KIND-typed connections. The view reads the client store; task #7
// swaps the store's notes/connections sources for the engine API (/notes,
// /connections) without touching this surface.
export default function GraphPage() {
  return (
    <AppShell>
      <GraphView />
    </AppShell>
  );
}
