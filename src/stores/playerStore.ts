import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { IslandView, PlayerState, PlayerStatus, Station, TrackMetadata } from "@/types";

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      currentStation: null,
      status: "idle" as PlayerStatus,
      volume: 0.8,
      isMuted: false,
      metadata: null,
      islandView: "idle" as IslandView,

      playStation: (station: Station) =>
        set({
          currentStation: station,
          status: "loading",
          metadata: null,
          islandView: "expanded",
        }),

      stop: () =>
        set({
          status: "idle",
          metadata: null,
          islandView: "idle",
        }),

      setVolume: (volume: number) => set({ volume }),

      toggleMute: () => set((s: PlayerState) => ({ isMuted: !s.isMuted })),

      setIslandView: (islandView: IslandView) => set({ islandView }),

      setStatus: (status: PlayerStatus) => set({ status }),

      setMetadata: (metadata: TrackMetadata | null) => set({ metadata }),
    }),
    {
      name: "radio-player",
      storage: createJSONStorage(() => localStorage),
      partialize: (state: PlayerState) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        currentStation: state.currentStation,
      }),
    }
  )
);
