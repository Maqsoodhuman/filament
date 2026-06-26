import { NextResponse } from "next/server";

// GET /api/clusters — BFF proxy for the Organize tab's AI sections (the engine's
// k-means over topical vectors). KG_API_URL stays server-only. Empty list keeps
// Organize rendering offline (it falls back to the local cluster stub).
export async function GET(req: Request) {
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  const recluster = new URL(req.url).searchParams.get("recluster");
  const qs = recluster ? `?recluster=${encodeURIComponent(recluster)}` : "";
  try {
    const res = await fetch(`${base}/clusters${qs}`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
