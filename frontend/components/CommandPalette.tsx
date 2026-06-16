"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Notebook, Share2, Sparkles, FileText, type LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";

// ⌘K command palette — single fuzzy entry point: switch surface, jump to a
// note, start the import. Styled in Filament's hand (paper popover, soft
// shadow). Reads notes from the client store, not the network.

type Action = {
  id: string;
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  run: () => void;
};

function fuzzy(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++;
  return i === q.length;
}

export default function CommandPalette() {
  const router = useRouter();
  const { notes, createNote } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
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

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const navActions: Action[] = useMemo(
    () => [
      { id: "new", label: "New note", shortcut: "c", icon: PenLine, run: () => { const n = createNote(); go(`/notes?id=${n.id}`); } },
      { id: "notes", label: "Go to Notes", shortcut: "g n", icon: PenLine, run: () => go("/notes") },
      { id: "organize", label: "Go to Organized", shortcut: "g o", icon: Notebook, run: () => go("/organize") },
      { id: "graph", label: "Go to Knowledge graph", shortcut: "g g", icon: Share2, run: () => go("/graph") },
      { id: "import", label: "Import a library", shortcut: "i", icon: Sparkles, run: () => go("/onboarding") },
    ],
    [go, createNote],
  );

  const results: Action[] = useMemo(() => {
    const matchedNav = navActions.filter((a) => fuzzy(query, a.label));
    const noteActions: Action[] = notes
      .filter((n) => fuzzy(query, n.title || "Untitled"))
      .slice(0, 8)
      .map((n) => ({
        id: `note-${n.id}`,
        label: n.title || "Untitled",
        icon: FileText,
        run: () => go(`/notes?id=${n.id}`),
      }));
    return [...matchedNav, ...noteActions];
  }, [navActions, notes, query, go]);

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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        background: "rgba(22,26,43,.28)",
        paddingTop: "16vh",
      }}
      onMouseDown={close}
      role="presentation"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          overflow: "hidden",
          borderRadius: 16,
          border: "1px solid var(--line)",
          background: "var(--paper-2)",
          boxShadow: "0 30px 60px -20px rgba(22,26,43,.45)",
        }}
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
          style={{
            width: "100%",
            border: "none",
            borderBottom: "1px solid var(--line)",
            background: "transparent",
            padding: "15px 18px",
            fontSize: 15,
            color: "var(--text)",
            outline: "none",
            fontFamily: "var(--f-ui)",
          }}
        />
        <ul style={{ maxHeight: 340, overflowY: "auto", padding: "6px", margin: 0, listStyle: "none" }}>
          {results.length === 0 && (
            <li style={{ padding: "12px 14px", fontSize: 13, color: "var(--text-faint)" }}>No matches</li>
          )}
          {results.map((a, i) => {
            const Ic = a.icon;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => a.run()}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 11,
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "none",
                    background: i === active ? "var(--line-2)" : "transparent",
                    color: "var(--text)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13.5,
                  }}
                >
                  {Ic && (
                    <span style={{ color: "var(--text-faint)", display: "grid", placeItems: "center" }}>
                      <Ic size={15} />
                    </span>
                  )}
                  <span style={{ flex: 1 }}>{a.label}</span>
                  {a.shortcut && (
                    <kbd style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-faint)" }}>
                      {a.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
