/**
 * Prepares the database for Playwright: fresh embedded DB (or migrated DATABASE_URL) + demo data.
 * Invoked by playwright.config.ts before `next start`.
 */
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "../src/dev/seed-demo";
import { createDb } from "../src/server/db/client";

async function main() {
  if (!process.env.DATABASE_URL) {
    const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "e2e");
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.PGLITE_DIR = dir;
  }
  const handle = await createDb({ migrate: true });
  try {
    const { report } = await seedDemo(handle.db, { athletes: 600 });
    console.log(`[e2e] seeded ${report.stats.athletes} athletes`);
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
