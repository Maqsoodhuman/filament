"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";

// BlockNote is browser-only — load the editor with ssr:false so Next never
// tries to render ProseMirror on the server (App Router SSR gotcha). The page
// is a client component because next/dynamic({ ssr: false }) is client-only.
const NoteEditor = dynamic(() => import("@/components/NoteEditor"), {
  ssr: false,
  loading: () => (
    <div className="px-6 py-12">
      <p className="text-meta text-text-tertiary">Loading editor…</p>
    </div>
  ),
});

// Write editor surface (the original vision's "write your own notes").
// An authored note enters the same normalize → enqueue → engine path as an
// import, so this never forks the engine.
export default function NewNotePage() {
  return (
    <AppShell title="New note">
      {/* The editor body is long prose, so it uses an internal ~720px reading
          column inside the full-width workspace. */}
      <div className="px-4 pt-8 sm:px-8">
        {/* Surface header renders immediately (not behind the ssr:false editor
            boundary) so the page describes itself before the editor hydrates. */}
        <div className="mx-auto max-w-[720px]">
          <p className="text-meta text-text-secondary">
            Write a note — title and body. It enters the same pipeline as an
            import.
          </p>
        </div>
      </div>
      <NoteEditor />
    </AppShell>
  );
}
