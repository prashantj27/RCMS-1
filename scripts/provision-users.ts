/**
 * Creates / updates the standard accounts (admin, hq, centre, analyst) from environment variables.
 *
 *   RCMS_ADMIN_PASSWORD=…  RCMS_HQ_PASSWORD=…  RCMS_CENTRE_PASSWORD=…  RCMS_CENTRE_ACADEMY_IDS=3010,888  RCMS_ANALYST_PASSWORD=…
 *   npm run db:provision-users
 *
 * `--vercel` (used by `vercel-build`): quiet no-op without a database, skips Preview deployments unless
 * ALLOW_PREVIEW_MIGRATE=1, and never fails the deploy – problems are printed as warnings.
 */
import { createDb } from "../src/server/db/client";
import { directDatabaseUrl } from "../src/server/db/url";
import { ACCOUNT_SPECS, provisionUsers } from "../src/server/provision";

async function main() {
  const vercelMode = process.argv.includes("--vercel");
  const url = directDatabaseUrl();
  if (vercelMode) {
    if (!url) return console.warn("[provision] no database URL – skipping");
    if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_MIGRATE !== "1") {
      return console.warn("[provision] Preview deployment – skipping (set ALLOW_PREVIEW_MIGRATE=1 to enable)");
    }
    if (!ACCOUNT_SPECS.some((s) => process.env[`RCMS_${s.key}_PASSWORD`])) {
      return console.warn("[provision] no RCMS_*_PASSWORD variables set – nothing to do");
    }
  }
  const handle = await createDb({ direct: true, migrate: !url }); // embedded dev DB migrates itself
  let failed = false;
  try {
    for (const r of await provisionUsers(handle.db)) {
      const line = `[provision] ${r.key.padEnd(7)} ${r.login.padEnd(12)} ${r.role.padEnd(12)} ${r.action}${r.detail ? ` – ${r.detail}` : ""}`;
      if (r.action === "error") {
        failed = true;
        console.warn(vercelMode ? `::warning::${line}` : line);
      } else console.log(line);
    }
  } finally {
    await handle.close();
  }
  if (failed && !vercelMode) process.exit(1);
}

main().catch((e) => {
  console.error("[provision] failed:", e instanceof Error ? e.message : e);
  process.exit(process.argv.includes("--vercel") ? 0 : 1);
});
