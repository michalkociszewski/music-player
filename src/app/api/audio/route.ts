import { NextRequest, NextResponse } from "next/server";
import { DOWNLOADS_DIR } from "@/lib/slskd";
import path from "path";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";

const SLSKD_FILES_URL = process.env.SLSKD_FILES_URL?.replace(/\/$/, "");

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const relative = decodeURIComponent(filePath);
  const ext = path.extname(relative).toLowerCase();
  const contentType = MIME[ext] ?? "audio/mpeg";

  // Remote mode: proxy from SLSKD_FILES_URL
  if (SLSKD_FILES_URL) {
    const fileUrl = `${SLSKD_FILES_URL}/${relative.split("/").map(encodeURIComponent).join("/")}`;
    const range = req.headers.get("range");
    const upstream = await fetch(fileUrl, {
      headers: range ? { Range: range } : {},
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        ...(upstream.headers.get("Content-Length") ? { "Content-Length": upstream.headers.get("Content-Length")! } : {}),
        ...(upstream.headers.get("Content-Range") ? { "Content-Range": upstream.headers.get("Content-Range")! } : {}),
      },
    });
  }

  // Local mode: serve from filesystem
  const localPath = path.join(DOWNLOADS_DIR, relative);
  const resolved = path.resolve(localPath);
  if (!resolved.startsWith(DOWNLOADS_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stat = statSync(resolved);
    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const stream = createReadStream(resolved, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Type": contentType,
        },
      });
    }

    const stream = createReadStream(resolved);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
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
