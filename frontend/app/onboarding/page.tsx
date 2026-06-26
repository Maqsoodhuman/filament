"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, BookMarked, FileText, Upload, ArrowRight } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ThreadCard from "@/components/ThreadCard";
import { useStore, topThreads } from "@/lib/store";
import { parseFiles } from "@/lib/import";

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
  const { connections, noteById, importNotes } = useStore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    fileRef.current?.click();
  }

  // Real file-drop import (goal A1): parse → importNotes (push library to the
  // engine + scan) → first insight. The staged prose animates over the real work.
  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    if (!files.length) return;
    setPhase("scanning");
    setStage(0);
    const t1 = setTimeout(() => setStage(1), 700);
    const t2 = setTimeout(() => setStage(2), 1500);
    const parsed = await parseFiles(files);
    const res = await importNotes(parsed);
    clearTimeout(t1);
    clearTimeout(t2);
    setImported(res.added);
    // We NEVER fabricate a thread: the engine's surfaced count decides done vs empty.
    setPhase(res.surfaced > 0 ? "done" : "empty");
  }

  // Sources without a real connector (Readwise/Notion OAuth) keep the demo beat.
  async function runImport() {
    setPhase("scanning");
    setStage(0);
    for (let i = 1; i < STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, 850));
      setStage(i);
    }
    await new Promise((r) => setTimeout(r, 850));
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

            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={onFilesPicked}
              style={{ display: "none" }}
            />

            <div className="source-grid">
              {SOURCES.map((s) => {
                const Ic = s.icon;
                return (
                  <button
                    key={s.key}
                    className="source-btn"
                    onClick={() => (s.key === "upload" || s.key === "kindle" ? openPicker() : runImport())}
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
            <p className="lede">
              {imported > 0 ? `Imported ${imported} note${imported === 1 ? "" : "s"}. ` : ""}
              Before your import even finished, the engine lit one up.
            </p>
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
