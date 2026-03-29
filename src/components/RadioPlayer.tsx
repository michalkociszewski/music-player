"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import { motion } from "framer-motion";
import { useAudioStore } from "@/stores/audioStore";

const AUDIO_EXT = new Set([".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wav"]);

function trackUrl(path: string) {
  return `/api/audio?path=${encodeURIComponent(path)}`;
}

function ext(p: string) {
  return p.slice(p.lastIndexOf(".")).toLowerCase().replace(".", "") || "mp3";
}

function basename(p: string) {
  return p.split("/").pop()?.replace(/\.[^.]+$/, "") ?? p;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const BAR_HEIGHTS = [0.45, 0.75, 1, 0.6, 0.88, 0.5, 0.7];

function Waveform({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-7">
      {BAR_HEIGHTS.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-blue-400"
          style={{ height: "100%", transformOrigin: "bottom" }}
          animate={
            isPlaying
              ? { scaleY: [h, h * 0.35, h * 0.8, h * 0.5, h] }
              : { scaleY: h * 0.25 }
          }
          transition={
            isPlaying
              ? { duration: 0.7 + i * 0.08, repeat: Infinity, ease: "easeInOut", delay: i * 0.09 }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

export function RadioPlayer() {
  const howlRef = useRef<Howl | null>(null);
  const rafRef = useRef<number | null>(null);
  const libraryRef = useRef<string[]>([]);
  const currentPathRef = useRef<string | null>(null);

  const setPlaying = useAudioStore((s) => s.setPlaying);
  const _setToggle = useAudioStore((s) => s._setToggle);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);
  const playRequest = useAudioStore((s) => s.playRequest);
  const clearPlayRequest = useAudioStore((s) => s.clearPlayRequest);
  const libraryVersion = useAudioStore((s) => s.libraryVersion);

  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackName, setTrackName] = useState("—");

  const playPath = useCallback(
    (path: string) => {
      howlRef.current?.stop();
      howlRef.current?.unload();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      currentPathRef.current = path;
      setTrackName(basename(path));
      setSeek(0);
      setDuration(0);

      const howl = new Howl({
        src: [trackUrl(path)],
        html5: true,
        format: [ext(path)],
        onplay: () => setPlaying(true),
        onpause: () => setPlaying(false),
        onstop: () => setPlaying(false),
        onload: () => setDuration(howl.duration()),
        onend: () => { setPlaying(false); playRandom(); },
        onerror: () => { setPlaying(false); playRandom(); },
      });

      howlRef.current = howl;
      _setToggle(() => {
        if (howl.playing()) howl.pause();
        else howl.play();
      });

      howl.play();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function playRandom() {
    const lib = libraryRef.current;
    if (!lib.length) return;
    const candidates = lib.filter((p) => p !== currentPathRef.current);
    const pool = candidates.length ? candidates : lib;
    playPath(pool[Math.floor(Math.random() * pool.length)]);
  }

  // Refresh library when new tracks are downloaded
  useEffect(() => {
    if (libraryVersion === 0) return;
    fetch("/api/library")
      .then((r) => r.json())
      .then(({ files }: { files: string[] }) => {
        libraryRef.current = files.filter((f) => AUDIO_EXT.has(f.slice(f.lastIndexOf("."))));
      })
      .catch(() => {});
  }, [libraryVersion]);

  // Play specific track on request
  useEffect(() => {
    if (!playRequest) return;
    clearPlayRequest();
    playPath(playRequest);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest]);

  // Load library on mount and start playing
  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then(({ files }: { files: string[] }) => {
        const audio = files.filter((f) => AUDIO_EXT.has(f.slice(f.lastIndexOf("."))));
        libraryRef.current = audio;
        if (audio.length) playPath(audio[Math.floor(Math.random() * audio.length)]);
      })
      .catch(() => {});

    return () => {
      howlRef.current?.stop();
      howlRef.current?.unload();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RAF seek updater
  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const h = howlRef.current;
      if (h?.playing()) setSeek(h.seek() as number);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  const remaining = duration - seek;
  const progress = duration ? seek / duration : 0;

  function seekTo(val: number) {
    setSeek(val);
    howlRef.current?.seek(val);
  }

  return (
    <div className="w-[440px] rounded-[28px] bg-[#141414] p-6 flex flex-col gap-5 shadow-2xl">
      {/* Top row */}
      <div className="flex items-center gap-4">
        <div className="size-[84px] flex-shrink-0 rounded-[18px] bg-gradient-to-br from-orange-400 via-pink-400 to-indigo-400" />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="truncate text-white text-[22px] font-semibold leading-tight">{trackName}</span>
        </div>
        <Waveform isPlaying={isPlaying} />
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <span className="text-white/60 text-sm tabular-nums w-10">{fmt(seek)}</span>
        <div className="relative flex-1 h-[5px] bg-white/15 rounded-full">
          <div
            className="absolute inset-y-0 left-0 bg-white/50 rounded-full pointer-events-none"
            style={{ width: `${progress * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={seek}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-white/60 text-sm tabular-nums w-14 text-right">
          -{fmt(remaining)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-10">
        <button
          onClick={playRandom}
          className="text-white/80 hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" className="size-7 fill-current">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        <button onClick={toggle} className="text-white/90 hover:text-white transition-colors">
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="size-8 fill-current">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-8 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={playRandom}
          className="text-white/80 hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" className="size-7 fill-current">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
