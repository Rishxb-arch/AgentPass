import type { AgentPassport, AgentTier } from "../passport/index.js";
import { verifyPassport, tierAtLeast } from "../passport/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type KYAStatus = "unverified" | "pending" | "verified" | "flagged" | "blocked";

export interface BehaviorSignal {
  type:
    | "rate_limit_hit"
    | "auth_failure"
    | "scope_violation"
    | "normal_operation"
    | "bulk_read"
    | "form_submission"
    | "repeated_access"
    | "clean_history";
  count: number;
  windowHours: number;
}

/**
 * VerificationReplacement maps this agent's KYA score to which
 * human verification mechanisms the score makes unnecessary.
 */
export interface VerificationReplacement {
  /** trustScore >= 70 */
  replacesCaptcha: boolean;
  /** trustScore >= 80 AND principalVerified */
  replacesOTP: boolean;
  /** trustScore >= 60 AND tier >= "verified" */
  replacesLoginWall: boolean;
  /** trustScore >= 50 */
  replacesRateLimit: boolean;
  /** principalVerified AND tier >= "basic" */
  replacesEmailVerification: boolean;
}

export interface KYACheck {
  name: string;
  passed: boolean;
  score: number;
  detail: string;
  checkedAt: string;
}

export interface AgentClassification {
  type:
    | "assistant"
    | "automation"
    | "research"
    | "commerce"
    | "transactional"
    | "unknown";
  confidence: number;
  tags: string[];
}

export interface KYAProfile {
  agentId: string;
  principalId: string;
  status: KYAStatus;
  riskScore: number;
  trustScore: number;
  verificationReplacement: VerificationReplacement;
  classification: AgentClassification;
  checks: KYACheck[];
  approvedSystems: string[];
  blockedSystems: string[];
  assessedAt: string;
}

// ─── Assessment ───────────────────────────────────────────────────────────────

/**
 * Assess an agent and produce a KYA profile.
 * The resulting trustScore determines which human verifications
 * the agent's credentials can replace.
 */
