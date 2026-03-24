/**
 * E2E test: WebGenericAdapter against https://example.com
 *
 * Requires a real Chromium browser (installed via `playwright install chromium`).
 * The BrowserPool is launched once for the suite, then drained on teardown.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "@agentpass/runtime";
import { issuePassport, assessAgent, setPassportSecret } from "@agentpass/core";
import { WebGenericAdapter } from "../src/index.js";
import type { PageContent } from "../src/types.js";

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  setPassportSecret("e2e-test-secret-12345");
  await pool.launch();
}, 30_000);

afterAll(async () => {
  await pool.drain();
}, 15_000);

function makePassportAndProfile() {
  const passport = issuePassport({
    principalId: "e2e_test_user",
    name: "E2E Test Agent",
    tier: "verified",
    capabilities: ["web:read", "web:browse", "data:extract"],
  });
  const kyaProfile = assessAgent({
    passport,
    declaredIntent: "E2E test against example.com",
    behaviorSignals: [{ type: "clean_history", count: 10, windowHours: 168 }],
  });
  return { passport, kyaProfile };
}

// ─── E2E tests ────────────────────────────────────────────────────────────────

describe("WebGenericAdapter (Playwright) — fetch_page against https://example.com", () => {
  it(
    "returns success with title and non-empty text",
    async () => {
      const adapter = new WebGenericAdapter();
      const { passport, kyaProfile } = makePassportAndProfile();

      const result = await adapter.execute(
        "fetch_page",
        { url: "https://example.com" },
        passport,
        kyaProfile,
      );

      expect(result.success).toBe(true);

      const data = result.data as PageContent;
      expect(data).toBeDefined();
      expect(typeof data.title).toBe("string");
      expect(data.title.length).toBeGreaterThan(0);
      expect(typeof data.text).toBe("string");
      expect(data.text.length).toBeGreaterThan(0);
      expect(data.url).toContain("example.com");
    },
    30_000,
  );

  it(
    "populates links array with properly typed Link objects",
    async () => {
      const adapter = new WebGenericAdapter();
      const { passport, kyaProfile } = makePassportAndProfile();

      const result = await adapter.execute(
        "fetch_page",
        { url: "https://example.com" },
        passport,
        kyaProfile,
      );

      expect(result.success).toBe(true);

      const data = result.data as PageContent;
      expect(Array.isArray(data.links)).toBe(true);

      // Every link must have the required shape
      for (const link of data.links) {
        expect(typeof link.href).toBe("string");
        expect(typeof link.text).toBe("string");
        expect(["internal", "external", "anchor"]).toContain(link.type);
      }
    },
    30_000,
  );

  it(
    "sets auditEntry with correct agentId and outcome",
    async () => {
      const adapter = new WebGenericAdapter();
      const { passport, kyaProfile } = makePassportAndProfile();

      const result = await adapter.execute(
        "fetch_page",
        { url: "https://example.com" },
        passport,
        kyaProfile,
      );

      expect(result.auditEntry).toBeDefined();
      expect(result.auditEntry.agentId).toBe(passport.agentId);
      expect(result.auditEntry.outcome).toBe("success");
    },
    30_000,
  );

  it(
    "extract_structured: extracts h1 content from example.com",
    async () => {
      const adapter = new WebGenericAdapter();
      const { passport, kyaProfile } = makePassportAndProfile();

      const result = await adapter.execute(
        "extract_structured",
        {
          url: "https://example.com",
          schema: { heading: "h1" },
        },
        passport,
        kyaProfile,
      );

      expect(result.success).toBe(true);

      const data = result.data as { extracted: Record<string, unknown>; confidence: number };
      expect(data.extracted).toBeDefined();
      expect(data.confidence).toBeGreaterThan(0);
      expect(typeof data.extracted["heading"]).toBe("string");
    },
    30_000,
  );
});
