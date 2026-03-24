/**
 * routes/delegation.ts
 *
 * Delegation token lifecycle management.
 *
 * GET  /api/delegation               — list all delegations (optionally filter by agentId)
 * POST /api/delegation               — issue a new delegation token
 * GET  /api/delegation/:tokenId      — get a single delegation token
 * POST /api/delegation/:tokenId/revoke — revoke a delegation token
 * POST /api/delegation/:tokenId/consume — consume (use) a delegation token
 */

import type { FastifyInstance } from "fastify";
import {
  issueDelegation,
  setDelegationSecret,
} from "@agentpass/core";
import type { AgentCapability, DelegationScope } from "@agentpass/core";
import {
  createDelegation,
  findDelegation,
  listDelegations,
  revokeDelegation,
  consumeDelegation,
  findAgent,
} from "@agentpass/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env["AGENTPASS_SECRET"];
  if (!secret) throw new Error("AGENTPASS_SECRET not set");
  setDelegationSecret(secret);
  return secret;
}

// ─── Route registration ────────────────────────────────────────────────────────

export async function delegationRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/delegation ────────────────────────────────────────────────────
  fastify.get<{ Querystring: { agentId?: string } }>(
    "/api/delegation",
    async (req, reply) => {
      const tokens = await listDelegations(req.query.agentId);
      return reply.send({ tokens, total: tokens.length });
    }
  );

  // ── GET /api/delegation/:tokenId ──────────────────────────────────────────
  fastify.get<{ Params: { tokenId: string } }>(
    "/api/delegation/:tokenId",
    async (req, reply) => {
      const token = await findDelegation(req.params.tokenId);
      if (!token) return reply.status(404).send({ error: "Delegation token not found" });
      return reply.send({ token });
    }
  );

  // ── POST /api/delegation ───────────────────────────────────────────────────
  fastify.post<{
    Body: {
      agentId: string;
      grantorId: string;
      capabilities: AgentCapability[];
      systems?: string[];
      maxActions?: number | null;
      allowedHours?: number[] | null;
      expiresInHours?: number;
      singleUse?: boolean;
      grantorCapabilities?: AgentCapability[];
    };
  }>("/api/delegation", async (req, reply) => {
    const {
      agentId,
      grantorId,
      capabilities,
      systems = ["*"],
      maxActions = null,
      allowedHours = null,
      expiresInHours = 1,
      singleUse = false,
      grantorCapabilities = [],
    } = req.body;

    if (!agentId || !grantorId || !capabilities?.length) {
      return reply.status(400).send({
        error: "agentId, grantorId, and capabilities are required",
      });
    }

    // Verify the agent exists
    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    getSecret();

    const scope: DelegationScope = {
      capabilities,
      systems,
      maxActions,
      allowedHours,
    };

    // Issue via core (applies scope reduction rules)
    const coreToken = issueDelegation(grantorId, agentId, scope, {
      expiresInHours,
      singleUse,
      grantorCapabilities,
    });

    // Persist to DB
    const dbToken = await createDelegation({
      tokenId: coreToken.tokenId,
      agentId: coreToken.agentId,
      grantorId: coreToken.grantorId,
      scope: coreToken.scope as unknown as Record<string, unknown>,
      issuedAt: new Date(coreToken.issuedAt),
      expiresAt: new Date(coreToken.expiresAt),
      singleUse: coreToken.singleUse,
      usageCount: coreToken.usageCount,
      active: coreToken.active,
      signature: coreToken.signature,
    });

    return reply.status(201).send({ token: dbToken });
  });

  // ── POST /api/delegation/:tokenId/revoke ──────────────────────────────────
  fastify.post<{ Params: { tokenId: string } }>(
    "/api/delegation/:tokenId/revoke",
    async (req, reply) => {
      const existing = await findDelegation(req.params.tokenId);
      if (!existing) {
        return reply.status(404).send({ error: "Delegation token not found" });
      }

      const revoked = await revokeDelegation(req.params.tokenId);
      return reply.send({ revoked: true, token: revoked });
    }
  );

  // ── POST /api/delegation/:tokenId/consume ─────────────────────────────────
  fastify.post<{ Params: { tokenId: string } }>(
    "/api/delegation/:tokenId/consume",
    async (req, reply) => {
      const consumed = await consumeDelegation(req.params.tokenId);
      if (!consumed) {
        return reply.status(404).send({
          error: "Delegation token not found or already inactive",
        });
      }
      return reply.send({ consumed: true, token: consumed });
    }
  );
}
