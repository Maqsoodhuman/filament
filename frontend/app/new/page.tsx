"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";

// BlockNote is browser-only — load the editor with ssr:false so Next never
// tries to render ProseMirror on the server (App Router SSR gotcha). The page
// is a client component because next/dynamic({ ssr: false }) is client-only.
const NoteEditor = dynamic(() => import("@/components/NoteEditor"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[760px] px-5 py-10 sm:px-8 sm:py-12">
      <div className="h-9 w-1/2 animate-pulse rounded-sm bg-surface-hover" />
      <div className="mt-6 h-4 w-full animate-pulse rounded-sm bg-surface-hover" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-sm bg-surface-hover" />
    </div>
  ),
});

// Write editor surface (the original vision's "write your own notes").
// An authored note enters the same normalize → enqueue → engine path as an
// import, so this never forks the engine. A standard note layout — title, tags,
// generous editor body — lives inside the full-width workspace; the editor
// itself owns its reading column.
export default function NewNotePage() {
  return (
    <AppShell title="New note">
      <NoteEditor />
    </AppShell>
  );
}
