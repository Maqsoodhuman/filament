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
      <div className="mx-auto flex h-[56px] max-w-[920px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-h2 text-text-primary">
            Knowledge graph
          </Link>
          <nav className="flex items-center gap-6">
            {TABS.map((tab) => {
              const isActive = tab.label === active;
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={
                    "text-ui transition-colors duration-[120ms] ease-confirm " +
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
