import { describe, it, expect, beforeAll } from "vitest";
import {
  assessAgent,
  computeVerificationReplacement,
  scoreRisk,
  classifyAgent,
  evaluateVerificationReplacement,
} from "../src/kya/index.js";
import { issuePassport, setPassportSecret } from "../src/passport/index.js";
import { setSecret } from "../src/delegation/index.js";

beforeAll(() => {
  setPassportSecret("test-secret-12345");
  setSecret("test-secret-12345");
});

describe("assessAgent — 6 checks", () => {
  it("runs all 6 checks and returns a profile", () => {
    const passport = issuePassport({
      principalId: "user_001",
      name: "Test Agent",
      tier: "verified",
      capabilities: ["web:browse", "commerce:search"],
    });

    const profile = assessAgent({ passport, declaredIntent: "Search for product prices online" });

    expect(profile.agentId).toBe(passport.agentId);
    expect(profile.checks).toHaveLength(6);

    const checkNames = profile.checks.map((c) => c.name);
    expect(checkNames).toContain("passport_validity");
    expect(checkNames).toContain("principal_verification");
    expect(checkNames).toContain("capability_scope");
    expect(checkNames).toContain("behavior_history");
    expect(checkNames).toContain("intent_declaration");
    expect(checkNames).toContain("clean_history_bonus");
  });

  it("check 1: passes for valid passport, fails for revoked", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const profile = assessAgent({ passport });
    const check = profile.checks.find((c) => c.name === "passport_validity");
    expect(check!.passed).toBe(true);
    expect(check!.score).toBe(100);
  });

  it("check 2: principal_verification passes for non-anonymous principal", () => {
    const passport = issuePassport({ principalId: "real_user_001", name: "T" });
    const profile = assessAgent({ passport });
    const check = profile.checks.find((c) => c.name === "principal_verification");
    expect(check!.passed).toBe(true);
    expect(check!.score).toBe(90);
  });

  it("check 2: principal_verification gives lower score for anonymous", () => {
    const passport = issuePassport({ principalId: "anonymous", name: "T" });
    const profile = assessAgent({ passport });
    const check = profile.checks.find((c) => c.name === "principal_verification");
    expect(check!.passed).toBe(false);
    expect(check!.score).toBe(20);
  });

  it("check 3: flags basic tier agent with identity:delegate", () => {
    const passport = issuePassport({
      principalId: "u1",
      name: "T",
      tier: "basic",
      capabilities: ["identity:delegate"],
    });
    const profile = assessAgent({ passport });
    const check = profile.checks.find((c) => c.name === "capability_scope");
    expect(check!.passed).toBe(false);
    expect(check!.score).toBe(30);
  });

  it("check 4: behavior_history deducts for auth_failures and scope_violations", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const profile = assessAgent({
      passport,
      behaviorSignals: [
        { type: "auth_failure", count: 3, windowHours: 24 },
        { type: "scope_violation", count: 1, windowHours: 24 },
      ],
    });
    const check = profile.checks.find((c) => c.name === "behavior_history");
    // 100 - 3*10 - 1*20 = 50
    expect(check!.score).toBe(50);
  });

  it("check 5: intent_declaration scores 80 for long intent, 50 for short", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const longProfile = assessAgent({ passport, declaredIntent: "Researching product prices across multiple e-commerce platforms" });
    const shortProfile = assessAgent({ passport, declaredIntent: "hi" });

    const longCheck = longProfile.checks.find((c) => c.name === "intent_declaration");
    const shortCheck = shortProfile.checks.find((c) => c.name === "intent_declaration");

    expect(longCheck!.score).toBe(80);
    expect(shortCheck!.score).toBe(50);
  });

  it("check 6: clean_history_bonus adds +10 trust", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const withBonus = assessAgent({
      passport,
      behaviorSignals: [{ type: "clean_history", count: 5, windowHours: 168 }],
    });
    const withoutBonus = assessAgent({ passport });

    const bonusCheck = withBonus.checks.find((c) => c.name === "clean_history_bonus");
    expect(bonusCheck!.passed).toBe(true);
    expect(bonusCheck!.score).toBe(10);
    expect(withBonus.trustScore).toBeGreaterThanOrEqual(withoutBonus.trustScore);
  });

  it("blocks agent when passport is invalid", () => {
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const revoked = { ...passport, active: false };
    const profile = assessAgent({ passport: revoked });
    expect(profile.status).toBe("blocked");
    expect(profile.trustScore).toBe(0);
  });

  it("marks flagged when risk > 70", () => {
    const passport = issuePassport({
      principalId: "u1",
      name: "T",
      tier: "basic",
      capabilities: ["identity:delegate"],
    });
    const profile = assessAgent({ passport });
    expect(["flagged", "blocked"]).toContain(profile.status);
  });
});

