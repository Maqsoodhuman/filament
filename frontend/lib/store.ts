"use client";

// Client data store — the Filament-rich note model fused with our engine's
// KIND-typed connections (docs/COHESIVE_DESIGN.md §4). This is the in-browser
// source of truth that makes every surface interactive (editor edits, graph
// responds, find-connections surfaces threads). Persistence is localStorage for
// now; task #7 swaps these helpers for the engine API (/notes /connections
// /clusters /scan) without changing the surfaces that consume them.
//
// An authored note is just another ingestion source — it enters the same shape
// as an import, so the editor never forks the engine.

import { useCallback, useEffect, useRef, useState } from "react";

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "divider";

export type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  emoji?: string;
};

export type Note = {
  id: string;
  emoji: string;
  cover: string;
  title: string;
  tags: string[];
  created: number;
  updated: number;
  source: string;
  blocks: Block[];
};

export type Kind = "same mechanism" | "same dynamic" | "same topic";

export type Connection = {
  id: string;
  a_id: string;
  b_id: string;
  a_title: string;
  b_title: string;
  facet_type: string;
  kind: Kind;
  statement: string;
  validity: number;
  nonobviousness: number;
  q: number;
};

export type Cluster = {
  id: string;
  notebook: string;
  label: string;
  color: string;
  note_ids: string[];
  note_count: number;
  is_manual: boolean;
};

// ---- shared visual vocabulary ---------------------------------------------

export const COVERS = [
  "linear-gradient(120deg,#7C6CF0,#5B6CF0)",
  "linear-gradient(120deg,#1FA89A,#36C2A8)",
  "linear-gradient(120deg,#E0A33B,#F2C04B)",
  "linear-gradient(120deg,#E8705B,#F09177)",
  "linear-gradient(120deg,#161A2B,#2A3047)",
  "linear-gradient(120deg,#D2649B,#E58CBE)",
];

export const EMOJIS = [
  "📝", "💡", "🚀", "📚", "🧠", "🌱", "🔭", "⚡", "🎯", "🪐",
  "🧩", "✍️", "🔥", "🌊", "🗺️", "🎨", "🔗", "💭", "🌀", "📌",
  "💰", "🦠", "⚖️", "🛡️",
];

export const KIND_META: Record<
  Kind,
  { slug: "mechanism" | "dynamic" | "topic"; label: string; edge: string }
> = {
  "same mechanism": { slug: "mechanism", label: "same mechanism", edge: "#F2A93B" },
  "same dynamic": { slug: "dynamic", label: "same dynamic", edge: "#5B6CF0" },
  "same topic": { slug: "topic", label: "same topic", edge: "#5A6B8C" },
};

export const KIND_ORDER: Kind[] = ["same mechanism", "same dynamic", "same topic"];

let _id = 0;
export const uid = () =>
  `${Date.now().toString(36)}-${(_id++).toString(36)}-${Math.floor(
    (typeof performance !== "undefined" ? performance.now() : 0) % 1000,
  ).toString(36)}`;

export const blk = (type: BlockType, text = "", extra: Partial<Block> = {}): Block => ({
  id: uid(),
  type,
  text,
  ...extra,
});

// ---- seed: Filament craft × our engine's signature connections ------------
// The threshold-commitment cluster (bank runs ↔ quorum sensing ↔ Rawls) is the
// engine's soul — a genuine cross-domain thread topic-search cannot find.

