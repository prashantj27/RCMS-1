import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import type { DbHandle } from "@/server/db/client";
import { athletes, dqIssues, enrollments, academies, importBatches } from "@/server/db/schema";
import { rows } from "@/server/db/util";
import { runAthleteImport } from "@/server/import/run-import";
import { testDb } from "../helpers/db";

const matrix = syntheticAthleteMatrix({ athletes: 600, academies: 24, seed: 7 });
const ASOF = "2026-10-08";
const base = { fileName: "synthetic.xlsx", fileSha256: "x".repeat(64), createdBy: null, asOf: ASOF } as const;

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(async () => {
  await h.close();
});

describe("athlete master import", () => {
  it("dry run reports counts but writes nothing", async () => {
    const r = await runAthleteImport(h.db, { ...base, matrix, mode: "dry_run" });
    expect(r.applied).toBeNull();
    expect(r.stats.athletes).toBe(600);
    expect(r.stats.academies).toBe(24);
    expect(r.diff.athletesNew).toBe(600);
    const [{ n }] = (await rows<{ n: number }>(h.db, sql`select count(*)::int as n from athletes`)) as [{ n: number }];
    expect(n).toBe(0);
    const batches = await h.db.select().from(importBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.mode).toBe("dry_run");
    expect(batches[0]!.status).toBe("completed");
  });

  it("apply writes athletes, academies, enrolments and data-quality issues", async () => {
    const r = await runAthleteImport(h.db, { ...base, matrix, mode: "apply" });
    expect(r.applied?.athletesWritten).toBe(600);
    expect((await h.db.select().from(athletes)).length).toBe(600);
    expect((await h.db.select().from(academies)).length).toBe(24);
    expect((await h.db.select().from(enrollments)).length).toBe(r.stats.enrollments);
    expect(r.stats.duplicateEnrollmentRows).toBeGreaterThan(0);
    expect(r.stats.athletesWithoutEnrollment).toBeGreaterThan(0);

    const byRule = await rows<{ rule_code: string; n: number }>(h.db, sql`select rule_code, count(*)::int as n from dq_issues group by 1`);
    const rules = Object.fromEntries(byRule.map((x) => [x.rule_code, x.n]));
    for (const code of [
      "DOB_PLACEHOLDER_LIKELY",
      "SIZE_INVALID",
      "JOIN_DATE_INVALID",
      "PARENT_PLACEHOLDER",
      "MOBILE_INVALID",
      "DOB_INVALID",
      "KITID_GENDER_MISMATCH",
      "JOIN_BEFORE_BIRTH",
      "NAME_MISSING",
      "NO_ACADEMY",
      "INACTIVE_ACADEMY",
    ]) {
      expect(rules[code], code).toBeGreaterThan(0);
    }
  });

  it("never stores plaintext phone numbers or invalid values", async () => {
    const bad = await rows<{ n: number }>(
      h.db,
      sql`select count(*)::int as n from athletes where mobile_cipher !~ '^[A-Za-z0-9+/]{22}==$'`,
    );
    expect(bad[0]!.n).toBe(0);
    const zeroShoe = await rows<{ n: number }>(h.db, sql`select count(*)::int as n from athletes where shoe_size = 0`);
    expect(zeroShoe[0]!.n).toBe(0);
  });

  it("is idempotent: re-importing the same file changes no row counts", async () => {
    const before = await rows<{ a: number; e: number; i: number }>(
      h.db,
      sql`select (select count(*) from athletes)::int a, (select count(*) from enrollments)::int e, (select count(*) from dq_issues)::int i`,
    );
    const r = await runAthleteImport(h.db, { ...base, matrix, mode: "apply" });
    expect(r.diff.athletesNew).toBe(0);
    expect(r.diff.enrollmentsNew).toBe(0);
    const after = await rows<{ a: number; e: number; i: number }>(
      h.db,
      sql`select (select count(*) from athletes)::int a, (select count(*) from enrollments)::int e, (select count(*) from dq_issues)::int i`,
    );
    expect(after[0]).toEqual(before[0]);
  });

  it("preserves kit data edited in the app and never blanks known values", async () => {
    const [row] = await h.db.select().from(athletes).limit(1);
    await h.db
      .update(athletes)
      .set({ shoeSize: 12, editedAt: new Date() })
      .where(sql`id = ${row!.id}`);
    // Same file again: file value must not overwrite the manual edit.
    await runAthleteImport(h.db, { ...base, matrix, mode: "apply" });
    const [after] = await h.db
      .select()
      .from(athletes)
      .where(sql`id = ${row!.id}`);
    expect(after!.shoeSize).toBe(12);

    // A file that blanks the DOB must not erase the stored DOB.
    const blanked = matrix.map((r, i) =>
      i === 0 ? r : r.map((c, ci) => (matrix[0]![ci] === "date_of_birth" && r[0] === row!.id ? "NULL" : c)),
    );
    await runAthleteImport(h.db, { ...base, matrix: blanked, mode: "apply" });
    const [again] = await h.db
      .select()
      .from(athletes)
      .where(sql`id = ${row!.id}`);
    expect(again!.dob).toBe(row!.dob);
  });

  it("rejects a file with missing required columns and records the failed batch", async () => {
    await expect(
      runAthleteImport(h.db, {
        ...base,
        matrix: [
          ["foo", "bar"],
          [1, 2],
        ],
        mode: "apply",
      }),
    ).rejects.toThrow(/Missing required column/);
    const failed = await h.db
      .select()
      .from(importBatches)
      .where(sql`status = 'failed'`);
    expect(failed).toHaveLength(1);
  });

  it("rejects a KIT id reused by a different athlete id within the same file", async () => {
    const clash = matrix.map((r) => [...r]);
    const idCol = matrix[0]!.indexOf("player_detail_id");
    const victim = clash.find((r) => r[idCol] === 100001)!;
    const fresh = [...victim];
    fresh[idCol] = 999999;
    clash.push(fresh);
    const r = await runAthleteImport(h.db, { ...base, matrix: clash, mode: "apply" });
    expect(r.stats.rowsRejected).toBe(1);
    expect(r.rejected[0]!.reasons[0]).toMatch(/already belongs to player_detail_id 100001/);
    expect(
      await h.db
        .select()
        .from(athletes)
        .where(sql`id = 999999`),
    ).toHaveLength(0);
  });

  it("rejects a KIT id that already belongs to a different athlete in the database", async () => {
    const idCol = matrix[0]!.indexOf("player_detail_id");
    const victim = matrix.find((r) => r[idCol] === 100001)!;
    const fresh = [...victim];
    fresh[idCol] = 999998; // new id, same KIT id as stored athlete 100001
    const r = await runAthleteImport(h.db, { ...base, matrix: [matrix[0]!, fresh], mode: "apply" });
    expect(r.diff.kitIdConflicts).toBe(1);
    expect(r.stats.rowsRejected).toBe(1);
    expect(r.applied?.athletesWritten).toBe(0);
    expect(
      await h.db
        .select()
        .from(athletes)
        .where(sql`id = 999998`),
    ).toHaveLength(0);
  });

  it("derives possible duplicates (same name, DOB and father)", async () => {
    const twin = matrix.map((r) => [...r]);
    const idCol = matrix[0]!.indexOf("player_detail_id");
    const kitCol = matrix[0]!.indexOf("athlete_kitd_id");
    const src = twin[13]!; // row for n=13: no injected anomalies
    const copy = [...src];
    copy[idCol] = 888888;
    copy[kitCol] = "ZZAA001M99";
    twin.push(copy);
    await runAthleteImport(h.db, { ...base, matrix: twin, mode: "apply" });
    const dups = await h.db
      .select()
      .from(dqIssues)
      .where(sql`rule_code = 'POSSIBLE_DUPLICATE'`);
    expect(dups.map((d) => d.entityId)).toEqual(expect.arrayContaining([888888, src[idCol] as number]));
  });
});