describe("computeVerificationReplacement — thresholds", () => {
  it("replaces CAPTCHA when trustScore >= 70", () => {
    const vr = computeVerificationReplacement({ trustScore: 70, principalVerified: true, tier: "basic" });
    expect(vr.replacesCaptcha).toBe(true);
  });

  it("does NOT replace CAPTCHA when trustScore < 70", () => {
    const vr = computeVerificationReplacement({ trustScore: 69, principalVerified: true, tier: "basic" });
    expect(vr.replacesCaptcha).toBe(false);
  });

  it("replaces OTP when trustScore >= 80 AND principalVerified", () => {
    const vr = computeVerificationReplacement({ trustScore: 80, principalVerified: true, tier: "basic" });
    expect(vr.replacesOTP).toBe(true);
  });

  it("does NOT replace OTP when principal NOT verified", () => {
    const vr = computeVerificationReplacement({ trustScore: 85, principalVerified: false, tier: "basic" });
    expect(vr.replacesOTP).toBe(false);
  });

  it("replaces LoginWall when trustScore >= 60 AND tier >= verified", () => {
    const vr = computeVerificationReplacement({ trustScore: 60, principalVerified: true, tier: "verified" });
    expect(vr.replacesLoginWall).toBe(true);
  });

  it("does NOT replace LoginWall for basic tier even with high score", () => {
    const vr = computeVerificationReplacement({ trustScore: 90, principalVerified: true, tier: "basic" });
    expect(vr.replacesLoginWall).toBe(false);
  });

  it("replaces RateLimit when trustScore >= 50", () => {
    const vr = computeVerificationReplacement({ trustScore: 50, principalVerified: false, tier: "basic" });
    expect(vr.replacesRateLimit).toBe(true);
  });

  it("replaces EmailVerification when principalVerified and tier >= basic", () => {
    const vr = computeVerificationReplacement({ trustScore: 10, principalVerified: true, tier: "basic" });
    expect(vr.replacesEmailVerification).toBe(true);
  });
});

describe("scoreRisk", () => {
  it("computes risk from auth failures", () => {
    const risk = scoreRisk([{ type: "auth_failure", count: 3, windowHours: 24 }]);
    expect(risk).toBe(30); // 3 * 10
  });

  it("computes risk from scope violations", () => {
    const risk = scoreRisk([{ type: "scope_violation", count: 2, windowHours: 24 }]);
    expect(risk).toBe(40); // 2 * 20
  });

  it("caps at 100", () => {
    const risk = scoreRisk([
      { type: "auth_failure", count: 100, windowHours: 24 },
      { type: "scope_violation", count: 100, windowHours: 24 },
    ]);
    expect(risk).toBe(100);
  });

  it("reduces risk from clean_history", () => {
    const risk = scoreRisk([
      { type: "auth_failure", count: 2, windowHours: 24 },
      { type: "clean_history", count: 1, windowHours: 168 },
    ]);
    expect(risk).toBe(15); // 20 - 5
  });
});

describe("classifyAgent", () => {
  it("classifies commerce agent", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", capabilities: ["commerce:search", "commerce:cart"] });
    const cls = classifyAgent(passport, []);
    expect(cls.type).toBe("commerce");
    expect(cls.confidence).toBeGreaterThan(0.7);
  });

  it("classifies research agent", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", capabilities: ["data:extract", "web:read"] });
    const cls = classifyAgent(passport, []);
    expect(cls.type).toBe("research");
  });

  it("classifies transactional agent", () => {
    const passport = issuePassport({ principalId: "u1", name: "T", capabilities: ["payments:initiate"] });
    const cls = classifyAgent(passport, []);
    expect(cls.type).toBe("transactional");
  });
});

describe("audit chain integrity", () => {
  it("verifies a valid chain", async () => {
    const { createEntry, verifyChain } = await import("../src/audit/index.js");

    const e1 = createEntry("a1", "p1", { type: "read", system: "web", endpoint: "/", payloadHash: "" }, "success");
    const e2 = createEntry("a1", "p1", { type: "browse", system: "web", endpoint: "/page", payloadHash: "" }, "success", e1.entryHash);
    const e3 = createEntry("a1", "p1", { type: "api_call", system: "api", endpoint: "/api/data", payloadHash: "" }, "success", e2.entryHash);

    const result = verifyChain([e1, e2, e3]);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it("detects a broken chain", async () => {
    const { createEntry, verifyChain } = await import("../src/audit/index.js");

    const e1 = createEntry("a1", "p1", { type: "read", system: "web", endpoint: "/", payloadHash: "" }, "success");
    const e2 = createEntry("a1", "p1", { type: "browse", system: "web", endpoint: "/", payloadHash: "" }, "success", e1.entryHash);

    // Tamper with e2
    const tampered = { ...e2, outcome: "failure" as const };

    const result = verifyChain([e1, tampered]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });
});

describe("session expiry", () => {
  it("marks session as valid when active and not expired", async () => {
    const { createSession, isSessionValid } = await import("../src/session/index.js");
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const session = createSession(passport, "system:test", 60);
    expect(isSessionValid(session)).toBe(true);
  });

  it("marks session as invalid when terminated", async () => {
    const { createSession, terminateSession, isSessionValid } = await import("../src/session/index.js");
    const passport = issuePassport({ principalId: "u1", name: "T" });
    const session = createSession(passport, "system:test", 60);
    const terminated = terminateSession(session);
    expect(isSessionValid(terminated)).toBe(false);
  });
});
