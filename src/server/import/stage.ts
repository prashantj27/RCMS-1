import { createHash } from "node:crypto";
import { asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../auth/audit";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { importStageChunks, importStages } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";
import { ImportFileError, matrixFromFile } from "./parse-file";
import { runAthleteImport, type ImportReport } from "./run-import";

/** One request body is limited to 4.5 MB on Vercel; the browser sends ≤ 3 MB pieces. */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
const STAGE_TTL_HOURS = 24;

export const startStageSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  fileBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});

export const finishSchema = z.object({
  mode: z.enum(["dry_run", "apply"]),
  /** Empty the registry first so it holds exactly this file. */
  replace: z.boolean().optional().default(false),
});

/** Begins an upload of a workbook that will be sent in pieces. */
export async function startStage(db: Db, user: PortalUser, input: z.infer<typeof startStageSchema>): Promise<{ stageId: string }> {
  if (!/\.(xlsx|csv)$/i.test(input.fileName)) throw badRequest("Unsupported file type – choose a .xlsx or .csv file");
  // Housekeeping: abandoned uploads (their pieces cascade).
  await db.delete(importStages).where(lt(importStages.createdAt, sql`now() - interval '${sql.raw(String(STAGE_TTL_HOURS))} hours'`));
  const [row] = await db
    .insert(importStages)
    .values({ fileName: input.fileName, fileSha256: input.fileSha256, fileBytes: input.fileBytes, createdBy: user.id })
    .returning({ id: importStages.id });
  return { stageId: row!.id };
}

/** Stores one piece of the file. Idempotent per (stage, seq): re-sending a piece after a network error is safe. */
export async function putChunk(db: Db, stageId: string, seq: number, data: Buffer): Promise<{ receivedBytes: number }> {
  if (!Number.isInteger(seq) || seq < 0 || seq > 100_000) throw badRequest("Invalid piece number");
  if (data.length === 0) throw badRequest("Empty piece");
  if (data.length > MAX_CHUNK_BYTES) throw badRequest("Piece too large – send at most 4 MB at a time");
  const [stage] = await db.select({ id: importStages.id }).from(importStages).where(eq(importStages.id, stageId));
  if (!stage) throw notFound("Upload");
  await db
    .insert(importStageChunks)
    .values({ stageId, seq, data, size: data.length })
    .onConflictDoUpdate({ target: [importStageChunks.stageId, importStageChunks.seq], set: { data, size: data.length } });
  const [t] = await db
    .select({ n: sql<number>`coalesce(sum(${importStageChunks.size}), 0)::int` })
    .from(importStageChunks)
    .where(eq(importStageChunks.stageId, stageId));
  return { receivedBytes: Number(t?.n ?? 0) };
}

export async function discardStage(db: Db, stageId: string): Promise<void> {
  await db.delete(importStages).where(eq(importStages.id, stageId));
}

/**
 * Reads the uploaded file back, checks it is complete and unaltered (size and SHA-256 as announced by the browser),
 * parses it on the server and validates (dry run) or writes (apply) it.
 * A dry run keeps the upload so "Import" can follow without uploading again; a successful apply removes it.
 */
export async function finishStage(
  db: Db,
  user: PortalUser,
  stageId: string,
  opts: z.infer<typeof finishSchema>,
  ip: string | null,
): Promise<ImportReport> {
  const [stage] = await db.select().from(importStages).where(eq(importStages.id, stageId));
  if (!stage) throw notFound("Upload (it may have expired – upload the file again)");

  const pieces = await db
    .select({ seq: importStageChunks.seq, data: importStageChunks.data, size: importStageChunks.size })
    .from(importStageChunks)
    .where(eq(importStageChunks.stageId, stageId))
    .orderBy(asc(importStageChunks.seq));
  const received = pieces.reduce((s, c) => s + c.size, 0);
  if (!pieces.every((c, i) => c.seq === i) || received !== stage.fileBytes) {
    throw conflict(
      `Upload incomplete: ${received.toLocaleString("en-IN")} of ${stage.fileBytes.toLocaleString("en-IN")} bytes received. Upload the file again.`,
    );
  }
  const file = Buffer.concat(pieces.map((c) => c.data));
  if (createHash("sha256").update(file).digest("hex") !== stage.fileSha256) {
    throw conflict("The uploaded file was damaged in transit (checksum mismatch). Upload it again.");
  }

  let matrix: unknown[][];
  try {
    matrix = await matrixFromFile(file, stage.fileName);
  } catch (e) {
    if (e instanceof ImportFileError) throw badRequest(e.message);
    throw e;
  }
  let report: ImportReport;
  try {
    report = await runAthleteImport(db, {
      matrix,
      fileName: stage.fileName,
      fileSha256: stage.fileSha256,
      mode: opts.mode,
      replace: opts.replace,
      createdBy: user.id,
    });
  } catch (e) {
    // e.g. a sheet without the required columns: a problem with the file, reported before anything is changed
    if (e instanceof ImportFileError) throw badRequest(`${e.message}. Expected the athlete master workbook (see Data imports).`);
    throw e;
  }
  await audit(db, {
    actorId: user.id,
    actorEmail: user.email,
    action: opts.mode === "apply" ? (opts.replace ? "import_replace" : "import_apply") : "import_dry_run",
    entityType: "import_batch",
    entityId: report.batchId,
    detail: {
      fileName: stage.fileName,
      athletes: report.stats.athletes,
      rejected: report.stats.rowsRejected,
      ...(report.replacing ? { replaced: report.replacing } : {}),
    },
    ip,
  });
  if (opts.mode === "apply") await discardStage(db, stageId);
  return report;
}
