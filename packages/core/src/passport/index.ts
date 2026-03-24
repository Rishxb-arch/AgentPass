import { createHmac, createHash, randomBytes } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentCapability =
  | "web:read"
  | "web:write"
  | "web:forms"
  | "web:auth"
  | "web:browse"
  | "api:read"
  | "api:write"
  | "files:read"
  | "files:write"
  | "commerce:search"
  | "commerce:cart"
  | "commerce:checkout"
  | "commerce:orders"
  | "payments:initiate"
  | "payments:read"
  | "data:extract"
  | "data:monitor"
  | "identity:delegate"
  | "identity:verify";

export type AgentTier = "basic" | "verified" | "trusted" | "sovereign";

/** Tier ordering for comparison (higher index = higher trust) */
const TIER_ORDER: Record<AgentTier, number> = {
  basic: 0,
  verified: 1,
  trusted: 2,
  sovereign: 3,
};

/** What each tier unlocks */
export const TIER_DEFINITIONS: Record<AgentTier, string> = {
  basic: "Read-only web access, no delegation, no auth",
  verified: "Forms + API access, single-system delegation, authenticated sessions",
  trusted: "Multi-system delegation, payment reads, behavioral history established",
  sovereign: "Full capabilities, can spawn sub-agents, maximum trust level",
};

export interface TrustCredentials {
  passportToken: string;
  kyaScore: number;
  tier: AgentTier;
  principalVerified: boolean;
  capabilitiesHash: string;
  delegationToken?: string;
  presentedAt: string;
  credentialSignature: string;
}

export interface AgentPassport {
  agentId: string;
  principalId: string;
  name: string;
  tier: AgentTier;
  capabilities: AgentCapability[];
  fingerprint: string;
  issuedAt: string;
  expiresAt: string | null;
  active: boolean;
  signature: string;
  trustCredentials: TrustCredentials;
  metadata: Record<string, string>;
}

// ─── Secret key (module-level, set once) ────────────────────────────────────

let _secret = "";

/** Set the HMAC secret for passport signing. Call before issuing passports. */
export function setSecret(secret: string): void {
  _secret = secret;
}

