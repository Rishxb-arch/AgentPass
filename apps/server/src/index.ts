import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool } from "@agentpass/runtime";
import { runMigrations } from "@agentpass/db";
import { adapterRoutes } from "./routes/adapter.js";
import { agentRoutes } from "./routes/agents.js";
import { passportRoutes } from "./routes/passport.js";
import { delegationRoutes } from "./routes/delegation.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
});

// CORS — allow dashboard (3001) and docs (3000) in development
await server.register(cors, {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:3001"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

// Health check
server.get("/health", async () => ({
  status: "ok",
  version: "1.0.0",
  browser: pool.contextCount + " active contexts",
  timestamp: new Date().toISOString(),
}));

// Browser pool stats
server.get("/stats", async () => ({
  browser: { activeContexts: pool.contextCount },
  uptime: process.uptime(),
}));

// Adapter routes (Playwright automation)
await server.register(adapterRoutes);

// Agent enrollment, KYA, revocation, and audit
await server.register(agentRoutes);

// Central trust anchor — passport verification
await server.register(passportRoutes);

// Delegation token lifecycle
await server.register(delegationRoutes);

// Graceful shutdown
const shutdown = async (signal: string) => {
  server.log.info(`[Server] ${signal} received — shutting down`);
  await server.close();
  await pool.drain();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Boot — run DB migrations first, then start the server
try {
  console.log("[AgentPass Server] Running database migrations…");
  await runMigrations();
  console.log("[AgentPass Server] Migrations complete.");

  await pool.launch();
  await server.listen({ port: PORT, host: HOST });
  console.log(`[AgentPass Server] Running on http://${HOST}:${PORT}`);
  console.log(`[AgentPass Server] Dashboard: http://localhost:3001`);
  console.log(`[AgentPass Server] Health: http://localhost:${PORT}/health`);
} catch (err) {
  server.log.error(err);
  await pool.drain();
  process.exit(1);
}
