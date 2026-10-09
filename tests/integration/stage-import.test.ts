import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { buildPrototypeUser } from "@/server/auth/prototype";
import type { DbHandle } from "@/server/db/client";
import { athletes, importStageChunks, importStages } from "@/server/db/schema";
import { rows } from "@/server/db/util";
import { matrixFromFile } from "@/server/import/parse-file";
import { runAthleteImport } from "@/server/import/run-import";
import { discardStage, finishSchema, finishStage, putChunk, startStage, startStageSchema } from "@/server/import/stage";
import { getCurrentDataset } from "@/server/services/imports";
import { testDb } from "../helpers/db";

const admin = buildPrototypeUser("ADMIN");
const FILE = readFileSync(path.join(__dirname, "..", "fixtures", "synthetic-athletes.xlsx"));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const count = async (db: DbHandle["db"], table: string) =>
  (await rows<{ n: number }>(db, sql.raw(`select count(*)::int as n from ${table}`)))[0]!.n;

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(async () => h.close());

const pieces = (buf: Buffer, size: number) =>
  Array.from({ length: Math.ceil(buf.length / size) }, (_, i) => buf.subarray(i * size, (i + 1) * size));

async function upload(db: DbHandle["db"], buf = FILE, fileName = "national.xlsx", size = 40_000) {
  const { stageId } = await startStage(db, admin, { fileName, fileSha256: sha(buf), fileBytes: buf.length });
  let seq = 0;
  for (const p of pieces(buf, size)) await putChunk(db, stageId, seq++, Buffer.from(p));
  return stageId;
}

// What a plain import of the fixture produces – the reference every upload path must equal.
async function reference() {
  const r = await testDb();
  const report = await runAthleteImport(r.db, {
    matrix: await matrixFromFile(FILE, "synthetic-athletes.xlsx"),
    fileName: "ref.xlsx",
    fileSha256: sha(FILE),
    mode: "apply",
    createdBy: null,
  });
  const fingerprint = (
    await rows<{ x: string }>(
      r.db,
      sql`select md5(string_agg(concat_ws('|', a.id, a.kit_id, a.full_name, a.gender, a.dob, s.slug, a.shoe_size, a.tshirt_size), ';' order by a.id)) as x from athletes a join sports s on s.id = a.sport_id`,
    )
  )[0]!.x;
  const out = { report, fingerprint, athletes: await count(r.db, "athletes"), enrollments: await count(r.db, "enrollments") };
  await r.close();
  return out;
}

