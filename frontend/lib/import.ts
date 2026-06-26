// File-drop import (goal A1). Parses dropped files into ParsedNote records that
// store.importNotes turns into notes and pushes through the engine (normalize →
// enqueue → scan). No external deps: Markdown/.txt and Kindle "My Clippings.txt".
// Obsidian/Notion exports are just .md files, so they flow through parseMarkdown.

export type ParsedNote = {
  title: string;
  text: string;
  tags: string[];
  source: string;
};

const HASHTAG = /(?:^|\s)#([a-z0-9][a-z0-9_-]{1,30})/gi;

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HASHTAG.exec(text)) !== null) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 6);
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^[-*+]\s+/gm, "") // bullets
    .replace(/^>\s?/gm, "") // quotes
    .replace(/[*_`]{1,3}/g, "") // emphasis / code ticks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .trim();
}

function parseMarkdown(name: string, content: string): ParsedNote {
  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = firstHeading || name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]/g, " ").trim();
  const text = stripMarkdown(content);
  const ext = name.toLowerCase();
  const source = ext.endsWith(".md") || ext.endsWith(".markdown") ? "obsidian" : "upload";
  return { title: title || "Untitled", text, tags: extractTags(content), source };
}

// Kindle "My Clippings.txt": entries separated by a line of "=" (==========).
// Each entry: line 1 = "Book Title (Author)", a metadata line, blank, then the
// highlight text. One note per highlight, titled by the book.
function parseKindle(content: string): ParsedNote[] {
  const out: ParsedNote[] = [];
  for (const raw of content.split(/^={3,}\s*$/m)) {
    const lines = raw.split("\n").map((l) => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const book = nonEmpty[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
    // the highlight is everything after the metadata line ("- Your Highlight ...")
    const metaIdx = nonEmpty.findIndex((l) => /^-\s*(your |add)/i.test(l));
    const text = nonEmpty.slice(metaIdx >= 0 ? metaIdx + 1 : 1).join(" ").trim();
    if (text) out.push({ title: book || "Kindle highlight", text, tags: [], source: "kindle" });
  }
  return out;
}

export async function parseFiles(files: File[]): Promise<ParsedNote[]> {
  const out: ParsedNote[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    let content = "";
    try {
      content = await f.text();
    } catch {
      continue;
    }
    if (!content.trim()) continue;
    if (lower.includes("clippings") || (lower.endsWith(".txt") && /^={3,}\s*$/m.test(content))) {
      out.push(...parseKindle(content));
    } else if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
      out.push(parseMarkdown(f.name, content));
    }
    // other extensions are ignored (zip/enex are a later iteration)
  }
  return out.filter((n) => n.text.trim().length > 0);
}
