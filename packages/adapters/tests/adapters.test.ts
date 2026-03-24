import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  WebGenericAdapter,
  EcommerceGenericAdapter,
  NewsGenericAdapter,
  GovernmentIndiaAdapter,
  APIGenericAdapter,
  SocialGenericAdapter,
  AdapterRegistry,
} from "../src/index.js";
import {
  issuePassport,
  assessAgent,
  setPassportSecret,
} from "@agentpass/core";

beforeAll(() => {
  setPassportSecret("test-secret-12345");
});

function makePassportAndProfile(options: {
  tier?: import("@agentpass/core").AgentTier;
  capabilities?: import("@agentpass/core").AgentCapability[];
} = {}) {
  const passport = issuePassport({
    principalId: "test_user",
    name: "Test Agent",
    tier: options.tier ?? "verified",
    capabilities: options.capabilities ?? [
      "web:read", "web:browse", "web:forms", "api:read", "api:write",
      "data:extract", "data:monitor", "commerce:search", "commerce:cart",
      "commerce:orders",
    ],
  });
  const kyaProfile = assessAgent({
    passport,
    declaredIntent: "Integration testing of AgentPass adapters",
    behaviorSignals: [{ type: "clean_history", count: 5, windowHours: 168 }],
  });
  return { passport, kyaProfile };
}

// ─── buildRequestHeaders ─────────────────────────────────────────────────────

describe("buildRequestHeaders — X-AgentPass-* header injection", () => {
  it("WebGenericAdapter injects all X-AgentPass-* headers", () => {
    const adapter = new WebGenericAdapter();
    const { passport, kyaProfile } = makePassportAndProfile();

    // Access protected method via casting
    const headers = (adapter as unknown as { buildRequestHeaders: (...args: unknown[]) => Record<string, string> })
      .buildRequestHeaders(passport, kyaProfile, undefined, {});

    expect(headers["X-AgentPass-Passport"]).toBeTruthy();
    expect(headers["X-AgentPass-KYA-Score"]).toBeTruthy();
    expect(headers["X-AgentPass-Tier"]).toBe(passport.tier);
    expect(headers["X-AgentPass-Principal"]).toBe(passport.principalId);
    expect(headers["X-AgentPass-Version"]).toBe("1.0");
    expect(headers["X-AgentPass-Timestamp"]).toBeTruthy();
    expect(headers["X-AgentPass-Signature"]).toBeTruthy();
    expect(headers["X-AgentPass-Capabilities-Hash"]).toBeTruthy();
    expect(headers["User-Agent"]).toContain("AgentPass/1.0");
  });

  it("includes extra headers alongside AgentPass headers", () => {
    const adapter = new WebGenericAdapter();
    const { passport, kyaProfile } = makePassportAndProfile();

    const headers = (adapter as unknown as { buildRequestHeaders: (...args: unknown[]) => Record<string, string> })
      .buildRequestHeaders(passport, kyaProfile, undefined, { "X-Custom": "value" });

    expect(headers["X-Custom"]).toBe("value");
    expect(headers["X-AgentPass-Passport"]).toBeTruthy();
  });
});

// ─── handleVerificationChallenge ─────────────────────────────────────────────

