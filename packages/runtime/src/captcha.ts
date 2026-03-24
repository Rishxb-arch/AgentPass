/**
 * captcha.ts
 *
 * CAPTCHA detection, solving (via 2captcha), and token injection.
 *
 * Supported types:
 *   - reCAPTCHA v2 (checkbox + invisible)
 *   - reCAPTCHA v3 (score-based, no user interaction)
 *   - hCaptcha
 *   - Cloudflare Turnstile
 *
 * Usage:
 *   const detection = await detectCaptcha(page);
 *   if (detection) {
 *     const token = await solveCaptcha(detection, page.url(), apiKey);
 *     if (token) await injectCaptchaToken(page, detection, token);
 *   }
 *
 * Requires env: TWOCAPTCHA_API_KEY or CAPSOLVER_API_KEY
 */

import type { Page } from "playwright";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CaptchaType =
  | "recaptcha_v2"
  | "recaptcha_v3"
  | "hcaptcha"
  | "turnstile"
  | "image_captcha";

export interface CaptchaDetection {
  type: CaptchaType;
  sitekey?: string;
  /** reCAPTCHA v3 action string (e.g. "login", "submit") */
  action?: string;
  /** Selector of the element that holds the sitekey */
  containerSelector?: string;
}

export interface CaptchaSolveResult {
  token: string;
  type: CaptchaType;
  solvedIn: number;
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Scan the current page for known CAPTCHA widgets.
 * Returns null if no CAPTCHA is found.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaDetection | null> {
  return page.evaluate((): {
    type: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "turnstile" | "image_captcha";
    sitekey?: string;
    action?: string;
    containerSelector?: string;
  } | null => {
    // ── reCAPTCHA v2 ──────────────────────────────────────────────────────────
    const rcV2 = document.querySelector<HTMLElement>(
      ".g-recaptcha[data-sitekey], [data-callback][data-sitekey], div[data-sitekey]:not(.cf-turnstile):not(.h-captcha)"
    );
    if (rcV2) {
      return {
        type: "recaptcha_v2",
        sitekey: rcV2.dataset.sitekey,
        containerSelector: ".g-recaptcha",
      };
    }

    // ── reCAPTCHA v3 (script tag with render= param) ─────────────────────────
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
    for (const script of scripts) {
      const src = script.src || "";
      if (src.includes("recaptcha/api.js") || src.includes("recaptcha/enterprise.js")) {
        const match = src.match(/[?&]render=([^&]+)/);
        const actionEl = document.querySelector<HTMLElement>("[data-action]");
        if (match) {
          return {
            type: "recaptcha_v3",
            sitekey: decodeURIComponent(match[1]),
            action: actionEl?.dataset.action ?? "verify",
          };
        }
      }
    }

    // ── hCaptcha ──────────────────────────────────────────────────────────────
    const hcap = document.querySelector<HTMLElement>(
      ".h-captcha[data-sitekey], [data-hcaptcha-widget-id]"
    );
    if (hcap) {
      return {
        type: "hcaptcha",
        sitekey: hcap.dataset.sitekey,
        containerSelector: ".h-captcha",
      };
    }

    // ── Cloudflare Turnstile ──────────────────────────────────────────────────
    const ts = document.querySelector<HTMLElement>(".cf-turnstile[data-sitekey]");
    if (ts) {
      return {
        type: "turnstile",
        sitekey: ts.dataset.sitekey,
        containerSelector: ".cf-turnstile",
      };
    }

    // ── Image CAPTCHA (text-based) ────────────────────────────────────────────
    const imgCaptcha = document.querySelector<HTMLElement>(
      "img[src*='captcha'], img[alt*='captcha' i], img[id*='captcha' i]"
    );
    if (imgCaptcha) {
      return { type: "image_captcha" };
    }

    return null;
  });
}

// ─── Solving ──────────────────────────────────────────────────────────────────

/**
 * Solve a detected CAPTCHA using 2captcha.
 * Returns the solution token, or null if solving fails.
 *
 * @param detection  Result from detectCaptcha()
 * @param pageUrl    Current page URL (required by solving service)
 * @param apiKey     2captcha API key (from TWOCAPTCHA_API_KEY env var)
 */
export async function solveCaptcha(
  detection: CaptchaDetection,
  pageUrl: string,
  apiKey: string
): Promise<CaptchaSolveResult | null> {
  const start = Date.now();

  try {
    const taskId = await submitTask(detection, pageUrl, apiKey);
    if (!taskId) return null;

    console.log(`[CAPTCHA] Task ${taskId} submitted for ${detection.type} on ${pageUrl}`);

    const token = await pollResult(taskId, apiKey);
    if (!token) return null;

    const solvedIn = Date.now() - start;
    console.log(`[CAPTCHA] Solved ${detection.type} in ${solvedIn}ms`);
    return { token, type: detection.type, solvedIn };
  } catch (err) {
    console.error("[CAPTCHA] Solve failed:", err);
    return null;
  }
}

async function submitTask(
  detection: CaptchaDetection,
  pageUrl: string,
  apiKey: string
): Promise<string | null> {
  const params = new URLSearchParams({ key: apiKey, json: "1", pageurl: pageUrl });

  switch (detection.type) {
    case "recaptcha_v2":
      params.set("method", "userrecaptcha");
      params.set("googlekey", detection.sitekey ?? "");
      break;

    case "recaptcha_v3":
      params.set("method", "userrecaptcha");
      params.set("googlekey", detection.sitekey ?? "");
      params.set("version", "v3");
      params.set("action", detection.action ?? "verify");
      params.set("min_score", "0.7");
      break;

    case "hcaptcha":
      params.set("method", "hcaptcha");
      params.set("sitekey", detection.sitekey ?? "");
      break;

    case "turnstile":
      params.set("method", "turnstile");
      params.set("sitekey", detection.sitekey ?? "");
      break;

    case "image_captcha":
      // Image CAPTCHAs require screenshot + base64 submission — skip for now
      console.warn("[CAPTCHA] Image CAPTCHA solving not yet implemented");
      return null;

    default:
      return null;
  }

  const res = await fetch("https://2captcha.com/in.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.warn(`[CAPTCHA] Submit HTTP error: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as { status: number; request: string };
  if (data.status !== 1) {
    console.warn("[CAPTCHA] Submit rejected:", data.request);
    return null;
  }

  return data.request; // task ID
}

async function pollResult(
  taskId: string,
  apiKey: string,
  maxWaitMs = 120_000,
  pollIntervalMs = 5_000
): Promise<string | null> {
  const url = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    let data: { status: number; request: string };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      data = (await res.json()) as { status: number; request: string };
    } catch {
      continue; // transient network error — keep polling
    }

    if (data.status === 1) return data.request; // solved!
    if (data.request === "CAPCHA_NOT_READY") continue;

    // Any other response is a hard error
    console.warn("[CAPTCHA] Poll error:", data.request);
    return null;
  }

