import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { toJsonRow, batches } from "@/lib/matrix-json";
import { buildPrototypeUser } from "@/server/auth/prototype";
import type { DbHandle } from "@/server/db/client";
import { importStageRows, importStages } from "@/server/db/schema";
import { rows } from "@/server/db/util";
import { runAthleteImport } from "@/server/import/run-import";
import { chunkSchema, discardStage, finishStage, putChunk, startStage, startStageSchema } from "@/server/import/stage";
import { testDb } from "../helpers/db";

const admin = buildPrototypeUser("ADMIN");
const matrix = syntheticAthleteMatrix({ athletes: 700, academies: 20, seed: 21 });
const [header, ...body] = matrix as [string[], ...unknown[][]];
const wire = body.map(toJsonRow); // exactly what the browser sends
const SHA = "e".repeat(64);
const count = async (db: DbHandle["db"], table: string) =>
  (await rows<{ n: number }>(db, sql.raw(`select count(*)::int as n from ${table}`)))[0]!.n;

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(async () => h.close());

async function upload(db: DbHandle["db"], chunkSize = 250) {
  const { stageId } = await startStage(db, admin, { fileName: "national.xlsx", fileSha256: SHA, rowCount: wire.length, header });
  let seq = 0;
  for (const rowsChunk of batches(wire, chunkSize)) await putChunk(db, stageId, { seq: seq++, rows: rowsChunk });
  return stageId;
}

