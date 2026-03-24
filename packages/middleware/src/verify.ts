/**
 * verify.ts
 *
 * Framework-agnostic AgentPass request verification.
 *
 * This is the heart of @agentpass/middleware.  All framework adapters
 * (Express, Fastify, Next.js) delegate to verifyAgentRequest() which:
 *
 *   1. Extracts X-AgentPass-* headers
 *   2. Deserializes the passport token
 *   3. Cryptographically verifies both the passport signature and the
 *      trust credentials (HMAC-SHA256, same shared secret as the issuer)
 *   4. Evaluates what to bypass (captcha / rate-limit / login-wall / MFA)
 *   5. Returns an AgentPassDecision ready for the framework adapter to act on
 */

import {
  setPassportSecret,
  deserializePassport,
  verifyPassport,
  verifyTrustCredentials,
  tierAtLeast,
} from "@agentpass/core";
import type { AgentTier, TrustCredentials } from "@agentpass/core";
import type {
  AgentPassDecision,
  AgentPassGrants,
  MiddlewareOptions,
  ParsedAgentPassHeaders,
  VerifiedAgentContext,
} from "./types.js";

// ─── Header name constants ─────────────────────────────────────────────────

export const HEADER_PASSPORT = "x-agentpass-passport";
export const HEADER_KYA_SCORE = "x-agentpass-kya-score";
export const HEADER_TIER = "x-agentpass-tier";
export const HEADER_PRINCIPAL = "x-agentpass-principal";
export const HEADER_CAPABILITIES_HASH = "x-agentpass-capabilities-hash";
export const HEADER_VERSION = "x-agentpass-version";
export const HEADER_TIMESTAMP = "x-agentpass-timestamp";
export const HEADER_SIGNATURE = "x-agentpass-signature";
export const HEADER_DELEGATION = "x-agentpass-delegation";

/** Response headers AgentPass-aware sites set to acknowledge agent requests */
export const RESPONSE_ACCEPTED = "x-agentpass-accepted";
export const RESPONSE_GRANTED_TIER = "x-agentpass-granted-tier";
export const RESPONSE_BYPASSED = "x-agentpass-bypassed";

// ─── Default thresholds ───────────────────────────────────────────────────────

const DEFAULT_CAPTCHA_THRESHOLD = 70;
const DEFAULT_RATE_LIMIT_THRESHOLD = 60;
const DEFAULT_LOGIN_WALL_MIN_TIER: AgentTier = "trusted";
const DEFAULT_MFA_MIN_TIER: AgentTier = "verified";
const DEFAULT_MIN_KYA_SCORE = 0;
const DEFAULT_MIN_TIER: AgentTier = "basic";

// ─── Tier order (needed without circular import) ───────────────────────────

const TIER_ORDER: Record<AgentTier, number> = {
  basic: 0,
  verified: 1,
  trusted: 2,
  sovereign: 3,
};

function tierAtLeastLocal(a: AgentTier, b: AgentTier): boolean {
  return (TIER_ORDER[a] ?? 0) >= (TIER_ORDER[b] ?? 0);
}

// ─── Header parsing ───────────────────────────────────────────────────────────

/**
 * Extract AgentPass headers from any HTTP headers object.
 * Accepts the standard Node.js `IncomingHttpHeaders` shape where values can
 * be strings or arrays of strings.
 *
 * Returns null when the mandatory Passport header is absent (i.e. not an
 * AgentPass request at all).
 */
export function parseAgentPassHeaders(
  headers: Record<string, string | string[] | undefined>
): ParsedAgentPassHeaders | null {
  // HTTP headers are case-insensitive (RFC 7230).  Normalize to lowercase so
  // this works whether headers come from Node.js (already lowercase), a raw
  // object from buildAgentHeaders() (original casing), or a test fixture.
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  const get = (name: string): string => {
    const val = normalized[name];
    if (Array.isArray(val)) return val[0] ?? "";
    return val ?? "";
  };

  const passportToken = get(HEADER_PASSPORT);
  if (!passportToken || !passportToken.startsWith("agentpass.")) {
    return null; // Not an AgentPass request
  }

  const kyaRaw = get(HEADER_KYA_SCORE);
  const kyaScore = kyaRaw ? Number(kyaRaw) : 0;

  return {
    passportToken,
    kyaScore: isNaN(kyaScore) ? 0 : kyaScore,
    tier: get(HEADER_TIER) || "basic",
    principalId: get(HEADER_PRINCIPAL),
    capabilitiesHash: get(HEADER_CAPABILITIES_HASH),
    version: get(HEADER_VERSION),
    timestamp: get(HEADER_TIMESTAMP),
    signature: get(HEADER_SIGNATURE),
    ...(get(HEADER_DELEGATION) ? { delegationToken: get(HEADER_DELEGATION) } : {}),
  };
}

// ─── Grant computation ────────────────────────────────────────────────────────

/**
 * Decide what verification challenges an agent is allowed to skip,
 * based on its KYA score and tier.
 */
export function computeGrants(
  kyaScore: number,
  tier: AgentTier,
  options: MiddlewareOptions
): AgentPassGrants {
  const captchaThreshold = options.captchaThreshold ?? DEFAULT_CAPTCHA_THRESHOLD;
  const rateLimitThreshold = options.rateLimitThreshold ?? DEFAULT_RATE_LIMIT_THRESHOLD;
  const loginWallMinTier = options.loginWallMinTier ?? DEFAULT_LOGIN_WALL_MIN_TIER;
  const mfaMinTier = options.mfaMinTier ?? DEFAULT_MFA_MIN_TIER;

  return {
    replacesCaptcha: kyaScore >= captchaThreshold,
    replacesRateLimit: kyaScore >= rateLimitThreshold,
    replacesLoginWall: tierAtLeastLocal(tier, loginWallMinTier),
    replacesMFA: tierAtLeastLocal(tier, mfaMinTier),
    grantedAt: new Date().toISOString(),
  };
}

