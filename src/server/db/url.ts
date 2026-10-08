/**
 * Connection-string resolution.
 *
 * Vercel's Neon integration injects, for every environment:
 *   DATABASE_URL            pooled (PgBouncer) – use at runtime from serverless functions
 *   DATABASE_URL_UNPOOLED   direct – use for migrations and bulk loads (long transactions, DDL)
 * (POSTGRES_URL / POSTGRES_URL_NON_POOLING are the older aliases of the same two values.)
 */
type Env = Record<string, string | undefined>;

const first = (env: Env, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
};

/** Pooled URL for the running app. */
export const databaseUrl = (env: Env = process.env): string | undefined => first(env, ["DATABASE_URL", "POSTGRES_URL"]);

/** Direct URL for migrations / imports; falls back to the pooled one when no direct URL exists. */
export const directDatabaseUrl = (env: Env = process.env): string | undefined =>
  first(env, ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]) ?? databaseUrl(env);
