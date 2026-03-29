import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { searchAndDownload } from "@/lib/slskd";

const MAX_PER_MINUTE = 2;
const timestamps: number[] = [];

const SLSKD_FILES_URL = process.env.SLSKD_FILES_URL?.replace(/\/$/, "");
const USE_BLOB = !!(process.env.BLOB_READ_WRITE_TOKEN && SLSKD_FILES_URL);

function isRateLimited(): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  while (timestamps.length > 0 && timestamps[0] < windowStart) timestamps.shift();
  if (timestamps.length >= MAX_PER_MINUTE) return true;
  timestamps.push(now);
  return false;
}

function mimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".mp3": "audio/mpeg", ".flac": "audio/flac",
    ".ogg": "audio/ogg", ".m4a": "audio/mp4",
    ".aac": "audio/aac", ".wav": "audio/wav",
  };
  return map[ext] ?? "audio/mpeg";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (isRateLimited()) {
    return NextResponse.json({ error: "Rate limit: max 2 searches per minute" }, { status: 429 });
  }

  const body = (await req.json()) as { query?: string };
  if (!body.query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    // relativePath e.g. "Artist - Album/01. Song.flac"
    const relativePath = await searchAndDownload(body.query);

    if (USE_BLOB) {
      const fileUrl = `${SLSKD_FILES_URL}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Could not fetch file from file server: ${fileRes.status}`);

      const blob = await put(relativePath, fileRes.body!, {
        access: "public",
        contentType: mimeType(relativePath),
      });

      return NextResponse.json({ localPath: blob.url });
    }

    return NextResponse.json({ localPath: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("[slskd]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