describe("batched workbook upload", () => {
  it("rejects a sheet without the required columns before any row is sent", async () => {
    await expect(
      startStage(h.db, admin, { fileName: "x.xlsx", fileSha256: SHA, rowCount: 5, header: ["foo", "bar"] }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Missing required column/),
    });
  });

  it("validates input shapes (cells must be plain values, batches bounded)", () => {
    expect(chunkSchema.safeParse({ seq: 0, rows: [[1, "a", null, true]] }).success).toBe(true);
    expect(chunkSchema.safeParse({ seq: 0, rows: [[{ evil: 1 }]] }).success).toBe(false);
    expect(chunkSchema.safeParse({ seq: -1, rows: [[1]] }).success).toBe(false);
    expect(chunkSchema.safeParse({ seq: 0, rows: [] }).success).toBe(false);
    expect(chunkSchema.safeParse({ seq: 0, rows: Array.from({ length: 5001 }, () => [1]) }).success).toBe(false);
    expect(startStageSchema.safeParse({ fileName: "a", fileSha256: "nothex", rowCount: 1, header: ["a"] }).success).toBe(false);
  });

  it("dry run reports everything, writes nothing, and keeps the upload for a following import", async () => {
    const stageId = await upload(h.db);
    const r = await finishStage(h.db, admin, stageId, "dry_run", null);
    expect(r.mode).toBe("dry_run");
    expect(r.applied).toBeNull();
    expect(r.stats.athletes).toBe(700);
    expect(await count(h.db, "athletes")).toBe(0);
    expect(await count(h.db, "import_stages")).toBe(1); // kept
    expect(await count(h.db, "import_stage_rows")).toBeGreaterThan(0);

    const applied = await finishStage(h.db, admin, stageId, "apply", "1.2.3.4");
    expect(applied.applied?.athletesWritten).toBe(700);
    expect(await count(h.db, "athletes")).toBe(700);
    expect(await count(h.db, "import_stages")).toBe(0); // staging removed after a successful import
    expect(await count(h.db, "import_stage_rows")).toBe(0);
    const batchesTable = await rows<{ mode: string; status: string; file_name: string }>(
      h.db,
      sql`select mode, status, file_name from import_batches order by started_at`,
    );
    expect(batchesTable.map((b) => `${b.mode}:${b.status}`)).toEqual(["dry_run:completed", "apply:completed"]);
    expect(batchesTable[0]!.file_name).toBe("national.xlsx");
  });

  it("gives exactly the same result as reading the file directly (dates survive the JSON trip)", async () => {
    const fresh = await testDb();
    try {
      const direct = await runAthleteImport(fresh.db, { matrix, fileName: "d.xlsx", fileSha256: SHA, mode: "dry_run", createdBy: null });
      const stageId = await upload(fresh.db, 100);
      const viaStage = await finishStage(fresh.db, admin, stageId, "dry_run", null);
      expect(viaStage.stats).toEqual(direct.stats);
      expect(viaStage.diff).toEqual(direct.diff);
      expect(viaStage.topIssues).toEqual(direct.topIssues);
    } finally {
      await fresh.close();
    }
  });

  it("applying the staged file and applying the file directly produce identical rows", async () => {
    const a = await testDb();
    const b = await testDb();
    try {
      await runAthleteImport(a.db, { matrix, fileName: "d.xlsx", fileSha256: SHA, mode: "apply", createdBy: null });
      await finishStage(b.db, admin, await upload(b.db, 90), "apply", null);
      const fingerprint = async (db: DbHandle["db"]) =>
        (
          await rows<{ h: string }>(
            db,
            sql`select md5(string_agg(concat_ws('|', id, kit_id, full_name, father_name, mother_name, gender, dob, sport_id, shoe_size, blazer_size, tshirt_size, pant_size, kitting_updated_at), ';' order by id)) as h from athletes`,
          )
        )[0]!.h;
      expect(await fingerprint(b.db)).toBe(await fingerprint(a.db));
      for (const t of ["athletes", "academies", "enrollments", "dq_issues", "sports"])
        expect(await count(b.db, t), t).toBe(await count(a.db, t));
    } finally {
      await a.close();
      await b.close();
    }
  });

  it("refuses an incomplete or gappy upload with a clear message, and a resent batch is idempotent", async () => {
    const db = h.db;
    const { stageId } = await startStage(db, admin, { fileName: "gap.xlsx", fileSha256: SHA, rowCount: wire.length, header });
    const parts = [...batches(wire, 200)];
    await putChunk(db, stageId, { seq: 0, rows: parts[0]! });
    await expect(finishStage(db, admin, stageId, "dry_run", null)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(new RegExp(`incomplete: 200 of ${wire.length}`)),
    });
    // skip seq 1 → gap
    for (let i = 2; i < parts.length; i++) await putChunk(db, stageId, { seq: i, rows: parts[i]! });
    await expect(finishStage(db, admin, stageId, "dry_run", null)).rejects.toMatchObject({ status: 409 });
    // fill the gap, and re-send an already-stored batch (network retry)
    await putChunk(db, stageId, { seq: 1, rows: parts[1]! });
    const again = await putChunk(db, stageId, { seq: 1, rows: parts[1]! });
    expect(again.received).toBe(wire.length);
    await expect(finishStage(db, admin, stageId, "dry_run", null)).resolves.toMatchObject({ mode: "dry_run" });
    await discardStage(db, stageId);
    expect(await count(db, "import_stages")).toBe(0);
  });

  it("unknown uploads are 404, and abandoned uploads are cleaned up", async () => {
    const ghost = "00000000-0000-4000-8000-0000000000aa";
    await expect(putChunk(h.db, ghost, { seq: 0, rows: [[1]] })).rejects.toMatchObject({ status: 404 });
    await expect(finishStage(h.db, admin, ghost, "dry_run", null)).rejects.toMatchObject({ status: 404 });
    const { stageId } = await startStage(h.db, admin, { fileName: "old.xlsx", fileSha256: SHA, rowCount: 1, header });
    await h.db
      .update(importStages)
      .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(importStages.id, stageId));
    await startStage(h.db, admin, { fileName: "new.xlsx", fileSha256: SHA, rowCount: 1, header });
    const left = await h.db.select({ id: importStages.id }).from(importStages);
    expect(left.map((x) => x.id)).not.toContain(stageId);
    const orphanRows = await h.db.select().from(importStageRows).where(eq(importStageRows.stageId, stageId));
    expect(orphanRows).toHaveLength(0);
  });
});
