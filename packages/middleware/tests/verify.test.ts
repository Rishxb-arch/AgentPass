/**
 * verify.test.ts
 *
 * Tests the full AgentPass verification round-trip:
 *   issuePassport() → buildAgentHeaders() → verifyAgentRequest()
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  issuePassport,
  buildAgentHeaders,
  setPassportSecret,
} from "@agentpass/core";
import {
  verifyAgentRequest,
  parseAgentPassHeaders,
  computeGrants,
  buildAcceptedHeaders,
} from "../src/verify.js";
import type { MiddlewareOptions } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-agentpass-middleware-2024";

function makeOptions(overrides: Partial<MiddlewareOptions> = {}): MiddlewareOptions {
  return {
    secret: TEST_SECRET,
    captchaThreshold: 70,
    rateLimitThreshold: 60,
    loginWallMinTier: "trusted",
    mfaMinTier: "verified",
    ...overrides,
  };
}

function makeHeaders(kyaScore = 80): Record<string, string> {
  setPassportSecret(TEST_SECRET);
  const passport = issuePassport({
    principalId: "user_123",
    name: "TestAgent",
    tier: "trusted",
    capabilities: ["web:read", "data:extract"],
  });
  return buildAgentHeaders(passport, kyaScore);
}

// ─── parseAgentPassHeaders ─────────────────────────────────────────────────

describe("parseAgentPassHeaders", () => {
  it("returns null when X-AgentPass-Passport header is absent", () => {
    const result = parseAgentPassHeaders({ "content-type": "application/json" });
    expect(result).toBeNull();
  });

  it("returns null when passport token does not start with 'agentpass.'", () => {
    const result = parseAgentPassHeaders({
      "x-agentpass-passport": "invalid-token",
    });
    expect(result).toBeNull();
  });

  it("parses all header fields correctly", () => {
    const headers = makeHeaders(85);
    const parsed = parseAgentPassHeaders(headers);

    expect(parsed).not.toBeNull();
    expect(parsed!.passportToken).toMatch(/^agentpass\./);
    expect(parsed!.kyaScore).toBe(85);
    expect(parsed!.tier).toBe("trusted");
    expect(parsed!.principalId).toBe("user_123");
    expect(parsed!.signature).toBeTruthy();
    expect(parsed!.timestamp).toBeTruthy();
  });

  it("handles array-valued headers by taking first element", () => {
    const headers = makeHeaders();
    const arrayHeaders: Record<string, string | string[]> = {
      ...headers,
      "x-agentpass-kya-score": ["80", "90"],
    };
    const parsed = parseAgentPassHeaders(arrayHeaders);
    expect(parsed?.kyaScore).toBe(80);
  });
});

// ─── verifyAgentRequest ────────────────────────────────────────────────────

describe("verifyAgentRequest", () => {
  const options = makeOptions();

  it("returns isAgent=false when no AgentPass headers present", () => {
    const decision = verifyAgentRequest({ "content-type": "text/html" }, options);
    expect(decision.isAgent).toBe(false);
    expect(decision.verified).toBe(false);
  });

  it("returns verified=true for a correctly signed passport", () => {
    const headers = makeHeaders(80);
    const decision = verifyAgentRequest(headers, options);

    expect(decision.isAgent).toBe(true);
    expect(decision.verified).toBe(true);
    expect(decision.context).toBeDefined();
    expect(decision.reason).toBeUndefined();
  });

  it("attaches correct context fields", () => {
    const headers = makeHeaders(75);
    const decision = verifyAgentRequest(headers, options);

    const ctx = decision.context!;
    expect(ctx.agentId).toMatch(/^ap_/);
    expect(ctx.principalId).toBe("user_123");
    expect(ctx.name).toBe("TestAgent");
    expect(ctx.tier).toBe("trusted");
    expect(ctx.kyaScore).toBe(75);
    expect(ctx.capabilities).toContain("web:read");
    expect(ctx.verifiedAt).toBeTruthy();
  });

  it("returns verified=false when signature is tampered with", () => {
    const headers = makeHeaders(80);
    // Corrupt the signature
    const tampered = {
      ...headers,
      "x-agentpass-signature": "000000000000000000000000000000000000000000000000",
    };
    const decision = verifyAgentRequest(tampered, options);

    expect(decision.verified).toBe(false);
    expect(decision.reason).toContain("signature");
  });

  it("returns verified=false when passport token is malformed", () => {
    const headers = makeHeaders(80);
    const tampered = {
      ...headers,
      "x-agentpass-passport": "agentpass.NOTVALID.abcd",
    };
    const decision = verifyAgentRequest(tampered, options);

    expect(decision.verified).toBe(false);
  });

  it("returns verified=false when KYA score is below minKyaScore", () => {
    const headers = makeHeaders(30);
    const decision = verifyAgentRequest(headers, makeOptions({ minKyaScore: 50 }));

    expect(decision.verified).toBe(false);
    expect(decision.reason).toContain("KYA score");
  });

  it("returns verified=false when tier is below minTier", () => {
    setPassportSecret(TEST_SECRET);
    const passport = issuePassport({
      principalId: "user_456",
      name: "LowTierAgent",
      tier: "basic",
      capabilities: ["web:read"],
    });
    const headers = buildAgentHeaders(passport, 80);
    const decision = verifyAgentRequest(headers, makeOptions({ minTier: "verified" }));

    expect(decision.verified).toBe(false);
    expect(decision.reason).toContain("tier");
  });

  it("returns verified=false when required capabilities are missing", () => {
    const headers = makeHeaders(80);
    const decision = verifyAgentRequest(
      headers,
      makeOptions({ requiredCapabilities: ["commerce:checkout"] })
    );

    expect(decision.verified).toBe(false);
    expect(decision.reason).toContain("capabilities");
  });

  it("returns verified=false when wrong secret is used", () => {
    const headers = makeHeaders(80);
    const wrongOptions = makeOptions({ secret: "completely-wrong-secret" });
    const decision = verifyAgentRequest(headers, wrongOptions);

    expect(decision.verified).toBe(false);
  });
});

// ─── computeGrants ────────────────────────────────────────────────────────

describe("computeGrants", () => {
  it("grants captcha bypass at score >= 70", () => {
    const options = makeOptions();
    expect(computeGrants(70, "trusted", options).replacesCaptcha).toBe(true);
    expect(computeGrants(69, "trusted", options).replacesCaptcha).toBe(false);
  });

  it("grants rate-limit bypass at score >= 60", () => {
    const options = makeOptions();
    expect(computeGrants(60, "trusted", options).replacesRateLimit).toBe(true);
    expect(computeGrants(59, "trusted", options).replacesRateLimit).toBe(false);
  });

  it("grants login-wall bypass at tier >= trusted", () => {
    const options = makeOptions();
    expect(computeGrants(80, "trusted", options).replacesLoginWall).toBe(true);
    expect(computeGrants(80, "sovereign", options).replacesLoginWall).toBe(true);
    expect(computeGrants(80, "verified", options).replacesLoginWall).toBe(false);
    expect(computeGrants(80, "basic", options).replacesLoginWall).toBe(false);
  });

  it("grants MFA bypass at tier >= verified", () => {
    const options = makeOptions();
    expect(computeGrants(80, "verified", options).replacesMFA).toBe(true);
    expect(computeGrants(80, "basic", options).replacesMFA).toBe(false);
  });

  it("respects custom thresholds", () => {
    const options = makeOptions({ captchaThreshold: 90, rateLimitThreshold: 80 });
    const grants = computeGrants(85, "verified", options);
    expect(grants.replacesCaptcha).toBe(false);
    expect(grants.replacesRateLimit).toBe(true);
  });
});

// ─── buildAcceptedHeaders ─────────────────────────────────────────────────

describe("buildAcceptedHeaders", () => {
  it("lists all bypassed checks in response headers", () => {
    const headers = makeHeaders(80);
    const decision = verifyAgentRequest(headers, makeOptions());
    const ctx = decision.context!;
    const responseHeaders = buildAcceptedHeaders(ctx);

    expect(responseHeaders["x-agentpass-accepted"]).toBeTruthy();
    expect(responseHeaders["x-agentpass-granted-tier"]).toBe("trusted");
    expect(responseHeaders["x-agentpass-bypassed"]).toContain("captcha");
    expect(responseHeaders["x-agentpass-bypassed"]).toContain("rate_limit");
    expect(responseHeaders["x-agentpass-bypassed"]).toContain("login_wall");
  });

  it("returns 'none' when no grants apply", () => {
    const headers = makeHeaders(50);
    const decision = verifyAgentRequest(
      headers,
      makeOptions({ loginWallMinTier: "sovereign", mfaMinTier: "sovereign" })
    );
    // With KYA=50 neither captcha(70) nor rate_limit(60) thresholds met,
    // and sovereign tier not matched for login_wall/mfa
    const ctx = decision.context!;
    const responseHeaders = buildAcceptedHeaders(ctx);
    expect(responseHeaders["x-agentpass-bypassed"]).toBe("none");
  });
});
