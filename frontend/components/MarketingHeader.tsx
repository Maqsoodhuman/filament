import Link from "next/link";

// MarketingHeader — the simple header for the public pages (/, /product). NOT
// the AppShell: marketing pages stand on their own. Logo + Product link + the
// primary "Open app" CTA into /timeline. Calm, on the warm palette; blue stays
// reserved for connections, so the CTA is the neutral solid button (§3 Button).
export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-app/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="Knowledge graph — home"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-ai text-[13px] font-medium text-white">
            K
          </span>
          <span className="text-ui font-medium text-text-primary">
            Knowledge graph
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/product"
            className="rounded-sm px-3 py-2 text-ui text-text-secondary transition-colors duration-[120ms] ease-confirm hover:text-text-primary"
          >
            Product
          </Link>
          <Link
            href="/timeline"
            className="inline-flex min-h-[40px] items-center rounded-sm bg-btn-solid-bg px-4 text-ui font-medium text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90"
          >
            Open app
          </Link>
        </nav>
      </div>
    </header>
  );
}
