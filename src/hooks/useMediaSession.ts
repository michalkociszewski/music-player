"use client";

import { useEffect } from "react";

import { usePlayerStore } from "@/stores/playerStore";
import { stations } from "@/lib/stations";

export function useMediaSession() {
  const currentStation = usePlayerStore((s) => s.currentStation);
  const metadata = usePlayerStore((s) => s.metadata);
  const status = usePlayerStore((s) => s.status);
  const stop = usePlayerStore((s) => s.stop);
  const playStation = usePlayerStore((s) => s.playStation);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const isActive = status === "playing" || status === "loading";

    navigator.mediaSession.metadata = isActive && currentStation
      ? new MediaMetadata({
          title: metadata?.title ?? currentStation.name,
          artist: metadata?.artist ?? currentStation.genre,
          album: metadata?.album ?? "Internet Radio",
          artwork: currentStation.logoUrl
            ? [{ src: currentStation.logoUrl, sizes: "512x512", type: "image/svg+xml" }]
            : [],
        })
      : null;

    navigator.mediaSession.playbackState = isActive ? "playing" : "none";
  }, [currentStation, metadata, status]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("stop", stop);
    navigator.mediaSession.setActionHandler("pause", stop);

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (!currentStation) return;
      const idx = stations.findIndex((s) => s.slug === currentStation.slug);
      const prev = stations[(idx - 1 + stations.length) % stations.length];
      playStation(prev);
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (!currentStation) return;
      const idx = stations.findIndex((s) => s.slug === currentStation.slug);
      const next = stations[(idx + 1) % stations.length];
      playStation(next);
    });

    return () => {
      navigator.mediaSession.setActionHandler("stop", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [currentStation, stop, playStation]);
}