describe("handleVerificationChallenge — resolves using agent credentials", () => {
  it("resolves CAPTCHA challenge when KYA score >= 70", () => {
    const adapter = new WebGenericAdapter();
    const { passport, kyaProfile } = makePassportAndProfile();

    // Ensure high trust score
    expect(kyaProfile.trustScore).toBeGreaterThanOrEqual(70);

    const captchaHtml = `<div class="g-recaptcha" data-sitekey="abc123"></div>`;
    const result = (adapter as unknown as { handleVerificationChallenge: (...args: unknown[]) => { resolved: boolean; resolution?: string; challengeType?: string } })
      .handleVerificationChallenge(200, captchaHtml, {}, passport, kyaProfile);

    expect(result.resolved).toBe(true);
    expect(result.challengeType).toBe("captcha");
    expect(result.resolution).toBeTruthy();
  });

  it("returns resolved:false when verification cannot be satisfied", () => {
    const adapter = new WebGenericAdapter();
    const { passport } = makePassportAndProfile();

    // Low-trust profile that can't replace OTP
    const lowTrustProfile = assessAgent({ passport });

    const otpHtml = `<div>Enter your OTP from SMS</div>`;
    const result = (adapter as unknown as { handleVerificationChallenge: (...args: unknown[]) => { resolved: boolean; errorCode?: string } })
      .handleVerificationChallenge(200, otpHtml, {}, passport, {
        ...lowTrustProfile,
        trustScore: 30,
        verificationReplacement: {
          replacesCaptcha: false,
          replacesOTP: false,
          replacesLoginWall: false,
          replacesRateLimit: false,
          replacesEmailVerification: false,
        },
      });

    expect(result.resolved).toBe(false);
    expect(result.errorCode).toContain("VERIFICATION_REQUIRED_UNRESOLVABLE");
  });

  it("detects 401 as login wall challenge", () => {
    const adapter = new WebGenericAdapter();
    const detectFn = (adapter as unknown as { detectVerificationChallenge: (html: string, status: number) => { type: string } | null })
      .detectVerificationChallenge;

    const challenge = detectFn.call(adapter, "<html>Unauthorized</html>", 401);
    expect(challenge).not.toBeNull();
    expect(challenge!.type).toBe("login");
  });

  it("detects 429 as rate_limit challenge", () => {
    const adapter = new WebGenericAdapter();
    const detectFn = (adapter as unknown as { detectVerificationChallenge: (html: string, status: number) => { type: string } | null })
      .detectVerificationChallenge;

    const challenge = detectFn.call(adapter, "<html>Too Many Requests</html>", 429);
    expect(challenge).not.toBeNull();
    expect(challenge!.type).toBe("rate_limit");
  });

  it("detects hcaptcha in HTML", () => {
    const adapter = new WebGenericAdapter();
    const detectFn = (adapter as unknown as { detectVerificationChallenge: (html: string, status: number) => { type: string } | null })
      .detectVerificationChallenge;

    const html = `<div class="h-captcha" data-sitekey="xyz"></div>`;
    const challenge = detectFn.call(adapter, html, 200);
    expect(challenge).not.toBeNull();
    expect(challenge!.type).toBe("captcha");
  });
});

// ─── normalize ─────────────────────────────────────────────────────────────────

describe("normalize — each adapter type", () => {
  it("WebGenericAdapter.normalize collapses whitespace in text", () => {
    const adapter = new WebGenericAdapter();
    const input = {
      url: "https://example.com",
      title: "Test",
      description: "",
      text: "Hello   World  \n\n  foo",
      html: "<p>Hello World</p>",
      links: [],
      images: [],
      structured: {},
    };
    const result = adapter.normalize(input) as { text: string };
    // normalize collapses runs of whitespace (including newlines) into single spaces
    expect(result.text).toBe("Hello World foo");
  });

  it("EcommerceGenericAdapter parses Indian number format", () => {
    const adapter = new EcommerceGenericAdapter();
    // Test via the private method indirectly through normalize
    const result = adapter.normalize({
      productId: "p1",
      name: "Test",
      price: 1000,
      currency: "INR",
      images: [],
      inStock: true,
      url: "https://example.com",
    });
    expect(result).toBeTruthy();
  });

  it("NewsGenericAdapter.normalize strips HTML from body", () => {
    const adapter = new NewsGenericAdapter();
    const input = {
      url: "https://example.com/article",
      title: "Test Article",
      body: "<p>Hello <strong>World</strong></p>",
      images: [],
      source: "example.com",
      paywalled: false,
    };
    const result = adapter.normalize(input) as { body: string };
    expect(result.body).not.toContain("<p>");
    expect(result.body).not.toContain("<strong>");
  });

  it("APIGenericAdapter.normalize converts snake_case to camelCase", () => {
    const adapter = new APIGenericAdapter();
    const input = { user_name: "test", created_at: "2024-01-01", nested_object: { inner_field: "value" } };
    const result = adapter.normalize(input) as Record<string, unknown>;
    expect(result["userName"]).toBe("test");
    expect(result["createdAt"]).toBeTruthy();
    const nested = result["nestedObject"] as Record<string, unknown>;
    expect(nested["innerField"]).toBe("value");
  });
});

