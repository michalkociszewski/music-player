import os from "os";
import path from "path";
import type { SlskdSearchFile, SlskdSearchResponse, SlskdTransferFile } from "@/types";

const SLSKD_BASE = "http://localhost:5030/api/v0";
const SLSKD_USER = process.env.SLSKD_USER ?? "slskd";
const SLSKD_PASS = process.env.SLSKD_PASS ?? "slskd";
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads", "slskd");

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
const POLL_INTERVAL_MS = 2000;
const SEARCH_TIMEOUT_MS = 35_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const res = await fetch(`${SLSKD_BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: SLSKD_USER, password: SLSKD_PASS }),
  });
  if (!res.ok) throw new Error("slskd auth failed");
  const data = (await res.json()) as { token: string; expires: number };
  cachedToken = data.token;
  tokenExpiresAt = data.expires * 1000 - 60_000;
  return cachedToken;
}

async function headers(): Promise<HeadersInit> {
  return { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" };
}

// slskd saves files to: DOWNLOADS_DIR / (path minus first component, backslashes→slashes)
function deriveLocalPath(slskdFilename: string): string {
  const parts = slskdFilename.replace(/\\/g, "/").split("/");
  const withoutShareRoot = parts.slice(1).join("/");
  return path.join(DOWNLOADS_DIR, withoutShareRoot);
}

function audioExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf(".")).toLowerCase();
}

function fileScore(file: SlskdSearchFile, query: string, uploadSpeed: number): number {
  const ext = audioExtension(file.filename);
  if (!AUDIO_EXTENSIONS.has(ext)) return -1;

  const name = file.filename.toLowerCase();
  const termMatches = query.toLowerCase().split(" ").filter((t) => name.includes(t)).length;
  const formatScore = ext === ".flac" ? 2 : ext === ".mp3" ? 3 : 1; // prefer mp3 for compat
  const speedScore = Math.min(uploadSpeed / 1_000_000, 5);
  const sizeScore = file.size < 20 * 1024 * 1024 ? 1 : 0; // prefer <20MB

  return termMatches * 10 + formatScore + speedScore + sizeScore;
}

async function startSearch(query: string): Promise<string> {
  const res = await fetch(`${SLSKD_BASE}/searches`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ searchText: query }),
  });
  if (!res.ok) throw new Error(`Search start failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

async function waitForSearchResults(searchId: string): Promise<SlskdSearchResponse[]> {
  const deadline = Date.now() + SEARCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${SLSKD_BASE}/searches/${searchId}?includeResponses=true`, {
      headers: await headers(),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { state: string; responses: SlskdSearchResponse[] };
    if (data.state.startsWith("Completed") && (data.responses?.length ?? 0) > 0)
      return data.responses;
  }
  // Return whatever we got so far even if not completed
  const res = await fetch(`${SLSKD_BASE}/searches/${searchId}?includeResponses=true`, {
    headers: await headers(),
  });
  const data = (await res.json()) as { responses: SlskdSearchResponse[] };
  return data.responses ?? [];
}

function pickBestFile(responses: SlskdSearchResponse[], query: string): { username: string; file: SlskdSearchFile } | null {
  let best: { username: string; file: SlskdSearchFile; score: number } | null = null;
  for (const resp of responses) {
    for (const file of resp.files) {
      const score = fileScore(file, query, resp.uploadSpeed ?? 0);
      if (score > (best?.score ?? -1)) {
        best = { username: resp.username, file, score };
      }
    }
  }
  return best ?? null;
}

async function initiateDownload(username: string, file: SlskdSearchFile): Promise<void> {
  const res = await fetch(`${SLSKD_BASE}/transfers/downloads/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify([{ filename: file.filename, size: file.size }]),
  });
  if (!res.ok) throw new Error(`Download initiation failed: ${res.status}`);
}

async function pollUntilDownloaded(username: string, filename: string): Promise<string> {
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${SLSKD_BASE}/transfers/downloads/${encodeURIComponent(username)}`, {
      headers: await headers(),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { directories: Array<{ files: SlskdTransferFile[] }> };
    for (const dir of data.directories ?? []) {
      const match = dir.files.find((f) => f.filename === filename);
      if (!match) continue;
      if (match.state.includes("Succeeded")) return deriveLocalPath(filename);
      if (match.state.includes("Error") || match.state.includes("Cancelled")) {
        throw new Error(`Transfer failed: ${match.state}`);
      }
    }
  }
  throw new Error("Download timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function searchAndDownload(query: string): Promise<string> {
  const searchId = await startSearch(query);
  const responses = await waitForSearchResults(searchId);

  const picked = pickBestFile(responses, query);
  if (!picked) throw new Error(`No results for: ${query}`);

  await initiateDownload(picked.username, picked.file);
  return pollUntilDownloaded(picked.username, picked.file.filename);
}
