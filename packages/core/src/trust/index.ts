import { createHmac } from "node:crypto";
import {
  buildAgentHeaders,
  buildTrustCredentials,
  type AgentPassport,
  type AgentTier,
} from "../passport/index.js";
import type { KYAProfile } from "../kya/index.js";
import { evaluateVerificationReplacement } from "../kya/index.js";
import type { DelegationToken } from "../delegation/index.js";
import { serializeDelegation } from "../delegation/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SystemHandshake {
  systemId: string;
  agentPassAware: boolean;
  acceptedCredentials: string[];
  verificationBypassed: string[];
  grantedTier: AgentTier;
  handshakeAt: string;
}

// ─── Secret (shared) ─────────────────────────────────────────────────────────

let _secret = "";

export function setSecret(secret: string): void {
  _secret = secret;
}

function hmacSha256(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Present credentials to a system.
 * Returns the full X-AgentPass-* header set to inject on every request.
 * This is the trust presentation protocol — the agent presents credentials
 * proactively so systems can verify identity without human checks.
 */
export function presentCredentials(
  passport: AgentPassport,
  kyaProfile: KYAProfile,
  delegation?: DelegationToken
): Record<string, string> {
  const delegationToken = delegation
    ? serializeDelegation(delegation)
    : undefined;
  return buildAgentHeaders(passport, kyaProfile.trustScore, delegationToken);
}

/**
 * Parse a system's handshake response headers.
 * Determines whether the system is AgentPass-aware and what it accepted.
 */
export function parseSystemHandshake(
  responseHeaders: Record<string, string>,
  systemId: string
): SystemHandshake {
  const accepted = responseHeaders["x-agentpass-accepted"] ?? "";
  const grantedTierRaw = responseHeaders["x-agentpass-granted-tier"] ?? "basic";
  const agentPassAware = !!responseHeaders["x-agentpass-accepted"];

  const acceptedCredentials = accepted
    ? accepted.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const verificationBypassed: string[] = [];
  const bypassed = responseHeaders["x-agentpass-bypassed"] ?? "";
  if (bypassed) {
    verificationBypassed.push(
      ...bypassed.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  const validTiers: AgentTier[] = ["basic", "verified", "trusted", "sovereign"];
  const grantedTier: AgentTier = validTiers.includes(grantedTierRaw as AgentTier)
    ? (grantedTierRaw as AgentTier)
    : "basic";

  return {
    systemId,
    agentPassAware,
    acceptedCredentials,
    verificationBypassed,
    grantedTier,
    handshakeAt: new Date().toISOString(),
  };
}

/**
 * Evaluate whether an agent's credentials replace a given verification type.
 */
export function evaluateVerification(
  kyaProfile: KYAProfile,
  targetVerificationType: string
): boolean {
  return evaluateVerificationReplacement(kyaProfile, targetVerificationType);
}

/**
 * Build a signed verification proof the agent can present in lieu of human verification.
 * e.g. instead of solving a CAPTCHA, present this proof of KYA score >= 70.
 */
export function buildVerificationProof(
  passport: AgentPassport,
  kyaProfile: KYAProfile,
  verificationType: string
): string {
  const payload = JSON.stringify({
    agentId: passport.agentId,
    principalId: passport.principalId,
    tier: passport.tier,
    trustScore: kyaProfile.trustScore,
    verificationType,
    replacesVerification: evaluateVerificationReplacement(kyaProfile, verificationType),
    issuedAt: new Date().toISOString(),
  });
  const signature = hmacSha256(_secret, payload);
  return Buffer.from(
    JSON.stringify({ payload: JSON.parse(payload), signature })
  ).toString("base64url");
}
