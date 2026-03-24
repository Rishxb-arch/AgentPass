import { Browser, BrowserContext, chromium, Page } from "playwright";
import { STEALTH_SCRIPT, CHROME_USER_AGENT } from "./stealth.js";
import { loadSession, saveSession, domainFromUrl } from "./sessions.js";

interface ContextEntry {
  context: BrowserContext;
  lastUsed: number;
  agentId: string;
}

const CONTEXT_TTL_MS = 10 * 60 * 1000;

export class BrowserPool {
  private browser: Browser | null = null;
  private contexts = new Map<string, ContextEntry>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private _launched = false;

  get launched(): boolean {
    return this._launched;
  }

  async launch(): Promise<void> {
    if (this._launched) return;
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        // Disable the AutomationControlled feature flag that headless Chrome exposes
        "--disable-blink-features=AutomationControlled",
        // Match a real Chrome installation more closely
        "--disable-infobars",
        "--window-size=1280,800",
        "--start-maximized",
        // Prevents the "Chrome is being controlled by automated test software" bar
        "--disable-extensions-except=",
        "--disable-popup-blocking",
      ],
    });
    this.gcTimer = setInterval(() => this.gc(), 60_000);
    this._launched = true;
    console.log("[BrowserPool] Chromium launched");
  }

  /**
   * Get or create a persistent BrowserContext for an agentId.
   * On first creation: loads a stored session (cookies/localStorage) if one exists,
   * applies the full stealth init script, and sets a realistic User-Agent.
   */
  async getContext(
    agentId: string,
    initialUrl?: string,
    extraHeaders?: Record<string, string>
  ): Promise<BrowserContext> {
    if (!this.browser) throw new Error("BrowserPool not launched — call pool.launch() first");

    const existing = this.contexts.get(agentId);
    if (existing) {
      existing.lastUsed = Date.now();
      if (extraHeaders) await existing.context.setExtraHTTPHeaders(extraHeaders);
      return existing.context;
    }

    // Try to load a stored session for this agent + domain
    const domain = initialUrl ? domainFromUrl(initialUrl) : undefined;
    const storedState = domain ? await loadSession(agentId, domain) : undefined;

    const context = await this.browser.newContext({
      // Realistic Chrome User-Agent instead of the obvious "Playwright" string
      userAgent: CHROME_USER_AGENT,
      ignoreHTTPSErrors: false,
      extraHTTPHeaders: extraHeaders ?? {},
      viewport: { width: 1280, height: 800 },
      // Restore session if we have one — agent is already "logged in"
      storageState: storedState as import("playwright").BrowserContextOptions["storageState"],
      // Match a real browser's locale and timezone
      locale: "en-US",
      timezoneId: "America/New_York",
      // Colour scheme preference (most sites default to light)
      colorScheme: "light",
    });

    if (storedState) {
      console.log(`[BrowserPool] Restored session for agent ${agentId.slice(0, 8)} on ${domain}`);
    }

    // Inject comprehensive stealth script — runs before any page JS
    await context.addInitScript({ content: STEALTH_SCRIPT });

    this.contexts.set(agentId, { context, lastUsed: Date.now(), agentId });
    return context;
  }

  /**
   * Lease a page, run fn, then close the page.
   *
   * AgentPass headers are injected on every outgoing request via route interception.
   * After fn() completes, the context's session state is persisted to disk so the
   * agent is "already logged in" on the next visit to the same domain.
   */
  async withPage<T>(
    agentId: string,
    url: string,
    agentPassHeaders: Record<string, string>,
    fn: (page: Page) => Promise<T>
  ): Promise<T> {
    const context = await this.getContext(agentId, url, agentPassHeaders);
    const page = await context.newPage();

    // Inject AgentPass headers on every outgoing request from this page
    await page.route("**/*", async (route) => {
      try {
        const existing = await route.request().allHeaders();
        await route.continue({ headers: { ...existing, ...agentPassHeaders } });
      } catch {
        // Route may already be handled (e.g. aborted by navigation) — ignore
      }
    });

    try {
      const result = await fn(page);

      // Persist session state after a successful run
      const domain = domainFromUrl(url);
      await saveSession(agentId, domain, context);

      return result;
    } finally {
      await page.close();
    }
  }

  async clearContext(agentId: string): Promise<void> {
    const entry = this.contexts.get(agentId);
    if (entry) {
      await entry.context.close().catch(() => null);
      this.contexts.delete(agentId);
    }
  }

  async drain(): Promise<void> {
    if (this.gcTimer) clearInterval(this.gcTimer);
    for (const entry of this.contexts.values()) {
      await entry.context.close().catch(() => null);
    }
    this.contexts.clear();
    await this.browser?.close();
    this.browser = null;
    this._launched = false;
    console.log("[BrowserPool] Drained");
  }

  private async gc(): Promise<void> {
    const now = Date.now();
    for (const [agentId, entry] of this.contexts) {
      if (now - entry.lastUsed > CONTEXT_TTL_MS) {
        await entry.context.close().catch(() => null);
        this.contexts.delete(agentId);
      }
    }
  }

  get contextCount(): number {
    return this.contexts.size;
  }
}

// Singleton — imported by both apps/server and packages/adapters
export const pool = new BrowserPool();
