/**
 * schema.ts
 *
 * Drizzle ORM schema for AgentPass persistence.
 *
 * Tables:
 *   principals         — humans / organisations that own agents
 *   agents             — registered AI agent identities
 *   passports          — issued + revocable passport records (one active per agent)
 *   kya_behavior_signals — behaviour events that feed KYA scoring
 *   kya_scores         — computed KYA score snapshots
 *   audit_log          — blockchain-style chained audit entries
 *   delegation_tokens  — issued delegation tokens with usage tracking
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ─── principals ──────────────────────────────────────────────────────────────

export const principals = pgTable("principals", {
  id: text("id").primaryKey(),           // matches principalId in passports
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── agents ──────────────────────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),                       // "ap_xxx" format
  principalId: text("principal_id")
    .notNull()
    .references(() => principals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("basic"),     // basic | verified | trusted | sovereign
  capabilities: jsonb("capabilities").notNull().default([]),
  fingerprint: text("fingerprint").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agents_principal_idx").on(t.principalId),
]);

// ─── passports ───────────────────────────────────────────────────────────────

export const passports = pgTable("passports", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  token: text("token").notNull(),           // serialized "agentpass.xxx.yyy" token
  signature: text("signature").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
}, (t) => [
  index("passports_agent_idx").on(t.agentId),
  index("passports_active_idx").on(t.agentId, t.active),
]);

// ─── kya_behavior_signals ────────────────────────────────────────────────────

export const kyaBehaviorSignals = pgTable("kya_behavior_signals", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  /** auth_failure | scope_violation | clean_history | rate_limit_hit | normal_operation | bulk_read | form_submission | repeated_access */
  signalType: text("signal_type").notNull(),
  /** Number of occurrences of this signal type in the window */
  count: integer("count").notNull().default(1),
  /** Time window in hours that count applies to (default 24) */
  windowHours: integer("window_hours").notNull().default(24),
  /** Which site/system reported this signal */
  source: text("source"),
  metadata: jsonb("metadata").notNull().default({}),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("kya_signals_agent_idx").on(t.agentId),
  index("kya_signals_type_idx").on(t.agentId, t.signalType),
]);

// ─── kya_scores ──────────────────────────────────────────────────────────────

export const kyaScores = pgTable("kya_scores", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  trustScore: integer("trust_score").notNull(),
  riskScore: integer("risk_score").notNull(),
  /** unverified | pending | verified | flagged | blocked */
  status: text("status").notNull(),
  /** assistant | automation | research | commerce | transactional | unknown */
  classificationType: text("classification_type"),
  replacesCaptcha: boolean("replaces_captcha").notNull().default(false),
  replacesOtp: boolean("replaces_otp").notNull().default(false),
  replacesLoginWall: boolean("replaces_login_wall").notNull().default(false),
  replacesRateLimit: boolean("replaces_rate_limit").notNull().default(false),
  replacesEmailVerification: boolean("replaces_email_verification").notNull().default(false),
  /** Snapshot of signals used for this computation */
  signalsSnapshot: jsonb("signals_snapshot").notNull().default({}),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("kya_scores_agent_idx").on(t.agentId),
  index("kya_scores_computed_idx").on(t.agentId, t.computedAt),
]);

// ─── audit_log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  entryId: text("entry_id").primaryKey(),    // "aud_xxx" format
  agentId: text("agent_id").notNull(),
  principalId: text("principal_id").notNull(),
  /** AuditAction object: { type, system, endpoint, payloadHash } */
  action: jsonb("action").notNull(),
  /** success | failure | blocked */
  outcome: text("outcome").notNull(),
  /** agentpass_credentials | legacy_auth | none */
  verificationUsed: text("verification_used").notNull(),
  targetUrl: text("target_url"),
  payloadHash: text("payload_hash"),
  /** SHA-256 of the previous entry — forms the chain */
  previousHash: text("previous_hash").notNull(),
  /** SHA-256 of this entire entry */
  entryHash: text("entry_hash").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
}, (t) => [
  index("audit_agent_idx").on(t.agentId),
  index("audit_timestamp_idx").on(t.agentId, t.timestamp),
]);

// ─── delegation_tokens ───────────────────────────────────────────────────────

export const delegationTokens = pgTable("delegation_tokens", {
  tokenId: text("token_id").primaryKey(),    // "del_xxx" format
  agentId: text("agent_id").notNull(),       // agent being delegated TO
  grantorId: text("grantor_id").notNull(),   // agent doing the delegating
  scope: jsonb("scope").notNull(),           // { systems, capabilities, maxActions, allowedHours }
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  singleUse: boolean("single_use").notNull().default(false),
  usageCount: integer("usage_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  signature: text("signature").notNull(),
}, (t) => [
  index("delegation_agent_idx").on(t.agentId),
  index("delegation_grantor_idx").on(t.grantorId),
]);

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Principal = typeof principals.$inferSelect;
export type NewPrincipal = typeof principals.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Passport = typeof passports.$inferSelect;
export type NewPassport = typeof passports.$inferInsert;

export type KyaBehaviorSignal = typeof kyaBehaviorSignals.$inferSelect;
export type NewKyaBehaviorSignal = typeof kyaBehaviorSignals.$inferInsert;

export type KyaScore = typeof kyaScores.$inferSelect;
export type NewKyaScore = typeof kyaScores.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type DelegationToken = typeof delegationTokens.$inferSelect;
export type NewDelegationToken = typeof delegationTokens.$inferInsert;
