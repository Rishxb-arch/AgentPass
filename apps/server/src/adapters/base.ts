import { Page } from "playwright";
import { pool, handleCaptcha } from "@agentpass/runtime";

export interface AgentPassContext {
  agentId: string;
  principalId: string;
  tier: string;
  trustScore: number;
  serializedToken: string;
  delegationToken?: string;
  capabilities: string[];
}

export interface AdapterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  verificationBypassed?: "captcha" | "rate_limit" | "login_wall" | "otp" | null;
  statusCode?: number;
  latencyMs: number;
  adapter: string;
  endpoint: string;
}

export interface VerificationResult {
  type: "captcha" | "otp" | "login_wall" | "rate_limit" | "none";
  resolved: boolean;
  method?: "agentpass_headers" | "captcha_solver" | "credential" | "backoff";
}

// Build AgentPass HTTP headers from context
export function buildAgentPassHeaders(ctx: AgentPassContext): Record<string, string> {
  const headers: Record<string, string> = {
    "X-AgentPass-Passport": ctx.serializedToken,
    "X-AgentPass-KYA-Score": String(ctx.trustScore),
    "X-AgentPass-Tier": ctx.tier,
    "X-AgentPass-Principal": ctx.principalId,
    "X-AgentPass-Capabilities-Hash": ctx.capabilities.slice().sort().join(",").slice(0, 16),
    "X-AgentPass-Version": "1.0",
    "X-AgentPass-Timestamp": new Date().toISOString(),
  };
  if (ctx.delegationToken) {
    headers["X-AgentPass-Delegation"] = ctx.delegationToken;
  }
  return headers;
}

// Detect verification challenges on a loaded page
export async function detectVerification(page: Page, statusCode?: number): Promise<VerificationResult["type"]> {
  if (statusCode === 429) return "rate_limit";
  if (statusCode === 401 || statusCode === 403) return "login_wall";

  const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() ?? "");
  const html = await page.content();

  if (html.includes("g-recaptcha") || html.includes("h-captcha") || html.includes("cf-turnstile") || bodyText.includes("captcha")) {
    return "captcha";
  }
  if (bodyText.includes("verify your email") || bodyText.includes("enter the code") || bodyText.includes("otp")) {
    return "otp";
  }
  if (bodyText.includes("sign in") || bodyText.includes("log in") || bodyText.includes("create an account")) {
    return "login_wall";
  }
  return "none";
}

// Attempt to resolve a verification challenge
export async function resolveVerification(
  type: VerificationResult["type"],
  page: Page,
  ctx: AgentPassContext
): Promise<VerificationResult> {
  if (type === "none") return { type: "none", resolved: true };

  // Rate limit: wait and retry
  if (type === "rate_limit") {
    if (ctx.trustScore >= 50) {
      // High trust — page.reload() after brief wait
      await page.waitForTimeout(2000);
      return { type, resolved: true, method: "backoff" };
    }
    return { type, resolved: false };
  }

  // Login wall: AgentPass headers should have already been injected
  // If we still see it, the site doesn't support AgentPass yet
  if (type === "login_wall") {
    if (ctx.trustScore >= 60 && ctx.tier !== "basic") {
      // Headers were already injected — site doesn't support AgentPass natively
      // Try clicking "Continue as guest" or dismiss modal
      const dismissSelectors = ["[data-dismiss]", ".modal-close", "button:has-text('Skip')", "button:has-text('Continue')"];
      for (const sel of dismissSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          return { type, resolved: true, method: "agentpass_headers" };
        }
      }
    }
    return { type, resolved: false };
  }

  // CAPTCHA: solve via 2captcha then inject token
  if (type === "captcha") {
    const solved = await handleCaptcha(page, process.env["TWOCAPTCHA_API_KEY"]);
    if (solved) {
      return { type, resolved: true, method: "captcha_solver" };
    }
    return { type, resolved: false };
  }

  return { type, resolved: false };
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

// Base class all Playwright adapters extend
export abstract class PlaywrightAdapter {
  abstract readonly id: string;
  abstract readonly name: string;

  protected async execute<T>(
    ctx: AgentPassContext,
    url: string,
    fn: (page: Page) => Promise<T>
  ): Promise<AdapterResult<T>> {
    const start = Date.now();
    const headers = buildAgentPassHeaders(ctx);

    try {
      const data = await withRetry(() =>
        pool.withPage(ctx.agentId, url, headers, async (page) => {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          const statusCode = response?.status() ?? 200;

          const challengeType = await detectVerification(page, statusCode);
          if (challengeType !== "none") {
            const resolution = await resolveVerification(challengeType, page, ctx);
            if (!resolution.resolved) {
              throw new Error(`Unresolved verification challenge: ${challengeType}`);
            }
          }

          return fn(page);
        })
      );

      return {
        success: true,
        data,
        latencyMs: Date.now() - start,
        adapter: this.id,
        endpoint: url,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
        adapter: this.id,
        endpoint: url,
      };
    }
  }

  // JSON API call without full browser rendering (for documented APIs)
  protected async apiCall<T>(
    url: string,
    options: RequestInit & { headers?: Record<string, string> },
    ctx: AgentPassContext
  ): Promise<T> {
    const agentPassHeaders = buildAgentPassHeaders(ctx);
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AgentPass/1.0",
        ...agentPassHeaders,
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }
}
