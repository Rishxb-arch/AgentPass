import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";
import { BaseAdapter } from "../base-adapter.js";
import type { AdapterManifest, AdapterResult, Article, Image } from "../types.js";

export class NewsGenericAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_news_generic",
    systemId: "news:*",
    systemName: "Generic News & Blog",
    version: "1.0.0",
    systemType: "news",
    requiredCapabilities: ["web:read", "data:extract"],
    requiredTier: "basic",
    agentPassAware: false,
    verificationRequirements: [
      { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 70 },
      { type: "rate_limit", satisfiedByAgentPass: true, requiredKYAScore: 50 },
    ],
    rateLimits: { requestsPerMinute: 25, requestsPerHour: 400, agentPassVerifiedMultiplier: 4 },
    outputSchema: {},
    systemPatterns: ["*.medium.com", "*.substack.com", "*.wordpress.com", "*.blogger.com"],
    endpoints: [
      { id: "get_article", description: "Fetch and parse an article", requiredCapability: "web:read", inputSchema: { url: "string" }, outputSchema: {}, category: "news" },
      { id: "get_feed", description: "Get articles from RSS/Atom feed or listing page", requiredCapability: "web:read", inputSchema: { url: "string", limit: "number?" }, outputSchema: {}, category: "news" },
      { id: "search_site", description: "Search within a news site", requiredCapability: "data:extract", inputSchema: { baseUrl: "string", query: "string", page: "number?" }, outputSchema: {}, category: "news" },
      { id: "get_sitemap", description: "Get sitemap URLs", requiredCapability: "web:read", inputSchema: { baseUrl: "string" }, outputSchema: {}, category: "news" },
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
      case "get_article": return this.getArticle(input, passport, kyaProfile, headers);
      case "get_feed": return this.getFeed(input, passport, kyaProfile, headers);
      case "search_site": return this.searchSite(input, passport, kyaProfile, headers);
      case "get_sitemap": return this.getSitemap(input, passport, kyaProfile, headers);
      default: return { success: false, errorCode: "UNKNOWN_ENDPOINT", auditEntry: this.audit(passport, "read", "", "failure") };
    }
  }

  private async getArticle(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<Article>> {
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

      const article = this.parseArticle(html, url);
      return {
        success: true,
        data: article,
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_ARTICLE_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async getFeed(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const url = input["url"] as string;
    const limit = (input["limit"] as number | undefined) ?? 20;

    const feedPaths = ["", "/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml"];
    const baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;

    for (const path of feedPaths) {
      try {
        const feedUrl = baseUrl + path;
        const response = await fetch(feedUrl, { headers });
        if (!response.ok) continue;

        const text = await response.text();
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("xml") || text.trimStart().startsWith("<?xml") || text.includes("<rss") || text.includes("<feed")) {
          const articles = this.parseXmlFeed(text, feedUrl, limit);
          return {
            success: true,
            data: { articles, feedTitle: this.extractFeedTitle(text), feedType: text.includes("<feed") ? "atom" : "rss" },
            auditEntry: this.audit(passport, "read", feedUrl, "success"),
          };
        }
      } catch {
        continue;
      }
    }

    // Fallback: scrape listing page
    try {
      const response = await fetch(url, { headers });
      const html = await response.text();
      const articles = this.scrapeArticleListing(html, url, limit);
      return {
        success: true,
        data: { articles, feedTitle: this.extractHtmlTitle(html), feedType: "html" },
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_FEED_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async searchSite(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const baseUrl = input["baseUrl"] as string;
    const query = input["query"] as string;
    const page = (input["page"] as number | undefined) ?? 1;
    const searchUrl = `${new URL(baseUrl).origin}/?s=${encodeURIComponent(query)}&paged=${page}`;

    try {
      const response = await fetch(searchUrl, { headers });
      const html = await response.text();
      const articles = this.scrapeArticleListing(html, baseUrl, 20);

      return {
        success: true,
        data: { results: articles },
        auditEntry: this.audit(passport, "search", searchUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "SEARCH_FAILED", auditEntry: this.audit(passport, "search", baseUrl, "failure") };
    }
  }

  private async getSitemap(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const baseUrl = input["baseUrl"] as string;
    const sitemapUrl = `${new URL(baseUrl).origin}/sitemap.xml`;

    try {
      const response = await fetch(sitemapUrl, { headers });
      const xml = await response.text();

      const urls: Array<{ url: string; lastModified?: string; changeFreq?: string }> = [];
      const urlRegex = /<url>([\s\S]*?)<\/url>/g;
      let match;
      while ((match = urlRegex.exec(xml)) !== null) {
        const block = match[1] ?? "";
        const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
        const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
        const freqMatch = block.match(/<changefreq>([^<]+)<\/changefreq>/);
        if (locMatch?.[1]) {
          urls.push({
            url: locMatch[1].trim(),
            lastModified: lastmodMatch?.[1]?.trim(),
            changeFreq: freqMatch?.[1]?.trim(),
          });
        }
      }

      return {
        success: true,
        data: { urls, totalUrls: urls.length },
        auditEntry: this.audit(passport, "read", sitemapUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_SITEMAP_FAILED", auditEntry: this.audit(passport, "read", baseUrl, "failure") };
    }
  }

  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput === "object" && rawOutput !== null) {
      const article = rawOutput as Partial<Article>;
      if (article.body) {
        article.body = article.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (article.publishedAt) {
        article.publishedAt = this.normalizeDate(article.publishedAt);
      }
    }
    return rawOutput;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    return { healthy: true };
  }

  // ── Parsing helpers ─────────────────────────────────────────────────────────

  private parseArticle(html: string, url: string): Article {
    // Try JSON-LD Article schema
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]?.trim() ?? "{}");
        if (["Article", "NewsArticle", "BlogPosting"].includes(data["@type"])) {
          return {
            url,
            title: String(data["headline"] ?? data["name"] ?? ""),
            author: data["author"] ? String((data["author"] as Record<string, unknown>)["name"] ?? data["author"]) : undefined,
            publishedAt: this.normalizeDate(String(data["datePublished"] ?? "")),
            updatedAt: this.normalizeDate(String(data["dateModified"] ?? "")),
            body: String(data["articleBody"] ?? ""),
            summary: data["description"] ? String(data["description"]) : undefined,
            tags: [],
            images: [],
            source: new URL(url).hostname,
            paywalled: false,
          };
        }
      } catch {
        // fall through
      }
    }

    // Heuristic extraction
    const title = this.extractTagContent(html, "h1") ?? this.extractTagContent(html, "title") ?? "";
    const body = this.extractArticleBody(html);
    const paywalled = /paywall|subscribe to read|premium content|members only/i.test(html);

    return {
      url,
      title,
      body,
      images: this.extractImages(url, html),
      source: new URL(url).hostname,
      paywalled,
    };
  }

  private parseXmlFeed(xml: string, feedUrl: string, limit: number): Omit<Article, "body">[] {
    const articles: Omit<Article, "body">[] = [];
    const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < limit) {
      const block = match[1] ?? "";
      const title = this.extractXmlTag(block, "title");
      const link = this.extractXmlTag(block, "link") ?? this.extractXmlTag(block, "id") ?? "";
      const pubDate = this.extractXmlTag(block, "pubDate") ?? this.extractXmlTag(block, "published") ?? "";

      if (title && link) {
        articles.push({
          url: link,
          title,
          publishedAt: this.normalizeDate(pubDate),
          images: [],
          source: new URL(feedUrl).hostname,
          paywalled: false,
        });
      }
    }

    return articles;
  }

  private scrapeArticleListing(html: string, baseUrl: string, limit: number): Omit<Article, "body">[] {
    const articles: Omit<Article, "body">[] = [];
    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null && articles.length < limit) {
      const href = match[1] ?? "";
      const title = (match[2] ?? "").trim();
      if (!title || !href) continue;

      let url = href;
      try { url = new URL(href, baseUrl).href; } catch { continue; }

      articles.push({ url, title, images: [], source: new URL(baseUrl).hostname, paywalled: false });
    }

    return articles;
  }

  private extractFeedTitle(xml: string): string {
    return this.extractXmlTag(xml, "title") ?? "Feed";
  }

  private extractHtmlTitle(html: string): string {
    return this.extractTagContent(html, "title") ?? "Site";
  }

  private extractTagContent(html: string, tag: string): string | null {
    const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
    return match?.[1]?.trim() ?? null;
  }

  private extractXmlTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
    return (match?.[1] ?? match?.[2] ?? "").trim() || null;
  }

  private extractArticleBody(html: string): string {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const content = articleMatch?.[1] ?? mainMatch?.[1] ?? html;
    return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50000);
  }

  private extractImages(baseUrl: string, html: string): Image[] {
    const images: Image[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null && images.length < 20) {
      const src = match[1] ?? "";
      if (!src) continue;
      try {
        images.push({ src: new URL(src, baseUrl).href, alt: match[2] ?? "" });
      } catch { continue; }
    }
    return images;
  }

  private normalizeDate(dateStr: string): string | undefined {
    if (!dateStr) return undefined;
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return dateStr;
    }
  }

  private audit(passport: AgentPassport, type: import("@agentpass/core").AuditAction["type"], endpoint: string, outcome: "success" | "failure" | "blocked"): AdapterResult["auditEntry"] {
    return { agentId: passport.agentId, principalId: passport.principalId, action: { type, system: "news:generic", endpoint, payloadHash: "" }, outcome, verificationUsed: "agentpass_credentials", timestamp: new Date().toISOString() };
  }
}
