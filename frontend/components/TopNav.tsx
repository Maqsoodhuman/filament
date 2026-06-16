import Link from "next/link";
import CommandPaletteHint from "@/components/CommandPaletteHint";

// TopNav — design system §3. Single persistent bar: app mark + three text
// tabs (sentence case), active tab marked by 500 weight + 1.5px neutral
// underline (NOT blue), right side holds the Cmd+K hint only.
const TABS = [
  { label: "Timeline", href: "/" },
  { label: "Organize", href: "/organize" },
  { label: "Graph", href: "/graph" },
] as const;

type TabLabel = (typeof TABS)[number]["label"];

export default function TopNav({
  active = "Timeline",
}: {
  active?: TabLabel;
}) {
  return (
    <header className="border-b border-hairline border-border-hairline bg-surface">
      <div className="flex h-[56px] w-full items-center justify-between gap-2 px-4 sm:gap-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-8">
          <Link
            href="/"
            className="min-w-0 shrink truncate text-h2 text-text-primary"
          >
            {/* Full mark on sm+, compact mark below sm so the tabs never collide. */}
            <span className="hidden sm:inline">Knowledge graph</span>
            <span className="sm:hidden">KG</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-3 sm:gap-6">
            {TABS.map((tab) => {
              const isActive = tab.label === active;
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={
                    "whitespace-nowrap text-ui transition-colors duration-[120ms] ease-confirm " +
                    (isActive
                      ? "font-medium text-text-primary [border-bottom:1.5px_solid_var(--text-primary)] pb-[2px]"
                      : "text-text-secondary hover:text-text-primary")
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <CommandPaletteHint />
      </div>
    </header>
  );
}
