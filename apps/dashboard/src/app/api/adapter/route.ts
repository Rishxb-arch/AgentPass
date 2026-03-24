import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const endpoint = req.nextUrl.searchParams.get("endpoint") ?? "execute";

    const res = await fetch(`${SERVER_URL}/adapter/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server unreachable — is apps/server running on port 3002?" },
      { status: 503 }
    );
  }
}
