#!/usr/bin/env bash
# SKILL: regenerate-api-types (CONTRACT — orchestrator only)
# Export the OpenAPI schema from the FastAPI app, generate frontend/lib/api-types.ts,
# and verify it type-checks. Gate: exits nonzero if tsc fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/engine"
source .venv/bin/activate
python -c "import json; from kg_api.main import app; open('openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
echo "exported engine/openapi.json"

cd "$ROOT/frontend"
npx --yes openapi-typescript ../engine/openapi.json -o lib/api-types.ts
npx --yes tsc --noEmit
echo "PASS: api-types.ts regenerated and type-checks"
