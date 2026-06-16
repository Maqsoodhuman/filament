"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Plus, Copy, Trash2, Type, Heading1, Heading2, Heading3, List, ListOrdered,
  CheckSquare, Quote, Code, Minus, Bold, Italic, Underline, Strikethrough,
  Link2, Highlighter, Hash, X, MessageSquareQuote, type LucideIcon,
} from "lucide-react";
import { COVERS, EMOJIS, blk, type Block, type BlockType, type Note } from "@/lib/store";

// Filament's block editor, ported to our store (docs/COHESIVE_DESIGN.md §3).
// Slash menu, headings, lists, to-dos, quote, callout, code, divider, cover,
// emoji, tag chips, a floating format toolbar — plus markdown-paste
// auto-detect. An authored note is just another ingestion source: its blocks
// serialise to markdown for the engine `body` (see lib/markdown via paste).

const SLASH: { type: BlockType; label: string; hint: string; icon: LucideIcon }[] = [
  { type: "paragraph", label: "Text", hint: "Plain paragraph", icon: Type },
  { type: "h1", label: "Heading 1", hint: "Big section title", icon: Heading1 },
  { type: "h2", label: "Heading 2", hint: "Medium heading", icon: Heading2 },
  { type: "h3", label: "Heading 3", hint: "Small heading", icon: Heading3 },
  { type: "bulleted", label: "Bulleted list", hint: "Simple bullets", icon: List },
  { type: "numbered", label: "Numbered list", hint: "Ordered items", icon: ListOrdered },
  { type: "todo", label: "To-do", hint: "Checkbox task", icon: CheckSquare },
  { type: "quote", label: "Quote", hint: "Capture a line", icon: Quote },
  { type: "callout", label: "Callout", hint: "Highlighted note", icon: MessageSquareQuote },
  { type: "code", label: "Code", hint: "Monospaced block", icon: Code },
  { type: "divider", label: "Divider", hint: "Visual break", icon: Minus },
];

const PLACEHOLDER: Record<string, string> = {
  paragraph: "Type '/' for commands, or just write…",
  h1: "Heading 1", h2: "Heading 2", h3: "Heading 3",
  bulleted: "List item", numbered: "List item", todo: "To-do",
  quote: "Quote", callout: "Callout", code: "Code",
};

