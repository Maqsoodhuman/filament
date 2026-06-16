"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// FindConnectionsButton — design system §3 Button: primary = solid neutral
// (--text-primary) bg / surface text. NO blue button (blue is never a generic
// CTA; it's reserved for surfaced connections themselves). On click it POSTs to
// the engine's on-demand entrypoint then refreshes the route so freshly
// surfaced connections render in the rail.
//
// The POST goes through a same-origin Route Handler proxy (/api/notes/[id]/
// find-connections) because KG_API_URL is a server-only env var.
export default function FindConnectionsButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/find-connections`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      router.refresh();
    } catch {
      setError("Couldn't reach the engine. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded-sm bg-text-primary px-3 py-[6px] text-ui text-surface transition-opacity duration-[120ms] ease-confirm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Finding connections…" : "Find connections"}
      </button>
      {error ? (
        <span role="alert" aria-live="polite" className="text-meta text-text-secondary">
          {error}
        </span>
      ) : null}
    </div>
  );
}
