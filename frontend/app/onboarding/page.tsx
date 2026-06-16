"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, BookMarked, FileText, Upload, ArrowRight } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ThreadCard from "@/components/ThreadCard";
import { useStore, topThreads } from "@/lib/store";

// Onboarding / import → first-insight (docs/COHESIVE_DESIGN.md §3 Onboarding) —
// in Filament's aesthetic: a warm centred card, import sources, a calm progress
// beat, then the first intersection lights up (an amber ThreadCard) before the
// import "finishes." Honest-empty preserved: if nothing genuine surfaces, we say
// so. No app chrome.

type Phase = "idle" | "scanning" | "done" | "empty";

const STAGES = [
  "Reading your library…",
  "Extracting the structure beneath each note…",
  "Looking for threads across distant ideas…",
] as const;

const SOURCES = [
  { key: "readwise", label: "Readwise", desc: "Highlights & articles", icon: BookOpen, color: "#E0A33B" },
  { key: "kindle", label: "Kindle", desc: "Book highlights", icon: BookMarked, color: "#1FA89A" },
  { key: "notion", label: "Notion", desc: "Pages & databases", icon: FileText, color: "#7C6CF0" },
  { key: "upload", label: "Upload files", desc: ".md / .txt", icon: Upload, color: "#E8705B" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { connections, noteById } = useStore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);

  async function runImport() {
    setPhase("scanning");
    setStage(0);
    // The calm progress beat. Task #7's API wiring fires POST /scan here and
    // polls the job; the staged prose mirrors the real pipeline order.
    for (let i = 1; i < STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, 850));
      setStage(i);
    }
    await new Promise((r) => setTimeout(r, 850));
    // We NEVER fabricate a thread: an empty top-list becomes an honest empty.
    setPhase(topThreads(connections, 1).length > 0 ? "done" : "empty");
  }

  const first = topThreads(connections, 1)[0];

  return (
    <div className="onboard-wrap">
      <div className="onboard-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <BrandMark />
          <span style={{ fontSize: 16 }}>Filament</span>
        </div>

        {phase === "idle" || phase === "scanning" ? (
          <>
            <h1>Bring in your library</h1>
            <p className="lede">
              Import what you already read. The engine quietly looks for the
              non-obvious threads across it — the kind topic search can&apos;t find.
            </p>

            <div className="source-grid">
              {SOURCES.map((s) => {
                const Ic = s.icon;
                return (
                  <button
                    key={s.key}
                    className="source-btn"
                    onClick={runImport}
                    disabled={phase === "scanning"}
                  >
                    <span className="si" style={{ background: s.color }}>
                      <Ic size={18} />
                    </span>
                    <span>
                      <div className="st">{s.label}</div>
                      <div className="sd">{s.desc}</div>
                    </span>
                  </button>
                );
              })}
            </div>

            {phase === "scanning" ? (
              <div style={{ marginTop: 26 }} role="status" aria-live="polite">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }} />
                </div>
                <p style={{ fontFamily: "var(--f-read)", fontSize: 16, color: "var(--text-soft)" }}>
                  {STAGES[stage]}
                </p>
              </div>
            ) : (
              <button className="cta" style={{ marginTop: 26 }} onClick={runImport}>
                Scan my library <ArrowRight size={15} />
              </button>
            )}
          </>
        ) : phase === "done" && first ? (
          <>
            <h1>We found a thread you didn&apos;t ask for</h1>
            <p className="lede">Before your import even finished, the engine lit one up.</p>
            <ThreadCard
              c={first}
              aEmoji={noteById(first.a_id)?.emoji}
              bEmoji={noteById(first.b_id)?.emoji}
              kicker="Your first intersection"
            />
            <button className="cta" style={{ marginTop: 24 }} onClick={() => router.push(`/notes?id=${first.a_id}`)}>
              Open your library <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <>
            <h1>No threads yet — and that&apos;s honest</h1>
            <p className="lede">
              Nothing crossed the bar this time. An empty result is an honest result.
              Import more of your library, or scan again as it grows.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button className="cta" onClick={() => router.push("/notes")}>
                Open your library <ArrowRight size={15} />
              </button>
              <button className="cta ghost" onClick={runImport}>
                Scan again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
