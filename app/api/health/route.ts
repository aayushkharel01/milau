import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "milau",
    timestamp: new Date().toISOString()
  });
}
