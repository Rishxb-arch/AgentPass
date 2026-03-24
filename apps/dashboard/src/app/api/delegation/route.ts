import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

// GET /api/delegation?agentId=...
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const agentId = req.nextUrl.searchParams.get("agentId");
    const url = agentId
      ? `${SERVER_URL}/api/delegation?agentId=${encodeURIComponent(agentId)}`
      : `${SERVER_URL}/api/delegation`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server unreachable" },
      { status: 503 }
    );
  }
}

// POST /api/delegation  — issue a new delegation token
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const res = await fetch(`${SERVER_URL}/api/delegation`, {
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
