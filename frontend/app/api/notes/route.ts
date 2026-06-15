import { NextResponse } from "next/server";

// GET /api/notes — BFF proxy used by the ⌘K palette for note search. Lists the
// library once (client filters by title). Keeps KG_API_URL server-only.
export async function GET() {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/notes`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    // Empty list keeps the palette usable offline (nav + new note still work).
    return NextResponse.json([], { status: 200 });
  }
}

// Thin BFF proxy for note creation. Keeps KG_API_URL server-only: the write
// editor POSTs here same-origin and we relay the body to the engine's
// POST /notes. No LLM/embedding work happens here — the engine enqueues the
// async pipeline; this path only forwards the create. The engine returns the
// created NoteOut (with its id), which the client uses to redirect to
// /notes/{id}.
export async function POST(req: Request) {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "engine unreachable" }, { status: 502 });
  }
}