function placeCaretEnd(el: HTMLElement | null) {
  if (!el) return;
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

// markdown → blocks (paste auto-detect). Deliberately small but covers the
// common cases; the inverse (blocks → markdown) is the engine `body` serialiser.
function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(blk("code", codeBuf.join("\n")));
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const t = line.trim();
    if (!t) continue;
    if (/^###\s+/.test(t)) out.push(blk("h3", t.replace(/^###\s+/, "")));
    else if (/^##\s+/.test(t)) out.push(blk("h2", t.replace(/^##\s+/, "")));
    else if (/^#\s+/.test(t)) out.push(blk("h1", t.replace(/^#\s+/, "")));
    else if (/^>\s+/.test(t)) out.push(blk("quote", t.replace(/^>\s+/, "")));
    else if (/^[-*]\s+\[[ xX]\]\s+/.test(t))
      out.push(blk("todo", t.replace(/^[-*]\s+\[[ xX]\]\s+/, ""), { checked: /\[[xX]\]/.test(t) }));
    else if (/^[-*+]\s+/.test(t)) out.push(blk("bulleted", t.replace(/^[-*+]\s+/, "")));
    else if (/^\d+\.\s+/.test(t)) out.push(blk("numbered", t.replace(/^\d+\.\s+/, "")));
    else out.push(blk("paragraph", t));
  }
  if (codeBuf.length) out.push(blk("code", codeBuf.join("\n")));
  return out;
}

function looksLikeMarkdown(s: string): boolean {
  return /\n/.test(s) && /(^|\n)\s*(#{1,3}\s|[-*+]\s|\d+\.\s|>\s|```)/.test(s);
}

// ---- single block ----------------------------------------------------------

type SlashState = { blockId: string; query: string; rect: DOMRect } | null;

function EditorBlock({
  block, listNumber, onUpdate, onEnter, onDeleteEmpty, onSlashState, registerRef, onToggleTodo, onPasteBlocks,
}: {
  block: Block;
  listNumber?: number;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onEnter: (id: string) => void;
  onDeleteEmpty: (id: string) => void;
  onSlashState: (s: SlashState) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onToggleTodo: (id: string) => void;
  onPasteBlocks: (id: string, blocks: Block[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerRef(block.id, el);
    if (el.innerHTML !== (block.text || "")) el.innerHTML = block.text || "";
    return () => registerRef(block.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, block.type]);

  const isEmpty = !block.text || ref.current?.textContent?.trim() === "";

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    const plain = el.textContent ?? "";
    if (plain.startsWith("/")) {
      const rect = el.getBoundingClientRect();
      onSlashState({ blockId: block.id, query: plain.slice(1), rect });
    } else {
      onSlashState(null);
    }
    onUpdate(block.id, { text: el.innerHTML });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "code") {
        e.preventDefault();
        document.execCommand("insertText", false, "\n");
        return;
      }
      e.preventDefault();
      onEnter(block.id);
      return;
    }
    if (e.key === "Backspace") {
      const el = ref.current;
      if (el && el.textContent === "") {
        e.preventDefault();
        onDeleteEmpty(block.id);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && looksLikeMarkdown(text)) {
      e.preventDefault();
      onPasteBlocks(block.id, markdownToBlocks(text));
    }
  };

  if (block.type === "divider") {
    return (
      <div className="divider-row">
        <hr />
      </div>
    );
  }

  const editable = (
    <div
      ref={ref}
      className={`block ${block.type} ${block.type === "todo" && block.checked ? "done" : ""}`}
      contentEditable
      suppressContentEditableWarning
      data-empty={isEmpty}
      data-ph={PLACEHOLDER[block.type] || ""}
      data-block-id={block.id}
      onInput={handleInput}
      onKeyDown={handleKey}
      onPaste={handlePaste}
    />
  );

  if (block.type === "bulleted")
    return <div className="li-wrap"><span className="li-mark">•</span>{editable}</div>;
  if (block.type === "numbered")
    return <div className="li-wrap"><span className="li-mark num">{listNumber}.</span>{editable}</div>;
  if (block.type === "todo")
    return (
      <div className="li-wrap">
        <button
          className={`todo-box ${block.checked ? "on" : ""}`}
          onClick={() => onToggleTodo(block.id)}
          aria-label="Toggle to-do"
        >
          {block.checked && <CheckSquare size={12} color="#fff" />}
        </button>
        {editable}
      </div>
    );
  if (block.type === "callout")
    return <div className="callout"><span className="ce">{block.emoji || "💡"}</span>{editable}</div>;
  return editable;
}

// ---- the editor -------------------------------------------------------------

export default function NoteEditor({
  note,
  onChange,
}: {
  note: Note;
  onChange: (n: Note) => void;
}) {
  const refs = useRef<Record<string, HTMLElement>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [tagInput, setTagInput] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) refs.current[id] = el;
    else delete refs.current[id];
  }, []);

  useEffect(() => {
    if (focusId && refs.current[focusId]) {
      placeCaretEnd(refs.current[focusId]);
      setFocusId(null);
    }
  }, [focusId, note.blocks]);

  const setBlocks = (blocks: Block[]) => onChange({ ...note, blocks, updated: Date.now() });

  const updateBlock = (id: string, patch: Partial<Block>) =>
    onChange({ ...note, updated: Date.now(), blocks: note.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const toggleTodo = (id: string) =>
    updateBlock(id, { checked: !note.blocks.find((b) => b.id === id)?.checked });

  const insertAfter = (id: string) => {
    const idx = note.blocks.findIndex((b) => b.id === id);
    const cur = note.blocks[idx];
    let newType: BlockType = "paragraph";
    if (["bulleted", "numbered", "todo"].includes(cur.type)) {
      if (!cur.text || refs.current[id]?.textContent?.trim() === "") {
        updateBlock(id, { type: "paragraph" });
        return;
      }
      newType = cur.type;
    }
    const nb = blk(newType);
    const next = [...note.blocks];
    next.splice(idx + 1, 0, nb);
    setBlocks(next);
    setFocusId(nb.id);
  };

  const deleteEmpty = (id: string) => {
    if (note.blocks.length === 1) return;
    const idx = note.blocks.findIndex((b) => b.id === id);
    const next = note.blocks.filter((b) => b.id !== id);
    setBlocks(next);
    const prev = next[Math.max(0, idx - 1)];
    if (prev) setFocusId(prev.id);
  };

  const pasteBlocks = (id: string, blocks: Block[]) => {
    if (!blocks.length) return;
    const idx = note.blocks.findIndex((b) => b.id === id);
    const cur = note.blocks[idx];
    const next = [...note.blocks];
    const isCurEmpty = !cur.text || refs.current[id]?.textContent?.trim() === "";
    next.splice(idx + (isCurEmpty ? 0 : 1), isCurEmpty ? 1 : 0, ...blocks);
    setBlocks(next);
    setFocusId(blocks[blocks.length - 1].id);
  };

  const convert = (id: string, type: BlockType) => {
    const patch: Partial<Block> = { type, text: "" };
    if (type === "callout") patch.emoji = "💡";
    const next = note.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    if (type === "divider") {
      const idx = next.findIndex((b) => b.id === id);
      const nb = blk("paragraph");
      next.splice(idx + 1, 0, nb);
      setBlocks(next);
      setFocusId(nb.id);
    } else {
      setBlocks(next);
      setFocusId(id);
    }
    setSlash(null);
  };

  const blockMenu = (id: string, action: "delete" | "duplicate" | "add") => {
    if (action === "delete") {
      if (note.blocks.length === 1) {
        setBlocks([blk("paragraph")]);
        return;
      }
      setBlocks(note.blocks.filter((b) => b.id !== id));
    } else if (action === "duplicate") {
      const idx = note.blocks.findIndex((b) => b.id === id);
      const dup = { ...note.blocks[idx], id: blk("paragraph").id };
      const next = [...note.blocks];
      next.splice(idx + 1, 0, dup);
      setBlocks(next);
    } else if (action === "add") {
      insertAfter(id);
    }
  };

  const slashOpts = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase();
    return SLASH.filter((o) => !q || o.label.toLowerCase().includes(q) || o.type.includes(q));
  }, [slash]);

  useEffect(() => setSlashIdx(0), [slash?.query]);

  useEffect(() => {
    if (!slash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => Math.min(i + 1, slashOpts.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); if (slashOpts[slashIdx]) convert(slash.blockId, slashOpts[slashIdx].type); }
      else if (e.key === "Escape") setSlash(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slash, slashOpts, slashIdx]);

  const refreshToolbar = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setToolbar(null); return; }
    const range = sel.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) { setToolbar(null); return; }
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setToolbar(null); return; }
    setToolbar({ top: r.top, left: r.left + r.width / 2 });
  };

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    refreshToolbar();
    const sel = window.getSelection();
    let node = sel?.anchorNode as HTMLElement | null;
    while (node && node.nodeType !== 1) node = node.parentNode as HTMLElement | null;
    while (node && !(node as HTMLElement).dataset?.blockId) node = node.parentNode as HTMLElement | null;
    if (node) updateBlock((node as HTMLElement).dataset.blockId!, { text: (node as HTMLElement).innerHTML });
  };

  // Twitter-style: a "#" prefix shows as you type; Enter / space / comma commit
  const commitTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#+/, "");
    if (t && !note.tags.includes(t)) onChange({ ...note, tags: [...note.tags, t] });
    setTagInput("");
  };
  const addTag = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " " || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && !tagInput && note.tags.length) {
      onChange({ ...note, tags: note.tags.slice(0, -1) });
    }
  };

  const numbers = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 0;
    note.blocks.forEach((b) => {
      if (b.type === "numbered") { n += 1; map[b.id] = n; } else n = 0;
    });
    return map;
  }, [note.blocks]);

  return (
    <div
      className="editor-scroll"
      onMouseUp={refreshToolbar}
      onKeyUp={refreshToolbar}
      onScroll={() => setToolbar(null)}
    >
      <div className="editor-cover" style={{ background: note.cover }}>
        <div className="swap">
          {COVERS.map((c) => (
            <button
              key={c}
              className="cover-chip"
              style={{ background: c }}
              onClick={() => onChange({ ...note, cover: c })}
              aria-label="Change cover"
            />
          ))}
        </div>
      </div>

      <div className="editor" ref={editorRef}>
        <div style={{ position: "relative" }}>
          <button className="editor-emoji" onClick={() => setEmojiOpen((v) => !v)} aria-label="Change emoji">
            {note.emoji}
          </button>
          {emojiOpen && (
            <div className="emoji-pop">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { onChange({ ...note, emoji: e }); setEmojiOpen(false); }}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          className="editor-title"
          rows={1}
          placeholder="Untitled"
          value={note.title}
          onChange={(e) => onChange({ ...note, title: e.target.value })}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
          }}
        />

        <div className="editor-tags">
          {note.tags.map((t) => (
            <span key={t} className="tag-chip">
              <Hash size={11} />
              {t}
              <button
                onClick={() => onChange({ ...note, tags: note.tags.filter((x) => x !== t) })}
                aria-label={`Remove ${t}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <span className="tag-compose">
            {tagInput && <span className="tag-hash">#</span>}
            <input
              className="tag-add"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(/^#+/, ""))}
              onKeyDown={addTag}
            />
          </span>
        </div>

        {note.blocks.map((b) => (
          <div className="block-row" key={b.id}>
            <div className="block-handle">
              <button className="bh-btn" title="Add block below" onClick={() => blockMenu(b.id, "add")}><Plus size={14} /></button>
              <button className="bh-btn" title="Duplicate" onClick={() => blockMenu(b.id, "duplicate")}><Copy size={13} /></button>
              <button className="bh-btn" title="Delete block" onClick={() => blockMenu(b.id, "delete")}><Trash2 size={13} /></button>
            </div>
            <EditorBlock
              block={b}
              listNumber={numbers[b.id]}
              onUpdate={updateBlock}
              onEnter={insertAfter}
              onDeleteEmpty={deleteEmpty}
              onSlashState={setSlash}
              registerRef={registerRef}
              onToggleTodo={toggleTodo}
              onPasteBlocks={pasteBlocks}
            />
          </div>
        ))}
      </div>

      {slash && slashOpts.length > 0 && (
        <div className="slash-menu" style={{ top: slash.rect.bottom + 6, left: slash.rect.left }}>
          <div className="grp">Basic blocks</div>
          {slashOpts.map((o, i) => {
            const Ic = o.icon;
            return (
              <button
                key={o.type}
                className={`slash-item ${i === slashIdx ? "on" : ""}`}
                onMouseEnter={() => setSlashIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); convert(slash.blockId, o.type); }}
              >
                <span className="si"><Ic size={16} /></span>
                <span>
                  <span className="lab">{o.label}</span>
                  <br />
                  <span className="hint">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {toolbar && (
        <div
          className="float-tb"
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button title="Bold" onClick={() => exec("bold")}><Bold size={15} /></button>
          <button title="Italic" onClick={() => exec("italic")}><Italic size={15} /></button>
          <button title="Underline" onClick={() => exec("underline")}><Underline size={15} /></button>
          <button title="Strikethrough" onClick={() => exec("strikeThrough")}><Strikethrough size={15} /></button>
          <span className="sep" />
          <button title="Highlight" onClick={() => exec("hiliteColor", "#FCE6B8")}><Highlighter size={15} /></button>
          <button title="Link" onClick={() => { const u = prompt("Link URL"); if (u) exec("createLink", u); }}><Link2 size={15} /></button>
        </div>
      )}
    </div>
  );
}
