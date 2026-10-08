import { describe, expect, it } from "vitest";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { createDb } from "@/server/db/client";
import { runAthleteImport } from "@/server/import/run-import";
import { getSetupChecks } from "@/server/setup";
import { testDb } from "../helpers/db";

describe("deployment readiness checks (/api/health)", () => {
  it("reports what is missing: no tables → tables but no data → ready with data", async () => {
    const fresh = await createDb({ url: "", pgliteDir: "memory://", migrate: false });
    try {
      expect(await getSetupChecks(fresh.db)).toEqual({ database: true, migrations: false, data: false });
    } finally {
      await fresh.close();
    }
    const migrated = await testDb();
    try {
      expect(await getSetupChecks(migrated.db)).toEqual({ database: true, migrations: true, data: false });
      await runAthleteImport(migrated.db, {
        matrix: syntheticAthleteMatrix({ athletes: 20, academies: 2, seed: 1 }),
        fileName: "s.xlsx",
        fileSha256: "d".repeat(64),
        mode: "apply",
        createdBy: null,
        asOf: "2026-10-08",
      });
      expect(await getSetupChecks(migrated.db)).toEqual({ database: true, migrations: true, data: true });
    } finally {
      await migrated.close();
    }
  });
});
