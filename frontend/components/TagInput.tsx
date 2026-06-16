"use client";

import { useState } from "react";

// TagInput — hashtag/tags chips for the note editor. Type a tag and press Enter
// (or comma) to add it; Backspace on an empty field removes the last chip; each
// chip has its own remove control. Neutral tag pills (§ token --tag) — tags are
// NOT connections, so no blue. The committed list is lifted to the parent and
// sent as `tags` on save.

function normalize(raw: string): string {
  // Drop a leading "#", trim, collapse internal whitespace, lowercase. Keeps the
  // stored tag clean whether the user types "#Systems" or "systems".
  return raw
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export default function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const t = normalize(raw);
    if (!t) return;
    if (tags.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...tags, t]);
    setDraft("");
  }

  function removeAt(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," ) {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft.length === 0 && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-pill bg-tag-bg py-[3px] pl-2 pr-1 text-meta text-tag-text"
        >
          <span>#{tag}</span>
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remove tag ${tag}`}
            className="grid h-4 w-4 place-items-center rounded-pill text-tag-text transition-colors duration-[120ms] ease-confirm hover:bg-text-tertiary/20 hover:text-text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(draft)}
        placeholder={tags.length === 0 ? "Add a tag…" : "Add another…"}
        aria-label="Add a tag"
        className="min-w-[120px] flex-1 bg-transparent py-1 text-ui text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
    </div>
  );
}
