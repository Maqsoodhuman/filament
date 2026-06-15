import { NextResponse } from "next/server";

// GET /api/connections — BFF proxy for the surfaced-connection list. Used by the
// onboarding first-insight callout (and any client that needs the live edges)
// so KG_API_URL stays server-only. Forwards an optional ?note_id filter to the
// engine's GET /connections.
export async function GET(req: Request) {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("note_id");
  const qs = noteId ? `?note_id=${encodeURIComponent(noteId)}` : "";
  try {
    const res = await fetch(`${base}/connections${qs}`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    // Empty list keeps onboarding rendering offline (it falls back to fixtures).
    return NextResponse.json([], { status: 200 });
  }
}
