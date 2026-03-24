/**
 * selectorRegistry — semantic CSS selector maps for common web patterns.
 *
 * Each key is a semantic name in the form "domain:concept".
 * Values are CSS selectors tried in priority order.
 *
 * Usage:
 *   const price = await selectorRegistry.extract(page, "ecommerce:product-price");
 */
import { Page } from "playwright";

type SelectorList = string[];

const registry: Record<string, SelectorList> = {
  // ── Ecommerce ─────────────────────────────────────────────────────────────
  "ecommerce:product-price": [
    '[itemprop="price"]',
    '[data-price]',
    '[data-testid*="price"]',
    ".price",
    "#price",
    ".product-price",
    '[class*="price--"]',
    '[class*="ProductPrice"]',
    '[class*="product-price"]',
    '[class*="offer-price"]',
    "span.a-price-whole", // Amazon
    ".a-offscreen",       // Amazon
  ],
  "ecommerce:product-name": [
    '[itemprop="name"]',
    '[data-testid*="product-title"]',
    "h1",
    ".product-title",
    ".product-name",
    '[class*="ProductTitle"]',
    "#productTitle",  // Amazon
    ".pdp-title",     // Flipkart
  ],
  "ecommerce:product-image": [
    '[itemprop="image"]',
    "#landingImage",          // Amazon
    ".product-image img",
    '[class*="ProductImage"] img',
    '[class*="product-image"] img',
    ".gallery-image img",
    '[data-testid*="image"] img',
  ],
  "ecommerce:add-to-cart": [
    "#add-to-cart-button",    // Amazon
    '[data-testid*="add-to-cart"]',
    "button:has-text('Add to cart')",
    "button:has-text('Add to bag')",
    "button:has-text('Add to Cart')",
    '[class*="add-to-cart"]',
    '[class*="AddToCart"]',
    ".addToCart",
  ],
  "ecommerce:in-stock": [
    '[class*="in-stock"]',
    '[class*="availability"]',
    '[itemprop="availability"]',
    "#availability",
  ],
  "ecommerce:search-input": [
    'input[type="search"]',
    'input[name="q"]',
    'input[name="query"]',
    'input[name="search"]',
    '[data-testid*="search"] input',
    "#search",
    ".search-input",
  ],
  "ecommerce:product-card": [
    '[data-component-type="s-search-result"]', // Amazon
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    '[class*="product-item"]',
    '[class*="search-result"]',
    "article[class*='product']",
    "li[class*='product']",
  ],

  // ── News ──────────────────────────────────────────────────────────────────
  "news:article-title": [
    '[itemprop="headline"]',
    "h1.article-title",
    "h1.entry-title",
    "h1.post-title",
    "h1",
    '[class*="article-title"]',
    '[class*="ArticleTitle"]',
  ],
  "news:article-body": [
    '[itemprop="articleBody"]',
    "article .entry-content",
    "article .post-content",
    ".article-body",
    ".story-body",
    ".article-content",
    "main article",
    "article",
  ],
  "news:article-author": [
    '[itemprop="author"]',
    '[rel="author"]',
    ".author",
    ".byline",
    '[class*="AuthorName"]',
    '[class*="author-name"]',
  ],
  "news:article-date": [
    '[itemprop="datePublished"]',
    "time[datetime]",
    '[class*="PublishDate"]',
    ".publish-date",
    ".post-date",
  ],
  "news:article-card": [
    "article",
    '[class*="article-card"]',
    '[class*="story-card"]',
    '[class*="news-card"]',
    "li[class*='story']",
  ],

  // ── Government ────────────────────────────────────────────────────────────
  "gov:table-data": ["table", ".data-table", ".results-table", "#dataTable"],
  "gov:form": ["form.main-form", "form#mainForm", "form", "#main-content form"],
  "gov:captcha": [".captcha", "#captcha", "[class*='captcha']", "#txtCaptcha"],
  "gov:submit-btn": [
    "button[type='submit']",
    "input[type='submit']",
    "#btnSubmit",
    "button:has-text('Search')",
    "button:has-text('Submit')",
  ],

  // ── Social ────────────────────────────────────────────────────────────────
  "social:post-body": [
    '[data-testid="tweetText"]',        // Twitter/X
    '.userContent',                      // Facebook
    '.feed-shared-update-v2__description',  // LinkedIn
    '[class*="post-body"]',
    "[class*='PostBody']",
  ],
  "social:post-author": [
    '[data-testid="User-Name"]',
    '[class*="username"]',
    '[class*="AuthorName"]',
  ],
};

export interface SelectorRegistryExtractOptions {
  /** If true, return innerText; if false, return attribute values or null */
  text?: boolean;
  timeout?: number;
}

export const selectorRegistry = {
  /** Get the CSS selector list for a semantic key */
  get(key: string): SelectorList {
    return registry[key] ?? [];
  },

  /** Try each selector in order, return the first non-empty innerText match */
  async extract(
    page: Page,
    key: string,
    options: SelectorRegistryExtractOptions = {}
  ): Promise<string | null> {
    const selectors = registry[key] ?? [];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        const visible = await el.isVisible({ timeout: options.timeout ?? 500 }).catch(() => false);
        if (!visible) continue;
        const text = await el.innerText().catch(() => null);
        if (text && text.trim()) return text.trim();
      } catch { /* try next */ }
    }
    return null;
  },

  /** Extract multiple semantic fields in parallel */
  async extractMany(
    page: Page,
    keys: string[],
    options: SelectorRegistryExtractOptions = {}
  ): Promise<Record<string, string | null>> {
    const entries = await Promise.all(
      keys.map(async (key) => [key, await selectorRegistry.extract(page, key, options)] as const)
    );
    return Object.fromEntries(entries);
  },

  /** Find all elements matching a semantic key and return their text content */
  async extractAll(page: Page, key: string): Promise<string[]> {
    const selectors = registry[key] ?? [];
    for (const sel of selectors) {
      try {
        const els = page.locator(sel);
        const count = await els.count().catch(() => 0);
        if (count === 0) continue;
        const texts = await Promise.all(
          Array.from({ length: Math.min(count, 50) }, (_, i) =>
            els.nth(i).innerText().catch(() => "")
          )
        );
        const filtered = texts.filter((t) => t.trim());
        if (filtered.length > 0) return filtered;
      } catch { /* try next */ }
    }
    return [];
  },

  /** Register custom selectors at runtime */
  register(key: string, selectors: SelectorList): void {
    registry[key] = selectors;
  },
};
