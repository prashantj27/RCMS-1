import { createDb, type DbHandle } from "@/server/db/client";

/**
 * Fresh, isolated database with all migrations applied.
 *  - default: in-memory Postgres (PGlite), no setup needed
 *  - TEST_DATABASE_URL set: the real postgres-js driver against that database (wiped first).
 *    Test files then run one at a time (see vitest.config.mts).
 */
export async function testDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createDb({ url: "", pgliteDir: "memory://", migrate: true });
  const reset = await createDb({ url });
  const { sql } = await import("drizzle-orm");
  await reset.db.execute(sql`drop schema if exists public cascade`);
  await reset.db.execute(sql`drop schema if exists drizzle cascade`);
  await reset.db.execute(sql`create schema public`);
  await reset.close();
  return createDb({ url, migrate: true });
}