// ─── Core verification ────────────────────────────────────────────────────────

/**
 * Fully verify an AgentPass request.
 *
 * Call this once per request from your framework adapter.
 * Returns an AgentPassDecision — the adapter then:
 *   - Attaches decision.context to the request object
 *   - Sets X-AgentPass-Accepted / X-AgentPass-Bypassed response headers
 *   - Calls next() (or passes 403 if the route requires a verified agent)
 *
 * @param headers   Raw HTTP headers (lowercase keys, Node.js IncomingHttpHeaders shape)
 * @param options   Middleware configuration (secret, thresholds, callbacks)
 */
export function verifyAgentRequest(
  headers: Record<string, string | string[] | undefined>,
  options: MiddlewareOptions
): AgentPassDecision {
  // ── 1. Set shared secret on the core module ────────────────────────────────
  // This is idempotent — calling setSecret multiple times is fine as long as
  // the same secret is used.  The secret is module-level in @agentpass/core.
  setPassportSecret(options.secret);

  // ── 2. Parse headers ───────────────────────────────────────────────────────
  const parsed = parseAgentPassHeaders(headers);
  if (!parsed) {
    return { isAgent: false, verified: false };
  }

  // ── 3. Deserialize the passport token ─────────────────────────────────────
  const passport = deserializePassport(parsed.passportToken);
  if (!passport) {
    return {
      isAgent: true,
      verified: false,
      reason: "Malformed passport token",
    };
  }

  // ── 4. Verify passport signature + expiry ─────────────────────────────────
  const passportCheck = verifyPassport(passport);
  if (!passportCheck.valid) {
    return {
      isAgent: true,
      verified: false,
      reason: passportCheck.reason ?? "Passport verification failed",
    };
  }

  // ── 5. Reconstruct TrustCredentials from headers + derive principalVerified
  //       This must match exactly what buildTrustCredentials() produced on the
  //       agent side, so that the HMAC recomputation passes.
  const principalVerified =
    parsed.principalId !== "" && parsed.principalId !== "anonymous";

  const credentials: TrustCredentials = {
    passportToken: parsed.passportToken,
    kyaScore: parsed.kyaScore,
    tier: parsed.tier as AgentTier,
    principalVerified,
    capabilitiesHash: parsed.capabilitiesHash,
    presentedAt: parsed.timestamp,
    credentialSignature: parsed.signature,
    ...(parsed.delegationToken ? { delegationToken: parsed.delegationToken } : {}),
  };

  // ── 6. Verify trust credentials (HMAC) ────────────────────────────────────
  const credCheck = verifyTrustCredentials(credentials);
  if (!credCheck.valid) {
    return {
      isAgent: true,
      verified: false,
      reason: credCheck.reason ?? "Invalid trust credential signature",
    };
  }

  // ── 7. Apply site-level policy checks ─────────────────────────────────────
  const tier = (parsed.tier as AgentTier) ?? "basic";
  const kyaScore = parsed.kyaScore;

  const minKyaScore = options.minKyaScore ?? DEFAULT_MIN_KYA_SCORE;
  if (kyaScore < minKyaScore) {
    return {
      isAgent: true,
      verified: false,
      reason: `KYA score ${kyaScore} below minimum ${minKyaScore}`,
    };
  }

  const minTier = options.minTier ?? DEFAULT_MIN_TIER;
  if (!tierAtLeastLocal(tier, minTier)) {
    return {
      isAgent: true,
      verified: false,
      reason: `Agent tier "${tier}" below required minimum "${minTier}"`,
    };
  }

  if (options.requiredCapabilities && options.requiredCapabilities.length > 0) {
    const missing = options.requiredCapabilities.filter(
      (cap) => !passport.capabilities.includes(cap)
    );
    if (missing.length > 0) {
      return {
        isAgent: true,
        verified: false,
        reason: `Missing required capabilities: ${missing.join(", ")}`,
      };
    }
  }

  // ── 8. Compute grants ─────────────────────────────────────────────────────
  const grants = computeGrants(kyaScore, tier, options);

  // ── 9. Build context ──────────────────────────────────────────────────────
  const context: VerifiedAgentContext = {
    agentId: passport.agentId,
    principalId: passport.principalId,
    name: passport.name,
    tier,
    kyaScore,
    capabilities: passport.capabilities,
    grants,
    passport,
    verifiedAt: new Date().toISOString(),
  };

  return { isAgent: true, verified: true, context };
}

// ─── Response header builder ──────────────────────────────────────────────────

/**
 * Build the X-AgentPass-* response headers that tell the agent what was
 * accepted and what was bypassed.
 *
 * Sites set these on every response so agents know they were identified.
 */
export function buildAcceptedHeaders(ctx: VerifiedAgentContext): Record<string, string> {
  const bypassed: string[] = [];
  if (ctx.grants.replacesCaptcha) bypassed.push("captcha");
  if (ctx.grants.replacesRateLimit) bypassed.push("rate_limit");
  if (ctx.grants.replacesLoginWall) bypassed.push("login_wall");
  if (ctx.grants.replacesMFA) bypassed.push("mfa");

  return {
    [RESPONSE_ACCEPTED]: bypassed.join(",") || "none",
    [RESPONSE_GRANTED_TIER]: ctx.tier,
    [RESPONSE_BYPASSED]: bypassed.join(",") || "none",
  };
}

// Re-export tierAtLeast from core for convenience
export { tierAtLeast };
