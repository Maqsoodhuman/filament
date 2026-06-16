"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { PenLine, Notebook, Share2, Plus, ArrowRight, Sparkles } from "lucide-react";
import BrandMark from "./BrandMark";
import { useStore } from "@/lib/store";

// Filament's backdrop-blur sticky topbar (docs/COHESIVE_DESIGN.md §3). Brand +
// tabs (Notes · Organized · Knowledge graph) + a context CTA. This replaces the
// old left-sidebar AppShell. On `/` (marketing home) the tabs hide and the CTA
// is "Open app"; inside the app it's "New note".

const TABS = [
  { id: "notes", label: "Notes", href: "/notes", icon: PenLine, match: (p: string) => p.startsWith("/notes") },
  { id: "organized", label: "Organized", href: "/organize", icon: Notebook, match: (p: string) => p.startsWith("/organize") },
  { id: "graph", label: "Knowledge graph", href: "/graph", icon: Share2, match: (p: string) => p.startsWith("/graph") },
] as const;

export default function Topbar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { createNote } = useStore();
  const isHome = pathname === "/" || pathname === "/product";

  function onNewNote() {
    const n = createNote();
    router.push(`/notes?id=${n.id}`);
  }

  return (
    <div className="topbar">
      <Link href="/" className="brand" aria-label="Filament — home">
        <BrandMark />
        <span>
          Filament
          <small>notes that connect</small>
        </span>
      </Link>

      {!isHome && (
        <nav className="tabs" aria-label="Primary">
          {TABS.map((t) => {
            const Ic = t.icon;
            const on = t.match(pathname);
            return (
              <Link
                key={t.id}
                href={t.href}
                className={`tab ${on ? "on" : ""}`}
                aria-current={on ? "page" : undefined}
              >
                <Ic size={15} />
                <span className="txt">{t.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="topbar-right">
        <Link href="/onboarding" className="cta ghost">
          <Sparkles size={15} /> Import
        </Link>
        {isHome ? (
          <Link href="/notes" className="cta">
            Open app <ArrowRight size={15} />
          </Link>
        ) : (
          <button type="button" className="cta" onClick={onNewNote}>
            <Plus size={15} /> New note
          </button>
        )}
      </div>
    </div>
  );
}
