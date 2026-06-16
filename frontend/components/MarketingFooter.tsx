import Link from "next/link";
import BrandMark from "./BrandMark";

// Big multi-column marketing footer (Capacities-style), adapted to Filament's
// surfaces, resources, and open-core editions.

const COLS: { h: string; links: { t: string; href: string }[] }[] = [
  {
    h: "Product",
    links: [
      { t: "Notes", href: "/notes" },
      { t: "Organized", href: "/organize" },
      { t: "Knowledge graph", href: "/graph" },
      { t: "Import a library", href: "/onboarding" },
    ],
  },
  {
    h: "Resources",
    links: [
      { t: "How it works", href: "/#how-it-works" },
      { t: "Connection kinds", href: "/#kinds" },
      { t: "The principle", href: "/#principle" },
      { t: "Product tour", href: "/product" },
    ],
  },
  {
    h: "Editions",
    links: [
      { t: "Community (free)", href: "/#pricing" },
      { t: "Premium", href: "/#pricing" },
      { t: "Self-host", href: "/#pricing" },
      { t: "Pricing", href: "/#pricing" },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="mfooter">
      <div className="mf-inner">
        <div>
          <Link href="/" className="brand" aria-label="Filament — home">
            <BrandMark />
            <span style={{ fontSize: 16 }}>Filament</span>
          </Link>
          <p className="mf-brand-blurb">
            A cross-source synthesis instrument. It surfaces the genuinely
            non-obvious, true connections across everything you read.
          </p>
        </div>
        {COLS.map((c) => (
          <div className="mf-col" key={c.h}>
            <h5>{c.h}</h5>
            {c.links.map((l) => (
              <Link key={l.t} href={l.href}>
                {l.t}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="mf-bottom">
        <span>© 2026 Filament</span>
        <span style={{ marginLeft: "auto" }}>An empty result is an honest result.</span>
      </div>
    </footer>
  );
}
