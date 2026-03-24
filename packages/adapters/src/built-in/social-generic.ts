import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";
import { BaseAdapter } from "../base-adapter.js";
import type { AdapterManifest, AdapterResult, Post, SocialProfile, Image } from "../types.js";

export class SocialGenericAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_social_generic",
    systemId: "social:*",
    systemName: "Generic Social Platform",
    version: "1.0.0",
    systemType: "social",
    requiredCapabilities: ["web:read", "data:extract"],
    requiredTier: "basic",
    agentPassAware: false,
    verificationRequirements: [
      { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 70 },
      { type: "login", satisfiedByAgentPass: true, requiredKYAScore: 65, requiredTier: "verified" },
    ],
    rateLimits: { requestsPerMinute: 15, requestsPerHour: 150, agentPassVerifiedMultiplier: 3 },
    outputSchema: {},
    systemPatterns: ["reddit.com", "*.reddit.com", "twitter.com", "x.com", "linkedin.com", "*.linkedin.com"],
    endpoints: [
      { id: "get_post", description: "Get a social media post", requiredCapability: "web:read", inputSchema: { url: "string" }, outputSchema: {}, category: "social" },
      { id: "get_profile", description: "Get a user profile", requiredCapability: "web:read", inputSchema: { url: "string" }, outputSchema: {}, category: "social" },
      { id: "get_feed", description: "Get feed/listing of posts", requiredCapability: "web:read", inputSchema: { url: "string", limit: "number?" }, outputSchema: {}, category: "social" },
      { id: "search", description: "Search posts and profiles", requiredCapability: "data:extract", inputSchema: { baseUrl: "string", query: "string", type: "string?" }, outputSchema: {}, category: "social" },
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
      return { success: false, error: auth.reason, errorCode: "UNAUTHORIZED", auditEntry: this.audit(passport, "read", "", "blocked") };
    }

    const headers = this.buildRequestHeaders(passport, kyaProfile);

    switch (endpointId) {
      case "get_post": return this.getPost(input, passport, kyaProfile, headers);
      case "get_profile": return this.getProfile(input, passport, kyaProfile, headers);
      case "get_feed": return this.getFeed(input, passport, kyaProfile, headers);
      case "search": return this.search(input, passport, kyaProfile, headers);
      default: return { success: false, errorCode: "UNKNOWN_ENDPOINT", auditEntry: this.audit(passport, "read", "", "failure") };
    }
  }

  private async getPost(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<Post>> {
    const url = input["url"] as string;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();

      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(response.status, html, Object.fromEntries(response.headers.entries()), passport, kyaProfile);
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "read", url, "failure") };
        }
      }

      const post = this.parsePost(html, url);
      return {
        success: true,
        data: post,
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_POST_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async getProfile(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<SocialProfile>> {
    const url = input["url"] as string;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();

      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(response.status, html, Object.fromEntries(response.headers.entries()), passport, kyaProfile);
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "read", url, "failure") };
        }
      }

      const profile = this.parseProfile(html, url);
      return {
        success: true,
        data: profile,
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_PROFILE_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async getFeed(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ posts: Post[]; platform: string }>> {
    const url = input["url"] as string;
    const limit = (input["limit"] as number | undefined) ?? 20;
    const platform = this.detectPlatform(url);

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();

      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(response.status, html, Object.fromEntries(response.headers.entries()), passport, kyaProfile);
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "read", url, "failure") };
        }
      }

      const posts = this.parseFeed(html, url, platform, limit);
      return {
        success: true,
        data: { posts, platform },
        auditEntry: this.audit(passport, "browse", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_FEED_FAILED", auditEntry: this.audit(passport, "browse", url, "failure") };
    }
  }

  private async search(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ results: Array<Post | SocialProfile> }>> {
    const baseUrl = input["baseUrl"] as string;
    const query = input["query"] as string;
    const type = (input["type"] as string | undefined) ?? "all";
    const platform = this.detectPlatform(baseUrl);
    const searchUrl = `${new URL(baseUrl).origin}/search?q=${encodeURIComponent(query)}&type=${type}`;

    try {
      const response = await fetch(searchUrl, { headers });
      const html = await response.text();
      const posts = this.parseFeed(html, baseUrl, platform, 20);

      return {
        success: true,
        data: { results: posts },
        auditEntry: this.audit(passport, "search", searchUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "SEARCH_FAILED", auditEntry: this.audit(passport, "search", baseUrl, "failure") };
    }
  }

  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;

    const post = rawOutput as Partial<Post>;
    if (post.content) {
      post.content = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    // Normalize relative time strings to ISO
    if (post.publishedAt) {
      post.publishedAt = this.normalizeRelativeTime(post.publishedAt) ?? post.publishedAt;
    }
    // Normalize engagement counts like "1.2K" -> 1200
    if (post.likes !== undefined) post.likes = this.parseCount(String(post.likes));
    if (post.comments !== undefined) post.comments = this.parseCount(String(post.comments));
    if (post.shares !== undefined) post.shares = this.parseCount(String(post.shares));

    return rawOutput;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    return { healthy: true };
  }

  // ── Parsing helpers ─────────────────────────────────────────────────────────

  private parsePost(html: string, url: string): Post {
    const platform = this.detectPlatform(url);

    // Try schema.org
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]?.trim() ?? "{}") as Record<string, unknown>;
        if (["SocialMediaPosting", "DiscussionForumPosting", "Comment", "Article"].includes(String(data["@type"]))) {
          return {
            url,
            author: data["author"] ? String((data["author"] as Record<string, unknown>)["name"] ?? data["author"]) : undefined,
            content: String(data["articleBody"] ?? data["text"] ?? ""),
            publishedAt: data["datePublished"] ? String(data["datePublished"]) : undefined,
            platform,
          };
        }
      } catch {
        // fall through
      }
    }

    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const content = h1Match?.[1]?.trim() ?? "";

    return { url, content, platform };
  }

  private parseProfile(html: string, url: string): SocialProfile {
    const platform = this.detectPlatform(url);
    const username = url.split("/").filter(Boolean).pop() ?? "";
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const displayName = h1Match?.[1]?.trim();

    return { url, username, displayName, platform };
  }

  private parseFeed(html: string, baseUrl: string, platform: string, limit: number): Post[] {
    const posts: Post[] = [];
    const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let match;

    while ((match = articleRegex.exec(html)) !== null && posts.length < limit) {
      const articleHtml = match[1] ?? "";
      const titleMatch = articleHtml.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
      const linkMatch = articleHtml.match(/<a[^>]+href=["']([^"']+)["']/i);
      const content = titleMatch?.[1]?.trim() ?? "";
      if (!content) continue;

      let postUrl = linkMatch?.[1] ?? baseUrl;
      try { postUrl = new URL(postUrl, baseUrl).href; } catch { postUrl = baseUrl; }

      posts.push({ url: postUrl, content, platform });
    }

    return posts;
  }

  private detectPlatform(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes("reddit")) return "reddit";
      if (hostname.includes("twitter") || hostname.includes("x.com")) return "twitter";
      if (hostname.includes("linkedin")) return "linkedin";
      if (hostname.includes("facebook")) return "facebook";
      if (hostname.includes("instagram")) return "instagram";
      return hostname;
    } catch {
      return "unknown";
    }
  }

  private normalizeRelativeTime(timeStr: string): string | undefined {
    try {
      return new Date(timeStr).toISOString();
    } catch {
      // Parse relative time like "2 hours ago", "3 days ago"
      const now = Date.now();
      const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
      if (match) {
        const num = parseInt(match[1] ?? "0");
        const unit = (match[2] ?? "").toLowerCase();
        const multipliers: Record<string, number> = {
          second: 1000, minute: 60000, hour: 3600000,
          day: 86400000, week: 604800000, month: 2592000000, year: 31536000000,
        };
        const ms = multipliers[unit] ?? 0;
        return new Date(now - num * ms).toISOString();
      }
      return undefined;
    }
  }

  private parseCount(str: string): number {
    if (typeof str === "number") return str;
    const cleaned = str.replace(/,/g, "").trim().toUpperCase();
    if (cleaned.endsWith("K")) return parseFloat(cleaned) * 1000;
    if (cleaned.endsWith("M")) return parseFloat(cleaned) * 1000000;
    if (cleaned.endsWith("B")) return parseFloat(cleaned) * 1000000000;
    return parseFloat(cleaned) || 0;
  }

  private audit(passport: AgentPassport, type: import("@agentpass/core").AuditAction["type"], endpoint: string, outcome: "success" | "failure" | "blocked"): AdapterResult["auditEntry"] {
    return { agentId: passport.agentId, principalId: passport.principalId, action: { type, system: "social:generic", endpoint, payloadHash: "" }, outcome, verificationUsed: "agentpass_credentials", timestamp: new Date().toISOString() };
  }
}
