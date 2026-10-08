import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rows } from "./db/util";
import { authMode, isProd } from "./env";
import { AppError } from "./errors";

/** True when sessions can be signed: not needed in prototype mode; a real AUTH_SECRET in production login mode. */
export function authSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return authMode(env) === "prototype" || !isProd() || (env.AUTH_SECRET ?? "").length >= 32;
}

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
  database: boolean;
  migrations: boolean;
  authSecret: boolean;
  accounts: boolean;
}

/** Booleans only – safe to expose publicly; they tell an operator what is still missing, nothing else. */
export async function getSetupChecks(db: Db): Promise<SetupChecks> {
  const checks: SetupChecks = { database: false, migrations: false, authSecret: authSecretConfigured(), accounts: false };
  await rows(db, sql`select 1`);
  checks.database = true;
  const [t] = await rows<{ ok: boolean }>(db, sql`select to_regclass('public.users') is not null as ok`);
  checks.migrations = Boolean(t?.ok);
  if (checks.migrations) {
    const [u] = await rows<{ n: number | string }>(db, sql`select count(*)::int as n from users where is_active`);
    checks.accounts = Number(u?.n ?? 0) > 0;
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
  if (e instanceof Error && /AUTH_SECRET must be set/.test(e.message)) {
    console.error("[setup] AUTH_SECRET is missing or shorter than 32 characters");
    return new AppError(
      503,
      "not_configured",
      "The server is missing its AUTH_SECRET setting. Add it in the host's environment variables and redeploy.",
    );
  }
  return null;
}
