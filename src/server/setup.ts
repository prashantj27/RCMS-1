import { sql } from "drizzle-orm";
import { createDb, getDb, type Db } from "./db/client";
import { directDatabaseUrl } from "./db/url";
import { rows } from "./db/util";
import { AppError } from "./errors";

/** SQLSTATE of a Postgres error, however the driver wraps it (postgres-js, PGlite, Drizzle's DrizzleQueryError). */
export function pgErrorCode(e: unknown): string | undefined {
  for (let cur: unknown = e, i = 0; cur && i < 5; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export interface SetupChecks {
  /** The database answers. */
  database: boolean;
  /** The tables exist (migrations ran). */
  migrations: boolean;
  /** At least one athlete is loaded. */
  data: boolean;
}

/** Booleans only – safe to expose publicly; they tell an operator what is still missing, nothing else. */
export async function getSetupChecks(db: Db): Promise<SetupChecks> {
  const checks: SetupChecks = { database: false, migrations: false, data: false };
  await rows(db, sql`select 1`);
  checks.database = true;
  // Every table the running app needs; a database set up by an older build lacks the newest ones.
  const [t] = await rows<{ ok: boolean }>(
    db,
    sql`select (to_regclass('public.athletes') is not null and to_regclass('public.import_stage_chunks') is not null) as ok`,
  );
  checks.migrations = Boolean(t?.ok);
  if (checks.migrations) {
    const [u] = await rows<{ any: boolean }>(db, sql`select exists (select 1 from athletes) as any`);
    checks.data = Boolean(u?.any);
  }
  return checks;
}

/** Turns "the deployment is not set up yet" failures into an actionable 503 instead of a bare 500. */
export function notConfiguredError(e: unknown): AppError | null {
  if (pgErrorCode(e) === "42P01") {
    console.error("[setup] database tables are missing – migrations have not run on this deployment (check the build log for '[migrate]')");
    return new AppError(
      503,
      "not_configured",
      "The database has not been set up yet (migrations have not run). Check the deployment's build log.",
    );
  }
  return null;
}

export type SetupProblem = "no_database_url" | "cannot_connect" | "auth_failed" | "database_missing" | "migrations_missing" | "unknown";

const HINTS: Record<SetupProblem, string> = {
  no_database_url:
    "This deployment has no database connection string. In Vercel open Storage → your Neon database → Connect Project, tick Production AND Preview, then redeploy (variables only reach deployments built after they were added).",
  cannot_connect:
    "The database host could not be reached. Check that the Neon database is active and not suspended or deleted, then redeploy.",
  auth_failed:
    "The database rejected the credentials. Reconnect the Neon database to this Vercel project (or reset its password) and redeploy.",
  database_missing:
    "The database named in the connection string does not exist. Reconnect the Neon database to this Vercel project and redeploy.",
  migrations_missing:
    "The database is reachable but its tables are missing or out of date. Press “Set up database” (Administrator portal).",
  unknown: "The database check failed for an unexpected reason. Look at the Vercel runtime logs for the line starting with [setup].",
};

/** Maps a connection/query failure to a fixed category + hint. Never includes the error text, host or credentials. */
export function classifyDbError(e: unknown): { problem: SetupProblem; hint: string } {
  let problem: SetupProblem = "unknown";
  for (let cur: unknown = e, i = 0; cur && i < 5; i++, cur = (cur as { cause?: unknown }).cause) {
    const code = (cur as { code?: unknown }).code;
    const message = (cur as { message?: unknown }).message;
    if (typeof message === "string" && message.startsWith("DATABASE_URL is not set")) problem = "no_database_url";
    else if (code === "28P01" || code === "28000") problem = "auth_failed";
    else if (code === "3D000") problem = "database_missing";
    else if (code === "42P01") problem = "migrations_missing";
    else if (
      typeof code === "string" &&
      /^(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_)/.test(code)
    ) {
      problem = "cannot_connect";
    }
    if (problem !== "unknown") break;
  }
  return { problem, hint: HINTS[problem] };
}

export type SetupState = { ready: true } | { ready: false; problem: SetupProblem; hint: string };

const g = globalThis as unknown as { __rcmsReady?: boolean };

/** Is the database connected and fully migrated? A positive answer is remembered for the life of the instance. */
export async function getSetupState(): Promise<SetupState> {
  if (g.__rcmsReady) return { ready: true };
  try {
    const checks = await getSetupChecks(await getDb());
    if (checks.migrations) {
      g.__rcmsReady = true;
      return { ready: true };
    }
    return { ready: false, problem: "migrations_missing", hint: HINTS.migrations_missing };
  } catch (e) {
    const c = classifyDbError(e);
    console.error(`[setup] ${c.problem}`, e);
    return { ready: false, ...c };
  }
}

/**
 * Applies pending migrations (idempotent; drizzle records what ran). Uses the direct, un-pooled connection because DDL
 * does not belong on a transaction pooler. Safe to call on a ready database: it does nothing.
 */
export async function runSetup(): Promise<SetupChecks> {
  const url = directDatabaseUrl();
  if (!url) {
    // Embedded dev/test database (PGlite): it migrates itself when it opens.
    if (process.env.RCMS_ALLOW_PGLITE === "1" || process.env.NODE_ENV !== "production") return getSetupChecks(await getDb());
    throw new AppError(503, "not_configured", HINTS.no_database_url);
  }
  const handle = await createDb({ url, migrate: true });
  await handle.close();
  g.__rcmsReady = undefined;
  return getSetupChecks(await getDb());
}
