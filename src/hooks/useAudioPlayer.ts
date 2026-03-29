"use client";

import { useEffect, useRef, useCallback } from "react";
import { Howl } from "howler";

import { usePlayerStore } from "@/stores/playerStore";
import type { PlayerStatus } from "@/types";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

function isDev() {
  return process.env.NODE_ENV === "development";
}

function log(...args: unknown[]) {
  if (isDev()) console.log("[useAudioPlayer]", ...args);
}

export function useAudioPlayer() {
  const howlRef = useRef<Howl | null>(null);
  const retriesRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStation = usePlayerStore((s) => s.currentStation);
  const status = usePlayerStore((s) => s.status);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setStatus = usePlayerStore((s) => s.setStatus);
  const stop = usePlayerStore((s) => s.stop);

  const destroyHowl = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (howlRef.current) {
      howlRef.current.fade(howlRef.current.volume(), 0, 200);
      setTimeout(() => {
        howlRef.current?.unload();
        howlRef.current = null;
      }, 220);
    }
  }, []);

  const attemptReconnect = useCallback(
    (streamUrl: string, fallbackUrl?: string) => {
      if (retriesRef.current >= MAX_RETRIES) {
        log("Max retries reached, giving up");
        setStatus("error");
        return;
      }

      const delay = RETRY_BASE_MS * Math.pow(2, retriesRef.current);
      retriesRef.current += 1;
      log(`Retry ${retriesRef.current}/${MAX_RETRIES} in ${delay}ms`);

      retryTimeoutRef.current = setTimeout(() => {
        const url =
          retriesRef.current === MAX_RETRIES && fallbackUrl
            ? fallbackUrl
            : streamUrl;
        createHowl(url, fallbackUrl);
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setStatus]
  );

  const createHowl = useCallback(
    (streamUrl: string, fallbackUrl?: string) => {
      destroyHowl();

      const howl = new Howl({
        src: [streamUrl],
        html5: true,
        volume: isMuted ? 0 : volume,
        format: ["mp3", "aac", "ogg"],
        onplay: () => {
          log("Playing");
          retriesRef.current = 0;
          howl.fade(0, isMuted ? 0 : volume, 300);
          setStatus("playing");
        },
        onloaderror: (_id: number, err: unknown) => {
          log("Load error", err);
          handleStreamError(streamUrl, fallbackUrl);
        },
        onplayerror: (_id: number, err: unknown) => {
          log("Play error", err);
          handleStreamError(streamUrl, fallbackUrl);
        },
        onend: () => {
          log("Stream ended — reconnecting");
          handleStreamError(streamUrl, fallbackUrl);
        },
      });

      howl.volume(0);
      howl.play();
      howlRef.current = howl;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volume, isMuted, destroyHowl]
  );

  function handleStreamError(streamUrl: string, fallbackUrl?: string) {
    setStatus("loading");
    attemptReconnect(streamUrl, fallbackUrl);
  }

  // React to station changes
  useEffect(() => {
    if (!currentStation || status === "idle") {
      destroyHowl();
      return;
    }

    if (status === "loading") {
      retriesRef.current = 0;
      createHowl(currentStation.streamUrl, currentStation.fallbackUrl);
    }
  }, [currentStation, status, createHowl, destroyHowl]);

  // React to volume changes
  useEffect(() => {
    if (!howlRef.current) return;
    howlRef.current.volume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => destroyHowl();
  }, [destroyHowl]);

  const playStation = usePlayerStore((s) => s.playStation);

  return {
    play: playStation,
    stop,
    setVolume: usePlayerStore((s) => s.setVolume),
    toggleMute: usePlayerStore((s) => s.toggleMute),
    status,
  };
}
