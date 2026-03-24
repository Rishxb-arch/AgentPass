/**
 * repos/audit.ts
 *
 * Repository functions for the `audit_log` table.
 * Wraps @agentpass/core's createEntry() so the chain is maintained in Postgres.
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../client.js";
import { auditLog } from "../schema.js";
import type { AuditLogEntry, NewAuditLogEntry } from "../schema.js";
import { createEntry, verifyChain as coreVerifyChain } from "@agentpass/core";
import type { AuditAction, VerificationMethod } from "@agentpass/core";

// ─── Append ───────────────────────────────────────────────────────────────────

export interface AppendEntryInput {
  agentId: string;
  principalId: string;
  action: AuditAction;
  outcome: "success" | "failure" | "blocked";
  verificationUsed?: VerificationMethod;
  /** Optional URL of the target system for contextual audit logging */
  targetUrl?: string | null;
}

/**
 * Create a new audit entry chained to the agent's last entry and persist it.
 *
 * Fetches the previous hash from the DB, calls core's createEntry(),
 * then inserts the result.
 */
export async function appendEntry(input: AppendEntryInput): Promise<AuditLogEntry> {
  // Get the most recent entry's hash to maintain the chain
  const lastEntries = await db
    .select({ entryHash: auditLog.entryHash })
    .from(auditLog)
    .where(eq(auditLog.agentId, input.agentId))
    .orderBy(desc(auditLog.timestamp))
    .limit(1);

  const previousHash = lastEntries[0]?.entryHash ?? "genesis";

  const coreEntry = createEntry(
    input.agentId,
    input.principalId,
    input.action,
    input.outcome,
    previousHash,
    input.verificationUsed ?? "none"
  );

  const newEntry: NewAuditLogEntry = {
    entryId: coreEntry.entryId,
    agentId: coreEntry.agentId,
    principalId: coreEntry.principalId,
    action: coreEntry.action,  // stored as JSONB
    outcome: coreEntry.outcome,
    verificationUsed: coreEntry.verificationUsed,
    targetUrl: input.targetUrl ?? null,
    payloadHash: null,
    previousHash: coreEntry.previousHash,
    entryHash: coreEntry.entryHash,
    timestamp: new Date(coreEntry.timestamp),
  };

  const rows = await db.insert(auditLog).values(newEntry).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to append audit entry");
  return row;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface ListEntriesOptions {
  agentId?: string;
  limit?: number;
  offset?: number;
}

export async function listEntries(options: ListEntriesOptions = {}): Promise<AuditLogEntry[]> {
  if (options.agentId) {
    return db
      .select()
      .from(auditLog)
      .where(eq(auditLog.agentId, options.agentId))
      .orderBy(desc(auditLog.timestamp))
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);
  }
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.timestamp))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0);
}

// ─── Chain verification ───────────────────────────────────────────────────────

/**
 * Verify the entire audit chain for an agent.
 * Loads all entries ordered by timestamp and runs core's verifyChain().
 */
export async function verifyAuditChain(
  agentId: string
): Promise<{ valid: boolean; brokenAt?: number }> {
  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.agentId, agentId))
    .orderBy(auditLog.timestamp);

  const coreEntries = entries.map((e) => ({
    entryId: e.entryId,
    agentId: e.agentId,
    principalId: e.principalId,
    action: e.action as AuditAction,
    outcome: e.outcome as "success" | "failure" | "blocked",
    verificationUsed: e.verificationUsed as VerificationMethod,
    timestamp: e.timestamp.toISOString(),
    previousHash: e.previousHash,
    entryHash: e.entryHash,
  }));

  return coreVerifyChain(coreEntries);
}