/** Alias for setSecret — used in tests and SDK */
export const setPassportSecret = setSecret;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacSha256(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

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

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Issue a new AgentPassport.
 *
 * @param options - Passport issuance options
 * @returns A signed AgentPassport
 */
export function issuePassport(options: {
  principalId: string;
  name: string;
  tier?: AgentTier;
  capabilities?: AgentCapability[];
  expiresInHours?: number | null;
  metadata?: Record<string, string>;
}): AgentPassport {
  const {
    principalId,
    name,
    tier = "basic",
    capabilities = [],
    expiresInHours = 24,
    metadata = {},
  } = options;

  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt =
    expiresInHours != null
      ? new Date(now.getTime() + expiresInHours * 3600 * 1000).toISOString()
      : null;

  const agentId =
    "ap_" + sha256(principalId + randomHex(8)).slice(0, 32);

  const sortedCaps = [...capabilities].sort();
  const fingerprint = sha256(
    name + sortedCaps.join(",") + tier
  ).slice(0, 16);

  const payload: Record<string, unknown> = {
    agentId,
    principalId,
    name,
    tier,
    capabilities: sortedCaps,
    fingerprint,
    issuedAt,
    expiresAt,
    active: true,
    metadata: { ...metadata, protocol: "agentpass/1.0" },
  };

  const signature = hmacSha256(_secret, canonical(payload));

  const passport: AgentPassport = {
    agentId,
    principalId,
    name,
    tier,
    capabilities: sortedCaps,
    fingerprint,
    issuedAt,
    expiresAt,
    active: true,
    signature,
    trustCredentials: {} as TrustCredentials, // filled below
    metadata: { ...metadata, protocol: "agentpass/1.0" },
  };

  const passportToken = serializePassport(passport);
  const capabilitiesHash = sha256(sortedCaps.join(",")).slice(0, 16);
  const principalVerified = principalId !== "" && principalId !== "anonymous";

  const credPayload = canonical({
    passportToken,
    kyaScore: 0,
    tier,
    principalVerified,
    capabilitiesHash,
    presentedAt: issuedAt,
  });
  const credentialSignature = hmacSha256(_secret, credPayload);

  passport.trustCredentials = {
    passportToken,
    kyaScore: 0,
    tier,
    principalVerified,
    capabilitiesHash,
    presentedAt: issuedAt,
    credentialSignature,
  };

  return passport;
}

/**
 * Verify a passport's signature and expiry.
 */
export function verifyPassport(passport: AgentPassport): {
  valid: boolean;
  reason?: string;
} {
  if (!passport.active) {
    return { valid: false, reason: "Passport is revoked" };
  }

  if (passport.expiresAt && new Date(passport.expiresAt) < new Date()) {
    return { valid: false, reason: "Passport has expired" };
  }

  const { signature, trustCredentials, ...rest } = passport;
  const payload: Record<string, unknown> = rest;
  const expected = hmacSha256(_secret, canonical(payload));

  if (expected !== signature) {
    return { valid: false, reason: "Invalid signature" };
  }

  return { valid: true };
}

/**
 * Revoke a passport by setting active to false.
 */
export function revokePassport(passport: AgentPassport): AgentPassport {
  return { ...passport, active: false };
}

/**
 * Check if a passport holds a specific capability.
 */
export function hasCapability(
  passport: AgentPassport,
  capability: AgentCapability
): boolean {
  return passport.capabilities.includes(capability);
}

/**
 * Serialize a passport to a compact token string.
 * Format: "agentpass.{base64url(json)}.{sig.slice(0,16)}"
 */
export function serializePassport(passport: AgentPassport): string {
  const { trustCredentials, ...rest } = passport;
  const json = JSON.stringify(rest);
  const encoded = base64url(json);
  return `agentpass.${encoded}.${passport.signature.slice(0, 16)}`;
}

/**
 * Deserialize a passport token back to an AgentPassport.
 * Returns null if the token is malformed.
 */
export function deserializePassport(token: string): AgentPassport | null {
  try {
    const parts = token.split(".");
    if (parts.length < 3 || parts[0] !== "agentpass") return null;
    const json = fromBase64url(parts[1] ?? "");
    const obj = JSON.parse(json) as AgentPassport;
    // Reconstruct trust credentials (without kyaScore since we don't store it)
    obj.trustCredentials = buildTrustCredentials(obj, 0);
    return obj;
  } catch {
    return null;
  }
}

/**
 * Build a TrustCredentials package from a passport and KYA score.
 * This is what gets presented to systems instead of human verification.
 */
export function buildTrustCredentials(
  passport: AgentPassport,
  kyaScore: number,
  delegationToken?: string
): TrustCredentials {
  const passportToken = serializePassport(passport);
  const capabilitiesHash = sha256(
    [...passport.capabilities].sort().join(",")
  ).slice(0, 16);
  const principalVerified =
    passport.principalId !== "" && passport.principalId !== "anonymous";
  const presentedAt = new Date().toISOString();

  const credPayload = canonical({
    passportToken,
    kyaScore,
    tier: passport.tier,
    principalVerified,
    capabilitiesHash,
    presentedAt,
    ...(delegationToken ? { delegationToken } : {}),
  });
  const credentialSignature = hmacSha256(_secret, credPayload);

  return {
    passportToken,
    kyaScore,
    tier: passport.tier,
    principalVerified,
    capabilitiesHash,
    ...(delegationToken ? { delegationToken } : {}),
    presentedAt,
    credentialSignature,
  };
}

/**
 * Verify a TrustCredentials package.
 */
export function verifyTrustCredentials(credentials: TrustCredentials): {
  valid: boolean;
  reason?: string;
} {
  const { credentialSignature, ...rest } = credentials;
  const expected = hmacSha256(_secret, canonical(rest as Record<string, unknown>));
  if (expected !== credentialSignature) {
    return { valid: false, reason: "Invalid credential signature" };
  }
  return { valid: true };
}

/**
 * Build the X-AgentPass-* headers to inject on every HTTP request.
 * These headers present agent credentials to target systems.
 */
export function buildAgentHeaders(
  passport: AgentPassport,
  kyaScore: number,
  delegationToken?: string
): Record<string, string> {
  const credentials = buildTrustCredentials(passport, kyaScore, delegationToken);
  const headers: Record<string, string> = {
    "X-AgentPass-Passport": credentials.passportToken,
    "X-AgentPass-KYA-Score": String(kyaScore),
    "X-AgentPass-Tier": passport.tier,
    "X-AgentPass-Principal": passport.principalId,
    "X-AgentPass-Capabilities-Hash": credentials.capabilitiesHash,
    "X-AgentPass-Version": "1.0",
    "X-AgentPass-Timestamp": credentials.presentedAt,
    "X-AgentPass-Signature": credentials.credentialSignature,
  };
  if (delegationToken) {
    headers["X-AgentPass-Delegation"] = delegationToken;
  }
  return headers;
}

/** Compare two tiers — returns true if a >= b */
export function tierAtLeast(a: AgentTier, b: AgentTier): boolean {
  return TIER_ORDER[a] >= TIER_ORDER[b];
}
