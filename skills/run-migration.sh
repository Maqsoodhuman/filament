#!/usr/bin/env bash
# SKILL: run-migration (ENGINE lane)
# Apply Alembic migrations against a scratch Postgres, then verify a clean downgrade.
#   run-migration.sh             # alembic upgrade head
#   run-migration.sh --self-test # upgrade head -> downgrade -1 -> upgrade head (clean round-trip)
# Requires DATABASE_URL pointing at a scratch Postgres (with the `vector` extension available).
# Gate: nonzero if upgrade or downgrade fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/engine"
source .venv/bin/activate
: "${DATABASE_URL:?set DATABASE_URL to a scratch Postgres, e.g. postgresql+psycopg://user@localhost/kg_scratch}"

if [[ "${1:-}" == "--self-test" ]]; then
  alembic upgrade head
  alembic downgrade -1
  alembic upgrade head
  echo "PASS: migration upgrade + downgrade round-trip clean"
else
  alembic upgrade head
  echo "PASS: upgraded to head"
fi
