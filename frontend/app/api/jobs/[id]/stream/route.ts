// GET /api/jobs/{id}/stream — SSE passthrough to the engine's job stream (A3). Proxies the
// upstream event-stream body so the client gets live import/scan progress. KG_API_URL stays
// server-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.KG_API_URL ?? "http://localhost:8000";
  try {
    const upstream = await fetch(`${base}/jobs/${id}/stream`, { cache: "no-store" });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch {
    return new Response("data: {\"status\":\"error\"}\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
  }
}
