import { randomBytes } from "node:crypto";
import type { AgentPassport } from "../passport/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionStatus = "active" | "expired" | "terminated";
export type AuthMethod = "agentpass_native" | "legacy_translated";

export interface AgentSession {
  sessionId: string;
  agentId: string;
  systemId: string;
  status: SessionStatus;
  authMethod: AuthMethod;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  metadata: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Create a new agent session.
 *
 * @param passport - The agent's passport
 * @param systemId - The system the session is for
 * @param ttlMinutes - Session TTL in minutes (default 60)
 * @param authMethod - How the session was established (default agentpass_native)
 */
export function createSession(
  passport: AgentPassport,
  systemId: string,
  ttlMinutes = 60,
  authMethod: AuthMethod = "agentpass_native"
): AgentSession {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

  return {
    sessionId: "ses_" + randomHex(8),
    agentId: passport.agentId,
    systemId,
    status: "active",
    authMethod,
    createdAt,
    lastActiveAt: createdAt,
    expiresAt,
    metadata: {},
  };
}

/**
 * Refresh a session, extending its expiry by the original TTL.
 */
export function refreshSession(
  session: AgentSession,
  ttlMinutes = 60
): AgentSession {
  if (session.status !== "active") {
    throw new Error("Cannot refresh a non-active session");
  }
  const now = new Date();
  return {
    ...session,
    lastActiveAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString(),
  };
}

/**
 * Terminate a session.
 */
export function terminateSession(session: AgentSession): AgentSession {
  return { ...session, status: "terminated" };
}

/**
 * Check if a session is currently valid.
 */
export function isSessionValid(session: AgentSession): boolean {
  if (session.status !== "active") return false;
  return new Date(session.expiresAt) > new Date();
}