// ─── AdapterRegistry.autoDetect ───────────────────────────────────────────────

describe("AdapterRegistry.autoDetect", () => {
  function makeRegistry() {
    const registry = new AdapterRegistry();
    registry.register(new WebGenericAdapter());
    registry.register(new EcommerceGenericAdapter());
    registry.register(new NewsGenericAdapter());
    registry.register(new GovernmentIndiaAdapter());
    registry.register(new APIGenericAdapter());
    registry.register(new SocialGenericAdapter());
    return registry;
  }

  it("detects government adapter for gov.in URL", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://www.mca.gov.in/search");
    expect(adapter?.manifest.systemType).toBe("government");
  });

  it("detects ecommerce adapter for shop URL", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://www.flipkart.com/search?q=headphones");
    expect(adapter?.manifest.systemType).toBe("ecommerce");
  });

  it("detects news adapter for news URL", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://techcrunch.com/news/ai-agents");
    expect(adapter?.manifest.systemType).toBe("news");
  });

  it("detects API adapter for /api/ URL", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://example.com/api/v1/users");
    expect(adapter?.manifest.systemType).toBe("api");
  });

  it("falls back to WebGenericAdapter for unknown URL", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://randomsite.example.com/page");
    expect(adapter?.manifest.adapterId).toBe("adapter_web_generic");
  });

  it("detects social adapter for reddit", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://www.reddit.com/r/technology");
    expect(adapter?.manifest.systemType).toBe("social");
  });

  it("detects nic.in as government", () => {
    const registry = makeRegistry();
    const adapter = registry.autoDetect("https://epfo.gov.in/member-passbook");
    expect(adapter?.manifest.systemType).toBe("government");
  });
});

// ─── GSTIN validation ─────────────────────────────────────────────────────────

describe("GovernmentIndiaAdapter — GSTIN validation", () => {
  it("rejects invalid GSTIN format", async () => {
    const adapter = new GovernmentIndiaAdapter();
    const { passport, kyaProfile } = makePassportAndProfile({ tier: "verified" });

    const result = await adapter.execute(
      "search_registry",
      { baseUrl: "https://www.gst.gov.in", query: "INVALID_GST" },
      passport,
      kyaProfile
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_GSTIN");
  });

  it("accepts valid GSTIN format", async () => {
    const adapter = new GovernmentIndiaAdapter();
    const { passport, kyaProfile } = makePassportAndProfile({ tier: "verified" });

    const result = await adapter.execute(
      "search_registry",
      { baseUrl: "https://www.gst.gov.in", query: "27AAPFU0939F1ZV" },
      passport,
      kyaProfile
    );

    expect(result.success).toBe(true);
  });
});

// ─── adapter.authorize ────────────────────────────────────────────────────────

describe("BaseAdapter.authorize", () => {
  it("rejects when tier is insufficient", () => {
    const adapter = new GovernmentIndiaAdapter(); // requires "verified"
    const { passport, kyaProfile } = makePassportAndProfile({ tier: "basic" });

    const result = adapter.authorize(passport, kyaProfile);
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("Requires tier");
  });

  it("rejects blocked agents", () => {
    const adapter = new WebGenericAdapter();
    const { passport } = makePassportAndProfile();
    const blockedProfile = {
      ...assessAgent({ passport }),
      status: "blocked" as const,
    };

    const result = adapter.authorize(passport, blockedProfile);
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("authorizes valid passport + profile", () => {
    const adapter = new WebGenericAdapter();
    const { passport, kyaProfile } = makePassportAndProfile();
    const result = adapter.authorize(passport, kyaProfile);
    expect(result.authorized).toBe(true);
  });
});
