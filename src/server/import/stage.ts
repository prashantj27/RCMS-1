import { asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { HeaderError, REQUIRED_COLUMNS, rowsFromMatrix } from "@/domain/athlete-master";
import { audit } from "../auth/audit";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { importStageRows, importStages } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";
import { MAX_ROWS } from "./parse-file";
import { runAthleteImport, type ImportReport } from "./run-import";

export const MAX_CHUNK_ROWS = 5000;
const STAGE_TTL_HOURS = 24;

const cell = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

export const startStageSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  rowCount: z.number().int().min(1).max(MAX_ROWS),
  header: z.array(z.string().max(100)).min(1).max(60),
});

export const chunkSchema = z.object({
  seq: z.number().int().min(0).max(100_000),
  rows: z.array(z.array(cell).max(60)).min(1).max(MAX_CHUNK_ROWS),
});

export const finishSchema = z.object({ mode: z.enum(["dry_run", "apply"]) });

/** Begins an upload. Fails fast when the header lacks required columns, before any row is sent. */
export async function startStage(db: Db, user: PortalUser, input: z.infer<typeof startStageSchema>): Promise<{ stageId: string }> {
  try {
    rowsFromMatrix([input.header]);
  } catch (e) {
    if (e instanceof HeaderError) {
      throw badRequest(
        `${e.message}. Expected a sheet with columns: ${REQUIRED_COLUMNS.join(", ")} (…and the optional ones of the athlete master).`,
      );
    }
    throw e;
  }
  // Housekeeping: abandoned uploads (rows cascade).
  await db.delete(importStages).where(lt(importStages.createdAt, sql`now() - interval '${sql.raw(String(STAGE_TTL_HOURS))} hours'`));
  const [row] = await db
    .insert(importStages)
    .values({ fileName: input.fileName, fileSha256: input.fileSha256, rowCount: input.rowCount, header: input.header, createdBy: user.id })
    .returning({ id: importStages.id });
  return { stageId: row!.id };
}

/** Stores one batch of rows. Idempotent per (stage, seq): re-sending a batch after a network error is safe. */
export async function putChunk(db: Db, stageId: string, input: z.infer<typeof chunkSchema>): Promise<{ received: number }> {
  const [stage] = await db.select({ id: importStages.id }).from(importStages).where(eq(importStages.id, stageId));
  if (!stage) throw notFound("Upload");
  await db
    .insert(importStageRows)
    .values({ stageId, seq: input.seq, rows: input.rows, rowCount: input.rows.length })
    .onConflictDoUpdate({ target: [importStageRows.stageId, importStageRows.seq], set: { rows: input.rows, rowCount: input.rows.length } });
  const [t] = await db
    .select({ n: sql<number>`coalesce(sum(${importStageRows.rowCount}), 0)::int` })
    .from(importStageRows)
    .where(eq(importStageRows.stageId, stageId));
  return { received: Number(t?.n ?? 0) };
}

export async function discardStage(db: Db, stageId: string): Promise<void> {
  await db.delete(importStages).where(eq(importStages.id, stageId));
}

/**
 * Validates (dry run) or writes (apply) the uploaded rows. The upload must be complete and gap-free.
 * A dry run keeps the staged rows so "Import" can follow without uploading again; a successful apply removes them.
 */
export async function finishStage(
  db: Db,
  user: PortalUser,
  stageId: string,
  mode: "dry_run" | "apply",
  ip: string | null,
): Promise<ImportReport> {
  const [stage] = await db.select().from(importStages).where(eq(importStages.id, stageId));
  if (!stage) throw notFound("Upload (it may have expired – upload the file again)");

  const chunks = await db
    .select({ seq: importStageRows.seq, rows: importStageRows.rows, n: importStageRows.rowCount })
    .from(importStageRows)
    .where(eq(importStageRows.stageId, stageId))
    .orderBy(asc(importStageRows.seq));
  const received = chunks.reduce((s, c) => s + c.n, 0);
  const contiguous = chunks.every((c, i) => c.seq === i);
  if (!contiguous || received !== stage.rowCount) {
    throw conflict(
      `Upload incomplete: ${received.toLocaleString("en-IN")} of ${stage.rowCount.toLocaleString("en-IN")} rows received. Send the missing batches and try again.`,
    );
  }

  const matrix: unknown[][] = [stage.header, ...chunks.flatMap((c) => c.rows)];
  const report = await runAthleteImport(db, { matrix, fileName: stage.fileName, fileSha256: stage.fileSha256, mode, createdBy: user.id });
  await audit(db, {
    actorId: user.id,
    actorEmail: user.email,
    action: mode === "apply" ? "import_apply" : "import_dry_run",
    entityType: "import_batch",
    entityId: report.batchId,
    detail: { fileName: stage.fileName, athletes: report.stats.athletes, rejected: report.stats.rowsRejected },
    ip,
  });
  if (mode === "apply") await discardStage(db, stageId);
  return report;
}
