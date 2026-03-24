/**
 * @agentpass/db
 *
 * Postgres persistence layer for AgentPass.
 * Exposes the Drizzle db client, schema types, migration runner, and
 * repository functions for all entities.
 */

// ─── Client ───────────────────────────────────────────────────────────────────
export { db, sql } from "./client.js";
export type { DB } from "./client.js";

// ─── Migrations ───────────────────────────────────────────────────────────────
export { runMigrations } from "./migrate.js";

// ─── Schema types ─────────────────────────────────────────────────────────────
export type {
  Principal,
  NewPrincipal,
  Agent,
  NewAgent,
  Passport,
  NewPassport,
  KyaBehaviorSignal,
  NewKyaBehaviorSignal,
  KyaScore,
  NewKyaScore,
  AuditLogEntry,
  NewAuditLogEntry,
  DelegationToken,
  NewDelegationToken,
} from "./schema.js";

// ─── Repositories ─────────────────────────────────────────────────────────────

export {
  upsertPrincipal,
  findPrincipal,
  createAgent,
  findAgent,
  listAgents,
  updateAgentTier,
} from "./repos/agents.js";

export {
  createPassport,
  findActivePassport,
  listPassports,
  revokePassports,
  findPassportByToken,
} from "./repos/passports.js";

export {
  recordSignal,
  listSignals,
  dbSignalsToBehaviorSignals,
  saveKyaScore,
  latestKyaScore,
  listKyaScores,
} from "./repos/kya.js";

export {
  appendEntry,
  listEntries,
  verifyAuditChain,
} from "./repos/audit.js";
export type { AppendEntryInput, ListEntriesOptions } from "./repos/audit.js";

export {
  createDelegation,
  findDelegation,
  listDelegations,
  revokeDelegation,
  consumeDelegation,
} from "./repos/delegations.js";
