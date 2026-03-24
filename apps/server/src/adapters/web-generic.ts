import { Page } from "playwright";
import { PlaywrightAdapter, AgentPassContext, AdapterResult } from "./base.js";

export interface FetchPageResult {
  url: string;
  title: string;
  text: string;
  links: { href: string; text: string }[];
  images: { src: string; alt: string }[];
  statusCode: number;
}

export interface ExtractResult {
  url: string;
  data: Record<string, unknown>;
  schema: string[];
}

export interface FormSubmitResult {
  success: boolean;
  redirectedTo?: string;
  responseText?: string;
}

export class WebGenericPlaywrightAdapter extends PlaywrightAdapter {
  readonly id = "web-generic";
  readonly name = "WebGenericAdapter";

  async fetchPage(ctx: AgentPassContext, url: string): Promise<AdapterResult<FetchPageResult>> {
    return this.execute(ctx, url, async (page: Page) => {
      const statusCode = (await page.evaluate(() => (window as unknown as Record<string, unknown>)["__agentPassStatus"] as number)) ?? 200;
      const title = await page.title();
      const text = await page.evaluate(() =>
        (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 50_000)
      );
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]")).slice(0, 200).map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a as HTMLAnchorElement).innerText?.trim().slice(0, 100) ?? "",
        }))
      );
      const images = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img[src]")).slice(0, 50).map((img) => ({
          src: (img as HTMLImageElement).src,
          alt: (img as HTMLImageElement).alt ?? "",
        }))
      );
      return { url: page.url(), title, text, links, images, statusCode };
    });
  }

  async extractStructured(
    ctx: AgentPassContext,
    url: string,
    schema: string[]
  ): Promise<AdapterResult<ExtractResult>> {
    return this.execute(ctx, url, async (page: Page) => {
      // Use LLM-style heuristic extraction based on schema fields
      const data: Record<string, unknown> = {};
      for (const field of schema) {
        // Prefer JSON-LD, then meta tags, then visible text matching field name
        const value = await page.evaluate((fieldName: string) => {
          // Try JSON-LD
          const lds = document.querySelectorAll('script[type="application/ld+json"]');
          for (const ld of lds) {
            try {
              const obj = JSON.parse(ld.textContent ?? "{}");
              if (obj[fieldName]) return String(obj[fieldName]);
            } catch { /* skip */ }
          }
          // Try meta tags
          const meta = document.querySelector(`meta[name="${fieldName}"], meta[property="${fieldName}"]`);
          if (meta) return meta.getAttribute("content");
          // Try visible element by id/class/data-attr
          const el = document.querySelector(`[id="${fieldName}"], [class*="${fieldName}"], [data-field="${fieldName}"]`);
          if (el) return (el as HTMLElement).innerText?.trim() ?? null;
          return null;
        }, field);
        if (value !== null) data[field] = value;
      }
      return { url: page.url(), data, schema };
    });
  }

  async submitForm(
    ctx: AgentPassContext,
    url: string,
    selector: string,
    fields: Record<string, string>
  ): Promise<AdapterResult<FormSubmitResult>> {
    return this.execute(ctx, url, async (page: Page) => {
      for (const [name, value] of Object.entries(fields)) {
        const el = page.locator(`${selector} [name="${name}"], ${selector} #${name}`).first();
        if (await el.isVisible().catch(() => false)) {
          await el.fill(value);
        }
      }
      await page.locator(`${selector} [type="submit"], ${selector} button[type="submit"]`).first().click();
      await page.waitForLoadState("networkidle").catch(() => null);
      return {
        success: true,
        redirectedTo: page.url(),
        responseText: await page.evaluate(() => document.body?.innerText?.slice(0, 2000)),
      };
    });
  }
}

export const webGenericAdapter = new WebGenericPlaywrightAdapter();
