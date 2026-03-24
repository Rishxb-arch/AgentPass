import { Page } from "playwright";
import { PlaywrightAdapter, AgentPassContext, AdapterResult } from "./base.js";

export interface Article {
  url: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  description: string;
  fullText: string;
  imageUrl: string | null;
  tags: string[];
}

export interface FeedItem {
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  author: string | null;
}

export class NewsPlaywrightAdapter extends PlaywrightAdapter {
  readonly id = "news-generic";
  readonly name = "NewsGenericAdapter";

  async getArticle(ctx: AgentPassContext, articleUrl: string): Promise<AdapterResult<Article>> {
    return this.execute(ctx, articleUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);

      // Dismiss cookie banners / paywalls
      await this.dismissModals(page);

      return page.evaluate((): Article => {
        const getMeta = (name: string): string | null =>
          document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") ?? null;

        // JSON-LD article data
        let ldData: Record<string, unknown> = {};
        document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
          try {
            const parsed = JSON.parse(script.textContent ?? "{}");
            if (parsed["@type"] === "NewsArticle" || parsed["@type"] === "Article") {
              ldData = parsed;
            }
          } catch { /* skip */ }
        });

        const title =
          (ldData.headline as string) ??
          getMeta("og:title") ??
          document.querySelector("h1")?.innerText?.trim() ?? "";

        const author =
          (ldData.author as { name?: string })?.name ??
          getMeta("author") ??
          document.querySelector('[itemprop="author"], [rel="author"]')?.textContent?.trim() ?? null;

        const publishedAt =
          (ldData.datePublished as string) ??
          getMeta("article:published_time") ??
          document.querySelector("time[datetime]")?.getAttribute("datetime") ?? null;

        const description =
          (ldData.description as string) ??
          getMeta("og:description") ??
          getMeta("description") ?? "";

        const imageUrl = (ldData.image as string | { url?: string }) instanceof Object
          ? (ldData.image as { url?: string }).url ?? null
          : getMeta("og:image");

        // Extract article body — try common article selectors
        const bodySelectors = ["article", '[class*="article-body"]', '[class*="story-body"]', "main", ".content"];
        let fullText = "";
        for (const sel of bodySelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent && el.textContent.length > 200) {
            fullText = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 20_000) ?? "";
            break;
          }
        }

        const tags = Array.from(document.querySelectorAll('[rel="tag"], [class*="tag"], [class*="topic"]'))
          .map((el) => (el as HTMLElement).innerText?.trim())
          .filter(Boolean)
          .slice(0, 20);

        return { url: window.location.href, title, author, publishedAt, description, fullText, imageUrl: imageUrl ?? null, tags };
      });
    });
  }

  async getFeed(ctx: AgentPassContext, siteUrl: string): Promise<AdapterResult<FeedItem[]>> {
    // Try RSS first (much faster than full browser render)
    const rssResult = await this.tryRss(siteUrl);
    if (rssResult) return { success: true, data: rssResult, latencyMs: 0, adapter: this.id, endpoint: siteUrl };

    return this.execute(ctx, siteUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      await this.dismissModals(page);

      return page.evaluate((): FeedItem[] => {
        // Find article cards/teasers on the front page
        const cardSelectors = ["article", '[class*="article-card"]', '[class*="story-card"]', '[class*="feed-item"]', "li[class*='post']"];
        let cards: Element[] = [];
        for (const sel of cardSelectors) {
          const found = document.querySelectorAll(sel);
          if (found.length > 2) { cards = Array.from(found).slice(0, 30); break; }
        }

        return cards.map((card) => {
          const link = card.querySelector("a[href]") as HTMLAnchorElement | null;
          const heading = card.querySelector("h1, h2, h3");
          const desc = card.querySelector("p, [class*='excerpt'], [class*='description']");
          const time = card.querySelector("time[datetime]");
          const author = card.querySelector('[class*="author"], [rel="author"]');
          return {
            url: link?.href ?? "",
            title: (heading as HTMLElement)?.innerText?.trim() ?? (link?.innerText?.trim() ?? ""),
            description: (desc as HTMLElement)?.innerText?.trim() ?? "",
            publishedAt: time?.getAttribute("datetime") ?? null,
            author: (author as HTMLElement)?.innerText?.trim() ?? null,
          };
        }).filter((item) => item.title && item.url);
      });
    });
  }

  private async tryRss(siteUrl: string): Promise<FeedItem[] | null> {
    const rssUrls = [`${siteUrl.replace(/\/$/, "")}/feed`, `${siteUrl.replace(/\/$/, "")}/rss`, `${siteUrl.replace(/\/$/, "")}/feed.xml`];
    for (const url of rssUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const xml = await res.text();
        if (!xml.includes("<item>") && !xml.includes("<entry>")) continue;

        const items: FeedItem[] = [];
        const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
          const item = match[1];
          const tag = (name: string) => item.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>|<${name}[^>]*>([^<]*)</${name}>`))?.[1] ?? item.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1] ?? "";
          items.push({
            url: tag("link").trim(),
            title: tag("title").trim(),
            description: tag("description").trim().slice(0, 300),
            publishedAt: tag("pubDate") || tag("published") || null,
            author: tag("author") || tag("dc:creator") || null,
          });
        }
        if (items.length > 0) return items;
      } catch { /* skip */ }
    }
    return null;
  }

  private async dismissModals(page: Page): Promise<void> {
    const dismissSelectors = [
      "button:has-text('Accept')", "button:has-text('Agree')", "button:has-text('Got it')",
      "button:has-text('Close')", "[class*='cookie-close']", "[class*='paywall-dismiss']",
      "[class*='modal-close']", "[aria-label='Close']",
    ];
    for (const sel of dismissSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1000 }).catch(() => null);
        break;
      }
    }
  }
}

export const newsAdapter = new NewsPlaywrightAdapter();
