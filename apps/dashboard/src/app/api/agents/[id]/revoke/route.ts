import { NextRequest, NextResponse } from "next/server";

const SERVER_URL = process.env.AGENTPASS_SERVER_URL ?? "http://localhost:3002";

// POST /api/agents/:id/revoke
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const res = await fetch(`${SERVER_URL}/api/agents/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
