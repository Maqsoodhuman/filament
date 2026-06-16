import Link from "next/link";
import {
  PenLine, Notebook, Share2, Sparkles, ChevronDown, ArrowRight,
  Workflow, GitBranch, Map, BookOpen,
} from "lucide-react";
import BrandMark from "./BrandMark";

// Marketing nav (home / product) — Capacities-style: brand + center links with
// Product & Resources dropdowns + Download + Pricing + Open app. Dropdowns are
// pure CSS (:hover / :focus-within), so this stays a server component.

const PRODUCT = [
  { icon: Share2, color: "#F2A93B", t: "The connection engine", d: "Surfaces non-obvious, true cross-domain threads", href: "/#how-it-works" },
  { icon: PenLine, color: "#1FA89A", t: "Notes", d: "Block editor with a live connections panel", href: "/notes" },
  { icon: Notebook, color: "#5B6CF0", t: "Organized", d: "Auto-clustered notebooks over your library", href: "/organize" },
  { icon: Sparkles, color: "#7C6CF0", t: "Knowledge graph", d: "Your library as a constellation of threads", href: "/graph" },
];

const RESOURCES = [
  { icon: Workflow, color: "#E0902A", t: "How it works", d: "The six-stage connection pipeline", href: "/#how-it-works" },
  { icon: Map, color: "#1FA89A", t: "Connection kinds", d: "Mechanism, dynamic, topic — and why amber wins", href: "/#kinds" },
  { icon: BookOpen, color: "#5B6CF0", t: "The principle", d: "Why an empty result is an honest result", href: "/#principle" },
  { icon: GitBranch, color: "#E8705B", t: "Open core", d: "Self-host the Community edition", href: "/#pricing" },
];

function Dropdown({ label, items }: { label: string; items: typeof PRODUCT }) {
  return (
    <div className="mnav-dd">
      <button className="mnav-link" type="button">
        {label} <ChevronDown size={14} />
      </button>
      <div className="mnav-panel" role="menu">
        {items.map((it) => {
          const Ic = it.icon;
          return (
            <Link key={it.t} href={it.href} className="mnav-item" role="menuitem">
              <span className="mi-ic" style={{ background: it.color }}>
                <Ic size={17} />
              </span>
              <span>
                <span className="mi-t">{it.t}</span>
                <span className="mi-d">{it.d}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketingNav() {
  return (
    <nav className="mnav" aria-label="Primary">
      <Link href="/" className="brand" aria-label="Filament — home">
        <BrandMark />
        <span>
          Filament
          <small>notes that connect</small>
        </span>
      </Link>

      <div className="mnav-links">
        <Dropdown label="Product" items={PRODUCT} />
        <Dropdown label="Resources" items={RESOURCES} />
        <Link href="/#pricing" className="mnav-link">Download</Link>
        <Link href="/#pricing" className="mnav-link">Pricing</Link>
      </div>

      <div className="mnav-right">
        <Link href="/notes" className="mnav-signin">Sign in</Link>
        <Link href="/notes" className="cta">
          Open app <ArrowRight size={15} />
        </Link>
      </div>
    </nav>
  );
}