export function assessAgent(options: {
  passport: AgentPassport;
  declaredIntent?: string;
  targetSystem?: string;
  behaviorSignals?: BehaviorSignal[];
}): KYAProfile {
  const { passport, declaredIntent = "", targetSystem, behaviorSignals = [] } = options;

  const checks: KYACheck[] = [];
  const now = new Date().toISOString();
  let aggregateScore = 0;
  let maxScore = 0;

  // ── Check 1: Passport validity ──────────────────────────────────────────
  const passportCheck = verifyPassport(passport);
  checks.push({
    name: "passport_validity",
    passed: passportCheck.valid,
    score: passportCheck.valid ? 100 : 0,
    detail: passportCheck.valid
      ? "Passport signature and expiry valid"
      : passportCheck.reason ?? "Invalid passport",
    checkedAt: now,
  });
  aggregateScore += passportCheck.valid ? 100 : 0;
  maxScore += 100;

  // If passport is invalid, immediately block
  if (!passportCheck.valid) {
    const riskScore = 100;
    const trustScore = 0;
    return buildProfile({
      passport,
      status: "blocked",
      riskScore,
      trustScore,
      checks,
      behaviorSignals,
      declaredIntent,
      ...(targetSystem !== undefined && { targetSystem }),
    });
  }

  // ── Check 2: Principal verification ─────────────────────────────────────
  const principalVerified =
    passport.principalId !== "" && passport.principalId !== "anonymous";
  checks.push({
    name: "principal_verification",
    passed: principalVerified,
    score: principalVerified ? 90 : 20,
    detail: principalVerified
      ? "Principal ID is non-empty and non-anonymous"
      : "Principal ID is anonymous or empty — reduced trust",
    checkedAt: now,
  });
  aggregateScore += principalVerified ? 90 : 20;
  maxScore += 90;

  // ── Check 3: Capability scope ────────────────────────────────────────────
  const hasIdentityDelegate = passport.capabilities.includes("identity:delegate");
  const isScopeViolation = passport.tier === "basic" && hasIdentityDelegate;
  const scopeScore = isScopeViolation ? 30 : 85;
  checks.push({
    name: "capability_scope",
    passed: !isScopeViolation,
    score: scopeScore,
    detail: isScopeViolation
      ? "Basic tier agent holding identity:delegate — potential scope violation"
      : "Capability scope is appropriate for tier",
    checkedAt: now,
  });
  aggregateScore += scopeScore;
  maxScore += 85;

  // ── Check 4: Behavior history ─────────────────────────────────────────────
  let behaviorScore = 100;
  const authFailures = behaviorSignals
    .filter((s) => s.type === "auth_failure")
    .reduce((sum, s) => sum + s.count, 0);
  const scopeViolations = behaviorSignals
    .filter((s) => s.type === "scope_violation")
    .reduce((sum, s) => sum + s.count, 0);

  behaviorScore -= authFailures * 10;
  behaviorScore -= scopeViolations * 20;
  behaviorScore = Math.max(0, behaviorScore);

  checks.push({
    name: "behavior_history",
    passed: behaviorScore >= 60,
    score: behaviorScore,
    detail: `Auth failures: ${authFailures}, Scope violations: ${scopeViolations}. Score: ${behaviorScore}/100`,
    checkedAt: now,
  });
  aggregateScore += behaviorScore;
  maxScore += 100;

  // ── Check 5: Intent declaration ───────────────────────────────────────────
  const intentScore = declaredIntent.length > 10 ? 80 : 50;
  checks.push({
    name: "intent_declaration",
    passed: declaredIntent.length > 10,
    score: intentScore,
    detail:
      declaredIntent.length > 10
        ? `Declared intent: "${declaredIntent.slice(0, 80)}"`
        : "Intent declaration absent or too short",
    checkedAt: now,
  });
  aggregateScore += intentScore;
  maxScore += 80;

  // ── Compute base scores ───────────────────────────────────────────────────
  const baseScore = Math.round((aggregateScore / maxScore) * 100);
  const riskScore = Math.max(0, Math.min(100, 100 - baseScore));
  let trustScore = baseScore;

  // ── Check 6: Clean history bonus ─────────────────────────────────────────
  const cleanHistoryCount = behaviorSignals
    .filter((s) => s.type === "clean_history")
    .reduce((sum, s) => sum + s.count, 0);
  if (cleanHistoryCount > 0) {
    trustScore = Math.min(100, trustScore + 10);
  }
  checks.push({
    name: "clean_history_bonus",
    passed: cleanHistoryCount > 0,
    score: cleanHistoryCount > 0 ? 10 : 0,
    detail:
      cleanHistoryCount > 0
        ? `+10 trust bonus from ${cleanHistoryCount} clean history signals`
        : "No clean history signals present",
    checkedAt: now,
  });

  // ── Status determination ──────────────────────────────────────────────────
  let status: KYAStatus;
  if (isScopeViolation || riskScore > 70) {
    status = "flagged";
  } else if (riskScore > 40) {
    status = "pending";
  } else {
    status = "verified";
  }

  return buildProfile({
    passport,
    status,
    riskScore,
    trustScore,
    checks,
    behaviorSignals,
    declaredIntent,
    ...(targetSystem !== undefined && { targetSystem }),
  });
}

