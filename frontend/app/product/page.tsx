import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

// Product page (/product) — describes the synthesis engine and the three
// surfaces, in Filament's hand. Public page; Topbar renders its marketing
// variant (no tabs, "Open app" CTA).

const STEPS = [
  { n: "01", title: "Bring in your library", body: "Import what you already read, or write your own notes. An authored note is just another source — it enters the exact same pipeline as an import." },
  { n: "02", title: "Ask it to find connections", body: "The engine runs on an explicit trigger, never automatically. It reads the structure beneath each note, not just its words." },
  { n: "03", title: "See only what's worth seeing", body: "A separate verifier scores every candidate for truth and non-obviousness. Only links that clear a hard bar surface — the amber threads. The rest stays silent." },
];

const SURFACES = [
  { title: "Notes", body: "Write in a block editor, with the engine's KIND-typed connections to each note in a panel beside it — the why, and a q-score." },
  { title: "Organized", body: "Auto-clustered notebooks over the whole library. Open any note to read it in place, with its connections grouped by kind beside it." },
  { title: "Knowledge graph", body: "A dark constellation of your notes. Structural links glow amber; topical links stay faint. Focus any note's neighbourhood to avoid the hairball." },
];

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-paper">
      <MarketingNav />

      <div className="hero" style={{ display: "block", paddingBottom: 20 }}>
        <span className="eyebrow">The product</span>
        <h1 style={{ maxWidth: "16ch" }}>
          A synthesis instrument for the threads you&apos;d never <em>spot</em> yourself.
        </h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          Topical similarity finds notes about the same thing — the easy half. The hard,
          valuable half is finding two notes that share a deep structure while living in
          completely different subjects. That&apos;s the whole point.
        </p>
      </div>

      <div className="home-band">
        <div className="inner">
          <div className="sec-head" style={{ margin: "0 0 22px" }}>How the engine works</div>
          <div className="features">
            {STEPS.map((s) => (
              <div className="fcard" key={s.n}>
                <span className="step">{s.n}</span>
                <h3 style={{ marginTop: 4 }}>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="sec-head">Three surfaces, one library</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SURFACES.map((s) => (
            <article
              key={s.title}
              className="fcard"
              style={{ display: "flex", gap: 28, alignItems: "flex-start" }}
            >
              <h3 style={{ width: 200, flexShrink: 0, margin: 0 }}>{s.title}</h3>
              <p style={{ margin: 0 }}>{s.body}</p>
            </article>
          ))}
        </div>
        <div style={{ marginTop: 40 }}>
          <Link href="/notes" className="cta">
            Open app <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