  console.warn("[CAPTCHA] Timed out after", maxWaitMs, "ms");
  return null;
}

// ─── Token injection ──────────────────────────────────────────────────────────

/**
 * Inject a solved CAPTCHA token into the page and trigger the site's callback.
 * Must be called after solveCaptcha() returns a token.
 */
export async function injectCaptchaToken(
  page: Page,
  detection: CaptchaDetection,
  token: string
): Promise<void> {
  await page.evaluate(
    ({ type, token }: { type: string; token: string }) => {
      // ── reCAPTCHA v2 / v3 ─────────────────────────────────────────────────
      if (type === "recaptcha_v2" || type === "recaptcha_v3") {
        // Inject into every g-recaptcha-response textarea on the page
        document.querySelectorAll<HTMLTextAreaElement>("textarea[name='g-recaptcha-response']").forEach((ta) => {
          ta.value = token;
          ta.style.display = "block";
          ta.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Fire registered grecaptcha callbacks
        const win = window as unknown as Record<string, unknown>;
        const cfg = win["___grecaptcha_cfg"] as Record<string, unknown> | undefined;
        if (cfg?.["clients"]) {
          const clients = cfg["clients"] as Record<string, unknown>;
          for (const client of Object.values(clients)) {
            const c = client as Record<string, unknown>;
            if (typeof c["callback"] === "function") {
              (c["callback"] as (t: string) => void)(token);
            }
            // Also look one level deeper (enterprise wrapping)
            for (const sub of Object.values(c)) {
              if (sub && typeof (sub as Record<string, unknown>)["callback"] === "function") {
                ((sub as Record<string, unknown>)["callback"] as (t: string) => void)(token);
              }
            }
          }
        }

        // Patch grecaptcha.execute for v3 so future calls return the token
        const grecaptcha = win["grecaptcha"] as Record<string, unknown> | undefined;
        if (grecaptcha) {
          grecaptcha["execute"] = () => Promise.resolve(token);
          const ent = grecaptcha["enterprise"] as Record<string, unknown> | undefined;
          if (ent) ent["execute"] = () => Promise.resolve(token);
        }
      }

      // ── hCaptcha ─────────────────────────────────────────────────────────
      if (type === "hcaptcha") {
        document.querySelectorAll<HTMLTextAreaElement>("textarea[name='h-captcha-response']").forEach((ta) => {
          ta.value = token;
          ta.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const win = window as unknown as Record<string, unknown>;
        const hcaptcha = win["hcaptcha"] as Record<string, unknown> | undefined;
        if (hcaptcha && typeof hcaptcha["execute"] === "function") {
          hcaptcha["execute"] = () => Promise.resolve({ response: token });
        }
      }

      // ── Cloudflare Turnstile ──────────────────────────────────────────────
      if (type === "turnstile") {
        document.querySelectorAll<HTMLInputElement>("input[name='cf-turnstile-response']").forEach((inp) => {
          inp.value = token;
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const win = window as unknown as Record<string, unknown>;
        const turnstile = win["turnstile"] as Record<string, unknown> | undefined;
        if (turnstile && typeof turnstile["execute"] === "function") {
          turnstile["execute"] = () => token;
        }
      }
    },
    { type: detection.type, token }
  );

  // Brief wait for the site's callback to process the injected token
  await page.waitForTimeout(500);
}

/**
 * Full pipeline: detect → solve → inject.
 * Returns true if a CAPTCHA was found and successfully solved.
 */
export async function handleCaptcha(page: Page, apiKey?: string): Promise<boolean> {
  const key = apiKey ?? process.env["TWOCAPTCHA_API_KEY"];
  if (!key) {
    console.warn("[CAPTCHA] No API key — set TWOCAPTCHA_API_KEY to enable solving");
    return false;
  }

  const detection = await detectCaptcha(page);
  if (!detection) return false; // no CAPTCHA found

  console.log(`[CAPTCHA] Detected ${detection.type} (sitekey: ${detection.sitekey?.slice(0, 16)}...)`);

  const result = await solveCaptcha(detection, page.url(), key);
  if (!result) return false;

  await injectCaptchaToken(page, detection, result.token);
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
