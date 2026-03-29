"use client";

import { useEffect, useRef } from "react";

import { useQueueStore } from "@/stores/queueStore";
import type { QueueTrack } from "@/types";

const PREFETCH_AHEAD = 2;
const POLL_MS = 2000;

async function searchAndDownloadTrack(track: QueueTrack): Promise<string> {
  const res = await fetch("/api/slskd/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: track.query }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? "Download failed");
  }
  const { localPath } = (await res.json()) as { localPath: string };
  return localPath;
}

export function useDownloadQueue() {
  const tracks = useQueueStore((s) => s.tracks);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const updateTrack = useQueueStore((s) => s.updateTrack);
  const processingIds = useRef(new Set<string>());

  useEffect(() => {
    const tracksToProcess = tracks.filter((t, i) => {
      const isNearCurrent = i >= currentIndex && i <= currentIndex + PREFETCH_AHEAD;
      const isPending = t.status === "queued";
      const isNotProcessing = !processingIds.current.has(t.id);
      return isNearCurrent && isPending && isNotProcessing;
    });

    for (const track of tracksToProcess) {
      processingIds.current.add(track.id);
      processTrack(track);
    }
  }, [tracks, currentIndex]);

  async function processTrack(track: QueueTrack) {
    updateTrack(track.id, { status: "searching" });

    try {
      updateTrack(track.id, { status: "downloading" });
      const localPath = await searchAndDownloadTrack(track);
      updateTrack(track.id, { status: "ready", localPath });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      updateTrack(track.id, { status: "error", error });
    } finally {
      processingIds.current.delete(track.id);
    }
  }

  return null;
}
