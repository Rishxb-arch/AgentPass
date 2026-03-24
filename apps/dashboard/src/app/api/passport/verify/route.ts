import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

// GET /api/passport/verify?token=agentpass.xxx.yyy
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const res = await fetch(
      `${SERVER_URL}/api/passport/verify?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server unreachable" },
      { status: 503 }
    );
  }
}

// POST /api/passport/verify  { token }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const res = await fetch(`${SERVER_URL}/api/passport/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server unreachable" },
      { status: 503 }
    );
  }
}
