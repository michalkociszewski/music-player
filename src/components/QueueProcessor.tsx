"use client";

import { useEffect, useRef } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { useAudioStore } from "@/stores/audioStore";

// Processes pending tracks one at a time. Respects server-side rate limit (429 = wait 60s).
export function QueueProcessor() {
  const tracks = useQueueStore((s) => s.tracks);
  const update = useQueueStore((s) => s.update);
  const remove = useQueueStore((s) => s.remove);
  const bumpLibrary = useAudioStore((s) => s.bumpLibrary);
  const processing = useRef(false);
  const retryAt = useRef<number>(0);

  useEffect(() => {
    if (processing.current) return;
    const pending = tracks.find((t) => t.status === "pending");
    if (!pending) return;

    const waitMs = Math.max(0, retryAt.current - Date.now());

    const timer = setTimeout(async () => {
      processing.current = true;
      update(pending.id, { status: "searching" });

      try {
        const res = await fetch("/api/slskd/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: pending.query }),
        });

        if (res.status === 429) {
          retryAt.current = Date.now() + 60_000;
          update(pending.id, { status: "pending" });
        } else if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          update(pending.id, { status: "error", error: data.error ?? "Failed" });
          setTimeout(() => remove(pending.id), 4000);
        } else {
          const { localPath } = await res.json();
          update(pending.id, { status: "ready", localPath });
          bumpLibrary();
        }
      } catch (e) {
        update(pending.id, {
          status: "error",
          error: e instanceof Error ? e.message : "Network error",
        });
        setTimeout(() => remove(pending.id), 4000);
      } finally {
        processing.current = false;
      }
    }, waitMs);

    return () => clearTimeout(timer);
  }, [tracks, update]);

  return null;
}