function seedNotes(): Note[] {
  const t = Date.UTC(2026, 5, 12, 9, 0, 0); // deterministic so SSR == client
  const day = 864e5;
  // Deterministic seed: blk() uses Date.now()/perf for runtime ids, which would
  // differ between SSR and client hydration. Re-stamp seed block ids by index
  // so the server HTML and first client render match exactly.
  const notes: Note[] = [
    {
      id: "cb", emoji: "💰", cover: COVERS[2], source: "manual",
      title: "Central bank credibility",
      tags: ["economics", "systems", "trust"],
      created: t, updated: t,
      blocks: [
        blk("paragraph", "A central bank's power rests less on its balance sheet than on the market's belief that it will act. Credibility is the asset; once spent, intervention gets expensive."),
        blk("callout", "The threat that is believed never has to be carried out.", { emoji: "💡" }),
        blk("quote", "Markets move on the promise, not the purchase."),
      ],
    },
    {
      id: "qs", emoji: "🦠", cover: COVERS[1], source: "readwise",
      title: "Bacterial quorum sensing",
      tags: ["biology", "systems", "emergence"],
      created: t - 2 * day, updated: t - 2 * day,
      blocks: [
        blk("paragraph", "Bacteria release signaling molecules and only switch on collective behavior once a concentration threshold is crossed — a population voting before it commits."),
        blk("bulleted", "No single cell decides; the medium does."),
        blk("bulleted", "Below threshold, nothing. Above it, everything at once."),
      ],
    },
    {
      id: "ru", emoji: "⚖️", cover: COVERS[0], source: "kindle",
      title: "Rawls — the veil of ignorance",
      tags: ["philosophy", "fairness"],
      created: t - 4 * day, updated: t - 4 * day,
      blocks: [
        blk("paragraph", "Choose the rules of society without knowing which position you'll occupy in it. Fairness falls out of designed uncertainty about your own stake."),
        blk("quote", "Justice is what you'd pick before you knew who you'd be."),
      ],
    },
    {
      id: "af", emoji: "🛡️", cover: COVERS[3], source: "manual",
      title: "Antifragility under stress",
      tags: ["systems", "risk", "complexity"],
      created: t - 7 * day, updated: t - 7 * day,
      blocks: [
        blk("paragraph", "Some systems gain from disorder — small, frequent shocks inoculate them against the rare large one. Suppressing all volatility hides accumulating fragility."),
        blk("bulleted", "Stability that is enforced is fragility deferred."),
      ],
    },
    {
      id: "cr", emoji: "🧠", cover: COVERS[4], source: "manual",
      title: "Compression is understanding",
      tags: ["learning", "writing", "ai"],
      created: t - 9 * day, updated: t - 9 * day,
      blocks: [
        blk("h2", "Why compression matters"),
        blk("paragraph", "When you can say a thing in fewer words without losing it, you understood it. What you cut tells you what you thought was decoration."),
        blk("quote", "The map that fits in your pocket is the one you actually use."),
      ],
    },
    {
      id: "sr", emoji: "📚", cover: COVERS[1], source: "readwise",
      title: "Spaced repetition works",
      tags: ["learning", "memory"],
      created: t - 11 * day, updated: t - 11 * day,
      blocks: [
        blk("paragraph", "Forgetting is a feature. The right time to review is just before you'd lose it — short, frequent recalls beat long cramming."),
        blk("bulleted", "A note you re-read is a note you re-encode."),
      ],
    },
    {
      id: "vlm", emoji: "🔭", cover: COVERS[1], source: "kindle",
      title: "Vision-language models, briefly",
      tags: ["ai", "research"],
      created: t - 13 * day, updated: t - 13 * day,
      blocks: [
        blk("h2", "The shape of a VLM"),
        blk("paragraph", "An image encoder and a language model share a space. Captioning is the easy demo; grounding is the hard part."),
        blk("code", "loss = ce(logits, target) + λ * align(img_emb, txt_emb)"),
      ],
    },
  ];
  notes.forEach((n) => n.blocks.forEach((b, i) => (b.id = `${n.id}:b${i}`)));
  return notes;
}

