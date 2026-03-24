/**
 * repos/passports.ts
 *
 * Repository functions for the `passports` table.
 * Handles issuance, lookup, and revocation of agent passport records.
 */

import { eq, and, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { passports } from "../schema.js";
import type { Passport, NewPassport } from "../schema.js";

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPassport(input: NewPassport): Promise<Passport> {
  const rows = await db.insert(passports).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to create passport");
  return row;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Returns the currently active (non-revoked, non-expired) passport for an agent.
 */
export async function findActivePassport(agentId: string): Promise<Passport | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(passports)
    .where(
      and(
        eq(passports.agentId, agentId),
        eq(passports.active, true),
        isNull(passports.revokedAt)
      )
    )
    .orderBy(passports.issuedAt)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Check expiry in application layer (avoids timezone edge cases)
  if (row.expiresAt && row.expiresAt < now) return null;

  return row;
}

/**
 * Get all passports for an agent (active and revoked).
 */
export async function listPassports(agentId: string): Promise<Passport[]> {
  return db
    .select()
    .from(passports)
    .where(eq(passports.agentId, agentId))
    .orderBy(passports.issuedAt);
}

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Revoke all active passports for an agent.
 * Returns the number of passports revoked.
 */
export async function revokePassports(agentId: string): Promise<number> {
  const now = new Date();
  const rows = await db
    .update(passports)
    .set({ active: false, revokedAt: now })
    .where(
      and(eq(passports.agentId, agentId), eq(passports.active, true))
    )
    .returning();
  return rows.length;
}

// ─── Token verification ───────────────────────────────────────────────────────

/**
 * Check the DB whether a passport token belongs to an active, non-revoked record.
 * Returns the record if valid, null if not found or revoked.
 */
export async function findPassportByToken(token: string): Promise<Passport | null> {
  const rows = await db
    .select()
    .from(passports)
    .where(
      and(
        eq(passports.token, token),
        eq(passports.active, true),
        isNull(passports.revokedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
