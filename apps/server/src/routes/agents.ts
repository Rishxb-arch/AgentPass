/**
 * routes/agents.ts
 *
 * Agent enrollment, lookup, revocation, and KYA signal submission.
 *
 * POST /api/agents/enroll        — register agent, issue + persist passport
 * GET  /api/agents               — list all agents with latest KYA score
 * GET  /api/agents/:agentId      — agent detail + latest KYA + signals
 * POST /api/agents/:agentId/revoke — revoke all active passports
 * POST /api/agents/:agentId/signal — submit behaviour signal, recompute KYA
 * GET  /api/agents/:agentId/audit  — paginated audit log for this agent
 */

import type { FastifyInstance } from "fastify";
import {
  issuePassport,
  setPassportSecret,
  serializePassport,
  deserializePassport,
  assessAgent,
} from "@agentpass/core";
import type { AgentCapability, AgentTier, BehaviorSignal } from "@agentpass/core";
import {
  upsertPrincipal,
  createAgent,
  findAgent,
  listAgents,
  createPassport,
  findActivePassport,
  revokePassports,
  recordSignal,
  listSignals,
  dbSignalsToBehaviorSignals,
  saveKyaScore,
  latestKyaScore,
  appendEntry,
  listEntries,
} from "@agentpass/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env["AGENTPASS_SECRET"];
  if (!secret) throw new Error("AGENTPASS_SECRET not set");
  setPassportSecret(secret);
  return secret;
}

/**
 * Run assessAgent() using DB signals and persist the new score snapshot.
 */
async function computeAndSaveKya(agentId: string) {
  const agentRow = await findAgent(agentId);
  if (!agentRow) throw new Error(`Agent ${agentId} not found`);

  const passportRow = await findActivePassport(agentId);
  if (!passportRow) throw new Error(`No active passport for ${agentId}`);

  getSecret();
  const passport = deserializePassport(passportRow.token);
  if (!passport) throw new Error("Could not deserialize passport");

  const signalRows = await listSignals(agentId);
  const behaviorSignals = dbSignalsToBehaviorSignals(signalRows);

  const profile = assessAgent({ passport, behaviorSignals });

  await saveKyaScore({
    agentId,
    trustScore: profile.trustScore,
    riskScore: profile.riskScore,
    status: profile.status,
    classificationType: profile.classification.type,
    replacesCaptcha: profile.verificationReplacement.replacesCaptcha,
    replacesOtp: profile.verificationReplacement.replacesOTP,
    replacesLoginWall: profile.verificationReplacement.replacesLoginWall,
    replacesRateLimit: profile.verificationReplacement.replacesRateLimit,
    replacesEmailVerification: profile.verificationReplacement.replacesEmailVerification,
    signalsSnapshot: behaviorSignals as unknown as Record<string, unknown>,
  });

  return profile;
}

