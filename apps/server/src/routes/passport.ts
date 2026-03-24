/**
 * routes/passport.ts
 *
 * Central trust anchor — public endpoint that third-party sites call to verify
 * whether an AgentPass token is valid (not revoked, not expired, cryptographically sound).
 *
 * GET  /api/passport/verify?token=agentpass.xxx.yyy
 *   → { valid, reason?, agent, tier, kyaScore }
 *
 * POST /api/passport/verify
 *   Body: { token: string }
 *   → same response (for clients that can't pass tokens as query params)
 */

import type { FastifyInstance } from "fastify";
import {
  deserializePassport,
  setPassportSecret,
  verifyPassport,
} from "@agentpass/core";
import {
  findPassportByToken,
  findAgent,
  latestKyaScore,
} from "@agentpass/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env["AGENTPASS_SECRET"];
  if (!secret) throw new Error("AGENTPASS_SECRET not set");
  setPassportSecret(secret);
  return secret;
}

// ─── Shared verify logic ──────────────────────────────────────────────────────

async function doVerify(token: string | undefined): Promise<{
  valid: boolean;
  reason?: string;
  agentId?: string;
  principalId?: string;
  name?: string;
  tier?: string;
  kyaScore?: number | null;
  expiresAt?: string | null;
}> {
  if (!token || !token.startsWith("agentpass.")) {
    return { valid: false, reason: "Invalid token format" };
  }

  getSecret();

  // 1. Deserialize and verify cryptographic signature + expiry
  const passport = deserializePassport(token);
  if (!passport) {
    return { valid: false, reason: "Malformed passport token" };
  }

  const cryptoCheck = verifyPassport(passport);
  if (!cryptoCheck.valid) {
    return { valid: false, reason: cryptoCheck.reason };
  }

  // 2. Check revocation status in the database
  const passportRow = await findPassportByToken(token);
  if (!passportRow) {
    // Not in DB at all, or already revoked
    return { valid: false, reason: "Passport not found or revoked" };
  }

  // Double-check expiry at the DB row level
  if (passportRow.expiresAt && passportRow.expiresAt < new Date()) {
    return { valid: false, reason: "Passport has expired" };
  }

  // 3. Fetch agent and latest KYA score
  const [agent, kya] = await Promise.all([
    findAgent(passport.agentId),
    latestKyaScore(passport.agentId),
  ]);

  return {
    valid: true,
    agentId: passport.agentId,
    principalId: passport.principalId,
    name: passport.name,
    tier: passport.tier,
    kyaScore: kya?.trustScore ?? null,
    expiresAt: passport.expiresAt,
  };
}

// ─── Route registration ────────────────────────────────────────────────────────

export async function passportRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/passport/verify?token=agentpass.xxx.yyy ──────────────────────
  fastify.get<{ Querystring: { token?: string } }>(
    "/api/passport/verify",
    async (req, reply) => {
      const result = await doVerify(req.query.token);
      const status = result.valid ? 200 : 400;
      return reply.status(status).send(result);
    }
  );

  // ── POST /api/passport/verify ─────────────────────────────────────────────
  // For clients that can't pass tokens as query params (e.g. large tokens, strict proxies)
  fastify.post<{ Body: { token?: string } }>(
    "/api/passport/verify",
    async (req, reply) => {
      const result = await doVerify(req.body?.token);
      const status = result.valid ? 200 : 400;
      return reply.status(status).send(result);
    }
  );
}
