import Link from "next/link";
import {
  PenLine, Notebook, Share2, Sparkles, ArrowRight, Layers, Filter,
  ShieldCheck, Gauge, Check, Plus, BookOpen, BookMarked, FileText, Hash, Brain,
} from "lucide-react";
import MarketingNav from "@/components/MarketingNav";
import HeroField from "@/components/HeroField";
import MarketingFooter from "@/components/MarketingFooter";

// Marketing HOME — a detailed, Capacities-class landing page in Filament's hand
// (docs/COHESIVE_DESIGN.md). Hero → band → surfaces → the engine pipeline (the
// moat) → connection KINDs → ingestion → the honest-empty principle → editions
// (open core) → FAQ → footer. Amber is the colour law: a structural connection.

const FEATURES = [
  { icon: Share2, color: "#F2A93B", step: "01", t: "Find the non-obvious thread", d: "The engine reads the structure beneath your notes and surfaces genuinely non-obvious, true links between ideas that sit far apart in subject matter — the amber thread topic search can never find." },
  { icon: Notebook, color: "#5B6CF0", step: "02", t: "Organize without filing", d: "Your library clusters itself into themed notebooks — real generated section names, live counts, multi-section membership. Nothing moves; it's a computed view over a timeline you always trust." },
  { icon: PenLine, color: "#1FA89A", step: "03", t: "Write like it's a page", d: "A block editor with slash commands, callouts, to-dos and a floating format bar. Every note you write enters the same engine as everything you import." },
];

const PIPELINE = [
  { icon: Layers, n: "01", t: "Extract structure", d: "A fast model pulls the structural facets from each note — its mechanisms and dynamics, not its surface words. Extracted once per source, cached forever." },
  { icon: Sparkles, n: "02", t: "Embed the abstraction", d: "We embed that abstraction, not the text — which is what places two topically-distant notes near each other in the first place." },
  { icon: Filter, n: "03", t: "Retrieve, then reject", d: "Pull candidate pairs from across the library, then invert topical similarity: anything too close in subject is dropped, and generic skeletons suppressed." },
  { icon: Brain, n: "04", t: "Reason the link", d: "A reasoning model works out how the two ideas actually connect and states the one-line why — the sentence you read on the card." },
  { icon: ShieldCheck, n: "05", t: "Verify, decorrelated", d: "A separate verifier — which never sees the reasoner's argument — independently scores the link for truth and for non-obviousness." },
  { icon: Gauge, n: "06", t: "Surface only q ≥ 3", d: "q = min(validity, non-obviousness). Only links that clear the bar reach you; everything else stays silent.", gate: "q ≥ 3" },
];

const KINDS = [
  { cls: "mech", line: "#F2A93B", t: "same mechanism", q: "up to q5", d: "Two ideas running on the same underlying mechanism in different domains. This is the moat — the link a human wouldn't have made.", eg: "Central bank credibility ↔ bacterial quorum sensing" },
  { cls: "", line: "#5B6CF0", t: "same dynamic", q: "q3–q4", d: "The same recurring pattern of change or force, dressed in different subject matter. Structural-ish, still worth surfacing.", eg: "Credibility before intervention ↔ fairness before knowing your stake" },
  { cls: "", line: "#5A6B8C", t: "same topic", q: "rarely shown", d: "Same subject — the commodity similarity any search already finds. Quiet by design; almost never surfaced.", eg: "Spaced repetition ↔ vision-language models" },
];

const SOURCES = [
  { icon: BookOpen, color: "#E0A33B", t: "Readwise" },
  { icon: BookMarked, color: "#1FA89A", t: "Kindle highlights" },
  { icon: FileText, color: "#7C6CF0", t: "Notion" },
  { icon: Hash, color: "#5B6CF0", t: "Markdown / .txt" },
  { icon: PenLine, color: "#E8705B", t: "Your own notes" },
];

const EDITIONS = [
  {
    premium: false, tag: "Open source", name: "Community", price: "$0", unit: "/ forever",
    desc: "Self-host and bring your own Ollama models. The full instrument, on-demand.",
    feats: ["Self-hosted, your data never leaves", "Bring your own local (Ollama) models", "On-demand Find connections & Scan", "Full editor, Organize & Graph", "MIT-licensed engine"],
    cta: "Get the source", ctaHref: "/#pricing", ghost: true,
  },
  {
    premium: true, tag: "Hosted", name: "Premium", price: "Coming soon", unit: "",
    desc: "Managed Claude models, zero setup — plus the engine working in the background for you.",
    feats: ["Everything in Community", "Managed Claude models (Haiku · Sonnet)", "Background library scanning", "Weekly digest of new intersections", "Priority ingestion at scale"],
    cta: "Join the waitlist", ctaHref: "/onboarding", ghost: false,
  },
];

