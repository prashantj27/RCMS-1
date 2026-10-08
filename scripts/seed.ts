/**
 * Seeds a LOCAL database with synthetic athletes and centres (no real people).
 * Refuses to run against production unless SEED_ALLOW_PRODUCTION=1.
 *
 *   npm run db:seed
 */
import { seedDemo } from "../src/dev/seed-demo";
import { createDb } from "../src/server/db/client";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
    console.error("Refusing to seed with NODE_ENV=production (set SEED_ALLOW_PRODUCTION=1 to override)");
    process.exit(2);
  }
  const handle = await createDb({ migrate: true });
  try {
    const report = await seedDemo(handle.db, { athletes: Number(process.env.SEED_ATHLETES ?? 1200) });
    console.log(`Seeded ${report.stats.athletes} athletes, ${report.stats.academies} academies, ${report.stats.enrollments} enrolments`);
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
