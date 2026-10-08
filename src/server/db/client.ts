import fs from "node:fs";
import path from "node:path";
import type * as DrizzlePglite from "drizzle-orm/pglite";
import type * as PgliteMigrator from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as Pglite from "@electric-sql/pglite";
import * as schema from "./schema";
import { databaseUrl, directDatabaseUrl } from "./url";
import { isProd, isTest } from "../env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
}

/**
 * Runtime-only import. The specifier is opaque to the bundler / file tracer so dev-only
 * packages (PGlite, ~26 MB of WASM) are NOT copied into every serverless function.
 */
const runtimeImport = <T>(specifier: string): Promise<T> =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier) as Promise<T>;

export const migrationsFolder = () => path.join(process.cwd(), "drizzle");

/**
 * Connect to Postgres or, for local development / tests, to an embedded PGlite.
 * `direct: true` prefers the un-pooled URL (migrations, bulk imports).
 */
export async function createDb(opts: { url?: string; direct?: boolean; pgliteDir?: string; migrate?: boolean } = {}): Promise<DbHandle> {
  const url = opts.url ?? (opts.direct ? directDatabaseUrl() : databaseUrl());
  if (url) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js")]);
    // prepare:false keeps us compatible with transaction-mode poolers (Neon, Supabase, PgBouncer).
    const client = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      onnotice: () => undefined, // IF NOT EXISTS notices from the migrator
    });
    const db = drizzle(client, { schema }) as unknown as Db;
    if (opts.migrate) {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
    }
    return { db, kind: "postgres", close: () => client.end({ timeout: 5 }) };
  }

  if (isProd() && process.env.RCMS_ALLOW_PGLITE !== "1") {
    throw new Error(
      "DATABASE_URL is not set. Connect a Neon database in Vercel (Storage) or set a Postgres connection string – see docs/DEPLOYMENT.md.",
    );
  }
  const [{ PGlite }, { drizzle }] = await Promise.all([
    runtimeImport<typeof Pglite>("@electric-sql/pglite"),
    runtimeImport<typeof DrizzlePglite>("drizzle-orm/pglite"),
  ]);
  const dir = opts.pgliteDir ?? process.env.PGLITE_DIR ?? (isTest() ? "memory://" : path.join(process.cwd(), ".data", "pglite"));
  if (!dir.startsWith("memory://")) fs.mkdirSync(path.dirname(dir), { recursive: true }); // PGlite only creates the leaf folder
  const client = new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  if (opts.migrate !== false) {
    const { migrate } = await runtimeImport<typeof PgliteMigrator>("drizzle-orm/pglite/migrator");
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  }
  return { db, kind: "pglite", close: () => client.close() };
}

const g = globalThis as unknown as { __rcmsDb?: Promise<DbHandle> };

/** Process-wide singleton (survives Next.js hot reloads and warm serverless invocations). */
export function getDb(): Promise<Db> {
  g.__rcmsDb ??= createDb().catch((e) => {
    g.__rcmsDb = undefined; // allow retry after a transient failure
    throw e;
  });
  return g.__rcmsDb.then((h) => h.db);
}

export async function closeDb(): Promise<void> {
  const h = await g.__rcmsDb;
  g.__rcmsDb = undefined;
  await h?.close();
}
