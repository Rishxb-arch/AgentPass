/**
 * @agentpass/middleware
 *
 * The site-side layer of the AgentPass protocol.
 *
 * Install this package on any Express, Fastify, or Next.js server to make
 * it AgentPass-aware.  Verified agents will skip CAPTCHAs, rate-limits, and
 * login walls — exactly as if a trusted employee had walked in.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                       AgentPass Protocol Flow                           │
 * │                                                                         │
 * │  AI Agent                        Your Server                            │
 * │  ─────────────────────────────   ────────────────────────────────────  │
 * │  passport = issuePassport(...)   // Install once                        │
 * │  headers  = buildAgentHeaders()  app.use(agentPass({ secret }))         │
 * │                                                                         │
 * │  fetch(url, { headers })  ──────►  agentPass() verifies HMAC           │
 * │                                    attaches req.agentContext            │
 * │                                    sets X-AgentPass-Accepted header     │
 * │                           ◄──────  skip CAPTCHA / rate-limit / login   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Quick start (Express):
 *   import { agentPass } from "@agentpass/middleware/express";
 *   app.use(agentPass({ secret: process.env.AGENTPASS_SHARED_SECRET! }));
 *
 * Quick start (Fastify):
 *   import { agentPassPlugin } from "@agentpass/middleware/fastify";
 *   await app.register(agentPassPlugin, { secret: process.env.AGENTPASS_SHARED_SECRET! });
 *
 * Quick start (Next.js — middleware.ts):
 *   import { withAgentPass } from "@agentpass/middleware/nextjs";
 *   export const middleware = withAgentPass({ secret: process.env.AGENTPASS_SHARED_SECRET! });
 */

// ─── Core verification (framework-agnostic) ────────────────────────────────
export {
  verifyAgentRequest,
  parseAgentPassHeaders,
  computeGrants,
  buildAcceptedHeaders,
  tierAtLeast,
  // Header name constants
  HEADER_PASSPORT,
  HEADER_KYA_SCORE,
  HEADER_TIER,
  HEADER_PRINCIPAL,
  HEADER_CAPABILITIES_HASH,
  HEADER_VERSION,
  HEADER_TIMESTAMP,
  HEADER_SIGNATURE,
  HEADER_DELEGATION,
  RESPONSE_ACCEPTED,
  RESPONSE_GRANTED_TIER,
  RESPONSE_BYPASSED,
} from "./verify.js";

// ─── Types ─────────────────────────────────────────────────────────────────
export type {
  AgentPassDecision,
  AgentPassGrants,
  MiddlewareOptions,
  ParsedAgentPassHeaders,
  VerifiedAgentContext,
  // Re-exported from @agentpass/core
  AgentCapability,
  AgentTier,
  AgentPassport,
} from "./types.js";
