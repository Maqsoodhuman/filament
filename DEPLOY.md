# Deploy — going live

Two pieces: the **engine API** (Python/FastAPI) on **Fly.io**, and the **frontend** (Next.js) on
**Vercel**. The default config runs the self-contained **fake provider** (deterministic, seeded, no
secrets) so you get a working public demo with zero API keys. Switch to real models later (below).

> Requires YOUR accounts (Fly + Vercel) — login + billing. Nothing here logs in for you.

## 1. Engine API → Fly.io

```bash
# one-time
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
flyctl auth login

cd engine
flyctl launch --no-deploy    # creates the app from fly.toml (accept the name or pick one)
flyctl deploy                # builds Dockerfile, ships it
flyctl status                # note the public URL, e.g. https://kg-engine.fly.dev
curl https://kg-engine.fly.dev/health   # {"status":"ok"}
```

## 2. Frontend → Vercel

Vercel auto-detects Next.js. Set the engine URL as an env var so the server-side fetch reaches Fly.

```bash
npm i -g vercel
cd frontend
vercel link                                  # create/link the project
vercel env add KG_API_URL production         # paste your Fly URL, e.g. https://kg-engine.fly.dev
vercel --prod                                # deploy → gives you the public site URL
```

That public Vercel URL is the live app.

## 3. (Optional) Real connections instead of the fake demo

The fake provider is great for a zero-cost public demo. For genuine structural connections:

- **Premium (Claude):** on the Fly engine, set `KG_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, and wire
  an embedding provider — Anthropic has none, so set `KG_EMBED_MODEL`/host to **Voyage** or a reachable
  **Ollama**. (See `engine/src/kg_engine/router.py` + `.env.example`.)
- **Stateful:** set `KG_STORE_BACKEND=postgres` + `DATABASE_URL` (Fly Managed Postgres or Neon) and run
  `skills/run-migration.sh` so notes/connections persist. Default is in-memory (ephemeral).
- The **eval-gate must stay green** on any model/threshold change before promoting (see `ORCHESTRATION.md`).

## Local production run (no cloud)

```bash
cd engine && source .venv/bin/activate && KG_SEED=1 KG_PROVIDER=fake uvicorn kg_api.main:app --port 8000 &
cd frontend && npm run build && KG_API_URL=http://127.0.0.1:8000 npm run start    # → http://localhost:3000
```
