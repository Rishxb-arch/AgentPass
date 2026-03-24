import { createHash, randomBytes } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AuditAction {
  type: "read" | "write" | "auth" | "form_submit" | "api_call" | "browse" | "search" | "extract";
  system: string;
  endpoint: string;
  payloadHash: string;
}

export type VerificationMethod = "agentpass_credentials" | "legacy_auth" | "none";

export interface AuditEntry {
  entryId: string;
  agentId: string;
  principalId: string;
  action: AuditAction;
  outcome: "success" | "failure" | "blocked";
  verificationUsed: VerificationMethod;
  timestamp: string;
  previousHash: string;
  entryHash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Create a new audit log entry.
 * Each entry is chained to the previous via previousHash.
 */
export function createEntry(
  agentId: string,
  principalId: string,
  action: AuditAction,
  outcome: AuditEntry["outcome"],
  previousHash = "genesis",
  verificationUsed: VerificationMethod = "none"
): AuditEntry {
  const entryId = "aud_" + randomHex(8);
  const timestamp = new Date().toISOString();

  const entryHash = sha256(
    entryId +
      agentId +
      JSON.stringify(action) +
      outcome +
      timestamp +
      previousHash
  );

  return {
    entryId,
    agentId,
    principalId,
    action,
    outcome,
    verificationUsed,
    timestamp,
    previousHash,
    entryHash,
  };
}

/**
 * Verify the integrity of an audit chain.
 * Returns valid: true if all hashes are correct and the chain is unbroken.
 */
export function verifyChain(entries: AuditEntry[]): {
  valid: boolean;
  brokenAt?: number;
} {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    // Recompute the hash
    const expectedHash = sha256(
      entry.entryId +
        entry.agentId +
        JSON.stringify(entry.action) +
        entry.outcome +
        entry.timestamp +
        entry.previousHash
    );

    if (expectedHash !== entry.entryHash) {
      return { valid: false, brokenAt: i };
    }

    // Verify chain link
    if (i > 0) {
      const prev = entries[i - 1];
      if (prev && entry.previousHash !== prev.entryHash) {
        return { valid: false, brokenAt: i };
      }
    } else {
      if (entry.previousHash !== "genesis") {
        return { valid: false, brokenAt: 0 };
      }
    }
  }

  return { valid: true };
}

/**
 * Export audit log entries with optional filtering.
 */
export function exportLog(
  entries: AuditEntry[],
  agentId?: string,
  dateRange?: { from: string; to: string }
): AuditEntry[] {
  let filtered = [...entries];

  if (agentId) {
    filtered = filtered.filter((e) => e.agentId === agentId);
  }

  if (dateRange) {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    filtered = filtered.filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= from && ts <= to;
    });
  }

  return filtered;
}
