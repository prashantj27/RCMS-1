/**
 * Seeds a LOCAL database with synthetic athletes, academies and one user per role.
 * Refuses to run against production unless SEED_ALLOW_PRODUCTION=1.
 *
 *   npm run db:seed
 *
 * Demo logins (password: SEED_PASSWORD, default "Demo-Passw0rd-2026"):
 *   admin  hq  centre (first 3 academies)  analyst
 */
import { DEMO_PASSWORD, seedDemo } from "../src/dev/seed-demo";
import { createDb } from "../src/server/db/client";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
    console.error("Refusing to seed with NODE_ENV=production (set SEED_ALLOW_PRODUCTION=1 to override)");
    process.exit(2);
  }
  const handle = await createDb({ migrate: true });
  try {
    const { report, created } = await seedDemo(handle.db, { athletes: Number(process.env.SEED_ATHLETES ?? 1200) });
    console.log(`Seeded ${report.stats.athletes} athletes, ${report.stats.academies} academies, ${report.stats.enrollments} enrolments`);
    for (const c of created) console.log(`  created ${c}`);
    console.log(`\nDemo password: ${DEMO_PASSWORD}`);
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
