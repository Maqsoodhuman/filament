-- Postgres + pgvector schema (production target for the v0 in-memory store).
-- One system of record; connections are strictly intra-user (shard/filter by user_id).
-- Embedding dim below assumes Voyage voyage-3-large (1024); adjust for a local embed model.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text UNIQUE NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- A note's stable home. content_hash drives idempotent re-extraction on edit.
CREATE TABLE notes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id),
    title         text NOT NULL DEFAULT '',
    body          text NOT NULL,
    source        text NOT NULL DEFAULT 'authored',   -- authored | readwise | kindle | notion | ...
    content_hash  text NOT NULL,
    topical_vec   vector(1024),                        -- note-level embedding (used to REJECT same-topic)
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_idx ON notes (user_id, created_at DESC);
CREATE UNIQUE INDEX notes_dedup_idx ON notes (user_id, content_hash);

-- Typed structural facets. Matched in abstraction space, partitioned by facet_type.
CREATE TABLE note_facets (
    id              bigserial PRIMARY KEY,
    note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    facet_type      text NOT NULL,                     -- causal_mechanism | tension_tradeoff | ...
    abstraction     text NOT NULL,
    salience        real NOT NULL,
    facet_vec       vector(1024) NOT NULL,
    content_hash    text NOT NULL,
    model_version   text NOT NULL
);
-- HNSW per (logical) facet_type partition; in practice partition the table by facet_type.
CREATE INDEX note_facets_hnsw ON note_facets USING hnsw (facet_vec vector_cosine_ops);
CREATE INDEX note_facets_user_type_idx ON note_facets (user_id, facet_type);

-- Judged connections. Only q>=3 are surfaced; sub-threshold kept hidden for tuning.
CREATE TABLE connections (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users(id),
    a_note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    b_note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    facet_type        text NOT NULL,
    statement         text NOT NULL,
    validity          smallint NOT NULL,
    nonobviousness    smallint NOT NULL,
    generic           boolean NOT NULL DEFAULT false,
    q                 smallint GENERATED ALWAYS AS (LEAST(validity, nonobviousness)) STORED,
    surfaced          boolean NOT NULL,
    extractor_version text NOT NULL,
    reasoner_version  text NOT NULL,
    verifier_version  text NOT NULL,
    prompt_hash       text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
-- lifetime per-pair dedup: a pair is judged at most once per model_version
CREATE UNIQUE INDEX connections_pair_ver_idx
    ON connections (user_id, LEAST(a_note_id, b_note_id), GREATEST(a_note_id, b_note_id), prompt_hash);
CREATE INDEX connections_surfaced_idx ON connections (user_id, surfaced, q DESC);

-- Two-axis user feedback (the data flywheel / the moat).
CREATE TABLE connection_feedback (
    id            bigserial PRIMARY KEY,
    connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id),
    verdict       text NOT NULL,                        -- useful | wrong | obvious | surface_match
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Organize tab: OneNote-style sections are clusters; a note can be in several (multi-membership).
CREATE TABLE note_clusters (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id),
    notebook       text NOT NULL DEFAULT 'default',
    label          text NOT NULL,
    is_manual      boolean NOT NULL DEFAULT false,
    cluster_version text NOT NULL
);
CREATE TABLE note_cluster_members (
    cluster_id uuid NOT NULL REFERENCES note_clusters(id) ON DELETE CASCADE,
    note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_id, note_id)
);

-- Eval/versioning spine.
CREATE TABLE prompt_versions (
    version     text PRIMARY KEY,
    stage       text NOT NULL,            -- extract | reason | verify
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE eval_runs (
    id            bigserial PRIMARY KEY,
    model_version text NOT NULL,
    precision     real,
    garbage_rate  real,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
