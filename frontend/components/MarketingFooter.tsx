import Link from "next/link";

// MarketingFooter — quiet closing footer for the public pages. Neutral, hairline
// top border, on the warm palette. No second accent.
export default function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-ai text-[11px] font-medium text-white">
            K
          </span>
          <span className="text-meta text-text-secondary">
            Knowledge graph — a cross-source synthesis instrument.
          </span>
        </div>
        <nav className="flex items-center gap-5 sm:ml-auto">
          <Link
            href="/product"
            className="text-meta text-text-secondary transition-colors duration-[120ms] ease-confirm hover:text-text-primary"
          >
            Product
          </Link>
          <Link
            href="/timeline"
            className="text-meta text-text-secondary transition-colors duration-[120ms] ease-confirm hover:text-text-primary"
          >
            Open app
          </Link>
        </nav>
      </div>
    </footer>
  );
}
