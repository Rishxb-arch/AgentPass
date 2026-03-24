/**
 * express.ts
 *
 * Express / Connect middleware adapter for @agentpass/middleware.
 *
 * Usage (app-level — verify every request):
 * ─────────────────────────────────────────────────────────────────────────────
 *   import express from "express";
 *   import { agentPass } from "@agentpass/middleware/express";
 *
 *   const app = express();
 *   app.use(agentPass({ secret: process.env.AGENTPASS_SHARED_SECRET! }));
 *
 *   app.get("/data", (req, res) => {
 *     if (req.agentContext?.grants.replacesCaptcha) {
 *       // skip your CAPTCHA gate
 *     }
 *     res.json({ data: "..." });
 *   });
 *
 * Usage (route-level — require a verified agent):
 * ─────────────────────────────────────────────────────────────────────────────
 *   import { requireAgent } from "@agentpass/middleware/express";
 *
 *   const secret = process.env.AGENTPASS_SHARED_SECRET!;
 *   app.get("/api/prices", requireAgent({ secret }), (req, res) => {
 *     // Only reachable with a verified AgentPass passport
 *     res.json({ prices: [...] });
 *   });
 *
 * TypeScript augmentation — add req.agentContext to Express.Request:
 * ─────────────────────────────────────────────────────────────────────────────
 *   declare global {
 *     namespace Express {
 *       interface Request {
 *         agentContext?: import("@agentpass/middleware").VerifiedAgentContext;
 *       }
 *     }
 *   }
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  verifyAgentRequest,
  buildAcceptedHeaders,
} from "./verify.js";
import type { MiddlewareOptions, VerifiedAgentContext } from "./types.js";

// ─── Request augmentation ──────────────────────────────────────────────────

/**
 * Extend the Express Request type with agentContext.
 *
 * In your application, add this to a .d.ts file to make it available globally:
 *
 *   declare global {
 *     namespace Express {
 *       interface Request {
 *         agentContext?: import("@agentpass/middleware").VerifiedAgentContext;
 *       }
 *     }
 *   }
 */
export type AgentPassRequest = Request & {
  agentContext?: VerifiedAgentContext;
};

// ─── agentPass() — the primary middleware ──────────────────────────────────

/**
 * Express middleware factory that parses and verifies AgentPass headers on
 * every request.  Attaches req.agentContext when verification succeeds.
 *
 * Unverified requests are passed through (call requireAgent() on specific
 * routes to enforce agent-only access).
 */
export function agentPass(options: MiddlewareOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const decision = verifyAgentRequest(
      req.headers as Record<string, string | string[] | undefined>,
      options
    );

    if (decision.verified && decision.context) {
      // Attach context to request for downstream handlers
      (req as AgentPassRequest).agentContext = decision.context;

      // Set protocol response headers so agent knows it was recognised
      const responseHeaders = buildAcceptedHeaders(decision.context);
      for (const [key, value] of Object.entries(responseHeaders)) {
        res.setHeader(key, value);
      }

      // Run site-specific callback if provided
      if (options.onVerifiedAgent) {
        try {
          await options.onVerifiedAgent(decision.context);
        } catch (err) {
          // Callback errors are non-fatal — log and continue
          console.error("[AgentPass] onVerifiedAgent callback error:", err);
        }
      }
    }

    // Always call next() unless allowUnauthenticated is explicitly false
    // and the request is an unverified agent (has headers but failed).
    if (
      options.allowUnauthenticated === false &&
      decision.isAgent &&
      !decision.verified
    ) {
      res.status(403).json({
        error: "AgentPass verification failed",
        reason: decision.reason,
        protocol: "agentpass/1.0",
      });
      return;
    }

    next();
  };
}

// ─── requireAgent() — route-level guard ───────────────────────────────────

/**
 * Route-level middleware that returns 403 unless the request carries a
 * valid AgentPass passport.  Compose after agentPass() or standalone.
 *
 * @example
 *   app.get("/api/prices", requireAgent({ secret }), handler)
 */
export function requireAgent(options: MiddlewareOptions): RequestHandler {
  const verify = agentPass({ ...options, allowUnauthenticated: false });
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(req as AgentPassRequest).agentContext) {
      // agentPass() not upstream — run inline verification
      await verify(req, res, next);
      return;
    }
    next();
  };
}

// ─── requireGrant() — grant-level guard ──────────────────────────────────

type GrantKey = keyof Pick<
  VerifiedAgentContext["grants"],
  "replacesCaptcha" | "replacesRateLimit" | "replacesLoginWall" | "replacesMFA"
>;

/**
 * Route-level middleware that requires a specific grant.
 * The request must already have been processed by agentPass().
 *
 * @example
 *   app.get("/checkout", requireGrant("replacesCaptcha"), handler)
 */
export function requireGrant(grant: GrantKey): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = (req as AgentPassRequest).agentContext;
    if (!ctx || !ctx.grants[grant]) {
      res.status(403).json({
        error: `AgentPass grant "${grant}" required`,
        protocol: "agentpass/1.0",
      });
      return;
    }
    next();
  };
}

// ─── Convenience re-export ─────────────────────────────────────────────────
export type { MiddlewareOptions, VerifiedAgentContext };
