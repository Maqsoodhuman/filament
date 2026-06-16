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
  // Track whether the editor has any text, so Save is guarded against an
  // empty submit (a note with neither title nor body is meaningless).
  const [hasBody, setHasBody] = useState(false);

  const editor = useCreateBlockNote();

  // Cheap content check: any block with non-whitespace inline text.
  function editorHasText(): boolean {
    try {
      return editor.document.some((block) => {
        const content = (block as { content?: unknown }).content;
        if (!Array.isArray(content)) return false;
        return content.some(
          (n) =>
            typeof (n as { text?: unknown }).text === "string" &&
            ((n as { text: string }).text.trim().length > 0),
        );
      });
    } catch {
      return false;
    }
  }

  const canSave = (title.trim().length > 0 || hasBody) && !saving;

  async function handleSave() {
    if (saving || !canSave) return;
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
        throw new Error("save failed");
      }
      const note = (await res.json()) as { id: string };
      router.push(`/notes/${note.id}`);
    } catch {
      // Human copy, never a raw status code (error-clarity).
      setError("We couldn't save this note. Check your connection and try again.");
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

      <div className="kg-editor mt-6 -mx-2">
        {/* theme=light keeps the editor on the flat neutral surface (§4.1).
            .kg-editor flattens the mantine container chrome (no bordered box). */}
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={() => setHasBody(editorHasText())}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-hairline border-border-hairline pt-6 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex min-h-[44px] items-center justify-center rounded-sm bg-text-primary px-4 py-2 text-ui text-surface transition-opacity duration-[120ms] ease-confirm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {error && (
          <span
            role="alert"
            aria-live="polite"
            className="text-meta text-text-secondary"
          >
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
