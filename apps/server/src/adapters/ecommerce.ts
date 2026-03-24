import { Page } from "playwright";
import { PlaywrightAdapter, AgentPassContext, AdapterResult } from "./base.js";

export interface Product {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  description: string;
  images: string[];
  inStock: boolean;
  rating: number | null;
  reviewCount: number | null;
  url: string;
}

export interface CartItem {
  productId: string;
  title: string;
  quantity: number;
  price: number;
}

export interface CartSummary {
  items: CartItem[];
  subtotal: number;
  currency: string;
  itemCount: number;
}

function parsePrice(text: string): number | null {
  const match = text.replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function parseCurrency(text: string): string {
  if (text.includes("₹") || text.toLowerCase().includes("inr")) return "INR";
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  return "USD";
}

export class EcommercePlaywrightAdapter extends PlaywrightAdapter {
  readonly id = "ecommerce-generic";
  readonly name = "EcommerceGenericAdapter";

  async searchProducts(
    ctx: AgentPassContext,
    siteUrl: string,
    query: string,
    options: { maxResults?: number; minPrice?: number; maxPrice?: number } = {}
  ): Promise<AdapterResult<Product[]>> {
    // Build search URL heuristically
    const searchUrl = this.buildSearchUrl(siteUrl, query);
    return this.execute(ctx, searchUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      return this.extractProductGrid(page, options.maxResults ?? 20);
    });
  }

  async getProduct(ctx: AgentPassContext, productUrl: string): Promise<AdapterResult<Product>> {
    return this.execute(ctx, productUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);

      const title = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const og = document.querySelector('meta[property="og:title"]');
        return h1?.innerText?.trim() ?? og?.getAttribute("content") ?? "";
      });

      const priceText = await page.evaluate(() => {
        // Common price selectors across e-commerce platforms
        const selectors = [
          '[itemprop="price"]', '[data-price]', '.price', '#price',
          '.product-price', '[class*="price"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return (el as HTMLElement).innerText ?? el.getAttribute("content") ?? "";
        }
        return "";
      });

      const description = await page.evaluate(() => {
        const descEl = document.querySelector('[itemprop="description"], #description, .product-description, [class*="description"]');
        return descEl ? (descEl as HTMLElement).innerText?.slice(0, 2000) : "";
      });

      const images = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img[src*="product"], [class*="product-image"] img, [class*="gallery"] img'))
          .slice(0, 5)
          .map((img) => (img as HTMLImageElement).src)
          .filter(Boolean)
      );

      const inStock = await page.evaluate(() => {
        const oosEl = document.querySelector('[class*="out-of-stock"], [class*="unavailable"]');
        const stockEl = document.querySelector('[itemprop="availability"]');
        if (oosEl) return false;
        if (stockEl) return stockEl.getAttribute("content")?.includes("InStock") ?? true;
        return true;
      });

      const ratingEl = await page.evaluate(() => {
        const el = document.querySelector('[itemprop="ratingValue"], [class*="rating"]');
        return el ? parseFloat((el as HTMLElement).innerText ?? el.getAttribute("content") ?? "0") : null;
      });

      const price = parsePrice(priceText);
      return {
        id: productUrl,
        title,
        price,
        currency: parseCurrency(priceText),
        description,
        images,
        inStock,
        rating: ratingEl,
        reviewCount: null,
        url: productUrl,
      };
    });
  }

  async getCart(ctx: AgentPassContext, siteUrl: string): Promise<AdapterResult<CartSummary>> {
    const cartUrl = this.buildCartUrl(siteUrl);
    return this.execute(ctx, cartUrl, async (page: Page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      const items = await page.evaluate((): CartItem[] => {
        const rows = document.querySelectorAll('[class*="cart-item"], [class*="basket-item"], tr[class*="item"]');
        return Array.from(rows).map((row) => {
          const titleEl = row.querySelector('[class*="title"], [class*="name"], a');
          const priceEl = row.querySelector('[class*="price"]');
          const qtyEl = row.querySelector('input[type="number"], [class*="quantity"]');
          return {
            productId: titleEl?.getAttribute("href") ?? "",
            title: (titleEl as HTMLElement)?.innerText?.trim() ?? "",
            quantity: parseInt((qtyEl as HTMLInputElement)?.value ?? "1", 10) || 1,
            price: parseFloat((priceEl as HTMLElement)?.innerText?.replace(/[^0-9.]/g, "") ?? "0") || 0,
          };
        }).filter((item) => item.title);
      });

      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return { items, subtotal, currency: "USD", itemCount: items.length };
    });
  }

  private buildSearchUrl(siteUrl: string, query: string): string {
    const base = siteUrl.replace(/\/$/, "");
    const q = encodeURIComponent(query);
    // Common search URL patterns
    if (base.includes("amazon")) return `${base}/s?k=${q}`;
    if (base.includes("flipkart")) return `${base}/search?q=${q}`;
    return `${base}/search?q=${q}&query=${q}`;
  }

  private buildCartUrl(siteUrl: string): string {
    const base = siteUrl.replace(/\/$/, "");
    if (base.includes("amazon")) return `${base}/gp/cart/view.html`;
    return `${base}/cart`;
  }

  private async extractProductGrid(page: Page, maxResults: number): Promise<Product[]> {
    return page.evaluate((max: number) => {
      // Common product card selectors across e-commerce
      const cardSelectors = [
        '[data-component-type="s-search-result"]', // Amazon
        '[class*="product-card"]',
        '[class*="product-item"]',
        '[class*="search-result"]',
        "article",
      ];

      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 2) { cards = Array.from(found).slice(0, max); break; }
      }

      return cards.map((card, i) => {
        const titleEl = card.querySelector("h2, h3, [class*='title'], [class*='name']");
        const priceEl = card.querySelector('[class*="price"], [data-price]');
        const imgEl = card.querySelector("img");
        const linkEl = card.querySelector("a");
        const priceText = (priceEl as HTMLElement)?.innerText ?? "";

        return {
          id: `result_${i}`,
          title: (titleEl as HTMLElement)?.innerText?.trim() ?? "",
          price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || null,
          currency: priceText.includes("₹") ? "INR" : "USD",
          description: "",
          images: imgEl ? [(imgEl as HTMLImageElement).src] : [],
          inStock: !card.textContent?.toLowerCase().includes("out of stock"),
          rating: null,
          reviewCount: null,
          url: (linkEl as HTMLAnchorElement)?.href ?? "",
        };
      }).filter((p) => p.title);
    }, maxResults);
  }
}

export const ecommerceAdapter = new EcommercePlaywrightAdapter();
