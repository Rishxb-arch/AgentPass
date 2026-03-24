import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load the server's .env so drizzle-kit can reach the DB
config({ path: "../../apps/server/.env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://localhost:5432/agentpass",
  },
  verbose: true,
  strict: false,
});
