import { NextResponse } from "next/server";
import { stations } from "@/lib/stations";

export function GET() {
  return NextResponse.json(stations);
}
