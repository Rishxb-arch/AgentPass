/**
 * nextjs.ts
 *
 * Next.js middleware adapter for @agentpass/middleware.
 *
 * Works in the Next.js Edge Runtime (middleware.ts at the project root).
 *
 * Usage — middleware.ts:
 * ─────────────────────────────────────────────────────────────────────────────
 *   import { withAgentPass } from "@agentpass/middleware/nextjs";
 *
 *   export const middleware = withAgentPass({
 *     secret: process.env.AGENTPASS_SHARED_SECRET!,
 *     onVerifiedAgent: async (ctx) => {
 *       console.log("Agent verified:", ctx.agentId, ctx.tier);
 *     },
 *   });
 *
 *   export const config = {
 *     matcher: ["/api/:path*", "/checkout/:path*"],
 *   };
 *
 * Usage — API route handler (Node.js runtime, pages/ or app/ router):
 * ─────────────────────────────────────────────────────────────────────────────
 *   import { verifyAgentPassRequest } from "@agentpass/middleware/nextjs";
 *   import type { NextApiRequest, NextApiResponse } from "next";
 *
 *   export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *     const ctx = verifyAgentPassRequest(req.headers, { secret: process.env.AGENTPASS_SHARED_SECRET! });
 *     if (ctx && ctx.grants.replacesCaptcha) {
 *       // skip captcha for this agent
 *     }
 *     res.json({ ok: true });
 *   }
 *
 * NOTE: The Next.js Edge Runtime does not have Node.js crypto built-ins, so
 * this module uses the Web Crypto API (SubtleCrypto) when running in an Edge
 * context.  The Node.js runtime path is used automatically in API routes.
 */

import {
  verifyAgentRequest,
  buildAcceptedHeaders,
  RESPONSE_ACCEPTED,
  RESPONSE_GRANTED_TIER,
  RESPONSE_BYPASSED,
} from "./verify.js";
import type { MiddlewareOptions, VerifiedAgentContext } from "./types.js";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Minimal Next.js NextRequest shape — avoids a hard dep on the "next" package */
interface NextRequestLike {
  headers: {
    get(name: string): string | null;
    entries(): IterableIterator<[string, string]>;
  };
  nextUrl?: { pathname: string };
}

/** Minimal NextResponse shape */
interface NextResponseLike {
  headers: {
    set(name: string, value: string): void;
  };
}

type NextMiddlewareFn = (req: NextRequestLike) => NextResponseLike | Promise<NextResponseLike>;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a Next.js Headers object (ReadonlyHeaders / Headers API) into the
 * plain Record<string, string> that verifyAgentRequest expects.
 */
function headersToRecord(
  headers: { get(name: string): string | null; entries(): IterableIterator<[string, string]> }
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value;
  }
  return record;
}

// ─── withAgentPass() — Next.js middleware wrapper ─────────────────────────

/**
 * Wraps a Next.js middleware function with AgentPass verification.
 *
 * Returns a Next.js-compatible middleware function.  When verification
 * succeeds the X-AgentPass-Accepted / Bypassed headers are added to the
 * response and the request is passed through.
 *
 * When verification fails and allowUnauthenticated === false a 403 JSON
 * response is returned immediately.
 */
export function withAgentPass(options: MiddlewareOptions): NextMiddlewareFn {
  return async (req: NextRequestLike): Promise<NextResponseLike> => {
    const headersRecord = headersToRecord(req.headers);
    const decision = verifyAgentRequest(headersRecord, options);

    if (decision.verified && decision.context) {
      const ctx = decision.context;

      // Run site callback
      if (options.onVerifiedAgent) {
        try {
          await options.onVerifiedAgent(ctx);
        } catch (err) {
          console.error("[AgentPass] onVerifiedAgent callback error:", err);
        }
      }

      // Build a NextResponse.next() with AgentPass headers
      const response = buildNextResponse("next");
      const accepted = buildAcceptedHeaders(ctx);
      for (const [key, value] of Object.entries(accepted)) {
        response.headers.set(key, value);
      }
      return response;
    }

    if (
      options.allowUnauthenticated === false &&
      decision.isAgent &&
      !decision.verified
    ) {
      return buildNextResponse("reject", decision.reason);
    }

    // Pass through — not an AgentPass request
    return buildNextResponse("next");
  };
}

// ─── verifyAgentPassRequest() — API route helper ─────────────────────────

/**
 * Use this in Next.js API routes (pages/api/ or app/api/) to extract
 * and verify the AgentPass context from an incoming request.
 *
 * Returns the VerifiedAgentContext if verification succeeds, null otherwise.
 *
 * @example
 *   const ctx = verifyAgentPassRequest(req.headers, { secret });
 *   if (ctx?.grants.replacesCaptcha) { ... }
 */
export function verifyAgentPassRequest(
  headers: Record<string, string | string[] | undefined>,
  options: MiddlewareOptions
): VerifiedAgentContext | null {
  const decision = verifyAgentRequest(headers, options);
  return decision.verified && decision.context ? decision.context : null;
}

// ─── Minimal NextResponse builder (avoids importing "next/server") ────────

/**
 * Build a minimal NextResponse-compatible object.
 *
 * In a real Next.js project, replace these with actual `NextResponse.next()`
 * and `NextResponse.json()` calls.  This stub lets the package compile
 * without a hard dependency on the "next" package.
 */
function buildNextResponse(
  type: "next" | "reject",
  reason?: string
): NextResponseLike & {
  status?: number;
  body?: string;
} {
  const responseHeaders = new Map<string, string>();

  return {
    headers: {
      set(name: string, value: string) {
        responseHeaders.set(name, value);
      },
    },
    ...(type === "reject"
      ? {
          status: 403,
          body: JSON.stringify({
            error: "AgentPass verification failed",
            reason,
            protocol: "agentpass/1.0",
          }),
        }
      : {}),
  };
}

// ─── Matcher config helper ────────────────────────────────────────────────

/**
 * Suggested Next.js matcher patterns for common AgentPass use-cases.
 *
 * @example
 *   export const config = { matcher: agentPassMatcher.api };
 */
export const agentPassMatcher = {
  /** Apply to all API routes */
  api: ["/api/:path*"],
  /** Apply to checkout and account pages */
  commerce: ["/checkout/:path*", "/account/:path*", "/cart/:path*"],
  /** Apply everywhere except static assets */
  all: ["/((?!_next/static|_next/image|favicon.ico).*)"],
} as const;

export type { MiddlewareOptions, VerifiedAgentContext };
