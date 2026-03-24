/**
 * sessions.ts
 *
 * Persistent browser sessions — saves and restores Playwright storageState
 * (cookies + localStorage + sessionStorage) per agentId + domain.
 *
 * Why this matters:
 *   - Most "login walls" agents hit repeatedly are sites the agent already
 *     authenticated with once. Persisting the session means the agent is
 *     always "already logged in" and never sees the login wall again.
 *   - Session files are stored in .agentpass-sessions/ at the project root.
 *     Add this directory to .gitignore.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "playwright";

// ─── Config ───────────────────────────────────────────────────────────────────

const SESSIONS_DIR = join(process.cwd(), ".agentpass-sessions");

/** Sessions older than this are considered stale and ignored (7 days) */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionMeta {
  agentId: string;
  domain: string;
  savedAt: string;
  cookieCount: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a stored storageState for a given agentId + domain.
 * Returns undefined if no session exists or it has expired.
 */
export async function loadSession(
  agentId: string,
  domain: string
): Promise<object | undefined> {
  const path = sessionPath(agentId, domain);
  try {
    const fileStat = await stat(path);
    const ageMs = Date.now() - fileStat.mtimeMs;
    if (ageMs > SESSION_MAX_AGE_MS) {
      console.log(`[Sessions] Session for ${domain} expired (${Math.round(ageMs / 86400000)}d old)`);
      return undefined;
    }
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as { state: object; meta: SessionMeta };
    console.log(`[Sessions] Loaded session for ${domain} (${parsed.meta.cookieCount} cookies)`);
    return parsed.state;
  } catch {
    return undefined;
  }
}

/**
 * Save the current context's storageState for a given agentId + domain.
 * Called automatically by the pool after each successful page load.
 */
export async function saveSession(
  agentId: string,
  domain: string,
  context: BrowserContext
): Promise<void> {
  try {
    await mkdir(SESSIONS_DIR, { recursive: true });
    const state = await context.storageState();
    const meta: SessionMeta = {
      agentId,
      domain,
      savedAt: new Date().toISOString(),
      cookieCount: state.cookies.length,
    };
    await writeFile(
      sessionPath(agentId, domain),
      JSON.stringify({ state, meta }, null, 2)
    );
  } catch (err) {
    // Non-fatal — session persistence is best-effort
    console.warn(`[Sessions] Failed to save session for ${domain}:`, err);
  }
}

/**
 * Check whether a valid (non-expired) session exists for a given agentId + domain.
 */
export async function hasSession(agentId: string, domain: string): Promise<boolean> {
  const loaded = await loadSession(agentId, domain);
  return loaded !== undefined;
}

/**
 * Delete a stored session — call this after a site logs the agent out
 * or returns a 401 despite having a valid session.
 */
export async function clearSession(agentId: string, domain: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(sessionPath(agentId, domain));
    console.log(`[Sessions] Cleared session for ${domain}`);
  } catch {
    // Already gone — fine
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionPath(agentId: string, domain: string): string {
  // Sanitize to filesystem-safe names
  const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 64);
  const safeAgent = agentId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 32);
  return join(SESSIONS_DIR, `${safeAgent}__${safeDomain}.json`);
}

/**
 * Extract the registrable domain from a URL for session keying.
 * "https://www.amazon.in/product/123" → "amazon.in"
 */
export function domainFromUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    // Strip leading www.
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