function seedConnections(): Connection[] {
  return [
    {
      id: "c_cb_qs", a_id: "cb", b_id: "qs",
      a_title: "Central bank credibility", b_title: "Bacterial quorum sensing",
      facet_type: "threshold-triggered collective commitment",
      kind: "same mechanism",
      statement:
        "Both stay dormant until a believed threshold is crossed, then commit collectively — the trigger is the shared expectation, not the underlying resource.",
      validity: 4, nonobviousness: 5, q: 4,
    },
    {
      id: "c_cb_ru", a_id: "cb", b_id: "ru",
      a_title: "Central bank credibility", b_title: "Rawls — the veil of ignorance",
      facet_type: "commitment made before the outcome is known",
      kind: "same dynamic",
      statement:
        "Each derives its force from a stance taken before the result is visible: credibility precedes intervention as fairness precedes knowing your position.",
      validity: 3, nonobviousness: 3, q: 3,
    },
    {
      id: "c_cr_sr", a_id: "cr", b_id: "sr",
      a_title: "Compression is understanding", b_title: "Spaced repetition works",
      facet_type: "strengthening signal by discarding the rest",
      kind: "same mechanism",
      statement:
        "Both improve retention by deliberate loss: compression keeps only the load-bearing parts; the forgetting curve keeps only what gets re-encoded under pressure.",
      validity: 4, nonobviousness: 4, q: 4,
    },
    {
      id: "c_qs_af", a_id: "qs", b_id: "af",
      a_title: "Bacterial quorum sensing", b_title: "Antifragility under stress",
      facet_type: "small perturbations aggregating to a regime change",
      kind: "same dynamic",
      statement:
        "Both turn many small local signals into one system-level switch — quorum sensing into collective action, repeated shocks into adapted robustness.",
      validity: 3, nonobviousness: 3, q: 3,
    },
    {
      id: "c_sr_vlm", a_id: "sr", b_id: "vlm",
      a_title: "Spaced repetition works", b_title: "Vision-language models, briefly",
      facet_type: "learning representations over time",
      kind: "same topic",
      statement:
        "Both sit in the learning literature, but the resemblance is topical — they share a subject, not a structure.",
      validity: 3, nonobviousness: 1, q: 1,
    },
  ];
}

// ---- clusters (Organize sections = AI clusters, multi-membership) ----------

const CLUSTER_COLORS = ["#F2A93B", "#5B6CF0", "#1FA89A", "#E8705B", "#7C6CF0", "#D2649B"];

function computeClusters(notes: Note[]): Cluster[] {
  // DEV baseline mirrors the engine's seeded clusters; PROD swaps in /clusters.
  const defs: { label: string; ids: string[] }[] = [
    { label: "Threshold commitment", ids: ["cb", "qs", "ru"] },
    { label: "What to keep, what to cut", ids: ["cr", "sr"] },
    { label: "Systems under stress", ids: ["af", "qs"] },
    { label: "Models & learning", ids: ["vlm", "sr"] },
  ];
  const have = new Set(notes.map((n) => n.id));
  return defs
    .map((d, i) => {
      const ids = d.ids.filter((x) => have.has(x));
      return {
        id: `cl_${i}`,
        notebook: "Research library",
        label: d.label,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
        note_ids: ids,
        note_count: ids.length,
        is_manual: false,
      };
    })
    .filter((c) => c.note_count > 0);
}

// ---- persistence -----------------------------------------------------------

const STORE_KEY = "filament:notes:v1";
const CONN_KEY = "filament:connections:v1";

type Snapshot = { notes: Note[]; connections: Connection[] };

function load(): Snapshot {
  if (typeof window === "undefined") return { notes: seedNotes(), connections: seedConnections() };
  try {
    const n = window.localStorage.getItem(STORE_KEY);
    const c = window.localStorage.getItem(CONN_KEY);
    const notes = n ? (JSON.parse(n) as Note[]) : seedNotes();
    const connections = c ? (JSON.parse(c) as Connection[]) : seedConnections();
    if (Array.isArray(notes) && notes.length) return { notes, connections: connections ?? [] };
  } catch {
    /* fall through to seed */
  }
  return { notes: seedNotes(), connections: seedConnections() };
}

function save(s: Snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s.notes));
    window.localStorage.setItem(CONN_KEY, JSON.stringify(s.connections));
  } catch {
    /* quota / private mode — stay in-memory */
  }
}

// ---- the hook --------------------------------------------------------------

let listeners: Array<() => void> = [];
let snapshot: Snapshot | null = null;

