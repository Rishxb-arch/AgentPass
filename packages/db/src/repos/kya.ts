/**
 * repos/kya.ts
 *
 * Repository functions for KYA scoring:
 *   - kya_behavior_signals — individual signal records (count + windowHours per type)
 *   - kya_scores — computed KYA score snapshots
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../client.js";
import { kyaBehaviorSignals, kyaScores } from "../schema.js";
import type {
  KyaBehaviorSignal,
  NewKyaBehaviorSignal,
  KyaScore,
  NewKyaScore,
} from "../schema.js";
import type { BehaviorSignal } from "@agentpass/core";

// ─── Behavior signals ─────────────────────────────────────────────────────────

export async function recordSignal(
  input: NewKyaBehaviorSignal
): Promise<KyaBehaviorSignal> {
  const rows = await db.insert(kyaBehaviorSignals).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to record KYA signal");
  return row;
}

export async function listSignals(agentId: string): Promise<KyaBehaviorSignal[]> {
  return db
    .select()
    .from(kyaBehaviorSignals)
    .where(eq(kyaBehaviorSignals.agentId, agentId))
    .orderBy(kyaBehaviorSignals.recordedAt);
}

/**
 * Convert DB signal rows into the BehaviorSignal[] format that assessAgent() expects.
 * Each DB row maps 1:1 to a BehaviorSignal since we store count + windowHours directly.
 */
export function dbSignalsToBehaviorSignals(
  rows: KyaBehaviorSignal[]
): BehaviorSignal[] {
  return rows.map((r) => ({
    type: r.signalType as BehaviorSignal["type"],
    count: r.count,
    windowHours: r.windowHours,
  }));
}

// ─── KYA score snapshots ──────────────────────────────────────────────────────

export async function saveKyaScore(input: NewKyaScore): Promise<KyaScore> {
  const rows = await db.insert(kyaScores).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to save KYA score");
  return row;
}

/**
 * Returns the most recent KYA score snapshot for an agent, or null if none.
 */
export async function latestKyaScore(agentId: string): Promise<KyaScore | null> {
  const rows = await db
    .select()
    .from(kyaScores)
    .where(eq(kyaScores.agentId, agentId))
    .orderBy(desc(kyaScores.computedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listKyaScores(agentId: string): Promise<KyaScore[]> {
  return db
    .select()
    .from(kyaScores)
    .where(eq(kyaScores.agentId, agentId))
    .orderBy(desc(kyaScores.computedAt));
}
