import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";

export type TrackStatus = "pending" | "searching" | "ready" | "error";

export interface QueueTrack {
  id: string;
  query: string;
  status: TrackStatus;
  localPath?: string;
  error?: string;
  addedAt: number;
}

interface QueueStore {
  tracks: QueueTrack[];
  add: (query: string) => void;
  update: (id: string, patch: Partial<QueueTrack>) => void;
  remove: (id: string) => void;
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set) => ({
      tracks: [],
      add: (query) =>
        set((s) => ({
          tracks: [
            ...s.tracks,
            { id: uuid(), query, status: "pending", addedAt: Date.now() },
          ],
        })),
      update: (id, patch) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      remove: (id) =>
        set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
    }),
    { name: "radio-queue" }
  )
);
