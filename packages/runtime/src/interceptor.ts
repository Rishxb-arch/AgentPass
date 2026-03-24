import { Page, Response } from "playwright";

export interface CapturedResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
  json: unknown | null;
  timestamp: number;
  /** Heuristic score: higher = more likely to be the primary data payload */
  relevanceScore: number;
}

/**
 * NetworkInterceptor attaches to a Playwright page and captures JSON API
 * responses matching registered URL patterns.
 *
 * Usage:
 *   const interceptor = new NetworkInterceptor(page);
 *   interceptor.register(["**\/search**", "**\/products**"]);
 *   await humanNavigation(page, url);
 *   const best = interceptor.bestMatch();
 */
export class NetworkInterceptor {
  private captured: CapturedResponse[] = [];
  private patterns: RegExp[] = [];
  private active = false;

  constructor(private readonly page: Page) {}

  /** Register glob-style URL patterns to capture. Call before navigation. */
  register(patterns: string[]): void {
    this.patterns = patterns.map(globToRegex);
    this.active = true;
    this.page.on("response", this.handler);
  }

  /** All captured responses sorted by relevance (highest first) */
  all(): CapturedResponse[] {
    return [...this.captured].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * The single best JSON response — largest JSON array payload that matches
   * a registered pattern.
   */
  bestMatch(): CapturedResponse | null {
    const jsonResponses = this.captured
      .filter((r) => r.json !== null)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    return jsonResponses[0] ?? null;
  }

  /** All captured responses that contain a JSON array at the root or in a common wrapper key */
  arrayResponses(): CapturedResponse[] {
    return this.captured.filter((r) => {
      if (!r.json) return false;
      if (Array.isArray(r.json)) return true;
      const obj = r.json as Record<string, unknown>;
      return ["data", "items", "results", "products", "list", "records", "hits"].some(
        (k) => Array.isArray(obj[k])
      );
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  stop(): void {
    if (this.active) {
      this.page.off("response", this.handler);
      this.active = false;
    }
  }

  clear(): void {
    this.captured = [];
  }

  private handler = async (response: Response): Promise<void> => {
    try {
      const url = response.url();
      if (!this.patterns.some((p) => p.test(url))) return;

      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.includes("application/json") && !contentType.includes("text/json")) return;

      const status = response.status();
      if (status < 200 || status >= 300) return;

      const body = await response.text();
      let json: unknown = null;
      try { json = JSON.parse(body); } catch { /* not JSON */ }

      const relevanceScore = this.score(url, body, json);

      this.captured.push({ url, status, contentType, body, json, timestamp: Date.now(), relevanceScore });
    } catch {
      // response may have already been disposed — ignore
    }
  };

  /** Heuristic: prefer large JSON arrays from non-CDN, non-tracking URLs */
  private score(url: string, body: string, json: unknown): number {
    let score = body.length; // bigger payload = more likely to be the data

    // Bonus for array payloads
    if (Array.isArray(json)) score += 10_000;
    else if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      const arrayKeys = ["data", "items", "results", "products", "list", "records", "hits"];
      if (arrayKeys.some((k) => Array.isArray(obj[k]))) score += 8_000;
    }

    // Penalty for analytics/tracking endpoints
    const trackingPenalty = ["analytics", "tracking", "pixel", "beacon", "log", "event", "metrics"];
    if (trackingPenalty.some((t) => url.toLowerCase().includes(t))) score -= 20_000;

    return score;
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(escaped, "i");
}
