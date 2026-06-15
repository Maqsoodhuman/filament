import type { components } from "@/lib/api-types";

type NoteOut = components["schemas"]["NoteOut"];

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
