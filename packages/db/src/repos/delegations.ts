/**
 * repos/delegations.ts
 *
 * Repository functions for the `delegation_tokens` table.
 */

import { eq, and } from "drizzle-orm";
import { db } from "../client.js";
import { delegationTokens } from "../schema.js";
import type { DelegationToken, NewDelegationToken } from "../schema.js";

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDelegation(
  input: NewDelegationToken
): Promise<DelegationToken> {
  const rows = await db.insert(delegationTokens).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to create delegation token");
  return row;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function findDelegation(tokenId: string): Promise<DelegationToken | null> {
  const rows = await db
    .select()
    .from(delegationTokens)
    .where(eq(delegationTokens.tokenId, tokenId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDelegations(agentId?: string): Promise<DelegationToken[]> {
  if (agentId) {
    return db
      .select()
      .from(delegationTokens)
      .where(eq(delegationTokens.agentId, agentId))
      .orderBy(delegationTokens.issuedAt);
  }
  return db.select().from(delegationTokens).orderBy(delegationTokens.issuedAt);
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeDelegation(tokenId: string): Promise<DelegationToken | null> {
  const rows = await db
    .update(delegationTokens)
    .set({ active: false })
    .where(eq(delegationTokens.tokenId, tokenId))
    .returning();
  return rows[0] ?? null;
}

// ─── Consume ──────────────────────────────────────────────────────────────────

/**
 * Increment usage count; if singleUse deactivate immediately.
 * Returns null if the token is not found or already inactive.
 */
export async function consumeDelegation(tokenId: string): Promise<DelegationToken | null> {
  const existing = await findDelegation(tokenId);
  if (!existing || !existing.active) return null;

  const newCount = existing.usageCount + 1;
  const deactivate = existing.singleUse;

  const rows = await db
    .update(delegationTokens)
    .set({
      usageCount: newCount,
      ...(deactivate ? { active: false } : {}),
    })
    .where(
      and(eq(delegationTokens.tokenId, tokenId), eq(delegationTokens.active, true))
    )
    .returning();
  return rows[0] ?? null;
}
