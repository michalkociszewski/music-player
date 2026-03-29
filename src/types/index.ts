export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type TrackStatus = "queued" | "searching" | "downloading" | "ready" | "error";

export interface QueueTrack {
  id: string;
  query: string;
  status: TrackStatus;
  artist?: string;
  title?: string;
  searchId?: string;
  slskdUsername?: string;
  slskdFilename?: string;
  localPath?: string;
  error?: string;
}

export interface SlskdSearchFile {
  filename: string;
  size: number;
  bitRate?: number;
  length?: number;
  sampleRate?: number;
}

export interface SlskdSearchResponse {
  username: string;
  files: SlskdSearchFile[];
  hasFreeUploadSlot?: boolean;
  uploadSpeed?: number;
}

export interface SlskdTransferFile {
  id: string;
  username: string;
  filename: string;
  size: number;
  state: string;
  percentComplete: number;
  localFilename?: string;
}

export type IslandView = "idle" | "compact" | "expanded";

export interface Station {
  slug: string;
  name: string;
  genre: string;
  streamUrl: string;
  fallbackUrl?: string;
  logoUrl: string;
  color: string;
  metadataEndpoint?: string;
}

export interface TrackMetadata {
  artist: string;
  title: string;
  album?: string;
  artworkUrl?: string;
}

export interface PlayerState {
  currentStation: Station | null;
  status: PlayerStatus;
  volume: number;
  isMuted: boolean;
  metadata: TrackMetadata | null;
  islandView: IslandView;

  playStation: (station: Station) => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIslandView: (view: IslandView) => void;
  setStatus: (status: PlayerStatus) => void;
  setMetadata: (metadata: TrackMetadata | null) => void;
}
