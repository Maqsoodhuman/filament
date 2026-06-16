import Link from "next/link";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";

// Marketing HOME — the public landing page at `/` (NOT the AppShell). The app
// Timeline now lives at /timeline. Calm, Capacities-style: a warm hero, a short
// "what it does" section, three feature blocks (the connection engine, Organize,
// Graph), and a footer. The primary CTA opens the app at /timeline.
//
// Blue stays reserved for connection moments, so CTAs are the neutral solid
// button; the lone blue accents here are the small connection-kind glyphs in the
// engine feature block, consistent with the product's one-accent rule.

function FeatureIcon({
  name,
}: {
  name: "engine" | "organize" | "graph";
}) {
  const common = {
    viewBox: "0 0 24 24",
    width: 22,
    height: 22,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "engine") {
    // arrows-transfer — the structural connection mark
    return (
      <svg {...common}>
        <path d="M17 3v10" />
        <path d="M14 6l3 -3l3 3" />
        <path d="M7 21v-10" />
        <path d="M4 14l3 -3l3 3" />
      </svg>
    );
  }
  if (name === "organize") {
    return (
      <svg {...common}>
        <path d="M4 4h6v6h-6z" />
        <path d="M14 4h6v6h-6z" />
        <path d="M4 14h6v6h-6z" />
        <path d="M14 14h6v6h-6z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.5 7.6l-3 7.4" />
      <path d="M13.5 7.6l3 7.4" />
    </svg>
  );
}

const FEATURES = [
  {
    name: "engine" as const,
    title: "The connection engine",
    body: "It reads the structure beneath your notes and surfaces genuinely non-obvious, true links between ideas that sit far apart in subject matter — the kind topic search can never find.",
  },
  {
    name: "organize" as const,
    title: "Organize",
    body: "Your library clusters itself into themed sections automatically. Nothing moves — it's a computed view on top of a stable timeline you always trust.",
  },
  {
    name: "graph" as const,
    title: "Graph",
    body: "See the local neighborhood around any note: a calm, readable map of what it connects to, typed by kind, with structural links called out.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-app">
      <MarketingHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1080px] px-5 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
          <div className="max-w-[760px]">
            <span className="inline-flex items-center gap-2 rounded-pill border border-accent-ai-border bg-accent-ai-tint px-3 py-1 text-meta text-accent-ai">
              Cross-source synthesis, not another notes app
            </span>
            <h1 className="mt-5 text-[44px] font-medium leading-[1.08] tracking-[-0.01em] text-text-primary sm:text-[56px]">
              A home for everything you think, learn, and connect.
            </h1>
            <p className="mt-6 max-w-[620px] text-[18px] leading-[1.6] text-text-secondary">
              Bring in everything you read. Knowledge graph quietly finds the
              non-obvious, true connections across your library — links between
              ideas that live in completely different worlds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/timeline"
                className="inline-flex min-h-[48px] items-center rounded-sm bg-btn-solid-bg px-6 text-ui font-medium text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90"
              >
                Get started
              </Link>
              <Link
                href="/product"
                className="inline-flex min-h-[48px] items-center rounded-sm border border-border bg-bg-card px-6 text-ui text-text-primary transition-colors duration-[120ms] ease-confirm hover:bg-bg-active"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section className="border-y border-border bg-bg-card">
          <div className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="max-w-[680px] text-h1 text-text-primary">
              Most tools help you store what you read. This one helps you see
              what it means together.
            </h2>
            <p className="mt-4 max-w-[680px] text-body text-text-secondary">
              Write your own notes or import your existing reading library. When
              you ask it to, the engine scans across everything and surfaces only
              the connections that are both true and genuinely non-obvious —
              nothing forced, nothing generic. An empty result is an honest
              result.
            </p>
          </div>
        </section>

        {/* Feature blocks */}
        <section className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.name}
                className="rounded-card border border-border bg-bg-card p-6"
              >
                <span className="grid h-11 w-11 place-items-center rounded-md bg-bg-active text-text-primary">
                  <FeatureIcon name={f.name} />
                </span>
                <h3 className="mt-4 text-h2 text-text-primary">{f.title}</h3>
                <p className="mt-2 text-ui leading-[1.6] text-text-secondary">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-[1080px] flex-col items-start gap-5 px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="max-w-[620px] text-h1 text-text-primary">
              Start with what you already have.
            </h2>
            <p className="max-w-[560px] text-body text-text-secondary">
              Open the app, bring in your library, and let it find the first
              connection you didn&apos;t ask for.
            </p>
            <Link
              href="/timeline"
              className="inline-flex min-h-[48px] items-center rounded-sm bg-btn-solid-bg px-6 text-ui font-medium text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90"
            >
              Open app
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
