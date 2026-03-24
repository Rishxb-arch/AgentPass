/**
 * migrate.ts
 *
 * Applies pending SQL migrations from src/migrations/ at server startup.
 * Uses drizzle-orm's built-in migration runner.
 *
 * Call once before accepting requests:
 *   import { runMigrations } from "@agentpass/db";
 *   await runMigrations();
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Apply all pending SQL migrations from the migrations folder.
 * Idempotent — already-applied migrations are tracked in the
 * `drizzle_migrations` table and skipped automatically.
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = join(__dirname, "migrations");
  console.log("[DB] Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("[DB] Migrations complete");
}
