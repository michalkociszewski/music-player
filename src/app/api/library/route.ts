import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { listCompletedDownloads } from "@/lib/slskd";

const AUDIO_EXT = new Set([".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wav"]);
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

function isAudio(name: string) {
  return AUDIO_EXT.has(name.slice(name.lastIndexOf(".")).toLowerCase());
}

export async function GET() {
  try {
    if (USE_BLOB) {
      const { blobs } = await list();
      const files = blobs.filter((b) => isAudio(b.pathname)).map((b) => b.url);
      return NextResponse.json({ files });
    }

    const relativePaths = await listCompletedDownloads();
    return NextResponse.json({ files: relativePaths });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
