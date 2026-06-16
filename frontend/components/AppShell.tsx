import Topbar from "./Topbar";

// The Filament app frame: a sticky backdrop-blur topbar over a full-bleed
// surface. Each app surface (Notes / Organized / Graph) manages its own grid
// that fills calc(100vh - 60px), so the shell adds no padding of its own.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <Topbar />
      <main>{children}</main>
    </div>
  );
}
