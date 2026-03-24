/**
 * repos/agents.ts
 *
 * Repository functions for the `principals` and `agents` tables.
 */

import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { agents, principals } from "../schema.js";
import type { Agent, NewAgent, Principal, NewPrincipal } from "../schema.js";

// ─── Principals ───────────────────────────────────────────────────────────────

export async function upsertPrincipal(
  input: NewPrincipal
): Promise<Principal> {
  const rows = await db
    .insert(principals)
    .values(input)
    .onConflictDoUpdate({
      target: principals.id,
      set: { name: input.name, email: input.email },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`Failed to upsert principal ${input.id}`);
  return row;
}

export async function findPrincipal(id: string): Promise<Principal | null> {
  const rows = await db
    .select()
    .from(principals)
    .where(eq(principals.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function createAgent(input: NewAgent): Promise<Agent> {
  const rows = await db.insert(agents).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("Failed to create agent");
  return row;
}

export async function findAgent(agentId: string): Promise<Agent | null> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAgents(principalId?: string): Promise<Agent[]> {
  if (principalId) {
    return db
      .select()
      .from(agents)
      .where(eq(agents.principalId, principalId))
      .orderBy(agents.createdAt);
  }
  return db.select().from(agents).orderBy(agents.createdAt);
}

export async function updateAgentTier(
  agentId: string,
  tier: string
): Promise<Agent | null> {
  const rows = await db
    .update(agents)
    .set({ tier, updatedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning();
  return rows[0] ?? null;
}
