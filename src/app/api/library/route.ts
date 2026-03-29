import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";

const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads", "slskd");
const AUDIO_EXT = new Set([".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wav"]);

function scan(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name === "incomplete") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scan(full));
    } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

export async function GET() {
  const files = scan(DOWNLOADS_DIR);
  return NextResponse.json({ files });
}
