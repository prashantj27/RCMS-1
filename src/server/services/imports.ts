import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { importBatches, users } from "../db/schema";

export interface ImportBatchView {
  id: string;
  mode: string;
  status: string;
  fileName: string;
  fileSha256: string;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
}

export async function listImportBatches(db: Db, limit = 25): Promise<ImportBatchView[]> {
  const r = await db
    .select({
      id: importBatches.id,
      mode: importBatches.mode,
      status: importBatches.status,
      fileName: importBatches.fileName,
      fileSha256: importBatches.fileSha256,
      startedAt: importBatches.startedAt,
      finishedAt: importBatches.finishedAt,
      by: users.email,
      error: importBatches.error,
      summary: importBatches.summary,
    })
    .from(importBatches)
    .leftJoin(users, eq(users.id, importBatches.createdBy))
    .orderBy(desc(importBatches.startedAt))
    .limit(limit);
  return r.map((x) => ({
    id: x.id,
    mode: x.mode,
    status: x.status,
    fileName: x.fileName,
    fileSha256: x.fileSha256,
    startedAt: x.startedAt.toISOString(),
    finishedAt: x.finishedAt?.toISOString() ?? null,
    createdBy: x.by,
    error: x.error,
    summary: x.summary,
  }));
}
