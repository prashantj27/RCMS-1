import type { Db } from "@/server/db/client";
import { runAthleteImport } from "@/server/import/run-import";
import { syntheticAthleteMatrix } from "./synthetic-athletes";

/** Loads synthetic athletes into a database. Idempotent (an import is an upsert). */
export async function seedDemo(db: Db, opts: { athletes?: number } = {}) {
  const matrix = syntheticAthleteMatrix({ athletes: opts.athletes ?? 1200, academies: 30, seed: 2026 });
  return runAthleteImport(db, {
    matrix,
    fileName: "synthetic-seed.xlsx",
    fileSha256: "0".repeat(64),
    mode: "apply",
    createdBy: null,
    asOf: "2026-10-08",
  });
}
