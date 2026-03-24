import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

// GET /api/agents/:id/audit?limit=50&offset=0
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const limit = req.nextUrl.searchParams.get("limit") ?? "50";
    const offset = req.nextUrl.searchParams.get("offset") ?? "0";

    const res = await fetch(
      `${SERVER_URL}/api/agents/${id}/audit?limit=${limit}&offset=${offset}`,
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
