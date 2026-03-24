/**
 * fastify.ts
 *
 * Fastify plugin adapter for @agentpass/middleware.
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 *   import Fastify from "fastify";
 *   import { agentPassPlugin } from "@agentpass/middleware/fastify";
 *
 *   const app = Fastify();
 *   await app.register(agentPassPlugin, {
 *     secret: process.env.AGENTPASS_SHARED_SECRET!,
 *   });
 *
 *   app.get("/api/prices", async (req, reply) => {
 *     if (req.agentContext?.grants.replacesCaptcha) {
 *       // skip captcha
 *     }
 *     return { prices: [...] };
 *   });
 *
 * Route-level guard (hook):
 * ─────────────────────────────────────────────────────────────────────────────
 *   app.get("/sensitive", {
 *     preHandler: app.requireAgent()
 *   }, handler);
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  verifyAgentRequest,
  buildAcceptedHeaders,
} from "./verify.js";
import type { MiddlewareOptions, VerifiedAgentContext } from "./types.js";

// ─── Fastify type augmentation ─────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    /** Set by agentPassPlugin when a verified AgentPass request is present */
    agentContext?: VerifiedAgentContext;
  }
  interface FastifyInstance {
    /** Returns a preHandler hook that enforces a verified AgentPass passport */
    requireAgent(): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export interface FastifyPluginOptions extends MiddlewareOptions {}

/**
 * Fastify plugin that verifies AgentPass headers on every request.
 *
 * Register once at the app level.  Access req.agentContext in route handlers.
 */
export const agentPassPlugin: FastifyPluginAsync<FastifyPluginOptions> = async (
  fastify,
  options
) => {
  // ── Add request decorator ────────────────────────────────────────────────
  fastify.decorateRequest("agentContext", null);

  // ── onRequest hook — runs on every incoming request ─────────────────────
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = verifyAgentRequest(
      request.headers as Record<string, string | string[] | undefined>,
      options
    );

    if (decision.verified && decision.context) {
      request.agentContext = decision.context;

      // Set protocol response headers
      const responseHeaders = buildAcceptedHeaders(decision.context);
      for (const [key, value] of Object.entries(responseHeaders)) {
        void reply.header(key, value);
      }

      // Run site-specific callback if provided
      if (options.onVerifiedAgent) {
        try {
          await options.onVerifiedAgent(decision.context);
        } catch (err) {
          request.log.error({ err }, "[AgentPass] onVerifiedAgent callback error");
        }
      }
    } else if (
      options.allowUnauthenticated === false &&
      decision.isAgent &&
      !decision.verified
    ) {
      await reply.status(403).send({
        error: "AgentPass verification failed",
        reason: decision.reason,
        protocol: "agentpass/1.0",
      });
    }
  });

  // ── requireAgent decorator ───────────────────────────────────────────────
  fastify.decorate(
    "requireAgent",
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.agentContext) {
          await reply.status(403).send({
            error: "AgentPass passport required",
            protocol: "agentpass/1.0",
          });
        }
      }
  );
};

export default agentPassPlugin;
export type { MiddlewareOptions, VerifiedAgentContext };
