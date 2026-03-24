// ─── Passport ─────────────────────────────────────────────────────────────────
export {
  issuePassport,
  verifyPassport,
  revokePassport,
  hasCapability,
  serializePassport,
  deserializePassport,
  buildTrustCredentials,
  verifyTrustCredentials,
  buildAgentHeaders,
  setSecret as setPassportSecret,
  tierAtLeast,
  TIER_DEFINITIONS,
} from "./passport/index.js";
export type {
  AgentCapability,
  AgentTier,
  AgentPassport,
  TrustCredentials,
} from "./passport/index.js";

// ─── Delegation ───────────────────────────────────────────────────────────────
export {
  issueDelegation,
  verifyDelegation,
  revokeDelegation,
  consumeDelegation,
  serializeDelegation,
  deserializeDelegation,
  setSecret as setDelegationSecret,
} from "./delegation/index.js";
export type { DelegationToken, DelegationScope } from "./delegation/index.js";

// ─── KYA ──────────────────────────────────────────────────────────────────────
export {
  assessAgent,
  canAccess,
  scoreRisk,
  classifyAgent,
  computeVerificationReplacement,
  evaluateVerificationReplacement,
} from "./kya/index.js";
export type {
  KYAStatus,
  BehaviorSignal,
  VerificationReplacement,
  KYACheck,
  AgentClassification,
  KYAProfile,
} from "./kya/index.js";

// ─── Audit ────────────────────────────────────────────────────────────────────
export { createEntry, verifyChain, exportLog } from "./audit/index.js";
export type {
  AuditEntry,
  AuditAction,
  VerificationMethod,
} from "./audit/index.js";

// ─── Session ──────────────────────────────────────────────────────────────────
export {
  createSession,
  refreshSession,
  terminateSession,
  isSessionValid,
} from "./session/index.js";
export type { AgentSession, SessionStatus, AuthMethod } from "./session/index.js";

// ─── Trust ────────────────────────────────────────────────────────────────────
export {
  presentCredentials,
  parseSystemHandshake,
  evaluateVerification,
  buildVerificationProof,
  setSecret as setTrustSecret,
} from "./trust/index.js";
export type { SystemHandshake } from "./trust/index.js";
