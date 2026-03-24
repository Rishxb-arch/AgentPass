import type { AgentPassport } from "@agentpass/core";
import type { KYAProfile } from "@agentpass/core";
import type { AgentSession } from "@agentpass/core";
import { pool, humanNavigation, dismissModals, humanType, humanClick, selectorRegistry } from "@agentpass/runtime";
import { BaseAdapter } from "../base-adapter.js";
import type {
  AdapterManifest,
  AdapterResult,
  PageContent,
  Link,
  Image,
} from "../types.js";

// ─── WebGenericAdapter ────────────────────────────────────────────────────────

/**
 * Universal fallback adapter. Works on any website.
 * Every agent can browse any URL through this adapter.
 */
export class WebGenericAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_web_generic",
    systemId: "*",
    systemName: "Generic Web",
    version: "1.0.0",
    systemType: "generic",
    requiredCapabilities: ["web:read"],
    requiredTier: "basic",
    agentPassAware: false,
    verificationRequirements: [
      { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 70 },
      { type: "rate_limit", satisfiedByAgentPass: true, requiredKYAScore: 50 },
    ],
    rateLimits: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      agentPassVerifiedMultiplier: 3,
    },
    outputSchema: {},
    systemPatterns: ["*"],
    endpoints: [
      {
        id: "fetch_page",
        description: "Fetch and parse any web page",
        requiredCapability: "web:read",
        inputSchema: { url: "string", headers: "object?" },
        outputSchema: {},
        category: "web",
      },
      {
        id: "extract_structured",
        description: "Extract structured data using CSS selectors or JSONPath",
        requiredCapability: "data:extract",
        inputSchema: { url: "string", schema: "object" },
        outputSchema: {},
        category: "data",
      },
      {
        id: "submit_form",
        description: "Submit a web form",
        requiredCapability: "web:forms",
        inputSchema: {
          url: "string",
          formSelector: "string",
          fields: "object",
          submitSelector: "string?",
        },
        outputSchema: {},
        category: "web",
      },
      {
        id: "api_call",
        description: "Make an HTTP API call",
        requiredCapability: "api:read",
        inputSchema: {
          url: "string",
          method: "string",
          headers: "object?",
          body: "unknown?",
        },
        outputSchema: {},
        category: "api",
      },
      {
        id: "monitor_page",
        description: "Monitor a page element for value changes",
        requiredCapability: "data:monitor",
        inputSchema: { url: "string", selector: "string" },
        outputSchema: {},
        category: "data",
      },
    ],
  };

  async execute(
    endpointId: string,
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    _session?: AgentSession
  ): Promise<AdapterResult> {
    const auth = this.authorize(passport, kyaProfile);
    if (!auth.authorized) {
      return this.errorResult(passport, "UNAUTHORIZED", auth.reason);
    }

    const headers = this.buildRequestHeaders(passport, kyaProfile, undefined, {});

    switch (endpointId) {
      case "fetch_page":
        return this.fetchPage(input, passport, kyaProfile, headers);
      case "extract_structured":
        return this.extractStructured(input, passport, kyaProfile, headers);
      case "submit_form":
        return this.submitForm(input, passport, kyaProfile, headers);
      case "api_call":
        return this.apiCall(input, passport, kyaProfile, headers);
      case "monitor_page":
        return this.monitorPage(input, passport, kyaProfile, headers);
      default:
        return this.errorResult(passport, "UNKNOWN_ENDPOINT", `No endpoint '${endpointId}'`);
    }
  }

  private async fetchPage(
    input: Record<string, unknown>,
    passport: AgentPassport,
    _kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<PageContent>> {
    const url = input["url"] as string;

    // Use Playwright if the pool is running, otherwise fall back to fetch
    if (pool.launched) {
      try {
        const content = await pool.withPage(passport.agentId, url, headers, async (page) => {
          await humanNavigation(page, url);
          await dismissModals(page);

          const title = await page.title();
          const finalUrl = page.url();

          const text = await page.evaluate(() =>
            (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 50_000)
          );
          const links: Link[] = await page.evaluate(() =>
            Array.from(document.querySelectorAll("a[href]"))
              .slice(0, 200)
              .map((a) => {
                const anchor = a as HTMLAnchorElement;
                const href = anchor.href;
                const raw = anchor.getAttribute("href") ?? "";
                const type: "internal" | "external" | "anchor" = raw.startsWith("#")
                  ? "anchor"
                  : href.startsWith(window.location.origin)
                  ? "internal"
                  : "external";
                return {
                  href,
                  text: (anchor.innerText ?? "").trim().slice(0, 100),
                  type,
                };
              })
          );
          const images: Image[] = await page.evaluate(() =>
            Array.from(document.querySelectorAll("img[src]"))
              .slice(0, 50)
              .map((img) => ({
                src: (img as HTMLImageElement).src,
                alt: (img as HTMLImageElement).alt ?? "",
                width: (img as HTMLImageElement).naturalWidth || undefined,
                height: (img as HTMLImageElement).naturalHeight || undefined,
              }))
          );
          const html = await page.content();

          const description = await page
            .locator('meta[name="description"]')
            .getAttribute("content", { timeout: 2_000 })
            .catch(() => null) ??
            await page
              .locator('meta[property="og:description"]')
              .getAttribute("content", { timeout: 2_000 })
              .catch(() => null) ?? "";

          return {
            url: finalUrl,
            title,
            description,
            text,
            links,
            images,
            html: html.slice(0, 100_000),
            structured: {} as Record<string, unknown>,
          };
        });

        return {
          success: true,
          data: this.normalize(content) as PageContent,
          verificationBypassed: [],
          auditEntry: this.buildAuditEntry(passport, "browse", url, "success"),
        };
      } catch (err) {
        return this.errorResult(passport, "FETCH_FAILED", String(err)) as AdapterResult<PageContent>;
      }
    }

    // Fallback: plain fetch (works for simple pages, no JS rendering)
    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();
      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(
          response.status, html, Object.fromEntries(response.headers.entries()), passport, _kyaProfile
        );
        if (!challenge.resolved) {
          return {
            success: false,
            error: `Verification required: ${challenge.challengeType}`,
            errorCode: challenge.errorCode,
            auditEntry: this.buildAuditEntry(passport, "browse", url, "failure"),
          };
        }
      }
      const content = this.parsePageContent(url, html);
      return {
        success: true,
        data: this.normalize(content) as PageContent,
        verificationBypassed: [],
        auditEntry: this.buildAuditEntry(passport, "browse", url, "success"),
      };
    } catch (err) {
      return this.errorResult(passport, "FETCH_FAILED", String(err)) as AdapterResult<PageContent>;
    }
  }

  private async extractStructured(
    input: Record<string, unknown>,
    passport: AgentPassport,
    _kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ extracted: Record<string, unknown>; confidence: number; url: string }>> {
    const url = input["url"] as string;
    const schema = input["schema"] as Record<string, string>;

    if (pool.launched) {
      try {
        const result = await pool.withPage(passport.agentId, url, headers, async (page) => {
          await humanNavigation(page, url);
          await dismissModals(page);

          const extracted: Record<string, unknown> = {};
          let hits = 0;

          for (const [key, selectorOrSemantic] of Object.entries(schema)) {
            // Support semantic registry keys (e.g. "ecommerce:product-price")
            const value = selectorOrSemantic.includes(":")
              ? await selectorRegistry.extract(page, selectorOrSemantic)
              : await page.locator(selectorOrSemantic).first().innerText().catch(() => null);

            extracted[key] = value;
            if (value !== null) hits++;
          }

          const confidence = Object.keys(schema).length > 0
            ? hits / Object.keys(schema).length
            : 0;

          return { extracted, confidence, url: page.url() };
        });

        return {
          success: true,
          data: result,
          auditEntry: this.buildAuditEntry(passport, "extract", url, "success"),
        };
      } catch (err) {
        return this.errorResult(passport, "EXTRACT_FAILED", String(err)) as AdapterResult<{ extracted: Record<string, unknown>; confidence: number; url: string }>;
      }
    }

    // Fallback: regex heuristics on raw HTML
    try {
      const response = await fetch(url, { headers });
      const html = await response.text();
      const extracted: Record<string, unknown> = {};
      let hits = 0;
      for (const [key, selector] of Object.entries(schema)) {
        const value = this.extractByHeuristic(html, selector);
        extracted[key] = value;
        if (value !== null) hits++;
      }
      const confidence = Object.keys(schema).length > 0 ? hits / Object.keys(schema).length : 0;
      return {
        success: true,
        data: { extracted, confidence, url },
        auditEntry: this.buildAuditEntry(passport, "extract", url, "success"),
      };
    } catch (err) {
      return this.errorResult(passport, "EXTRACT_FAILED", String(err)) as AdapterResult<{ extracted: Record<string, unknown>; confidence: number; url: string }>;
    }
  }

  private async submitForm(
    input: Record<string, unknown>,
    passport: AgentPassport,
    _kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const url = input["url"] as string;
    const fields = input["fields"] as Record<string, string>;
    const formSelector = (input["formSelector"] as string) ?? "form";
    const submitSelector = (input["submitSelector"] as string) ?? "button[type='submit'], input[type='submit']";

    if (pool.launched) {
      try {
        const result = await pool.withPage(passport.agentId, url, headers, async (page) => {
          await humanNavigation(page, url);
          await dismissModals(page);

          // Fill each field using humanType
          for (const [name, value] of Object.entries(fields)) {
            const sel = `${formSelector} [name="${name}"], ${formSelector} #${name}`;
            await humanType(page, sel, value, { clearFirst: true });
          }

          await humanClick(page, submitSelector);
          await page.waitForLoadState("networkidle").catch(() => null);

          return { success: true, redirectedTo: page.url() };
        });

        return {
          success: result.success,
          data: result,
          auditEntry: this.buildAuditEntry(passport, "form_submit", url, "success"),
        };
      } catch (err) {
        return this.errorResult(passport, "FORM_SUBMIT_FAILED", String(err));
      }
    }

    // Fallback: POST form fields directly
    try {
      const formData = new URLSearchParams(fields);
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const html = await response.text();
      return {
        success: response.ok,
        data: { success: response.ok, redirectUrl: response.url !== url ? response.url : undefined, responseContent: this.normalize(this.parsePageContent(response.url, html)) },
        auditEntry: this.buildAuditEntry(passport, "form_submit", url, response.ok ? "success" : "failure"),
      };
    } catch (err) {
      return this.errorResult(passport, "FORM_SUBMIT_FAILED", String(err));
    }
  }

  private async apiCall(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const url = input["url"] as string;
    const method = (input["method"] as string) ?? "GET";
    const extraHeaders = (input["headers"] as Record<string, string> | undefined) ?? {};
    const body = input["body"];

    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, ...extraHeaders },
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: unknown;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: response.ok,
        data: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          data,
        },
        auditEntry: this.buildAuditEntry(passport, "api_call", url, response.ok ? "success" : "failure"),
      };
    } catch (err) {
      return this.errorResult(passport, "API_CALL_FAILED", String(err));
    }
  }

  private async monitorPage(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const url = input["url"] as string;
    const selector = input["selector"] as string;

    try {
      const response = await fetch(url, { headers });
      const html = await response.text();
      const currentValue = this.extractByHeuristic(html, selector) ?? "";

      return {
        success: true,
        data: {
          currentValue,
          changed: false, // Would require previous state storage
          checkedAt: new Date().toISOString(),
        },
        auditEntry: this.buildAuditEntry(passport, "read", url, "success"),
      };
    } catch (err) {
      return this.errorResult(passport, "MONITOR_FAILED", String(err));
    }
  }

  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;

    const content = rawOutput as PageContent;

    // Strip excessive whitespace from text
    if (content.text) {
      content.text = content.text.replace(/\s+/g, " ").trim();
    }

    // Make URLs absolute (if we had a base URL — skip for now)
    return content;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await fetch("https://httpbin.org/get");
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private parsePageContent(url: string, html: string): PageContent {
    const title = this.extractTagContent(html, "title") ?? "";
    const description =
      this.extractMetaContent(html, "description") ??
      this.extractMetaContent(html, "og:description") ??
      "";

    // Strip HTML tags for text
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const links = this.extractLinks(url, html);
    const images = this.extractImages(url, html);

    return {
      url,
      title,
      description,
      text: text.slice(0, 50000),
      html,
      links,
      images,
      structured: {},
    };
  }

  private extractTagContent(html: string, tag: string): string | null {
    const match = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
    return match?.[1]?.trim() ?? null;
  }

  private extractMetaContent(html: string, name: string): string | null {
    const patterns = [
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
      new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }

  private extractLinks(baseUrl: string, html: string): Link[] {
    const links: Link[] = [];
    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)</gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1] ?? "";
      const text = (match[2] ?? "").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;

      let absoluteHref = href;
      try {
        absoluteHref = new URL(href, baseUrl).href;
      } catch {
        continue;
      }

      const type: Link["type"] = href.startsWith("#")
        ? "anchor"
        : new URL(absoluteHref).hostname === new URL(baseUrl).hostname
        ? "internal"
        : "external";

      links.push({ href: absoluteHref, text, type });
    }

    return links.slice(0, 200);
  }

  private extractImages(baseUrl: string, html: string): Image[] {
    const images: Image[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1] ?? "";
      const alt = match[2] ?? "";
      if (!src) continue;

      let absoluteSrc = src;
      try {
        absoluteSrc = new URL(src, baseUrl).href;
      } catch {
        continue;
      }

      images.push({ src: absoluteSrc, alt });
    }

    return images.slice(0, 50);
  }

  private extractByHeuristic(html: string, selector: string): string | null {
    // Very simple extraction — by tag name or .class or #id
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      const match = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]+)`, "i"));
      return match?.[1]?.trim() ?? null;
    }
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      const match = html.match(
        new RegExp(`class=["'][^"']*${cls}[^"']*["'][^>]*>([^<]+)`, "i")
      );
      return match?.[1]?.trim() ?? null;
    }
    // Bare tag
    const match = html.match(new RegExp(`<${selector}[^>]*>([^<]+)</${selector}>`, "i"));
    return match?.[1]?.trim() ?? null;
  }

  private errorResult(
    passport: AgentPassport,
    errorCode: string,
    error?: string
  ): AdapterResult {
    return {
      success: false,
      error,
      errorCode,
      auditEntry: this.buildAuditEntry(passport, "read", "unknown", "failure"),
    };
  }

  private buildAuditEntry(
    passport: AgentPassport,
    type: import("@agentpass/core").AuditAction["type"],
    endpoint: string,
    outcome: "success" | "failure" | "blocked"
  ): AdapterResult["auditEntry"] {
    return {
      agentId: passport.agentId,
      principalId: passport.principalId,
      action: {
        type,
        system: "web:generic",
        endpoint,
        payloadHash: "",
      },
      outcome,
      verificationUsed: "agentpass_credentials",
      timestamp: new Date().toISOString(),
    };
  }
}
