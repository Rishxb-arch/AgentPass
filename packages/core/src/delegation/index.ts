import { createHmac, randomBytes } from "node:crypto";
import type { AgentCapability, AgentTier } from "../passport/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DelegationScope {
  systems: string[];
  capabilities: AgentCapability[];
  maxActions: number | null;
  allowedHours: number[] | null;
}

export interface DelegationToken {
  tokenId: string;
  agentId: string;
  grantorId: string;
  scope: DelegationScope;
  issuedAt: string;
  expiresAt: string;
  singleUse: boolean;
  usageCount: number;
  active: boolean;
  signature: string;
}

// ─── Secret (shared with passport module via setSecret) ──────────────────────

let _secret = "";

export function setSecret(secret: string): void {
  _secret = secret;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function canonical(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

function hmacSha256(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Issue a delegation token.
 * Enforces scope reduction: the delegation cannot grant capabilities
 * the grantor does not themselves hold.
 */
export function issueDelegation(
  grantorId: string,
  agentId: string,
  scope: DelegationScope,
  options: {
    expiresInHours?: number;
    singleUse?: boolean;
    grantorCapabilities?: AgentCapability[];
  } = {}
): DelegationToken {
  const {
    expiresInHours = 1,
    singleUse = false,
    grantorCapabilities = [],
  } = options;

  // Scope reduction rule: remove capabilities grantor doesn't hold
  const reducedCapabilities =
    grantorCapabilities.length > 0
      ? scope.capabilities.filter((c) => grantorCapabilities.includes(c))
      : scope.capabilities;

  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + expiresInHours * 3600 * 1000
  ).toISOString();

  const tokenId = "del_" + randomHex(8);

  const payload: Record<string, unknown> = {
    tokenId,
    agentId,
    grantorId,
    scope: { ...scope, capabilities: reducedCapabilities },
    issuedAt,
    expiresAt,
    singleUse,
    usageCount: 0,
    active: true,
  };

  const signature = hmacSha256(_secret, canonical(payload));

  return {
    tokenId,
    agentId,
    grantorId,
    scope: { ...scope, capabilities: reducedCapabilities },
    issuedAt,
    expiresAt,
    singleUse,
    usageCount: 0,
    active: true,
    signature,
  };
}

/**
 * Verify a delegation token for a given agent and action.
 */
export function verifyDelegation(
  token: DelegationToken,
  agentId: string,
  action: { system: string; capability: AgentCapability }
): { valid: boolean; reason?: string } {
  if (!token.active) {
    return { valid: false, reason: "Delegation is revoked or consumed" };
  }

  if (token.agentId !== agentId) {
    return { valid: false, reason: "Agent ID mismatch" };
  }

  if (new Date(token.expiresAt) < new Date()) {
    return { valid: false, reason: "Delegation has expired" };
  }

  if (
    token.scope.maxActions !== null &&
    token.usageCount >= token.scope.maxActions
  ) {
    return { valid: false, reason: "Max actions exceeded" };
  }

  if (
    token.scope.allowedHours !== null &&
    !token.scope.allowedHours.includes(new Date().getUTCHours())
  ) {
    return { valid: false, reason: "Action not allowed at this hour" };
  }

  const systemMatch =
    token.scope.systems.includes("*") ||
    token.scope.systems.includes(action.system) ||
    token.scope.systems.some(
      (s) => action.system.startsWith(s.replace("*", ""))
    );

  if (!systemMatch) {
    return { valid: false, reason: `System '${action.system}' not in scope` };
  }

  if (!token.scope.capabilities.includes(action.capability)) {
    return {
      valid: false,
      reason: `Capability '${action.capability}' not delegated`,
    };
  }

  // Verify signature
  const { signature, ...rest } = token;
  const expected = hmacSha256(_secret, canonical(rest as Record<string, unknown>));
  if (expected !== signature) {
    return { valid: false, reason: "Invalid delegation signature" };
  }

  return { valid: true };
}

/**
 * Revoke a delegation token.
 */
export function revokeDelegation(token: DelegationToken): DelegationToken {
  return { ...token, active: false };
}

/**
 * Consume a delegation token (increment usage, deactivate if single-use).
 */
export function consumeDelegation(token: DelegationToken): DelegationToken {
  const updated = { ...token, usageCount: token.usageCount + 1 };
  if (updated.singleUse) {
    return { ...updated, active: false };
  }
  return updated;
}

/**
 * Serialize a delegation token to a compact string.
 */
export function serializeDelegation(token: DelegationToken): string {
  return Buffer.from(JSON.stringify(token)).toString("base64url");
}

/**
 * Deserialize a delegation token from a compact string.
 */
export function deserializeDelegation(encoded: string): DelegationToken | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    return JSON.parse(json) as DelegationToken;
  } catch {
    return null;
  }
}
