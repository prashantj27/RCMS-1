/**
 * Applies SQL migrations from ./drizzle using DATABASE_URL_UNPOOLED (Neon direct) or DATABASE_URL.
 *
 *   npm run db:migrate            apply (fails if DATABASE_URL is missing)
 *   tsx scripts/migrate.ts --vercel   build-time mode used by `vercel-build`:
 *       - skips quietly when DATABASE_URL is not configured
 *       - skips Preview deployments unless ALLOW_PREVIEW_MIGRATE=1, so a PR build
 *         can never alter a shared database by accident – EXCEPT when the database is
 *         completely empty (a brand-new project), where there is nothing to protect
 */
import { sql } from "drizzle-orm";
import { createDb } from "../src/server/db/client";
import { directDatabaseUrl } from "../src/server/db/url";

/** True when the RCMS tables do not exist yet. */
async function isFreshDatabase(url: string): Promise<boolean> {
  const handle = await createDb({ url });
  try {
    const rows = (await handle.db.execute(sql`select to_regclass('public.users') is null as fresh`)) as unknown;
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as { fresh: boolean }[];
    return Boolean(list[0]?.fresh);
  } finally {
    await handle.close();
  }
}

async function main() {
  const vercelMode = process.argv.includes("--vercel");
  const url = directDatabaseUrl(); // un-pooled when available (Neon): DDL belongs on a direct connection

  if (vercelMode) {
    if (!url) {
      console.warn("[migrate] DATABASE_URL not set – skipping migrations");
      return;
    }
    if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_MIGRATE !== "1") {
      if (!(await isFreshDatabase(url))) {
        console.warn("[migrate] Preview deployment – skipping migrations (set ALLOW_PREVIEW_MIGRATE=1 to enable)");
        return;
      }
      console.warn("[migrate] Preview deployment on an EMPTY database – applying migrations (nothing to protect)");
    }
  }
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const started = Date.now();
  const handle = await createDb({ url, migrate: true });
  await handle.close();
  console.log(`[migrate] migrations applied in ${Date.now() - started}ms`);
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
