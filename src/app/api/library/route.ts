import { NextResponse } from "next/server";
import { listCompletedDownloads } from "@/lib/slskd";

export async function GET() {
  try {
    const files = await listCompletedDownloads();
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
