import { describe, expect, it } from "vitest";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { createDb } from "@/server/db/client";
import { runAthleteImport } from "@/server/import/run-import";
import { sql } from "drizzle-orm";
import { getCurrentDataset } from "@/server/services/imports";
import { classifyDbError, getSetupChecks } from "@/server/setup";
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

describe("database problem classification (shown to the operator, never contains secrets)", () => {
  it("treats a database built by an older release (newest tables missing) as not migrated", async () => {
    const h = await testDb();
    try {
      await h.db.execute(sql`drop table import_stage_chunks, import_stages`);
      expect(await getSetupChecks(h.db)).toMatchObject({ database: true, migrations: false });
    } finally {
      await h.close();
    }
  });

  it.each([
    [new Error("DATABASE_URL is not set. Connect a Neon database"), "no_database_url"],
    [Object.assign(new Error("x"), { code: "ENOTFOUND" }), "cannot_connect"],
    [Object.assign(new Error("x"), { code: "CONNECT_TIMEOUT" }), "cannot_connect"],
    [{ cause: { code: "28P01" } }, "auth_failed"],
    [Object.assign(new Error("password=hunter2"), { code: "3D000" }), "database_missing"],
    [{ code: "42P01" }, "migrations_missing"],
    [new Error("boom"), "unknown"],
  ])("%#", (error, problem) => {
    const c = classifyDbError(error);
    expect(c.problem).toBe(problem);
    expect(c.hint).not.toMatch(/hunter2|postgres:\/\//);
  });
});

describe("current dataset (what the portals show and where it came from)", () => {
  it("is empty before any import, ignores dry runs, and names the applied workbook afterwards", async () => {
    const h = await testDb();
    try {
      const run = (mode: "dry_run" | "apply", name: string, sha: string) =>
        runAthleteImport(h.db, {
          matrix: syntheticAthleteMatrix({ athletes: 30, academies: 3, seed: 5 }),
          fileName: name,
          fileSha256: sha.repeat(64),
          mode,
          createdBy: null,
          asOf: "2026-10-09",
        });
      expect(await getCurrentDataset(h.db)).toEqual({ athletes: 0, centres: 0, source: null });
      await run("dry_run", "dry.xlsx", "a");
      expect((await getCurrentDataset(h.db)).source).toBeNull();
      await run("apply", "final.xlsx", "b");
      const d = await getCurrentDataset(h.db);
      expect(d.athletes).toBeGreaterThan(0);
      expect(d.centres).toBe(3);
      expect(d.source).toMatchObject({ fileName: "final.xlsx", fileSha256: "b".repeat(64) });
    } finally {
      await h.close();
    }
  });
});
