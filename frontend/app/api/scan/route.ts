import { NextResponse } from "next/server";

// Thin BFF proxy for the library scan (the on-demand "Scan library" trigger).
// Like the other proxies it keeps KG_API_URL server-only: the onboarding client
// POSTs here same-origin and we relay to the engine's POST /scan, which re-runs
// the engine over the corpus and returns a JobOut. No LLM/embedding work happens
// on this path — the engine owns the pipeline.
export async function POST(req: Request) {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  // Default to an incremental scan; accept an optional { full } body.
  let payload: unknown = { full: false };
  try {
    payload = await req.json();
  } catch {
    // No/invalid body — keep the default incremental scan.
  }

  try {
    const res = await fetch(`${base}/scan`, {
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
