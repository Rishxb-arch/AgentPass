import { describe, it, expect, beforeAll } from "vitest";
import {
  issueDelegation,
  verifyDelegation,
  revokeDelegation,
  consumeDelegation,
  setSecret,
} from "../src/delegation/index.js";
import type { DelegationScope } from "../src/delegation/index.js";

beforeAll(() => {
  setSecret("test-secret-12345");
});

const baseScope: DelegationScope = {
  systems: ["ecommerce:flipkart.com", "ecommerce:amazon.in"],
  capabilities: ["commerce:search", "web:browse"],
  maxActions: null,
  allowedHours: null,
};

describe("issueDelegation", () => {
  it("issues a delegation token with correct shape", () => {
    const token = issueDelegation("grantor_001", "agent_001", baseScope);

    expect(token.tokenId).toMatch(/^del_[a-f0-9]{16}$/);
    expect(token.agentId).toBe("agent_001");
    expect(token.grantorId).toBe("grantor_001");
    expect(token.active).toBe(true);
    expect(token.usageCount).toBe(0);
    expect(token.signature).toBeTruthy();
  });

  it("enforces scope reduction — removes capabilities grantor does not hold", () => {
    const scope: DelegationScope = {
      systems: ["*"],
      capabilities: ["commerce:search", "payments:initiate", "data:extract"],
      maxActions: null,
      allowedHours: null,
    };
    // Grantor only holds commerce:search and data:extract
    const token = issueDelegation("grantor_001", "agent_001", scope, {
      grantorCapabilities: ["commerce:search", "data:extract"],
    });

    expect(token.scope.capabilities).toContain("commerce:search");
    expect(token.scope.capabilities).toContain("data:extract");
    expect(token.scope.capabilities).not.toContain("payments:initiate");
  });

  it("creates single-use token when singleUse=true", () => {
    const token = issueDelegation("g1", "a1", baseScope, { singleUse: true });
    expect(token.singleUse).toBe(true);
  });

  it("sets maxActions when provided", () => {
    const scope = { ...baseScope, maxActions: 10 };
    const token = issueDelegation("g1", "a1", scope);
    expect(token.scope.maxActions).toBe(10);
  });
});

describe("verifyDelegation", () => {
  it("validates a correct delegation", () => {
    const token = issueDelegation("g1", "agent_001", baseScope);
    const result = verifyDelegation(token, "agent_001", {
      system: "ecommerce:flipkart.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects wrong agentId", () => {
    const token = issueDelegation("g1", "agent_001", baseScope);
    const result = verifyDelegation(token, "agent_999", {
      system: "ecommerce:flipkart.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("mismatch");
  });

  it("rejects system not in scope", () => {
    const token = issueDelegation("g1", "a1", baseScope);
    const result = verifyDelegation(token, "a1", {
      system: "ecommerce:myntra.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not in scope");
  });

  it("rejects capability not in scope", () => {
    const token = issueDelegation("g1", "a1", baseScope);
    const result = verifyDelegation(token, "a1", {
      system: "ecommerce:flipkart.com",
      capability: "payments:initiate",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not delegated");
  });

  it("rejects revoked token", () => {
    const token = issueDelegation("g1", "a1", baseScope);
    const revoked = revokeDelegation(token);
    const result = verifyDelegation(revoked, "a1", {
      system: "ecommerce:flipkart.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects when maxActions exceeded", () => {
    const scope = { ...baseScope, maxActions: 1 };
    const token = issueDelegation("g1", "a1", scope);
    const consumed = consumeDelegation(token);
    const result = verifyDelegation(consumed, "a1", {
      system: "ecommerce:flipkart.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Max actions");
  });

  it("accepts wildcard system scope", () => {
    const scope: DelegationScope = { ...baseScope, systems: ["*"] };
    const token = issueDelegation("g1", "a1", scope);
    const result = verifyDelegation(token, "a1", {
      system: "anything.example.com",
      capability: "commerce:search",
    });
    expect(result.valid).toBe(true);
  });
});

describe("consumeDelegation", () => {
  it("increments usageCount", () => {
    const token = issueDelegation("g1", "a1", baseScope);
    const consumed = consumeDelegation(token);
    expect(consumed.usageCount).toBe(1);
    expect(consumed.active).toBe(true);
  });

  it("deactivates single-use token on consume", () => {
    const token = issueDelegation("g1", "a1", baseScope, { singleUse: true });
    const consumed = consumeDelegation(token);
    expect(consumed.usageCount).toBe(1);
    expect(consumed.active).toBe(false);
  });
});
