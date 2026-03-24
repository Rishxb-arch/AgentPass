import {
  verifyPassport,
  verifyDelegation,
  hasCapability,
  presentCredentials,
  buildVerificationProof,
  tierAtLeast,
  type AgentPassport,
  type AgentTier,
} from "@agentpass/core";
import type { KYAProfile } from "@agentpass/core";
import { evaluateVerificationReplacement } from "@agentpass/core";
import type { DelegationToken } from "@agentpass/core";
import type {
  AdapterManifest,
  AdapterResult,
  VerificationRequirement,
} from "./types.js";
import type { AgentSession } from "@agentpass/core";

// ─── Base adapter ─────────────────────────────────────────────────────────────

export abstract class BaseAdapter {
  abstract readonly manifest: AdapterManifest;

  /**
   * Authorize an agent to use this adapter.
   * Checks passport validity, tier, capabilities, and KYA status.
   */
  authorize(
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    delegation?: DelegationToken
  ): { authorized: boolean; reason?: string } {
    const passportCheck = verifyPassport(passport);
    if (!passportCheck.valid) {
      return { authorized: false, reason: `Invalid passport: ${passportCheck.reason}` };
    }

    if (!tierAtLeast(passport.tier, this.manifest.requiredTier)) {
      return {
        authorized: false,
        reason: `Requires tier '${this.manifest.requiredTier}', agent has '${passport.tier}'`,
      };
    }

    for (const cap of this.manifest.requiredCapabilities) {
      if (!hasCapability(passport, cap)) {
        return {
          authorized: false,
          reason: `Missing required capability: '${cap}'`,
        };
      }
    }

    if (kyaProfile.status === "blocked") {
      return { authorized: false, reason: "Agent is blocked by KYA assessment" };
    }

    if (delegation) {
      // Validate delegation for a generic action
      const delCheck = verifyDelegation(delegation, passport.agentId, {
        system: this.manifest.systemId,
        capability: this.manifest.requiredCapabilities[0] ?? "web:read",
      });
      if (!delCheck.valid) {
        return {
          authorized: false,
          reason: `Invalid delegation: ${delCheck.reason}`,
        };
      }
    }

    return { authorized: true };
  }

  /**
   * Execute an adapter endpoint.
   */
  abstract execute(
    endpointId: string,
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    session?: import("@agentpass/core").AgentSession
  ): Promise<AdapterResult>;

  /**
   * Normalize raw adapter output.
   */
  abstract normalize(rawOutput: unknown): unknown;

  /**
   * Health check for the adapter.
   */
  abstract healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }>;

  // ── Protected helpers ──────────────────────────────────────────────────────

  /**
   * Build request headers, injecting the full X-AgentPass-* trust credential set.
   * Every HTTP request the adapter makes carries the agent's trust credentials.
   */
  protected buildRequestHeaders(
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    delegation?: DelegationToken,
    extraHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const agentPassHeaders = presentCredentials(passport, kyaProfile, delegation);
    return {
      "User-Agent": "AgentPass/1.0 (agent-native; see agentpass.dev)",
      Accept: "text/html,application/json,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      ...agentPassHeaders,
      ...extraHeaders,
    };
  }

  /**
   * Handle a verification challenge from a system.
   * Uses agent KYA credentials to resolve — never asks a human.
   *
   * @returns resolved:true with resolution proof if credentials satisfy the challenge,
   *          resolved:false with errorCode if not.
   */
  protected handleVerificationChallenge(
    responseStatus: number,
    responseBody: string,
    responseHeaders: Record<string, string>,
    passport: AgentPassport,
    kyaProfile: KYAProfile
  ): {
    resolved: boolean;
    resolution?: string;
    errorCode?: string;
    challengeType?: string;
  } {
    const challenge = this.detectVerificationChallenge(responseBody, responseStatus);
    if (!challenge) {
      return { resolved: false, errorCode: "NO_CHALLENGE_DETECTED" };
    }

    const canResolve = evaluateVerificationReplacement(kyaProfile, challenge.type);

    if (!canResolve) {
      return {
        resolved: false,
        errorCode: "VERIFICATION_REQUIRED_UNRESOLVABLE",
        challengeType: challenge.type,
      };
    }

    // Minimum KYA score check
    if (
      challenge.requiredKYAScore !== undefined &&
      kyaProfile.trustScore < challenge.requiredKYAScore
    ) {
      return {
        resolved: false,
        errorCode: `INSUFFICIENT_TRUST_LEVEL`,
        challengeType: challenge.type,
      };
    }

    const proof = buildVerificationProof(passport, kyaProfile, challenge.type);
    return {
      resolved: true,
      resolution: proof,
      challengeType: challenge.type,
    };
  }

  /**
   * Detect what kind of verification a system is demanding from HTML + status code.
   */
  protected detectVerificationChallenge(
    html: string,
    status: number
  ): VerificationRequirement | null {
    // Detect CAPTCHA
    const captchaIndicators = [
      "recaptcha",
      "g-recaptcha",
      "hcaptcha",
      "h-captcha",
      "captcha",
      "data-sitekey",
    ];
    const lowerHtml = html.toLowerCase();
    if (captchaIndicators.some((indicator) => lowerHtml.includes(indicator))) {
      return { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 70 };
    }

    // Detect OTP / SMS verification
    const otpIndicators = [
      "otp",
      "one-time password",
      "sms verification",
      "authenticator",
      "verification code",
      "enter the code",
    ];
    if (otpIndicators.some((indicator) => lowerHtml.includes(indicator))) {
      return { type: "otp", satisfiedByAgentPass: true, requiredKYAScore: 85 };
    }

    // Detect login wall
    if (status === 401 || status === 403) {
      return { type: "login", satisfiedByAgentPass: true, requiredKYAScore: 60 };
    }
    const loginIndicators = [
      "sign in to continue",
      "login to view",
      "please log in",
      "create an account",
      "you must be logged in",
      "sign in required",
    ];
    if (loginIndicators.some((indicator) => lowerHtml.includes(indicator))) {
      return { type: "login", satisfiedByAgentPass: true, requiredKYAScore: 60 };
    }

    // Detect rate limit
    if (status === 429) {
      return { type: "rate_limit", satisfiedByAgentPass: true, requiredKYAScore: 50 };
    }

    return null;
  }

  /**
   * Retry a function with exponential backoff on 429/503.
   */
  protected async retry<T>(
    fn: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const isRateLimit =
          err instanceof Error && err.message.includes("429");
        const isUnavailable =
          err instanceof Error && err.message.includes("503");

        if (isRateLimit || isUnavailable) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}
