"use client";

import { useState } from "react";
import { X, Play } from "lucide-react";
import { useQueueStore, type QueueTrack } from "@/stores/queueStore";
import { useAudioStore } from "@/stores/audioStore";

const STATUS_LABEL: Record<QueueTrack["status"], string> = {
  pending: "oczekuje",
  searching: "szuka...",
  ready: "gotowe",
  error: "błąd",
};

const STATUS_COLOR: Record<QueueTrack["status"], string> = {
  pending: "text-white/40",
  searching: "text-amber-400",
  ready: "text-green-400",
  error: "text-red-400",
};

export function Queue() {
  const tracks = useQueueStore((s) => s.tracks);
  const add = useQueueStore((s) => s.add);
  const remove = useQueueStore((s) => s.remove);
  const requestPlay = useAudioStore((s) => s.requestPlay);
  const [input, setInput] = useState("");

  function submit() {
    const q = input.trim();
    if (!q) return;
    add(q);
    setInput("");
  }

  return (
    <div className="w-[440px] flex flex-col gap-3">
      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="artysta, tytuł..."
          className="flex-1 rounded-xl bg-white/8 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:bg-white/12 transition-colors"
        />
        <button
          onClick={submit}
          className="rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          dodaj
        </button>
      </div>

      {/* List */}
      {tracks.length > 0 && (
        <div className="flex flex-col gap-1">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2.5"
            >
              <span className="flex-1 truncate text-sm text-white/80">
                {track.query}
              </span>
              <span className={`text-xs shrink-0 ${STATUS_COLOR[track.status]}`}>
                {track.error ?? STATUS_LABEL[track.status]}
              </span>
              {track.status === "ready" && track.localPath && (
                <button
                  onClick={() => requestPlay(track.localPath!)}
                  className="text-white/40 hover:text-white transition-colors shrink-0"
                >
                  <Play className="size-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={() => remove(track.id)}
                className="text-white/30 hover:text-white/70 transition-colors shrink-0"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
