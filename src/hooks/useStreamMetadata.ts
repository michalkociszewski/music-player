"use client";

import { useEffect, useRef } from "react";

import { usePlayerStore } from "@/stores/playerStore";
import type { TrackMetadata } from "@/types";

const POLL_INTERVAL_MS = 10_000;

export function useStreamMetadata(endpoint: string | undefined) {
  const setMetadata = usePlayerStore((s) => s.setMetadata);
  const status = usePlayerStore((s) => s.status);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!endpoint || status !== "playing") {
      return;
    }

    async function fetchMetadata() {
      try {
        const res = await fetch(endpoint!);
        if (!res.ok) return;
        const data = (await res.json()) as Partial<TrackMetadata>;
        if (data.title) {
          setMetadata({
            artist: data.artist ?? "",
            title: data.title,
            album: data.album,
            artworkUrl: data.artworkUrl,
          });
        }
      } catch {
        // Silently ignore — fallback to station name in UI
      }
    }

    fetchMetadata();
    intervalRef.current = setInterval(fetchMetadata, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [endpoint, status, setMetadata]);
}
