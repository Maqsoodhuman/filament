import Link from "next/link";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";

// Product page (/product) — describes the synthesis engine and the three
// surfaces (Timeline, Organize, Graph), with a CTA into the app. Public page,
// NOT the AppShell. Calm and on the warm palette; blue stays reserved.

const STEPS = [
  {
    n: "1",
    title: "Bring in your library",
    body: "Import what you already read, or write your own notes. An authored note is just another source — it enters the exact same pipeline as an import.",
  },
  {
    n: "2",
    title: "Ask it to find connections",
    body: "The engine runs on an explicit trigger, never automatically. It reads the structure beneath each note, not just its words.",
  },
  {
    n: "3",
    title: "See only what's worth seeing",
    body: "A separate verifier scores every candidate for truth and non-obviousness. Only links that clear a hard bar surface. The rest stays silent.",
  },
];

const SURFACES = [
  {
    title: "Timeline",
    body: "Your library, newest first — a stable home that never reorganizes itself. Each note carries a live count of the connections found into it.",
  },
  {
    title: "Organize",
    body: "Auto-clustered sections over the whole library. Open any note to read it in place, with its connections grouped by kind beside it.",
  },
  {
    title: "Graph",
    body: "A local, deterministic neighborhood view centered on one note. Structural links are called out; topical links stay quiet. No hairball.",
  },
];

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-bg-app">
      <MarketingHeader />

      <main>
        {/* Intro */}
        <section className="mx-auto max-w-[1080px] px-5 pb-12 pt-20 sm:px-8 sm:pt-24">
          <div className="max-w-[760px]">
            <span className="text-meta uppercase tracking-wide text-text-secondary">
              The product
            </span>
            <h1 className="mt-3 text-[40px] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary sm:text-[48px]">
              A synthesis instrument for the connections you&apos;d never spot
              yourself.
            </h1>
            <p className="mt-5 max-w-[640px] text-[18px] leading-[1.6] text-text-secondary">
              Topical similarity finds notes that are about the same thing.
              That&apos;s the easy half. The hard, valuable half is finding two
              notes that share a deep structure while living in completely
              different subjects — and that&apos;s the whole point of this tool.
            </p>
          </div>
        </section>

        {/* How the engine works */}
        <section className="border-y border-border bg-bg-card">
          <div className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="text-h1 text-text-primary">
              How the synthesis engine works
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              {STEPS.map((s) => (
                <article
                  key={s.n}
                  className="rounded-card border border-border bg-bg-app p-6"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-pill bg-bg-active text-ui font-medium text-text-primary">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-h2 text-text-primary">{s.title}</h3>
                  <p className="mt-2 text-ui leading-[1.6] text-text-secondary">
                    {s.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* The three surfaces */}
        <section className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-h1 text-text-primary">Three surfaces, one library</h2>
          <p className="mt-3 max-w-[640px] text-body text-text-secondary">
            Notes never physically move. Everything you see is a computed view on
            top of a single, stable home.
          </p>
          <div className="mt-8 flex flex-col gap-4">
            {SURFACES.map((s) => (
              <article
                key={s.title}
                className="flex flex-col gap-2 rounded-card border border-border bg-bg-card p-6 sm:flex-row sm:items-start sm:gap-8"
              >
                <h3 className="text-h2 text-text-primary sm:w-[160px] sm:shrink-0">
                  {s.title}
                </h3>
                <p className="text-ui leading-[1.6] text-text-secondary">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-[1080px] flex-col items-start gap-5 px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="max-w-[620px] text-h1 text-text-primary">
              Try it on your own reading.
            </h2>
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