function buildProfile(options: {
  passport: AgentPassport;
  status: KYAStatus;
  riskScore: number;
  trustScore: number;
  checks: KYACheck[];
  behaviorSignals: BehaviorSignal[];
  declaredIntent: string;
  targetSystem?: string;
}): KYAProfile {
  const { passport, status, riskScore, trustScore, checks, behaviorSignals } =
    options;

  const principalVerified =
    passport.principalId !== "" && passport.principalId !== "anonymous";

  const verificationReplacement = computeVerificationReplacement({
    trustScore,
    principalVerified,
    tier: passport.tier,
  });

  const classification = classifyAgent(passport, behaviorSignals);

  return {
    agentId: passport.agentId,
    principalId: passport.principalId,
    status,
    riskScore,
    trustScore,
    verificationReplacement,
    classification,
    checks,
    approvedSystems: [],
    blockedSystems: [],
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Compute the VerificationReplacement based on KYA scores.
 * This is the explicit mapping of what human verification this agent replaces.
 */
export function computeVerificationReplacement(options: {
  trustScore: number;
  principalVerified: boolean;
  tier: AgentTier;
}): VerificationReplacement {
  const { trustScore, principalVerified, tier } = options;
  return {
    replacesCaptcha: trustScore >= 70,
    replacesOTP: trustScore >= 80 && principalVerified,
    replacesLoginWall: trustScore >= 60 && tierAtLeast(tier, "verified"),
    replacesRateLimit: trustScore >= 50,
    replacesEmailVerification: principalVerified && tierAtLeast(tier, "basic"),
  };
}

/**
 * Check if an agent can access a given system.
 */
export function canAccess(
  profile: KYAProfile,
  systemId: string,
  requiredTier?: AgentTier
): { allowed: boolean; reason: string } {
  if (profile.status === "blocked") {
    return { allowed: false, reason: "Agent is blocked" };
  }
  if (profile.blockedSystems.includes(systemId)) {
    return { allowed: false, reason: `System '${systemId}' is blocked for this agent` };
  }
  if (profile.status === "flagged") {
    return { allowed: false, reason: "Agent is flagged — manual review required" };
  }
  if (requiredTier) {
    // We can't check tier here without the passport; trust the adapter to enforce
  }
  return { allowed: true, reason: "Access granted" };
}

/**
 * Score risk from a set of behavior signals.
 */
export function scoreRisk(signals: BehaviorSignal[]): number {
  let risk = 0;
  for (const signal of signals) {
    switch (signal.type) {
      case "auth_failure":
        risk += signal.count * 10;
        break;
      case "scope_violation":
        risk += signal.count * 20;
        break;
      case "rate_limit_hit":
        risk += signal.count * 5;
        break;
      case "bulk_read":
        risk += signal.count * 2;
        break;
      case "clean_history":
        risk = Math.max(0, risk - signal.count * 5);
        break;
    }
  }
  return Math.min(100, risk);
}

/**
 * Classify an agent based on its capabilities and signals.
 */
export function classifyAgent(
  passport: AgentPassport,
  signals: BehaviorSignal[]
): AgentClassification {
  const caps = passport.capabilities;
  const tags: string[] = [];

  if (caps.some((c) => c.startsWith("commerce:"))) tags.push("commerce");
  if (caps.some((c) => c.startsWith("payments:"))) tags.push("payments");
  if (caps.some((c) => c.startsWith("data:"))) tags.push("data");
  if (caps.some((c) => c.startsWith("api:"))) tags.push("api");
  if (caps.some((c) => c.startsWith("web:"))) tags.push("web");
  if (caps.includes("identity:delegate")) tags.push("delegation");

  const formSubmissions = signals.filter((s) => s.type === "form_submission").length;
  if (formSubmissions > 0) tags.push("form-submitter");

  let type: AgentClassification["type"] = "unknown";
  let confidence = 0.5;

  if (
    caps.includes("commerce:search") ||
    caps.includes("commerce:cart") ||
    caps.includes("commerce:checkout")
  ) {
    type = "commerce";
    confidence = 0.85;
  } else if (caps.includes("payments:initiate") || caps.includes("payments:read")) {
    type = "transactional";
    confidence = 0.9;
  } else if (caps.includes("data:extract") || caps.includes("data:monitor")) {
    type = "research";
    confidence = 0.75;
  } else if (caps.includes("web:forms") || caps.includes("web:auth")) {
    type = "automation";
    confidence = 0.7;
  } else if (caps.includes("web:browse") || caps.includes("web:read")) {
    type = "assistant";
    confidence = 0.65;
  }

  return { type, confidence, tags };
}

/**
 * Evaluate whether a specific verification type is replaced by this profile.
 */
export function evaluateVerificationReplacement(
  profile: KYAProfile,
  targetVerificationType: string
): boolean {
  const vr = profile.verificationReplacement;
  switch (targetVerificationType) {
    case "captcha":
      return vr.replacesCaptcha;
    case "otp":
      return vr.replacesOTP;
    case "login":
    case "login_wall":
      return vr.replacesLoginWall;
    case "rate_limit":
      return vr.replacesRateLimit;
    case "email_verify":
      return vr.replacesEmailVerification;
    default:
      return false;
  }
}
