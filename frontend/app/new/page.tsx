"use client";

import dynamic from "next/dynamic";
import TopNav from "@/components/TopNav";

// BlockNote is browser-only — load the editor with ssr:false so Next never
// tries to render ProseMirror on the server (App Router SSR gotcha). The page
// is a client component because next/dynamic({ ssr: false }) is client-only.
const NoteEditor = dynamic(() => import("@/components/NoteEditor"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-measure px-6 py-12">
      <p className="text-meta text-text-tertiary">Loading editor…</p>
    </div>
  ),
});

// Write editor surface (the original vision's "write your own notes").
// An authored note enters the same normalize → enqueue → engine path as an
// import, so this never forks the engine.
export default function NewNotePage() {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <TopNav active="Timeline" />
      <main>
        {/* Surface header renders immediately (not behind the ssr:false editor
            boundary) so the page describes itself before the editor hydrates. */}
        <div className="mx-auto max-w-measure px-6 pt-12">
          <p className="text-meta text-text-secondary">
            Write a note — title and body. It enters the same pipeline as an
            import.
          </p>
        </div>
        <NoteEditor />
      </main>
    </div>
  );
}
