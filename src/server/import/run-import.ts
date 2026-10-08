import { eq } from "drizzle-orm";
import { buildImportPlan, HeaderError, rowsFromMatrix, type ImportPlan } from "@/domain/athlete-master";
import type { Db } from "../db/client";
import { importBatches } from "../db/schema";
import { applyImportPlan, diffAgainstDb, excludeAthletes, type ApplyResult, type DbDiff } from "./apply";
import { ImportFileError } from "./parse-file";

export interface RunImportInput {
  matrix: unknown[][];
  fileName: string;
  fileSha256: string;
  mode: "dry_run" | "apply";
  createdBy: string | null;
  /** ISO date for "future"/age rules; defaults to today. */
  asOf?: string;
}

export interface ImportReport {
  batchId: string;
  mode: "dry_run" | "apply";
  fileName: string;
  stats: ImportPlan["stats"];
  diff: Omit<DbDiff, "kitIdConflicts" | "kitConflictIds"> & { kitIdConflicts: number };
  rejected: { line: number; reasons: string[] }[];
  rejectedTruncated: boolean;
  applied: ApplyResult | null;
  topIssues: { rule: string; count: number }[];
}

const REJECTED_SAMPLE = 100;

function withoutIds(d: DbDiff) {
  const { kitConflictIds: _ids, kitIdConflicts: _rows, ...rest } = d;
  return rest;
}

export async function runAthleteImport(db: Db, input: RunImportInput): Promise<ImportReport> {
  const [batch] = await db
    .insert(importBatches)
    .values({
      mode: input.mode,
      status: "running",
      fileName: input.fileName,
      fileSha256: input.fileSha256,
      createdBy: input.createdBy,
    })
    .returning({ id: importBatches.id });
  const batchId = batch!.id;

  try {
    let rowsKeyed;
    try {
      rowsKeyed = rowsFromMatrix(input.matrix as unknown[][]);
    } catch (e) {
      if (e instanceof HeaderError) throw new ImportFileError(e.message);
      throw e;
    }
    let plan = buildImportPlan(rowsKeyed, input.asOf ? { asOf: input.asOf } : {});

    const diff = await diffAgainstDb(db, plan);
    if (diff.kitConflictIds.length) plan = excludeAthletes(plan, new Set(diff.kitConflictIds));
    const rejected = [...plan.rejected, ...diff.kitIdConflicts];

    let applied: ApplyResult | null = null;
    if (input.mode === "apply") applied = await applyImportPlan(db, plan, batchId);

    const topIssues = Object.entries(plan.stats.issuesByRule)
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count);

    const report: ImportReport = {
      batchId,
      mode: input.mode,
      fileName: input.fileName,
      stats: { ...plan.stats, rowsRejected: rejected.length, rowsAccepted: plan.stats.rowsRead - rejected.length },
      diff: { ...withoutIds(diff), kitIdConflicts: diff.kitIdConflicts.length },
      rejected: rejected.slice(0, REJECTED_SAMPLE),
      rejectedTruncated: rejected.length > REJECTED_SAMPLE,
      applied,
      topIssues,
    };
    await db
      .update(importBatches)
      .set({ status: "completed", finishedAt: new Date(), summary: report as unknown as Record<string, unknown> })
      .where(eq(importBatches.id, batchId));
    return report;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .update(importBatches)
      .set({ status: "failed", finishedAt: new Date(), error: message.slice(0, 2000) })
      .where(eq(importBatches.id, batchId));
    throw e;
  }
}
