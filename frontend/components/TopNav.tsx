// TopNav — design system §3. Single persistent bar: app mark + three text
// tabs (sentence case), active tab marked by 500 weight + 1.5px neutral
// underline (NOT blue), right side holds the Cmd+K hint only.
const TABS = ["Timeline", "Organize", "Graph"] as const;

export default function TopNav({
  active = "Timeline",
}: {
  active?: (typeof TABS)[number];
}) {
  return (
    <header className="border-b border-hairline border-border-hairline bg-surface">
      <div className="mx-auto flex h-[56px] max-w-[920px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-h2 text-text-primary">Knowledge graph</span>
          <nav className="flex items-center gap-6">
            {TABS.map((tab) => {
              const isActive = tab === active;
              return (
                <span
                  key={tab}
                  className={
                    "text-ui " +
                    (isActive
                      ? "font-medium text-text-primary [border-bottom:1.5px_solid_var(--text-primary)] pb-[2px]"
                      : "text-text-secondary")
                  }
                >
                  {tab}
                </span>
              );
            })}
          </nav>
        </div>
        <span className="text-meta text-text-tertiary">⌘K</span>
      </div>
    </header>
  );
}
