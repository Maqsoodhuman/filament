"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// Write editor — design system §4.1 / §6.3.
// Centered 680px BlockNote canvas (tables, images, callouts, headings, lists),
// a title input above it, and a NEUTRAL Save button. Blue stays reserved for
// AI/connection moments, so Save is the neutral primary button (§3 Button).
//
// BlockNote is browser-only (ProseMirror + DOM); this component is mounted via
// next/dynamic with ssr:false from app/new/page.tsx so it never renders on the
// server.
export default function NoteEditor() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useCreateBlockNote();

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);

    // Serialize the rich doc to markdown so it enters the same
    // normalize → enqueue → engine path as an import (authored note is just
    // another ingestion source). body is plain markdown text.
    let body = "";
    try {
      body = await editor.blocksToMarkdownLossy(editor.document);
    } catch {
      body = "";
    }

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Matches NoteCreate { title, body, source } from lib/api-types.ts.
        body: JSON.stringify({
          title: title.trim() || "Untitled",
          body,
          source: "authored",
        }),
      });
      if (!res.ok) {
        throw new Error(`save failed (${res.status})`);
      }
      const note = (await res.json()) as { id: string };
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-measure px-6 py-12">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        aria-label="Note title"
        className="w-full bg-transparent text-display text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />

      <div className="mt-6 -mx-2">
        {/* theme=light keeps the editor on the flat neutral surface (§4.1). */}
        <BlockNoteView editor={editor} theme="light" />
      </div>

      <div className="mt-8 flex items-center gap-3 border-t border-hairline border-border-hairline pt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-text-primary px-4 py-2 text-ui text-surface transition-opacity duration-[120ms] ease-confirm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {error && (
          <span className="text-meta text-text-secondary">{error}</span>
        )}
      </div>
    </div>
  );
}