describe("file upload in pieces (the browser sends the workbook untouched)", () => {
  it("validates request shapes", () => {
    expect(startStageSchema.safeParse({ fileName: "a.xlsx", fileSha256: "e".repeat(64), fileBytes: 10 }).success).toBe(true);
    expect(startStageSchema.safeParse({ fileName: "a.xlsx", fileSha256: "nothex", fileBytes: 10 }).success).toBe(false);
    expect(startStageSchema.safeParse({ fileName: "a.xlsx", fileSha256: "e".repeat(64), fileBytes: 0 }).success).toBe(false);
    expect(finishSchema.parse({ mode: "apply" })).toEqual({ mode: "apply", replace: false });
    expect(finishSchema.safeParse({ mode: "drop" }).success).toBe(false);
  });

  it("refuses unsupported file types and oversized or malformed pieces", async () => {
    await expect(startStage(h.db, admin, { fileName: "x.exe", fileSha256: "e".repeat(64), fileBytes: 5 })).rejects.toMatchObject({
      status: 400,
    });
    const { stageId } = await startStage(h.db, admin, { fileName: "x.xlsx", fileSha256: "e".repeat(64), fileBytes: 5 });
    await expect(putChunk(h.db, stageId, 0, Buffer.alloc(0))).rejects.toMatchObject({ status: 400 });
    await expect(putChunk(h.db, stageId, -1, Buffer.from("a"))).rejects.toMatchObject({ status: 400 });
    await expect(putChunk(h.db, stageId, 0, Buffer.alloc(4 * 1024 * 1024 + 1))).rejects.toMatchObject({ status: 400 });
    await discardStage(h.db, stageId);
  });

  it("a dry run reports everything and writes nothing; apply then equals a plain import of the same file", async () => {
    const ref = await reference();
    const stageId = await upload(h.db);
    const dry = await finishStage(h.db, admin, stageId, { mode: "dry_run", replace: false }, null);
    expect(dry.mode).toBe("dry_run");
    expect(dry.stats.athletes).toBe(ref.athletes);
    expect(await count(h.db, "athletes")).toBe(0);
    expect(await count(h.db, "import_stages")).toBe(1); // kept for the following import

    const applied = await finishStage(h.db, admin, stageId, { mode: "apply", replace: false }, null);
    expect(applied.applied?.athletesWritten).toBe(ref.athletes);
    expect(await count(h.db, "athletes")).toBe(ref.athletes);
    expect(await count(h.db, "enrollments")).toBe(ref.enrollments);
    const fingerprint = (
      await rows<{ x: string }>(
        h.db,
        sql`select md5(string_agg(concat_ws('|', a.id, a.kit_id, a.full_name, a.gender, a.dob, s.slug, a.shoe_size, a.tshirt_size), ';' order by a.id)) as x from athletes a join sports s on s.id = a.sport_id`,
      )
    )[0]!.x;
    expect(fingerprint).toBe(ref.fingerprint);
    expect(await count(h.db, "import_stages")).toBe(0); // removed after a successful import
    expect(await count(h.db, "import_stage_chunks")).toBe(0);
  });

  it("is idempotent: the same file again changes nothing", async () => {
    const before = await count(h.db, "athletes");
    const r = await finishStage(h.db, admin, await upload(h.db), { mode: "apply", replace: false }, null);
    expect(r.diff.athletesNew).toBe(0);
    expect(r.diff.athletesExisting).toBe(before);
    expect(await count(h.db, "athletes")).toBe(before);
  });

  it("refuses an incomplete upload, a gap, and a damaged file with a clear message; a resent piece is harmless", async () => {
    const size = Math.ceil(FILE.length / 4);
    const parts = pieces(FILE, size);
    expect(parts.length).toBeGreaterThan(2);
    const { stageId } = await startStage(h.db, admin, { fileName: "gap.xlsx", fileSha256: sha(FILE), fileBytes: FILE.length });
    await putChunk(h.db, stageId, 0, Buffer.from(parts[0]!));
    await expect(finishStage(h.db, admin, stageId, { mode: "dry_run", replace: false }, null)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/Upload incomplete/),
    });
    for (let i = 2; i < parts.length; i++) await putChunk(h.db, stageId, i, Buffer.from(parts[i]!)); // skip piece 1
    await expect(finishStage(h.db, admin, stageId, { mode: "dry_run", replace: false }, null)).rejects.toMatchObject({ status: 409 });
    await putChunk(h.db, stageId, 1, Buffer.from(parts[1]!));
    const again = await putChunk(h.db, stageId, 1, Buffer.from(parts[1]!)); // network retry
    expect(again.receivedBytes).toBe(FILE.length);
    await expect(finishStage(h.db, admin, stageId, { mode: "dry_run", replace: false }, null)).resolves.toMatchObject({ mode: "dry_run" });

    // one flipped byte → checksum mismatch, nothing is imported
    const damaged = Buffer.from(FILE);
    damaged[100] = damaged[100]! ^ 0xff;
    const { stageId: bad } = await startStage(h.db, admin, { fileName: "bad.xlsx", fileSha256: sha(FILE), fileBytes: FILE.length });
    for (const [i, p] of pieces(damaged, Math.ceil(FILE.length / 4)).entries()) await putChunk(h.db, bad, i, Buffer.from(p));
    await expect(finishStage(h.db, admin, bad, { mode: "apply", replace: false }, null)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/checksum/),
    });
  });

  it("unknown uploads are 404, abandoned uploads are cleaned up", async () => {
    const ghost = "00000000-0000-4000-8000-0000000000aa";
    await expect(putChunk(h.db, ghost, 0, Buffer.from("a"))).rejects.toMatchObject({ status: 404 });
    await expect(finishStage(h.db, admin, ghost, { mode: "dry_run", replace: false }, null)).rejects.toMatchObject({ status: 404 });
    const { stageId } = await startStage(h.db, admin, { fileName: "old.xlsx", fileSha256: "e".repeat(64), fileBytes: 1 });
    await putChunk(h.db, stageId, 0, Buffer.from("a"));
    await h.db
      .update(importStages)
      .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(importStages.id, stageId));
    await startStage(h.db, admin, { fileName: "new.xlsx", fileSha256: "e".repeat(64), fileBytes: 1 });
    const left = await h.db.select({ id: importStages.id }).from(importStages);
    expect(left.map((x) => x.id)).not.toContain(stageId);
    expect(await h.db.select().from(importStageChunks).where(eq(importStageChunks.stageId, stageId))).toHaveLength(0);
  });
});

