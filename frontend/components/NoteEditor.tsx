"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import TagInput from "@/components/TagInput";

// Write editor — design system §4.1 / §6.3.
// A clean, standard note layout inside the workspace: a generous title, a
// hashtags/tags row, then a roomy BlockNote canvas with comfortable spacing.
// Headings in BlockNote give the "sections". Save is the NEUTRAL primary button
// (blue stays reserved for AI/connection moments, §3 Button).
//
// Markdown paste auto-detect: when pasted clipboard text looks like Markdown
// (from ChatGPT, etc.), it is parsed into formatted blocks (headings, lists,
// bold, code) instead of landing as one plain-text blob — handled in the
// `pasteHandler` below.
//
// BlockNote is browser-only (ProseMirror + DOM); this component is mounted via
// next/dynamic with ssr:false from app/new/page.tsx so it never renders on the
// server.

// Heuristic: does this clipboard text look like Markdown worth parsing as
// blocks? We look for the common markers (ATX headings, list bullets, fenced
// code, bold/italic, blockquotes, ordered lists, links). Conservative — a plain
// sentence with no markers falls through to the default handler.
function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false;
  const patterns = [
    /^#{1,6}\s+\S/m, // # heading
    /^\s*[-*+]\s+\S/m, // - bullet list
    /^\s*\d+\.\s+\S/m, // 1. ordered list
    /^\s*>\s+\S/m, // > blockquote
    /```/, // fenced code
    /`[^`]+`/, // inline code
    /\*\*[^*]+\*\*/, // **bold**
    /\[[^\]]+\]\([^)]+\)/, // [link](url)
    /^\s*---\s*$/m, // horizontal rule
  ];
  return patterns.some((re) => re.test(text));
}

export default function NoteEditor() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether the editor has any text, so Save is guarded against an
  // empty submit (a note with neither title nor body is meaningless).
  const [hasBody, setHasBody] = useState(false);

  const editor = useCreateBlockNote({
    // Auto-detect pasted Markdown and render it as formatted blocks (Notion-like)
    // rather than a plain-text blob. We let BlockNote's own paste pipeline do the
    // parsing — we only nudge it to prioritize the Markdown in text/plain when
    // the pasted text clearly contains Markdown markers (clipboards often carry
    // a text/html copy that would otherwise win and lose the structure).
    pasteHandler: ({ event, defaultPasteHandler }) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (looksLikeMarkdown(text)) {
        return defaultPasteHandler({
          prioritizeMarkdownOverHTML: true,
          plainTextAsMarkdown: true,
        });
      }
      return defaultPasteHandler();
    },
  });

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
        // Matches NoteCreate { title, body, source, tags } from lib/api-types.ts.
        body: JSON.stringify({
          title: title.trim() || "Untitled",
          body,
          source: "authored",
          tags,
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
    <div className="mx-auto w-full max-w-[760px] px-5 py-10 sm:px-8 sm:py-12">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        aria-label="Note title"
        className="w-full bg-transparent text-display text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />

      {/* Hashtags / tags — chips below the title. Type a tag + Enter to add,
          Backspace on an empty input removes the last chip. Saved as `tags`. */}
      <div className="mt-4">
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div className="kg-editor mt-6 border-t border-border pt-6">
        {/* theme=light keeps the editor on the flat neutral surface (§4.1).
            .kg-editor flattens the mantine container chrome (no bordered box) and
            gives the body a generous, readable measure. */}
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={() => setHasBody(editorHasText())}
        />
      </div>

      <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex min-h-[44px] items-center justify-center rounded-sm bg-btn-solid-bg px-4 py-2 text-ui text-btn-solid-text transition-opacity duration-[120ms] ease-confirm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {/* When Save is disabled (no title and no body), explain why — a disabled
            control with no reason is a dead affordance (forms-feedback). Hidden
            once the note can be saved. */}
        {!canSave && !saving && (
          <span className="text-meta text-text-secondary">
            Add a title or some text to save.
          </span>
        )}
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
