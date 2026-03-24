/**
 * types.ts
 *
 * All types for @agentpass/middleware.
 *
 * The middleware sits on the site's side of the protocol:
 *   1. Receives an incoming HTTP request with X-AgentPass-* headers
 *   2. Verifies the cryptographic passport (HMAC-SHA256, same shared secret)
 *   3. Evaluates what verification steps to bypass (captcha / rate-limit / login-wall)
 *   4. Attaches a VerifiedAgentContext to the request for downstream handlers
 *   5. Sets X-AgentPass-Accepted / X-AgentPass-Bypassed response headers
 */

import type { AgentCapability, AgentTier, AgentPassport } from "@agentpass/core";

// ─── Grants ───────────────────────────────────────────────────────────────────

/**
 * What the site agrees to skip / relax for a verified agent.
 * These are populated by evaluating the agent's KYA score and tier
 * against the site's threshold configuration.
 */
export interface AgentPassGrants {
  /** Agent may skip CAPTCHA challenges */
  replacesCaptcha: boolean;
  /** Agent is exempt from strict rate-limiting */
  replacesRateLimit: boolean;
  /** Agent may access pages that normally require a login */
  replacesLoginWall: boolean;
  /** Agent is exempt from MFA / 2FA prompts */
  replacesMFA: boolean;
  /** ISO timestamp — when grants were computed */
  grantedAt: string;
}

// ─── Decision ─────────────────────────────────────────────────────────────────

/**
 * The full verification decision returned by verifyAgentRequest().
 * framework adapters translate this into middleware behaviour.
 */
export interface AgentPassDecision {
  /** True when valid X-AgentPass-* headers were present */
  isAgent: boolean;
  /** True when passport + credentials were cryptographically valid */
  verified: boolean;
  /** Populated only when verified === true */
  context?: VerifiedAgentContext;
  /** Human-readable reason for rejection (when verified === false) */
  reason?: string;
}

// ─── Verified context ─────────────────────────────────────────────────────────

/**
 * Attached to the request (e.g. req.agentContext in Express) so route
 * handlers can read who the agent is and what it's allowed to skip.
 */
export interface VerifiedAgentContext {
  agentId: string;
  principalId: string;
  name: string;
  tier: AgentTier;
  kyaScore: number;
  capabilities: AgentCapability[];
  grants: AgentPassGrants;
  /** The fully deserialized + verified passport */
  passport: AgentPassport;
  /** ISO timestamp of when this request was verified */
  verifiedAt: string;
}

// ─── Parsed raw headers ───────────────────────────────────────────────────────

/**
 * The raw AgentPass header values extracted from an HTTP request.
 * All values are strings at this stage — parsed/validated in verify.ts.
 */
export interface ParsedAgentPassHeaders {
  passportToken: string;
  kyaScore: number;
  tier: string;
  principalId: string;
  capabilitiesHash: string;
  version: string;
  timestamp: string;
  signature: string;
  delegationToken?: string;
}

// ─── Middleware options ────────────────────────────────────────────────────────

/**
 * Shared options used by all framework adapters (Express, Fastify, Next.js).
 */
export interface MiddlewareOptions {
  /**
   * HMAC-SHA256 shared secret — must match the secret used by the
   * AgentPass issuer (set via setSecret() on the issuing server or SDK).
   *
   * Best practice: load from AGENTPASS_SHARED_SECRET environment variable.
   */
  secret: string;

  /**
   * KYA score at or above which CAPTCHA is skipped.
   * @default 70
   */
  captchaThreshold?: number;

  /**
   * KYA score at or above which rate-limit exemption is granted.
   * @default 60
   */
  rateLimitThreshold?: number;

  /**
   * Minimum tier required to bypass login walls.
   * @default "trusted"
   */
  loginWallMinTier?: AgentTier;

  /**
   * Minimum tier required to bypass MFA prompts.
   * @default "verified"
   */
  mfaMinTier?: AgentTier;

  /**
   * Minimum KYA score a request must present to be accepted at all.
   * Requests below this score are treated as unverified.
   * @default 0
   */
  minKyaScore?: number;

  /**
   * Minimum tier a request must present to be accepted.
   * Requests below this tier are treated as unverified.
   * @default "basic"
   */
  minTier?: AgentTier;

  /**
   * If set, agents must have ALL of these capabilities, otherwise the
   * request is rejected (403).
   */
  requiredCapabilities?: AgentCapability[];

  /**
   * Callback invoked after successful verification.
   * Use this to attach the context to the request, log the event, or
   * run site-specific logic (e.g. look up agent subscription).
   */
  onVerifiedAgent?: (ctx: VerifiedAgentContext) => Promise<void> | void;

  /**
   * If true, requests without AgentPass headers are still allowed through
   * (the middleware becomes opt-in rather than required).
   * @default true
   */
  allowUnauthenticated?: boolean;
}

// ─── Re-export core types used by consumers ───────────────────────────────────

export type { AgentCapability, AgentTier, AgentPassport };
