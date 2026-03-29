import { NextRequest, NextResponse } from "next/server";
import { searchAndDownload } from "@/lib/slskd";

const MAX_PER_MINUTE = 2;
const timestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  while (timestamps.length > 0 && timestamps[0] < windowStart) timestamps.shift();
  if (timestamps.length >= MAX_PER_MINUTE) return true;
  timestamps.push(now);
  return false;
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
    const localPath = await searchAndDownload(body.query);
    return NextResponse.json({ localPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("[slskd]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
