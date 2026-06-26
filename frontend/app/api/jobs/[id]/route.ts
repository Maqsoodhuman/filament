import { NextResponse } from "next/server";

// GET /api/jobs/{id} — BFF proxy to poll an async pipeline job (connect/scan).
// The client posts a trigger, gets a job_id, then polls here until status=done
// before refetching connections/clusters. KG_API_URL stays server-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/jobs/${id}`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "engine unreachable" }, { status: 502 });
  }
}
