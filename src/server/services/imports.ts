import { desc } from "drizzle-orm";
import type { Db } from "../db/client";
import { PROTOTYPE_USER_IDS, portalByRole } from "@/domain/prototype";
import { importBatches } from "../db/schema";

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

/** Which portal started a batch (CLI / system runs have no portal). */
function labelFor(id: string | null): string | null {
  const role = (Object.keys(PROTOTYPE_USER_IDS) as (keyof typeof PROTOTYPE_USER_IDS)[]).find((r) => PROTOTYPE_USER_IDS[r] === id);
  return role ? `${portalByRole(role).title} portal` : null;
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
      createdBy: importBatches.createdBy,
      error: importBatches.error,
      summary: importBatches.summary,
    })
    .from(importBatches)
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
    createdBy: labelFor(x.createdBy),
    error: x.error,
    summary: x.summary,
  }));
}
