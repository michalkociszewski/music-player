import { create } from "zustand";

interface AudioStore {
  isPlaying: boolean;
  setPlaying: (v: boolean) => void;
  toggle: () => void;
  _setToggle: (fn: () => void) => void;
  // play a specific local path immediately
  playRequest: string | null;
  requestPlay: (path: string) => void;
  clearPlayRequest: () => void;
  // bump to trigger library refresh in player
  libraryVersion: number;
  bumpLibrary: () => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  isPlaying: false,
  setPlaying: (v) => set({ isPlaying: v }),
  toggle: () => {},
  _setToggle: (fn) => set({ toggle: fn }),
  playRequest: null,
  requestPlay: (path) => set({ playRequest: path }),
  clearPlayRequest: () => set({ playRequest: null }),
  libraryVersion: 0,
  bumpLibrary: () => set((s) => ({ libraryVersion: s.libraryVersion + 1 })),
}));
