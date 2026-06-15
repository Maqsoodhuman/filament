import { NextResponse } from "next/server";

// Thin BFF proxy (design: no LLM/embedding work on the API path — this only
// forwards the on-demand trigger to the engine). KG_API_URL is server-only, so
// the client component POSTs here same-origin and we relay to the engine's
// Engine.find_connections() entrypoint.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/notes/${id}/find-connections`, {
      method: "POST",
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "engine unreachable" },
      { status: 502 },
    );
  }
}
