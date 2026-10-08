import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  // Only needed for `drizzle-kit studio/push`; `generate` works offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/rcms" },
  strict: true,
  verbose: true,
});
