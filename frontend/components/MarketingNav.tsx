"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PenLine, Notebook, Share2, Sparkles, ChevronDown, ArrowRight,
  Workflow, GitBranch, Map, BookOpen, type LucideIcon,
} from "lucide-react";
import BrandMark from "./BrandMark";

// Marketing nav (home / product) — Capacities-style: brand + center links with
// Product & Resources dropdowns + Download + Pricing + Open app. Hover gives a
// preview; a click *pins* the menu open (holds until you click it again or click
// outside) so hover never closes what a click opened. Only one menu open at a
// time, so they never overlap.

type Item = { icon: LucideIcon; color: string; t: string; d: string; href: string };

const PRODUCT: Item[] = [
  { icon: Share2, color: "#F2A93B", t: "The connection engine", d: "Surfaces non-obvious, true cross-domain threads", href: "/#how-it-works" },
  { icon: PenLine, color: "#1FA89A", t: "Notes", d: "Block editor with a live connections panel", href: "/notes" },
  { icon: Notebook, color: "#5B6CF0", t: "Organized", d: "Auto-clustered notebooks over your library", href: "/organize" },
  { icon: Sparkles, color: "#7C6CF0", t: "Knowledge graph", d: "Your library as a constellation of threads", href: "/graph" },
];

const RESOURCES: Item[] = [
  { icon: Workflow, color: "#E0902A", t: "How it works", d: "The six-stage connection pipeline", href: "/#how-it-works" },
  { icon: Map, color: "#1FA89A", t: "Connection kinds", d: "Mechanism, dynamic, topic — and why amber wins", href: "/#kinds" },
  { icon: BookOpen, color: "#5B6CF0", t: "The principle", d: "Why an empty result is an honest result", href: "/#principle" },
  { icon: GitBranch, color: "#E8705B", t: "Open core", d: "Self-host the Community edition", href: "/#pricing" },
];

function Dropdown({
  id, label, items, isOpen, onEnter, onLeave, onToggle, onItemClick,
}: {
  id: string; label: string; items: Item[]; isOpen: boolean;
  onEnter: () => void; onLeave: () => void; onToggle: () => void; onItemClick: () => void;
}) {
  return (
    <div className="mnav-dd" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button type="button" className="mnav-link" aria-expanded={isOpen} onClick={onToggle}>
        {label}
        <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "0.15s" }} />
      </button>
      {isOpen && (
        <div className="mnav-panel" role="menu">
          {items.map((it) => {
            const Ic = it.icon;
            return (
              <Link key={it.t} href={it.href} className="mnav-item" role="menuitem" onClick={onItemClick}>
                <span className="mi-ic" style={{ background: it.color }}>
                  <Ic size={17} />
                </span>
                <span className="mi-text">
                  <span className="mi-t">{it.t}</span>
                  <span className="mi-d">{it.d}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MarketingNav() {
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // close when clicking outside the nav, or on Escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null);
        setPinned(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        setPinned(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const close = () => {
    setOpen(null);
    setPinned(false);
  };
  const props = (id: string) => ({
    id,
    isOpen: open === id,
    onEnter: () => { if (!pinned) setOpen(id); },           // hover = preview
    onLeave: () => { if (!pinned) setOpen(null); },
    onToggle: () => {                                        // click = pin / unpin
      if (open === id && pinned) close();
      else { setOpen(id); setPinned(true); }
    },
    onItemClick: close,
  });

  return (
    <nav className="mnav" aria-label="Primary" ref={navRef}>
      <Link href="/" className="brand" aria-label="Filament — home">
        <BrandMark />
        <span>
          Filament
          <small>notes that connect</small>
        </span>
      </Link>

      <div className="mnav-links">
        <Dropdown label="Product" items={PRODUCT} {...props("product")} />
        <Dropdown label="Resources" items={RESOURCES} {...props("resources")} />
        <Link href="/#pricing" className="mnav-link">Download</Link>
        <Link href="/#pricing" className="mnav-link">Pricing</Link>
      </div>

      <div className="mnav-right">
        <Link href="/signin" className="mnav-signin">Sign in</Link>
        <Link href="/notes" className="cta">
          Open app <ArrowRight size={15} />
        </Link>
      </div>
    </nav>
  );
}
