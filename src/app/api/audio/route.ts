import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import path from "path";
import os from "os";

const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads", "slskd");

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

function resolveSafePath(localPath: string): string | null {
  const full = localPath.startsWith("/")
    ? localPath
    : path.join(DOWNLOADS_DIR, localPath);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(DOWNLOADS_DIR) && !resolved.startsWith("/")) return null;
  return resolved;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const resolved = resolveSafePath(decodeURIComponent(filePath));
  if (!resolved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const stat = statSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME[ext] ?? "audio/mpeg";

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(resolved, { start, end });
      const readable = Readable.toWeb(stream) as ReadableStream;

      return new NextResponse(readable, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
        },
      });
    }

    const stream = createReadStream(resolved);
    const readable = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(readable, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