describe("replace: the registry holds exactly the file afterwards", () => {
  it("retires everything from an earlier or demo load, keeps history, and reports what it replaced", async () => {
    const db = await testDb();
    try {
      // an earlier load with different people and centres (what the 1,200 demo athletes are on a deployed site)
      await runAthleteImport(db.db, {
        matrix: syntheticAthleteMatrix({ athletes: 80, academies: 5, seed: 99 }),
        fileName: "synthetic-demo-data.xlsx",
        fileSha256: "0".repeat(64),
        mode: "apply",
        createdBy: null,
      });
      const oldIds = (await db.db.select({ id: athletes.id }).from(athletes)).map((r) => r.id);
      const ref = await reference();

      // dry run with replace: reports the replacement, changes nothing
      const stageId = await upload(db.db);
      const dry = await finishStage(db.db, admin, stageId, { mode: "dry_run", replace: true }, null);
      expect(dry.replacing).toMatchObject({ athletes: oldIds.length, centres: 5 });
      expect(dry.diff).toMatchObject({ athletesNew: ref.athletes, athletesExisting: 0 });
      expect(await count(db.db, "athletes")).toBe(oldIds.length);

      const r = await finishStage(db.db, admin, stageId, { mode: "apply", replace: true }, null);
      expect(r.replacing?.athletes).toBe(oldIds.length);
      expect(await count(db.db, "athletes")).toBe(ref.athletes);
      expect(await count(db.db, "enrollments")).toBe(ref.enrollments);
      const fp = (
        await rows<{ x: string }>(
          db.db,
          sql`select md5(string_agg(concat_ws('|', a.id, a.kit_id, a.full_name, a.gender, a.dob, s.slug, a.shoe_size, a.tshirt_size), ';' order by a.id)) as x from athletes a join sports s on s.id = a.sport_id`,
        )
      )[0]!.x;
      expect(fp).toBe(ref.fingerprint);
      // nothing of the old load is left anywhere: no dangling findings, no unused sports or centres
      expect(
        (
          await rows<{ n: number }>(
            db.db,
            sql`select count(*)::int as n from dq_issues where entity_type = 'athlete' and entity_id not in (select id from athletes)`,
          )
        )[0]!.n,
      ).toBe(0);
      expect(
        (await rows<{ n: number }>(db.db, sql`select count(*)::int as n from sports where id not in (select sport_id from athletes)`))[0]!
          .n,
      ).toBe(0);
      expect(
        (
          await rows<{ n: number }>(
            db.db,
            sql`select count(*)::int as n from academies where id not in (select academy_id from enrollments)`,
          )
        )[0]!.n,
      ).toBe(0);
      // history is kept and the current dataset names the new file
      expect(await count(db.db, "import_batches")).toBeGreaterThanOrEqual(3);
      expect((await getCurrentDataset(db.db)).source?.fileName).toBe("national.xlsx");
    } finally {
      await db.close();
    }
  });

  it("a file that cannot be read leaves the registry untouched", async () => {
    const db = await testDb();
    try {
      await finishStage(db.db, admin, await upload(db.db), { mode: "apply", replace: false }, null);
      const before = await count(db.db, "athletes");
      const junk = Buffer.from("this is not a spreadsheet");
      const stageId = await upload(db.db, junk, "junk.xlsx");
      await expect(finishStage(db.db, admin, stageId, { mode: "apply", replace: true }, null)).rejects.toMatchObject({ status: 400 });
      expect(await count(db.db, "athletes")).toBe(before);
      // a sheet without the required columns is refused before anything is removed
      const csv = Buffer.from("foo,bar\n1,2\n");
      const stage2 = await upload(db.db, csv, "wrong.csv");
      await expect(finishStage(db.db, admin, stage2, { mode: "apply", replace: true }, null)).rejects.toMatchObject({ status: 400 });
      expect(await count(db.db, "athletes")).toBe(before);
    } finally {
      await db.close();
    }
  });
});
