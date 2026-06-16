"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { components } from "@/lib/api-types";

type NoteOut = components["schemas"]["NoteOut"];

// ⌘K command palette — design system §3 (CommandPalette) + §5.
// Single fuzzy entry point: create note, switch tab, jump to a note. Right-
// aligned mono shortcut hint per row (the palette teaches shortcuts). One of
// the two layers allowed the subtle shadow (§2 Border). Blue stays reserved —
// generic actions are neutral; only AI/connection verbs would carry blue (none
// of the actions here are AI verbs, so the palette is fully neutral).

type Action = {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
};

// Simple subsequence fuzzy match (chars appear in order, case-insensitive).
function fuzzy(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [notes, setNotes] = useState<NoteOut[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  // Open on ⌘K / Ctrl+K (and let the existing "⌘K" hint dispatch this event).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("kg:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kg:open-command-palette", onOpenEvent);
    };
  }, []);

  // Fetch the library once, lazily, the first time the palette opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (notes.length > 0) return;
    let cancelled = false;
    fetch("/api/notes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NoteOut[]) => {
        if (!cancelled && Array.isArray(data)) setNotes(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, notes.length]);

  const navActions: Action[] = useMemo(
    () => [
      { id: "new", label: "New note", shortcut: "c", run: () => go("/new") },
      {
        id: "timeline",
        label: "Go to Timeline",
        shortcut: "g t",
        run: () => go("/timeline"),
      },
      {
        id: "organize",
        label: "Go to Organize",
        shortcut: "g o",
        run: () => go("/organize"),
      },
      {
        id: "graph",
        label: "Go to Graph",
        shortcut: "g g",
        run: () => go("/graph"),
      },
    ],
    [go],
  );

  // Build the visible, filtered, ordered action list.
  const results: Action[] = useMemo(() => {
    const matchedNav = navActions.filter((a) => fuzzy(query, a.label));
    const noteActions: Action[] = notes
      .filter((n) => fuzzy(query, n.title || "Untitled"))
      .slice(0, 8)
      .map((n) => ({
        id: `note-${n.id}`,
        label: n.title || "Untitled",
        run: () => go(`/notes/${n.id}`),
      }));
    return [...matchedNav, ...noteActions];
  }, [navActions, notes, query, go]);

  // Keep the active index in range as the result set changes.
  useEffect(() => {
    setActive((a) => (a >= results.length ? 0 : a));
  }, [results.length]);

  if (!open) return null;

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[18vh]"
      onMouseDown={close}
      role="presentation"
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-md border border-hairline border-border-hairline bg-surface shadow-[0_1px_2px_rgba(0,0,0,.04)]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onListKey}
          placeholder="Search notes or run a command…"
          aria-label="Command palette search"
          className="w-full border-b border-hairline border-border-hairline bg-transparent px-4 py-3 text-ui text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        <ul className="max-h-[320px] overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-3 text-meta text-text-tertiary">
              No matches
            </li>
          )}
          {results.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => a.run()}
                className={
                  "flex w-full items-center justify-between px-4 py-2 text-left text-ui transition-colors duration-[120ms] ease-confirm " +
                  (i === active
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-primary")
                }
              >
                <span>{a.label}</span>
                {a.shortcut && (
                  <kbd className="font-mono text-[13px] leading-none text-text-tertiary">
                    {a.shortcut}
                  </kbd>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
