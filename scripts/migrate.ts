/**
 * Applies SQL migrations from ./drizzle to DATABASE_URL.
 *
 *   npm run db:migrate            apply (fails if DATABASE_URL is missing)
 *   tsx scripts/migrate.ts --vercel   build-time mode used by `vercel-build`:
 *       - skips quietly when DATABASE_URL is not configured
 *       - skips Preview deployments unless ALLOW_PREVIEW_MIGRATE=1, so a PR build
 *         can never alter a shared database by accident
 */
import { createDb } from "../src/server/db/client";

async function main() {
  const vercelMode = process.argv.includes("--vercel");
  const url = process.env.DATABASE_URL;

  if (vercelMode) {
    if (!url) {
      console.warn("[migrate] DATABASE_URL not set – skipping migrations");
      return;
    }
    if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_MIGRATE !== "1") {
      console.warn("[migrate] Preview deployment – skipping migrations (set ALLOW_PREVIEW_MIGRATE=1 to enable)");
      return;
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
