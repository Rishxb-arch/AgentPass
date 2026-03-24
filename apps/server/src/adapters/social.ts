import { Page } from "playwright";
import { PlaywrightAdapter, AgentPassContext, AdapterResult } from "./base.js";

export interface SocialPost {
  id: string;
  url: string;
  author: string;
  body: string;
  postedAt: string | null;
  upvotes: number | null;
  commentCount: number | null;
  platform: string;
}

export interface SocialProfile {
  url: string;
  username: string;
  displayName: string;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  platform: string;
}

function detectPlatform(url: string): string {
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("twitter.com") || url.includes("x.com")) return "x";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("facebook.com")) return "facebook";
  return "unknown";
}

export class SocialPlaywrightAdapter extends PlaywrightAdapter {
  readonly id = "social-generic";
  readonly name = "SocialGenericAdapter";

  async getPost(ctx: AgentPassContext, postUrl: string): Promise<AdapterResult<SocialPost>> {
    const platform = detectPlatform(postUrl);

    // Reddit has a JSON API — faster and more reliable than scraping
    if (platform === "reddit") {
      return this.getRedditPost(ctx, postUrl);
    }

    return this.execute(ctx, postUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      return page.evaluate((pl: string): SocialPost => {
        const getEl = (sels: string[]) => {
          for (const s of sels) {
            const el = document.querySelector(s);
            if (el) return (el as HTMLElement).innerText?.trim() ?? null;
          }
          return null;
        };
        const url = window.location.href;
        return {
          id: url,
          url,
          author: getEl(['[data-testid="User-Name"]', '[class*="author"]', '[rel="author"]']) ?? "",
          body: getEl(['[data-testid="tweetText"]', '[class*="post-body"]', 'article[role="article"]', "article"]) ?? "",
          postedAt: document.querySelector("time[datetime]")?.getAttribute("datetime") ?? null,
          upvotes: null,
          commentCount: null,
          platform: pl,
        };
      }, platform);
    });
  }

  async getProfile(ctx: AgentPassContext, profileUrl: string): Promise<AdapterResult<SocialProfile>> {
    const platform = detectPlatform(profileUrl);

    // Reddit JSON API
    if (platform === "reddit") {
      return this.getRedditProfile(ctx, profileUrl);
    }

    return this.execute(ctx, profileUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      return page.evaluate(({ pl, url }: { pl: string; url: string }): SocialProfile => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ?? null;

        const parseCount = (text: string | null): number | null => {
          if (!text) return null;
          const n = text.replace(/[,\s]/g, "").match(/[\d.]+([KkMm]?)/);
          if (!n) return null;
          const base = parseFloat(n[0]);
          const suffix = n[1]?.toUpperCase();
          if (suffix === "K") return Math.round(base * 1000);
          if (suffix === "M") return Math.round(base * 1_000_000);
          return Math.round(base);
        };

        return {
          url,
          username: getMeta("og:title")?.split(" ")[0] ?? document.querySelector("h1")?.innerText?.trim() ?? "",
          displayName: getMeta("og:title") ?? document.querySelector("h1")?.innerText?.trim() ?? "",
          bio: getMeta("og:description") ?? document.querySelector('[class*="bio"], [class*="description"]')?.textContent?.trim() ?? null,
          followerCount: parseCount(document.querySelector('[class*="follower"]')?.textContent ?? null),
          followingCount: parseCount(document.querySelector('[class*="following"]')?.textContent ?? null),
          postCount: null,
          platform: pl,
        };
      }, { pl: platform, url: profileUrl });
    });
  }

  // Reddit has an excellent public JSON API — use it directly
  private async getRedditPost(ctx: AgentPassContext, url: string): Promise<AdapterResult<SocialPost>> {
    const start = Date.now();
    try {
      const jsonUrl = url.replace(/\/$/, "") + ".json";
      const res = await fetch(jsonUrl, {
        headers: { "User-Agent": "AgentPass/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Reddit API: HTTP ${res.status}`);
      const data = await res.json() as unknown[][];
      const post = (data[0] as unknown as { data: { children: { data: Record<string, unknown> }[] } }).data.children[0].data;
      return {
        success: true,
        data: {
          id: String(post.id),
          url: `https://reddit.com${post.permalink}`,
          author: String(post.author),
          body: String(post.selftext || post.title),
          postedAt: new Date(Number(post.created_utc) * 1000).toISOString(),
          upvotes: Number(post.ups),
          commentCount: Number(post.num_comments),
          platform: "reddit",
        },
        latencyMs: Date.now() - start,
        adapter: this.id,
        endpoint: "reddit:post",
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "reddit:post" };
    }
  }

  private async getRedditProfile(ctx: AgentPassContext, url: string): Promise<AdapterResult<SocialProfile>> {
    const start = Date.now();
    try {
      const username = url.split("/u/")[1]?.split("/")[0] ?? url.split("/user/")[1]?.split("/")[0];
      if (!username) throw new Error("Cannot extract username from URL");
      const res = await fetch(`https://www.reddit.com/user/${username}/about.json`, {
        headers: { "User-Agent": "AgentPass/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Reddit API: HTTP ${res.status}`);
      const data = await res.json() as { data: Record<string, unknown> };
      const d = data.data;
      return {
        success: true,
        data: {
          url,
          username: String(d.name),
          displayName: String(d.name),
          bio: String((d.subreddit as Record<string, unknown> | undefined)?.["public_description"] ?? "") || null,
          followerCount: Number((d.subreddit as Record<string, unknown> | undefined)?.["subscribers"] ?? 0),
          followingCount: null,
          postCount: Number(d.total_karma ?? 0),
          platform: "reddit",
        },
        latencyMs: Date.now() - start,
        adapter: this.id,
        endpoint: "reddit:profile",
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "reddit:profile" };
    }
  }
}

export const socialAdapter = new SocialPlaywrightAdapter();
