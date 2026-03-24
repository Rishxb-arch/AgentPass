import { Page } from "playwright";

/** Small random delay in [min, max] ms to simulate human timing */
function jitter(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

/**
 * Navigate to a URL with realistic timing.
 * Waits for domcontentloaded, then a short human-style pause.
 */
export async function humanNavigation(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Brief pause after page load — humans don't scrape at machine speed
  await jitter(400, 900);
  // Wait for network to quiet down (JS rendering)
  await page.waitForLoadState("networkidle").catch(() => null);
  await jitter(200, 500);
}

/**
 * Type into a field character-by-character with realistic keystroke delays.
 * Falls back gracefully if selector is not found.
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
  options: { clearFirst?: boolean } = {}
): Promise<boolean> {
  const el = page.locator(selector).first();
  const visible = await el.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!visible) return false;

  if (options.clearFirst) {
    await el.clear();
    await jitter(100, 200);
  }

  await el.focus();
  await jitter(150, 300);

  // Type with per-character delay (50-120ms average WPM ~60)
  await el.pressSequentially(text, { delay: 50 + Math.random() * 70 });
  await jitter(100, 250);
  return true;
}

/**
 * Click an element with a small pre-click hover pause.
 */
export async function humanClick(
  page: Page,
  selector: string,
  options: { timeout?: number } = {}
): Promise<boolean> {
  const el = page.locator(selector).first();
  const visible = await el.isVisible({ timeout: options.timeout ?? 3_000 }).catch(() => false);
  if (!visible) return false;

  await el.hover();
  await jitter(80, 200);
  await el.click();
  await jitter(200, 400);
  return true;
}

/**
 * Scroll the page naturally to trigger lazy-loaded content.
 */
export async function humanScroll(page: Page, steps = 3): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 400 + Math.random() * 200);
    await jitter(300, 600);
  }
}

/**
 * Dismiss common modal overlays (cookie banners, subscription prompts, etc.)
 * Returns true if something was dismissed.
 */
export async function dismissModals(page: Page): Promise<boolean> {
  const candidates = [
    "button:has-text('Accept')",
    "button:has-text('Accept All')",
    "button:has-text('Agree')",
    "button:has-text('Got it')",
    "button:has-text('OK')",
    "button:has-text('Close')",
    "button:has-text('Skip')",
    "button:has-text('Continue')",
    "[aria-label='Close']",
    "[class*='cookie'] button",
    "[class*='consent'] button",
    "[class*='modal-close']",
    "[class*='dismiss']",
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click({ timeout: 1_000 }).catch(() => null);
      await jitter(300, 500);
      return true;
    }
  }
  return false;
}
