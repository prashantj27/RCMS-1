import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { academies, users } from "@/server/db/schema";
import { runAthleteImport } from "@/server/import/run-import";
import { createUser } from "@/server/services/users";
import { syntheticAthleteMatrix } from "./synthetic-athletes";

export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Passw0rd-2026";

/** Loads synthetic athletes and one demo user per role. Idempotent. */
export async function seedDemo(db: Db, opts: { athletes?: number } = {}) {
  const matrix = syntheticAthleteMatrix({ athletes: opts.athletes ?? 1200, academies: 30, seed: 2026 });
  const report = await runAthleteImport(db, {
    matrix,
    fileName: "synthetic-seed.xlsx",
    fileSha256: "0".repeat(64),
    mode: "apply",
    createdBy: null,
    asOf: "2026-10-08",
  });
  const first = (await db.select({ id: academies.id }).from(academies).orderBy(academies.id).limit(3)).map((a) => a.id);
  const demo = [
    { email: "admin", name: "Demo Admin", role: "ADMIN", academyIds: [] as number[] },
    { email: "hq", name: "Demo HQ Officer", role: "HQ_OFFICER", academyIds: [] as number[] },
    { email: "centre", name: "Demo Centre User", role: "CENTRE_USER", academyIds: first },
    { email: "analyst", name: "Demo Analyst", role: "ANALYST", academyIds: [] as number[] },
  ] as const;
  const created: string[] = [];
  for (const u of demo) {
    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, u.email));
    if (exists) continue;
    await createUser(db, null, { ...u, academyIds: [...u.academyIds], password: DEMO_PASSWORD }, null);
    created.push(`${u.role} ${u.email}`);
  }
  return { report, created };
}
