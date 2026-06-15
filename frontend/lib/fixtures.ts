import type { components } from "@/lib/api-types";

type NoteOut = components["schemas"]["NoteOut"];
type NoteDetail = components["schemas"]["NoteDetail"];

// Phase 2 fixture — typed against the generated contract so the shape can
// never drift from the engine's schema. Hand-writing API types is forbidden
// (see frontend/CLAUDE.md); this only fills that type with example data.
// TODO(phase3): replace fixture with fetch("/notes") against the live API.
export const timelineNotes: NoteOut[] = [
  {
    id: "n_001",
    title: "Central bank credibility",
    body: "A central bank's power rests less on its balance sheet than on the market's belief that it will act. Credibility is the asset; once spent, intervention gets expensive.",
    source: "manual",
    created_at: "2026-06-12T09:24:00Z",
    connection_count: 3,
  },
  {
    id: "n_002",
    title: "Bacterial quorum sensing",
    body: "Bacteria release signaling molecules and only switch on collective behavior once a concentration threshold is crossed — a population voting before it commits.",
    source: "readwise",
    created_at: "2026-06-10T14:02:00Z",
    connection_count: 2,
  },
  {
    id: "n_003",
    title: "Rawls — the veil of ignorance",
    body: "Choose the rules of society without knowing which position you'll occupy in it. Fairness falls out of designed uncertainty about your own stake.",
    source: "kindle",
    created_at: "2026-06-08T19:41:00Z",
    connection_count: 1,
  },
  {
    id: "n_004",
    title: "Antifragility under stress",
    body: "Some systems gain from disorder — small, frequent shocks inoculate them against the rare large one. Suppressing all volatility hides accumulating fragility.",
    source: "manual",
    created_at: "2026-06-05T08:15:00Z",
    connection_count: 0,
  },
];

// NoteDetail fixtures — used by app/notes/[id]/page.tsx when the engine API is
// unreachable (offline dev / static build). Keyed by note id. The engine seeds
// notes under ids `cb` / `qs` / `ru`, so we mirror those here plus a fallback,
// all typed against the generated NoteDetail contract.
const cbDetail: NoteDetail = {
  note: {
    id: "cb",
    title: "Central bank credibility",
    body: "A central bank's power rests less on its balance sheet than on the market's belief that it will act. Credibility is the asset; once spent, intervention gets expensive.",
    source: "manual",
    created_at: "2026-06-12T09:24:00Z",
    connection_count: 2,
  },
  connections: [
    {
      id: "c_cb_qs",
      a_id: "cb",
      b_id: "qs",
      a_title: "Central bank credibility",
      b_title: "Bacterial quorum sensing",
      facet_type: "threshold-triggered collective commitment",
      kind: "same mechanism",
      statement:
        "Both systems stay dormant until a believed threshold is crossed, then commit collectively — the trigger is the shared expectation, not the underlying resource.",
      validity: 4,
      nonobviousness: 4,
      q: 4,
    },
    {
      id: "c_cb_ru",
      a_id: "cb",
      b_id: "ru",
      a_title: "Central bank credibility",
      b_title: "Rawls — the veil of ignorance",
      facet_type: "commitment under designed uncertainty",
      kind: "same dynamic",
      statement:
        "Each derives its force from a stance taken before the outcome is known: credibility precedes intervention as fairness precedes knowing your position.",
      validity: 3,
      nonobviousness: 3,
      q: 3,
    },
  ],
};

const qsDetail: NoteDetail = {
  note: {
    id: "qs",
    title: "Bacterial quorum sensing",
    body: "Bacteria release signaling molecules and only switch on collective behavior once a concentration threshold is crossed — a population voting before it commits.",
    source: "readwise",
    created_at: "2026-06-10T14:02:00Z",
    connection_count: 1,
  },
  connections: [
    {
      id: "c_cb_qs",
      a_id: "qs",
      b_id: "cb",
      a_title: "Bacterial quorum sensing",
      b_title: "Central bank credibility",
      facet_type: "threshold-triggered collective commitment",
      kind: "same mechanism",
      statement:
        "Both systems stay dormant until a believed threshold is crossed, then commit collectively — the trigger is the shared expectation, not the underlying resource.",
      validity: 4,
      nonobviousness: 4,
      q: 4,
    },
  ],
};

const ruDetail: NoteDetail = {
  note: {
    id: "ru",
    title: "Rawls — the veil of ignorance",
    body: "Choose the rules of society without knowing which position you'll occupy in it. Fairness falls out of designed uncertainty about your own stake.",
    source: "kindle",
    created_at: "2026-06-08T19:41:00Z",
    connection_count: 1,
  },
  connections: [
    {
      id: "c_cb_ru",
      a_id: "ru",
      b_id: "cb",
      a_title: "Rawls — the veil of ignorance",
      b_title: "Central bank credibility",
      facet_type: "commitment under designed uncertainty",
      kind: "same dynamic",
      statement:
        "Each derives its force from a stance taken before the outcome is known: credibility precedes intervention as fairness precedes knowing your position.",
      validity: 3,
      nonobviousness: 3,
      q: 3,
    },
  ],
};

export const noteDetailFixtures: Record<string, NoteDetail> = {
  cb: cbDetail,
  qs: qsDetail,
  ru: ruDetail,
  n_001: cbDetail,
  n_002: qsDetail,
  n_003: ruDetail,
};

// Fallback for an unknown id: a minimal honest detail with no connections.
export function fallbackNoteDetail(id: string): NoteDetail {
  return noteDetailFixtures[id] ?? {
    note: {
      id,
      title: "Note",
      body: "This note could not be loaded from the engine.",
      source: "manual",
      created_at: new Date().toISOString(),
      connection_count: 0,
    },
    connections: [],
  };
}