const FAQ = [
  { q: "Is this a notes app?", a: "No. It's a cross-source synthesis instrument. You can write and import notes, but the point isn't storage — it's surfacing the genuinely non-obvious, true connections across everything you've read, the ones topical search can never find." },
  { q: "Does it run automatically on every note?", a: "No. The engine runs on an explicit trigger — Find connections on a note, or Scan library. Premium adds optional background scanning, but nothing happens on every keystroke." },
  { q: "What if it finds nothing?", a: "Then it says so. An empty result is an honest result — we never fabricate a connection to fill the screen. Every surfaced thread cleared a hard, decorrelated bar." },
  { q: "Where does my data live?", a: "On the Community edition you self-host, so nothing leaves your machine. On Premium it's hosted, and connections are always computed strictly within your own library." },
  { q: "Which models does it use?", a: "Haiku for extraction, Sonnet for reasoning and the independent verifier, and Voyage for embeddings — or your own local Ollama models on the Community edition." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper">
      <MarketingNav />

      {/* hero — the floating chips are graph nodes; amber filaments travel
          between them and glow in / out as each thread connects */}
      <div className="hero-bg">
        <div className="hero-stage hero-field-stage">
          <HeroField />
          <section className="hero2">
            <span className="eyebrow">
              <Sparkles size={13} /> Cross-source synthesis, not another notes app
            </span>
            <h1>
              Your notes already hold a <em>thread</em>. Filament lights it up.
            </h1>
            <p className="lede">
              Bring in everything you read. The engine finds the true, non-obvious
              connections across your whole library — and an empty result is an
              honest result.
            </p>
            <div className="hero-actions">
              <Link href="/notes" className="cta">
                Open app <ArrowRight size={16} />
              </Link>
              <Link href="/onboarding" className="cta ghost">
                Import your library
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* band */}
      <div className="home-band">
        <div className="inner two">
          <div>
            <h2>Most tools store what you read. This one shows you what it means together.</h2>
            <p>
              When you ask it to, the engine scans across everything and surfaces
              only connections that are both true and genuinely non-obvious —
              nothing forced, nothing generic. The strongest links are structural:
              two ideas from different worlds running on the same mechanism. Those
              glow amber.
            </p>
          </div>
          <article className="thread-card">
            <span className="tc-kicker">
              <Sparkles size={13} /> A structural thread
            </span>
            <p className="tc-why">
              Both stay dormant until a believed threshold is crossed, then commit
              collectively — the trigger is the shared expectation, not the
              underlying resource.
            </p>
            <div className="tc-pair">
              <span>💰 <b>Central bank credibility</b></span>
              <ArrowRight size={14} style={{ color: "var(--text-faint)" }} />
              <span>🦠 <b>Bacterial quorum sensing</b></span>
              <span className="kind-chip mechanism" style={{ marginLeft: "auto" }}>same mechanism</span>
              <span className="q-weight">q<b>4</b></span>
            </div>
          </article>
        </div>
      </div>

      {/* surfaces */}
      <div className="section" id="surfaces">
        <div className="sec-head">Three views, one note</div>
        <div className="features">
          {FEATURES.map((f) => {
            const Ic = f.icon;
            return (
              <div className="fcard" key={f.t}>
                <span className="step">{f.step}</span>
                <div className="ic" style={{ background: f.color }}>
                  <Ic size={20} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* how the engine works — the moat */}
      <div className="home-band">
        <div className="msection" id="how-it-works" style={{ padding: "76px 24px" }}>
          <div className="m-head-center">
            <span className="m-eyebrow">How the engine works</span>
            <h2 className="m-title center">Six stages tuned to find the link a human wouldn&apos;t.</h2>
            <p className="m-sub center">
              Not embeddings over note text. Not topical similarity. A deliberate
              pipeline that embeds the <em>abstraction</em>, rejects the obvious,
              and verifies twice before anything reaches you.
            </p>
          </div>
          <div className="pipeline">
            {PIPELINE.map((s) => {
              const Ic = s.icon;
              return (
                <div className="pipe-step" key={s.n}>
                  <span className="pn">{s.n}</span>
                  <div className="pic"><Ic size={19} /></div>
                  <h4>{s.t}</h4>
                  <p>{s.d}</p>
                  {s.gate && <span className="pgate">{s.gate}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* connection KINDs */}
      <div className="msection" id="kinds">
        <div className="m-head-center">
          <span className="m-eyebrow">The colour law</span>
          <h2 className="m-title center">Every connection is typed by kind — and amber always wins.</h2>
          <p className="m-sub center">
            The engine labels each thread by how deep the resemblance runs. The
            structural ones glow; the commodity ones stay quiet.
          </p>
        </div>
        <div className="kinds">
          {KINDS.map((k) => (
            <div className={`kind-block ${k.cls}`} key={k.t}>
              <div className="kb-top">
                <span className="kb-line" style={{ background: k.line }} />
                <h4>{k.t}</h4>
                <span className="kb-q">{k.q}</span>
              </div>
              <p>{k.d}</p>
              <div className="kb-eg">{k.eg}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ingestion sources */}
      <div className="home-band">
        <div className="msection two-col" style={{ display: "grid", gridTemplateColumns: "1fr", padding: "64px 24px" }}>
          <div className="m-head-center" style={{ marginBottom: 8 }}>
            <span className="m-eyebrow">Bring in everything you read</span>
            <h2 className="m-title center">Start with the library you already have.</h2>
            <p className="m-sub center">
              Highlights, books, pages, plain files, and your own notes all enter
              the same pipeline. The same highlight in two apps is only ever
              extracted once.
            </p>
          </div>
          <div className="sources" style={{ justifyContent: "center" }}>
            {SOURCES.map((s) => {
              const Ic = s.icon;
              return (
                <span className="source-pill" key={s.t}>
                  <span className="sp-dot" style={{ background: s.color }}><Ic size={13} /></span>
                  {s.t}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* the principle */}
      <div className="principle" id="principle">
        <div className="inner">
          <p className="p-quote">
            An empty result is an <em>honest</em> result.
          </p>
          <p className="p-sub">
            We never force a connection to fill the screen. Every thread you see
            cleared a hard bar — q ≥ 3, scored by a verifier that never saw the
            reasoner&apos;s argument, with generic &ldquo;horoscope&rdquo; links
            suppressed before any model ran. Trust is the product.
          </p>
        </div>
      </div>

      {/* editions / pricing */}
      <div className="msection" id="pricing">
        <div className="m-head-center">
          <span className="m-eyebrow">Open core</span>
          <h2 className="m-title center">Two editions, one engine.</h2>
          <p className="m-sub center">
            The same connection engine runs in both. Self-host it free, or let us
            run the managed models and scan in the background.
          </p>
        </div>
        <div className="editions">
          {EDITIONS.map((e) => (
            <div className={`edition ${e.premium ? "premium" : ""}`} key={e.name}>
              <span className="ed-tag">{e.tag}</span>
              <h3>{e.name}</h3>
              <div className="ed-price">
                {e.price} {e.unit && <small>{e.unit}</small>}
              </div>
              <p className="ed-desc">{e.desc}</p>
              <ul className="ed-feats">
                {e.feats.map((f) => (
                  <li key={f}><Check size={16} /> {f}</li>
                ))}
              </ul>
              <Link href={e.ctaHref} className={`cta ${e.ghost ? "ghost" : ""} ed-cta`}>
                {e.cta} <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="home-band">
        <div className="msection" style={{ padding: "72px 24px" }}>
          <div className="m-head-center">
            <span className="m-eyebrow">Questions</span>
            <h2 className="m-title center">The honest answers.</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <Plus size={20} className="fq-plus" />
                </summary>
                <p className="fq-a">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* closing CTA */}
      <div className="msection" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 90 }}>
        <h2 className="m-title center" style={{ marginBottom: 10 }}>Open the app and find the first thread you didn&apos;t ask for.</h2>
        <div className="hero-actions" style={{ justifyContent: "center", marginTop: 24 }}>
          <Link href="/notes" className="cta">Open app <ArrowRight size={16} /></Link>
          <Link href="/onboarding" className="cta ghost">Import your library</Link>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
