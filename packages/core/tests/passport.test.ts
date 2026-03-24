import { describe, it, expect, beforeAll } from "vitest";
import {
  issuePassport,
  verifyPassport,
  revokePassport,
  hasCapability,
  serializePassport,
  deserializePassport,
  buildTrustCredentials,
  verifyTrustCredentials,
  buildAgentHeaders,
  setPassportSecret,
  tierAtLeast,
} from "../src/passport/index.js";

beforeAll(() => {
  setPassportSecret("test-secret-12345");
});

describe("issuePassport", () => {
  it("generates a passport with correct shape", () => {
    const passport = issuePassport({
      principalId: "user_001",
      name: "Test Agent",
      tier: "basic",
      capabilities: ["web:read"],
    });

    expect(passport.agentId).toMatch(/^ap_[a-f0-9]{32}$/);
    expect(passport.principalId).toBe("user_001");
    expect(passport.name).toBe("Test Agent");
    expect(passport.tier).toBe("basic");
    expect(passport.capabilities).toContain("web:read");
    expect(passport.active).toBe(true);
    expect(passport.signature).toBeTruthy();
    expect(passport.metadata["protocol"]).toBe("agentpass/1.0");
  });

  it("sorts capabilities in fingerprint", () => {
    const p1 = issuePassport({ principalId: "u1", name: "A", capabilities: ["web:read", "api:read"] });
    const p2 = issuePassport({ principalId: "u1", name: "A", capabilities: ["api:read", "web:read"] });
    expect(p1.fingerprint).toBe(p2.fingerprint);
  });

  it("generates a 16-char fingerprint", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test" });
    expect(passport.fingerprint).toHaveLength(16);
  });

  it("sets expiresAt when expiresInHours provided", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", expiresInHours: 24 });
    expect(passport.expiresAt).not.toBeNull();
    const diff = new Date(passport.expiresAt!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 3600 * 1000);
    expect(diff).toBeLessThan(25 * 3600 * 1000);
  });

  it("sets expiresAt to null when expiresInHours is null", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", expiresInHours: null });
    expect(passport.expiresAt).toBeNull();
  });
});

describe("verifyPassport", () => {
  it("verifies a valid passport", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test" });
    const result = verifyPassport(passport);
    expect(result.valid).toBe(true);
  });

  it("rejects a revoked passport", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test" });
    const revoked = revokePassport(passport);
    const result = verifyPassport(revoked);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("revoked");
  });

  it("rejects a tampered passport", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test" });
    const tampered = { ...passport, name: "Hacker" };
    const result = verifyPassport(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature");
  });

  it("rejects an expired passport", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test", expiresInHours: -1 });
    const result = verifyPassport(passport);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });
});

describe("hasCapability", () => {
  it("returns true for present capability", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", capabilities: ["web:read", "api:read"] });
    expect(hasCapability(passport, "web:read")).toBe(true);
    expect(hasCapability(passport, "api:read")).toBe(true);
  });

  it("returns false for absent capability", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", capabilities: ["web:read"] });
    expect(hasCapability(passport, "api:write")).toBe(false);
  });
});

describe("serializePassport / deserializePassport", () => {
  it("round-trips a passport through serialization", () => {
    const passport = issuePassport({ principalId: "u1", name: "Test Agent", tier: "verified" });
    const token = serializePassport(passport);

    expect(token).toMatch(/^agentpass\..+\..+$/);

    const deserialized = deserializePassport(token);
    expect(deserialized).not.toBeNull();
    expect(deserialized!.agentId).toBe(passport.agentId);
    expect(deserialized!.name).toBe(passport.name);
    expect(deserialized!.tier).toBe(passport.tier);
  });

  it("returns null for malformed token", () => {
    expect(deserializePassport("not.a.valid.token")).toBeNull();
    expect(deserializePassport("agentpass.notbase64!!!")).toBeNull();
  });
});

describe("buildTrustCredentials", () => {
  it("builds valid trust credentials with kyaScore", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const creds = buildTrustCredentials(passport, 85);
    expect(creds.kyaScore).toBe(85);
    expect(creds.tier).toBe(passport.tier);
    expect(creds.capabilitiesHash).toBeTruthy();
    expect(creds.credentialSignature).toBeTruthy();
  });

  it("includes delegationToken when provided", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const creds = buildTrustCredentials(passport, 70, "del_token_xyz");
    expect(creds.delegationToken).toBe("del_token_xyz");
  });
});

describe("verifyTrustCredentials", () => {
  it("validates correct credentials", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const creds = buildTrustCredentials(passport, 75);
    expect(verifyTrustCredentials(creds).valid).toBe(true);
  });

  it("rejects tampered credentials", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const creds = buildTrustCredentials(passport, 75);
    const tampered = { ...creds, kyaScore: 100 };
    expect(verifyTrustCredentials(tampered).valid).toBe(false);
  });
});

describe("buildAgentHeaders", () => {
  it("returns all required X-AgentPass-* headers", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const headers = buildAgentHeaders(passport, 80);

    expect(headers["X-AgentPass-Passport"]).toBeTruthy();
    expect(headers["X-AgentPass-KYA-Score"]).toBe("80");
    expect(headers["X-AgentPass-Tier"]).toBe(passport.tier);
    expect(headers["X-AgentPass-Principal"]).toBe("u1");
    expect(headers["X-AgentPass-Version"]).toBe("1.0");
    expect(headers["X-AgentPass-Timestamp"]).toBeTruthy();
    expect(headers["X-AgentPass-Signature"]).toBeTruthy();
    expect(headers["X-AgentPass-Capabilities-Hash"]).toBeTruthy();
  });

  it("includes delegation header when provided", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const headers = buildAgentHeaders(passport, 80, "del_token_abc");
    expect(headers["X-AgentPass-Delegation"]).toBe("del_token_abc");
  });
});

describe("tierAtLeast", () => {
  it("returns true for equal tiers", () => {
    expect(tierAtLeast("basic", "basic")).toBe(true);
    expect(tierAtLeast("verified", "verified")).toBe(true);
    expect(tierAtLeast("sovereign", "sovereign")).toBe(true);
  });

  it("returns true for higher tiers", () => {
    expect(tierAtLeast("verified", "basic")).toBe(true);
    expect(tierAtLeast("trusted", "verified")).toBe(true);
    expect(tierAtLeast("sovereign", "basic")).toBe(true);
  });

  it("returns false for lower tiers", () => {
    expect(tierAtLeast("basic", "verified")).toBe(false);
    expect(tierAtLeast("verified", "trusted")).toBe(false);
    expect(tierAtLeast("basic", "sovereign")).toBe(false);
  });
});