// First render (SSR and client) MUST be the deterministic seed so the HTML
// matches; localStorage is pulled in only after mount (useStore effect). This
// avoids the repeat-visit hydration mismatch where the server renders the seed
// but the client's first paint reads persisted notes.
function ensure(): Snapshot {
  if (!snapshot) snapshot = { notes: seedNotes(), connections: seedConnections() };
  return snapshot;
}

function setSnapshot(next: Snapshot) {
  snapshot = next;
  save(next);
  listeners.forEach((l) => l());
}

export function useStore() {
  const [, force] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const l = () => force((x) => x + 1);
    listeners.push(l);
    // hydrate from localStorage after mount (SSR rendered the seed)
    snapshot = load();
    force((x) => x + 1);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  const s = ensure();

  const updateNote = useCallback((updated: Note) => {
    const cur = ensure();
    setSnapshot({
      ...cur,
      notes: cur.notes.map((n) => (n.id === updated.id ? { ...updated, updated: Date.now() } : n)),
    });
  }, []);

  const createNote = useCallback((): Note => {
    const cur = ensure();
    const n: Note = {
      id: uid(),
      emoji: "📝",
      cover: COVERS[Math.floor(Math.abs(Math.sin(cur.notes.length)) * COVERS.length) % COVERS.length],
      title: "",
      tags: [],
      source: "authored",
      created: Date.now(),
      updated: Date.now(),
      blocks: [blk("paragraph")],
    };
    setSnapshot({ ...cur, notes: [n, ...cur.notes] });
    return n;
  }, []);

  const deleteNote = useCallback((id: string) => {
    const cur = ensure();
    setSnapshot({
      notes: cur.notes.filter((n) => n.id !== id),
      connections: cur.connections.filter((c) => c.a_id !== id && c.b_id !== id),
    });
  }, []);

  const connectionsFor = useCallback(
    (id: string): Connection[] =>
      ensure()
        .connections.filter((c) => c.a_id === id || c.b_id === id)
        .map((c) => orientFrom(c, id))
        .sort((a, b) => qRank(b) - qRank(a)),
    [],
  );

  return {
    hydrated: mounted.current,
    notes: s.notes,
    connections: s.connections,
    clusters: computeClusters(s.notes),
    updateNote,
    createNote,
    deleteNote,
    connectionsFor,
    noteById: (id: string) => s.notes.find((n) => n.id === id),
  };
}

// orient a connection so `a` is always the queried note (for one-sided cards)
export function orientFrom(c: Connection, id: string): Connection {
  if (c.a_id === id) return c;
  return {
    ...c,
    a_id: c.b_id,
    b_id: c.a_id,
    a_title: c.b_title,
    b_title: c.a_title,
  };
}

function qRank(c: Connection): number {
  // mechanism > dynamic > topic, then by q
  const kindRank = c.kind === "same mechanism" ? 2 : c.kind === "same dynamic" ? 1 : 0;
  return kindRank * 10 + c.q;
}

// Intersections feed — the highest-q, most non-obvious threads across the whole
// library (docs/COHESIVE_DESIGN.md §3). Honest-empty: returns [] when nothing
// genuine surfaces. Structural (amber) outrank dynamic; topic links never lead.
export function topThreads(connections: Connection[], n = 5): Connection[] {
  return connections
    .filter((c) => c.q >= 3 && c.kind !== "same topic")
    .sort((a, b) => {
      const k = (c: Connection) => (c.kind === "same mechanism" ? 1 : 0);
      return k(b) - k(a) || b.q - a.q || b.nonobviousness - a.nonobviousness;
    })
    .slice(0, n);
}

// A note's display colour = its first cluster's colour (slate if unclustered).
export function clusterColorOf(noteId: string, clusters: Cluster[]): string {
  const c = clusters.find((cl) => cl.note_ids.includes(noteId));
  return c?.color ?? "#5A6B8C";
}

export function plainPreview(note: Note): string {
  const b = note.blocks.find((x) => x.text && x.type !== "divider");
  return b ? b.text.replace(/<[^>]+>/g, "") : "Empty note";
}

// Deterministic (UTC, en-US) so SSR HTML matches the first client render —
// avoids the timezone-driven hydration mismatch on date text.
export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatFull(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  });
}