// ─── Route registration ────────────────────────────────────────────────────────

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/agents/enroll ────────────────────────────────────────────────
  fastify.post<{
    Body: {
      principalId: string;
      principalName?: string;
      principalEmail?: string;
      name: string;
      tier?: AgentTier;
      capabilities?: AgentCapability[];
      expiresInHours?: number | null;
      metadata?: Record<string, string>;
    };
  }>("/api/agents/enroll", async (req, reply) => {
    const {
      principalId,
      principalName,
      principalEmail,
      name,
      tier = "basic",
      capabilities = [],
      expiresInHours = 24,
      metadata = {},
    } = req.body;

    if (!principalId || !name) {
      return reply.status(400).send({ error: "principalId and name are required" });
    }

    getSecret();

    // 1. Upsert principal
    await upsertPrincipal({
      id: principalId,
      name: principalName ?? principalId,
      email: principalEmail ?? null,
    });

    // 2. Issue passport
    const passport = issuePassport({
      principalId,
      name,
      tier,
      capabilities,
      expiresInHours,
      metadata,
    });

    const token = serializePassport(passport);

    // 3. Persist agent
    const agentRow = await createAgent({
      id: passport.agentId,
      principalId,
      name,
      tier,
      capabilities: capabilities as unknown as Record<string, unknown>,
      fingerprint: passport.fingerprint,
      metadata: metadata as unknown as Record<string, unknown>,
    });

    // 4. Persist passport
    await createPassport({
      agentId: passport.agentId,
      token,
      signature: passport.signature,
      issuedAt: new Date(passport.issuedAt),
      expiresAt: passport.expiresAt ? new Date(passport.expiresAt) : null,
    });

    // 5. Initial KYA assessment (empty signals = baseline)
    const profile = await computeAndSaveKya(passport.agentId);

    // 6. Log enrollment
    await appendEntry({
      agentId: passport.agentId,
      principalId,
      action: { type: "auth", system: "agentpass", endpoint: "/api/agents/enroll", payloadHash: "" },
      outcome: "success",
      verificationUsed: "agentpass_credentials",
    }).catch(() => null); // non-fatal

    return reply.status(201).send({
      agent: agentRow,
      token,
      passport: {
        agentId: passport.agentId,
        tier: passport.tier,
        capabilities: passport.capabilities,
        issuedAt: passport.issuedAt,
        expiresAt: passport.expiresAt,
        fingerprint: passport.fingerprint,
      },
      kyaProfile: {
        trustScore: profile.trustScore,
        riskScore: profile.riskScore,
        status: profile.status,
        verificationReplacement: profile.verificationReplacement,
        classification: profile.classification,
      },
    });
  });

  // ── GET /api/agents ────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { principalId?: string } }>(
    "/api/agents",
    async (req, reply) => {
      const agents = await listAgents(req.query.principalId);

      // Attach latest KYA score to each agent
      const withKya = await Promise.all(
        agents.map(async (a) => {
          const kya = await latestKyaScore(a.id);
          return { ...a, kya };
        })
      );

      return reply.send({ agents: withKya, total: withKya.length });
    }
  );

  // ── GET /api/agents/:agentId ──────────────────────────────────────────────
  fastify.get<{ Params: { agentId: string } }>(
    "/api/agents/:agentId",
    async (req, reply) => {
      const agent = await findAgent(req.params.agentId);
      if (!agent) return reply.status(404).send({ error: "Agent not found" });

      const [kya, passport, signals] = await Promise.all([
        latestKyaScore(agent.id),
        findActivePassport(agent.id),
        listSignals(agent.id),
      ]);

      return reply.send({ agent, kya, passport, signals });
    }
  );

  // ── POST /api/agents/:agentId/revoke ──────────────────────────────────────
  fastify.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/revoke",
    async (req, reply) => {
      const agent = await findAgent(req.params.agentId);
      if (!agent) return reply.status(404).send({ error: "Agent not found" });

      const count = await revokePassports(agent.id);

      await appendEntry({
        agentId: agent.id,
        principalId: agent.principalId,
        action: { type: "auth", system: "agentpass", endpoint: "/api/agents/revoke", payloadHash: "" },
        outcome: "success",
        verificationUsed: "none",
      }).catch(() => null);

      return reply.send({ revoked: count, agentId: agent.id });
    }
  );

  // ── POST /api/agents/:agentId/signal ──────────────────────────────────────
  fastify.post<{
    Params: { agentId: string };
    Body: {
      type: BehaviorSignal["type"];
      count?: number;
      windowHours?: number;
      source?: string;
    };
  }>("/api/agents/:agentId/signal", async (req, reply) => {
    const agent = await findAgent(req.params.agentId);
    if (!agent) return reply.status(404).send({ error: "Agent not found" });

    const { type, count = 1, windowHours = 24, source } = req.body;
    if (!type) return reply.status(400).send({ error: "signal type is required" });

    // Record signal
    const signal = await recordSignal({
      agentId: agent.id,
      signalType: type,
      count,
      windowHours,
      source: source ?? null,
    });

    // Recompute KYA
    const profile = await computeAndSaveKya(agent.id);

    return reply.send({
      signal,
      kyaProfile: {
        trustScore: profile.trustScore,
        riskScore: profile.riskScore,
        status: profile.status,
        verificationReplacement: profile.verificationReplacement,
      },
    });
  });

  // ── GET /api/agents/:agentId/audit ────────────────────────────────────────
  fastify.get<{
    Params: { agentId: string };
    Querystring: { limit?: string; offset?: string };
  }>("/api/agents/:agentId/audit", async (req, reply) => {
    const agent = await findAgent(req.params.agentId);
    if (!agent) return reply.status(404).send({ error: "Agent not found" });

    const entries = await listEntries({
      agentId: agent.id,
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });

    return reply.send({ entries, agentId: agent.id });
  });
}
