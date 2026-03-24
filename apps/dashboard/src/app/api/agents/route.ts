import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

// GET /api/agents?principalId=...  — list all agents
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const principalId = req.nextUrl.searchParams.get("principalId");
    const url = principalId
      ? `${SERVER_URL}/api/agents?principalId=${encodeURIComponent(principalId)}`
      : `${SERVER_URL}/api/agents`;

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

// POST /api/agents  — enroll a new agent
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const res = await fetch(`${SERVER_URL}/api/agents/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
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
