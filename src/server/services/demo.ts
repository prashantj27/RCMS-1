import { sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { audit } from "../auth/audit";
import type { SessionUser } from "../auth/authenticate";
import type { Db } from "../db/client";
import { one, num } from "../db/util";
import { authMode } from "../env";
import { conflict, forbidden, notFound } from "../errors";
import { runAthleteImport, type ImportReport } from "../import/run-import";

export interface DemoStatus {
  athletes: number;
  canLoad: boolean;
}

/** Demo data can only be loaded into a completely empty registry, and only in prototype mode. */
export async function getDemoStatus(db: Db, user: SessionUser): Promise<DemoStatus> {
  const r = await one<{ n: number }>(db, sql`select count(*)::int as n from athletes`);
  const athletes = num(r?.n);
  return { athletes, canLoad: authMode() === "prototype" && athletes === 0 && user.caps.has("imports:run") };
}

/**
 * Loads ~1,200 SYNTHETIC athletes (fictional names, 30 fictional centres) so a fresh prototype has something to show.
 * Refuses when any athlete exists: synthetic ids would otherwise mix with real records.
 */
export async function loadDemoData(db: Db, user: SessionUser, ip: string | null): Promise<ImportReport> {
  if (authMode() !== "prototype") throw notFound("Demo data");
  if (!user.caps.has("imports:run")) throw forbidden("Only the Administrator portal can load demo data");
  const status = await getDemoStatus(db, user);
  if (status.athletes > 0) throw conflict("The registry already contains athletes – demo data is only for an empty database");

  const report = await runAthleteImport(db, {
    matrix: syntheticAthleteMatrix({ athletes: 1200, academies: 30, seed: 2026 }),
    fileName: "synthetic-demo-data.xlsx",
    fileSha256: "0".repeat(64),
    mode: "apply",
    createdBy: user.id,
    asOf: new Date().toISOString().slice(0, 10),
  });
  await audit(db, {
    actorId: user.id,
    actorEmail: user.email,
    action: "demo_data_load",
    entityType: "import_batch",
    entityId: report.batchId,
    detail: { athletes: report.stats.athletes, centres: report.stats.academies },
    ip,
  });
  return report;
}
