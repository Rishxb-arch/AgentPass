/**
 * client.ts
 *
 * Drizzle + postgres singleton.
 *
 * Import { db } from "@agentpass/db" everywhere — one connection pool per process.
 *
 * The DATABASE_URL environment variable must be set before this module is
 * imported.  Format: postgres://user:pass@host:port/dbname
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// ─── Connection ───────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  throw new Error(
    "[AgentPass DB] DATABASE_URL is not set.\n" +
    "Add DATABASE_URL=postgres://localhost:5432/agentpass to your .env file."
  );
}

/**
 * postgres-js client — used by Drizzle and directly by the migration runner.
 * @internal
 */
export const sql = postgres(DATABASE_URL, {
  max: 10,                 // max pool size
  idle_timeout: 20,        // close idle connections after 20s
  connect_timeout: 10,     // fail fast if DB is unreachable
});

/**
 * Drizzle ORM db instance — use this for all queries.
 */
export const db = drizzle(sql, { schema });
export type DB = typeof db;
